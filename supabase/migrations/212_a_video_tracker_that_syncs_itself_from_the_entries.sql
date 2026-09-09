-- A VIDEO TRACKER THAT SYNCS ITSELF FROM THE ENTRIES.
--
-- The table is migration 211; this is everything that fills it and reads it.
-- See 211 for what the tool is for and why a curated table rather than a view.
--
-- FOUR FUNCTIONS AND EACH IS ONE IDEA:
--
--   handle_from_url            "@denisahadarau_" out of a profile link
--   hook_from_caption          the first line of what was posted
--   tracked_video_candidates   who qualifies right now, as a set
--   sync_tracked_videos        make the table agree with that set
--   admin_tracked_videos       the joined shape the page draws
--
-- WHY `tracked_video_candidates` IS ITS OWN FUNCTION AND NOT A CTE.
--
-- `sync_tracked_videos` needs the candidate set TWICE - once to upsert what
-- qualifies and once to find what no longer does - and a CTE cannot be shared
-- between two statements. The alternative was the same forty lines of window
-- function written out twice in one migration, which is the shape that produced
-- the 25 Aug retyping bug: two copies of one rule, and only one of them ever
-- gets fixed. It is also the only part of this worth testing on its own.
--
-- THE RANKING IS PER VIDEO, NOT PER CREATOR. The leaderboard ranks CREATORS by
-- the sum of their entries (see the note in the automatic-views write-up); this
-- ranks VIDEOS, because the question the page answers is "what should I make",
-- not "who won". A creator with the first and third best videos of a challenge
-- correctly appears twice.
--
-- ZERO IS NOT A VIEW COUNT. `logged_views > 0` rather than `is not null`: an
-- entry read as zero is almost always a read that failed rather than a video
-- nobody watched, and a top three padded out with zeroes is worse than a top
-- three with two videos in it.
--
-- THE THRESHOLD IS A SETTING, NOT A CONSTANT. `app_settings.video_tracker ->
-- view_threshold`, defaulting to the ten thousand Ethan asked for. It is a
-- setting because the answer differs by market: ten thousand is a strong video
-- in the UK and an ordinary one in a market with ten times the reach.
--
-- WHAT A SYNC NEVER TOUCHES: `hook` when `hook_source = 'manual'`, and `notes`,
-- `tags` and `pinned` ever. Those are the human half of the record and the
-- whole reason this is a table.
create or replace function public.handle_from_url(p_url text)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select nullif(
    ltrim(
      regexp_replace(
        split_part(
          regexp_replace(coalesce(p_url, ''), '^https?://[^/]+/', ''),
          '?', 1),
        '/.*$', ''),
      '@'),
    '')
$$;

create or replace function public.hook_from_caption(p_caption text)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select nullif(
    left(
      btrim(
        regexp_replace(
          split_part(replace(coalesce(p_caption, ''), chr(13), ''), chr(10), 1),
          '\s+', ' ', 'g')),
      140),
    '')
$$;

-- Two knobs, because the right answer differs by market: ten thousand views is
-- a strong video in the UK and an ordinary one somewhere with ten times the
-- reach, and "top three" is right for a challenge with forty entries and thin
-- for one with four hundred. Both live in `app_settings.video_tracker`.
create or replace function public.tracked_video_candidates(p_threshold bigint, p_top integer)
returns table (
  submission_id uuid,
  challenge_id uuid,
  community_id uuid,
  creator_id uuid,
  creator_name text,
  creator_handle text,
  platform text,
  video_url text,
  platform_video_id text,
  views bigint,
  views_source text,
  views_synced_at timestamptz,
  posted_at timestamptz,
  caption text,
  place integer,
  is_podium boolean
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with ranked as (
    select
      s.id,
      s.challenge_id,
      coalesce(s.community_id, c.community_id) as community_id,
      s.creator_id,
      p.name as creator_name,
      case s.platform
        when 'Instagram' then public.handle_from_url(p.instagram_url)
        when 'TikTok'    then public.handle_from_url(p.tiktok_url)
        when 'YouTube'   then public.handle_from_url(p.youtube_url)
        when 'Facebook'  then public.handle_from_url(p.facebook_url)
        else null
      end as creator_handle,
      s.platform,
      s.video_url,
      s.platform_video_id,
      s.logged_views::bigint as views,
      s.views_source,
      s.views_synced_at,
      s.submitted_at,
      s.caption,
      row_number() over (
        partition by s.challenge_id
        order by s.logged_views desc nulls last, s.submitted_at asc
      )::int as place
    from public.submissions s
    join public.challenges c on c.id = s.challenge_id
    left join public.profiles p on p.id = s.creator_id
    where s.logged_views is not null and s.logged_views > 0
  )
  select
    id, challenge_id, community_id, creator_id, creator_name, creator_handle,
    platform, video_url, platform_video_id, views, views_source, views_synced_at,
    submitted_at, caption, place, (place <= greatest(p_top, 0))
  from ranked
  where place <= greatest(p_top, 0) or views >= p_threshold
$$;

create or replace function public.sync_tracked_videos()
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_threshold bigint;
  v_top int;
  v_added int := 0;
  v_updated int := 0;
  v_dropped int := 0;
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;

  select coalesce((value->>'view_threshold')::bigint, 10000),
         coalesce((value->>'top_per_challenge')::int, 3)
    into v_threshold, v_top
  from public.app_settings
  where key = 'video_tracker';
  -- A MISSING ROW LEAVES BOTH NULL, which `coalesce` inside the select cannot
  -- fix - there is no row for it to run against. This is the second guard and
  -- it is the one that matters on a fresh database.
  v_threshold := coalesce(v_threshold, 10000);
  v_top := coalesce(v_top, 3);

  with picked as (
    select * from public.tracked_video_candidates(v_threshold, v_top)
  ), upserted as (
    insert into public.tracked_videos as t (
      submission_id, challenge_id, community_id, creator_id, creator_name, creator_handle,
      platform, video_url, platform_video_id, views, views_source, views_synced_at,
      posted_at, caption, hook, reason, rank, qualifies
    )
    select
      pk.submission_id, pk.challenge_id, pk.community_id, pk.creator_id, pk.creator_name, pk.creator_handle,
      pk.platform, pk.video_url, pk.platform_video_id, pk.views, pk.views_source, pk.views_synced_at,
      pk.posted_at, pk.caption, public.hook_from_caption(pk.caption),
      case when pk.is_podium then 'podium' else 'threshold' end,
      case when pk.is_podium then pk.place else null end,
      true
    from picked pk
    on conflict (submission_id) do update set
      challenge_id      = excluded.challenge_id,
      community_id      = excluded.community_id,
      creator_id        = excluded.creator_id,
      creator_name      = excluded.creator_name,
      creator_handle    = coalesce(excluded.creator_handle, t.creator_handle),
      platform          = excluded.platform,
      video_url         = excluded.video_url,
      platform_video_id = coalesce(excluded.platform_video_id, t.platform_video_id),
      views             = excluded.views,
      views_source      = excluded.views_source,
      views_synced_at   = excluded.views_synced_at,
      posted_at         = coalesce(t.posted_at, excluded.posted_at),
      caption           = coalesce(excluded.caption, t.caption),
      hook              = case when t.hook_source = 'manual' then t.hook
                               else coalesce(excluded.hook, t.hook) end,
      reason            = case when t.reason = 'manual' then 'manual' else excluded.reason end,
      rank              = excluded.rank,
      qualifies         = true
    returning (xmax = 0) as was_insert
  )
  select
    count(*) filter (where was_insert),
    count(*) filter (where not was_insert)
  into v_added, v_updated
  from upserted;

  update public.tracked_videos t
     set qualifies = false
   where t.submission_id is not null
     and t.reason <> 'manual'
     and t.qualifies
     and not exists (
       select 1 from public.tracked_video_candidates(v_threshold, v_top) pk
        where pk.submission_id = t.submission_id
     );
  get diagnostics v_dropped = row_count;

  return json_build_object(
    'threshold', v_threshold,
    'top',       v_top,
    'added',     v_added,
    'updated',   v_updated,
    'dropped',   v_dropped
  );
end;
$$;

create or replace function public.admin_tracked_videos()
returns table (
  id uuid,
  submission_id uuid,
  challenge_id uuid,
  challenge_title text,
  history_id uuid,
  history_title text,
  community_id uuid,
  market_name text,
  market_slug text,
  creator_id uuid,
  creator_name text,
  creator_handle text,
  creator_photo text,
  platform text,
  video_url text,
  platform_video_id text,
  thumbnail_url text,
  posted_at timestamptz,
  views bigint,
  views_source text,
  views_synced_at timestamptz,
  hook text,
  hook_source text,
  caption text,
  notes text,
  tags text[],
  reason text,
  rank integer,
  qualifies boolean,
  pinned boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    t.id, t.submission_id,
    t.challenge_id, c.title,
    t.history_id, h.title,
    t.community_id, m.name, m.slug,
    t.creator_id, coalesce(t.creator_name, p.name), t.creator_handle, p.photo_url,
    t.platform, t.video_url, t.platform_video_id, t.thumbnail_url, t.posted_at,
    t.views, t.views_source, t.views_synced_at,
    t.hook, t.hook_source, t.caption, t.notes, t.tags,
    t.reason, t.rank, t.qualifies, t.pinned,
    t.created_at, t.updated_at
  from public.tracked_videos t
  left join public.challenges c on c.id = t.challenge_id
  left join public.challenge_history h on h.id = t.history_id
  left join public.communities m on m.id = t.community_id
  left join public.profiles p on p.id = t.creator_id
  where public.is_admin()
  order by t.pinned desc, t.views desc nulls last, t.created_at desc
$$;

-- The defaults Ethan asked for, as a row rather than as a constant so they can
-- be changed without a deploy. `do nothing` because a value somebody has
-- already tuned must survive this migration being re-run.
insert into public.app_settings (key, value)
values ('video_tracker', jsonb_build_object('view_threshold', 10000, 'top_per_challenge', 3))
on conflict (key) do nothing;
