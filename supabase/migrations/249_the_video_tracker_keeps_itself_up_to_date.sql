-- 249: THE VIDEO TRACKER KEEPS ITSELF UP TO DATE (22 Sep 2026).
--
-- Ethan: "the video tracker should update live for any video over 10k, not just
-- at the end of a challenge. At the end of the challenge it should then
-- correctly update to show every video on the podium, so top 10 for the global
-- challenge, and also any video over 10k. Ensure the functions are automated."
--
-- Three things were wrong:
--
-- 1. NOTHING RAN IT. `sync_tracked_videos()` was admin-guarded and only called
--    by the tracker page itself, so the tracker was exactly as fresh as the last
--    time somebody opened it. It now has an unguarded `_internal` twin (revoked
--    from every API role, the pattern from migration 185) which a cron runs
--    every ten minutes - the view sweep is hourly, so a video crossing 10k is on
--    the tracker within minutes of the read that noticed it - and which a
--    trigger runs the moment a challenge ends or its winners are published.
--
-- 2. "THE PODIUM" WAS ALWAYS THREE. `top_per_challenge` (3) was applied to
--    every challenge, so the Global Challenge's ten paid places would have
--    shown three. A challenge's podium is now ITS OWN paid places
--    (`winners_count`, else the length of `prize_structure`), with the setting
--    only as the fallback for a challenge that defines neither.
--
-- 3. THE PODIUM WAS COUNTED WHILE THE CHALLENGE WAS STILL RUNNING, AND BY VIDEO.
--    A live challenge has no podium yet - its top three videos today are not
--    winners - so while a challenge runs only the view threshold qualifies.
--    Once it has ended the podium is the BOARD's (`results.rank`), which on a
--    points challenge ranks creators by points, not videos by views: each
--    podium creator is represented by their best video, tagged with the place
--    they actually finished. On a best-video board that is the same thing it
--    always was.
--
-- A video that stops qualifying keeps its row and its notes (`qualifies =
-- false`); nothing here deletes, as before.

create or replace function public.tracked_video_candidates(p_threshold bigint, p_top integer)
 returns table(
   submission_id uuid, challenge_id uuid, community_id uuid, creator_id uuid,
   creator_name text, creator_handle text, platform text, video_url text,
   platform_video_id text, views bigint, views_source text,
   views_synced_at timestamptz, posted_at timestamptz, caption text,
   place integer, is_podium boolean
 )
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  with ch as (
    select c.id,
           c.community_id,
           -- ENDED: past its deadline, or no longer active (archived), or its
           -- winners are out. A draft is never ended.
           (c.status <> 'draft'
             and (c.status <> 'active' or c.end_date < now() or c.winners_published_at is not null)) as ended,
           greatest(coalesce(
             nullif(c.winners_count, 0),
             nullif(jsonb_array_length(coalesce(c.prize_structure, '[]'::jsonb)), 0),
             p_top
           ), 0) as seats
      from public.challenges c
  ),
  vids as (
    select
      s.id,
      s.challenge_id,
      coalesce(s.community_id, ch.community_id) as community_id,
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
      ch.ended,
      ch.seats,
      -- This creator's videos in this challenge, best first.
      row_number() over (
        partition by s.challenge_id, s.creator_id
        order by s.logged_views desc nulls last, s.submitted_at asc, s.id
      )::int as mine,
      -- Every video in the challenge, best first (the fallback ranking for a
      -- challenge that has no saved board).
      row_number() over (
        partition by s.challenge_id
        order by s.logged_views desc nulls last, s.submitted_at asc, s.id
      )::int as by_views,
      r.rank as board_rank
    from public.submissions s
    join ch on ch.id = s.challenge_id
    left join public.profiles p on p.id = s.creator_id
    left join public.results r on r.challenge_id = s.challenge_id and r.creator_id = s.creator_id
    where s.logged_views is not null and s.logged_views > 0
  ),
  has_board as (
    select distinct challenge_id from public.results
  ),
  placed as (
    select v.*,
           case
             when not v.ended then null
             -- A saved board: the creator's finishing place, on their best video.
             when exists (select 1 from has_board hb where hb.challenge_id = v.challenge_id)
               then case when v.mine = 1 and v.board_rank is not null and v.board_rank <= v.seats
                         then v.board_rank end
             -- No board at all (an old challenge): the top videos by views.
             else case when v.by_views <= v.seats then v.by_views end
           end as podium_place
      from vids v
  )
  select
    id, challenge_id, community_id, creator_id, creator_name, creator_handle,
    platform, video_url, platform_video_id, views, views_source, views_synced_at,
    submitted_at, caption,
    coalesce(podium_place, by_views) as place,
    (podium_place is not null) as is_podium
  from placed
  where podium_place is not null or views >= p_threshold
$function$;
revoke all on function public.tracked_video_candidates(bigint, integer) from public, anon, authenticated;

-- The arithmetic, unguarded, for the cron and the trigger.
create or replace function public.sync_tracked_videos_internal()
 returns json
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_threshold bigint;
  v_top int;
  v_added int := 0;
  v_updated int := 0;
  v_dropped int := 0;
begin
  -- One at a time: the cron and a challenge ending can land together.
  if not pg_try_advisory_xact_lock(hashtext('sync_tracked_videos')) then
    return json_build_object('skipped', 'already_running');
  end if;

  select coalesce((value->>'view_threshold')::bigint, 10000),
         coalesce((value->>'top_per_challenge')::int, 3)
    into v_threshold, v_top
  from public.app_settings
  where key = 'video_tracker';
  v_threshold := coalesce(v_threshold, 10000);
  v_top := coalesce(v_top, 3);

  create temporary table if not exists _tv_picked on commit drop as
    select * from public.tracked_video_candidates(v_threshold, v_top) limit 0;
  truncate _tv_picked;
  insert into _tv_picked select * from public.tracked_video_candidates(v_threshold, v_top);

  with upserted as (
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
    from _tv_picked pk
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
    -- Only rows that actually changed are written, so a quiet ten minutes is
    -- a no-op rather than a hundred identical updates.
    where (t.views, t.views_synced_at, t.reason, t.rank, t.qualifies, t.caption, t.creator_name)
          is distinct from (excluded.views, excluded.views_synced_at, case when t.reason = 'manual' then 'manual' else excluded.reason end,
                            excluded.rank, true, coalesce(excluded.caption, t.caption), excluded.creator_name)
    returning (xmax = 0) as was_insert
  )
  select
    count(*) filter (where was_insert),
    count(*) filter (where not was_insert)
  into v_added, v_updated
  from upserted;

  -- Live views on rows that still qualify but whose number moved are covered
  -- above; rows that no longer qualify keep everything and stop qualifying.
  update public.tracked_videos t
     set qualifies = false
   where t.submission_id is not null
     and t.reason <> 'manual'
     and t.qualifies
     and not exists (select 1 from _tv_picked pk where pk.submission_id = t.submission_id);
  get diagnostics v_dropped = row_count;

  return json_build_object(
    'threshold', v_threshold,
    'top',       v_top,
    'added',     v_added,
    'updated',   v_updated,
    'dropped',   v_dropped
  );
end;
$function$;
revoke all on function public.sync_tracked_videos_internal() from public, anon, authenticated;

-- The button on the page: same arithmetic, behind the admin guard.
create or replace function public.sync_tracked_videos()
 returns json
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  return public.sync_tracked_videos_internal();
end;
$function$;
revoke all on function public.sync_tracked_videos() from public, anon;
grant execute on function public.sync_tracked_videos() to authenticated;

-- THE MOMENT A CHALLENGE ENDS, the podium lands on the tracker. A bookkeeping
-- side effect must never abort the write it follows (migration 131).
create or replace function public.trg_challenge_tracker_sync()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  begin
    perform public.sync_tracked_videos_internal();
  exception when others then
    raise warning 'video tracker sync after challenge % changed: %', new.id, sqlerrm;
  end;
  return null;
end;
$function$;
revoke all on function public.trg_challenge_tracker_sync() from public, anon, authenticated;

drop trigger if exists trg_challenge_tracker_sync on public.challenges;
create trigger trg_challenge_tracker_sync
  after update of status, winners_published_at, end_date, winners_count, prize_structure on public.challenges
  for each row
  when (old.status is distinct from new.status
        or old.winners_published_at is distinct from new.winners_published_at
        or old.end_date is distinct from new.end_date
        or old.winners_count is distinct from new.winners_count
        or old.prize_structure is distinct from new.prize_structure)
  execute function public.trg_challenge_tracker_sync();

-- EVERY TEN MINUTES. The deadline passing is not a row change (the archive
-- cron runs after midnight), so this is also what puts the podium up within
-- ten minutes of entries closing.
select cron.unschedule(jobid) from cron.job where jobname = 'sync-video-tracker';
select cron.schedule('sync-video-tracker', '*/10 * * * *', $$select public.sync_tracked_videos_internal()$$);

-- And once now.
select public.sync_tracked_videos_internal();
