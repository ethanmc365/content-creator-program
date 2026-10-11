-- 386 (13 Oct 2026): the video tracker includes VIP and official creators' videos.
-- Ethan: "For the video tracker built into this, we should also have the VIP community, official trip.com creators, etc.
-- All the videos should be accumulative here." VIP videos live in vip_videos, not in tracked_videos, so they are added
-- here at read time over the same view line the tracker uses for the community (app_settings.video_tracker), live
-- creators only, never disqualified ones. Each row says where it came from: `source` community | vip | official.
drop function if exists public.admin_tracked_videos();
create function public.admin_tracked_videos()
returns table(id uuid, submission_id uuid, challenge_id uuid, challenge_title text, history_id uuid, history_title text,
  community_id uuid, market_name text, market_slug text, creator_id uuid, creator_name text, creator_handle text,
  creator_photo text, platform text, video_url text, platform_video_id text, thumbnail_url text,
  posted_at timestamptz, views bigint, views_source text, views_synced_at timestamptz, hook text, hook_source text,
  caption text, notes text, tags text[], reason text, rank integer, qualifies boolean, pinned boolean,
  created_at timestamptz, updated_at timestamptz, screen_text text,
  source text, programme_id uuid, programme_name text, screen_lang text)
language sql stable security definer set search_path to 'public' as $function$
  with line as (
    select coalesce((select (value->>'view_threshold')::bigint from public.app_settings where key = 'video_tracker'), 10000) as v
  )
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
    t.created_at, t.updated_at,
    nullif(btrim(coalesce(t.screen_text, s.screen_text, '')), ''),
    'community'::text, null::uuid, null::text, m.language
  from public.tracked_videos t
  left join public.submissions s on s.id = t.submission_id
  left join public.challenges c on c.id = t.challenge_id
  left join public.challenge_history h on h.id = t.history_id
  left join public.communities m on m.id = t.community_id
  left join public.profiles p on p.id = t.creator_id
  where public.is_admin()
  union all
  select
    v.id, null::uuid,
    null::uuid, null::text,
    null::uuid, null::text,
    vp.community_id, m.name, m.slug,
    v.profile_id, p.name, null::text, p.photo_url,
    v.platform, v.video_url, v.platform_video_id, v.thumbnail_url, coalesce(v.posted_at, v.submitted_at),
    v.logged_views, v.views_source, v.views_synced_at,
    null::text, null::text, v.caption, null::text, null::text[],
    'vip'::text, null::int, true, false,
    v.submitted_at, coalesce(v.views_synced_at, v.submitted_at),
    nullif(btrim(coalesce(v.screen_text, '')), ''),
    coalesce(vp.kind, 'vip'), vp.id, vp.name, m.language
  from public.vip_videos v
  join public.profiles p on p.id = v.profile_id
  left join public.vip_programmes vp on vp.id = v.programme_id
  left join public.communities m on m.id = vp.community_id
  cross join line
  where public.is_admin()
    and v.status = 'tracking'
    and coalesce(v.logged_views, 0) >= line.v
    and not (coalesce(p.is_test, false) or coalesce(p.is_sandbox, false))
  order by 30 desc, 19 desc nulls last, 31 desc
$function$;

select public.lock_down_definer_functions();
