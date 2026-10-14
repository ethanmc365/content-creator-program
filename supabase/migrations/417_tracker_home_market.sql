-- 417: THE VIDEO TRACKER KNOWS EACH CREATOR'S HOME MARKET (14 Oct 2026).
-- A community video belonged only to its challenge's market, so a Romanian creator's Global Challenge entries sat under
-- Worldwide and picking Romania showed nothing but the Romanian VIPs. `home_id` / `home_name` (the creator's home
-- chapter; a VIP video's is its programme's market) let the page show a market's videos from every challenge.
drop function if exists public.admin_tracked_videos();
CREATE OR REPLACE FUNCTION public.admin_tracked_videos()
 RETURNS TABLE(id uuid, submission_id uuid, challenge_id uuid, challenge_title text, history_id uuid, history_title text, community_id uuid, market_name text, market_slug text, creator_id uuid, creator_name text, creator_handle text, creator_photo text, platform text, video_url text, platform_video_id text, thumbnail_url text, posted_at timestamp with time zone, views bigint, views_source text, views_synced_at timestamp with time zone, hook text, hook_source text, caption text, notes text, tags text[], reason text, rank integer, qualifies boolean, pinned boolean, created_at timestamp with time zone, updated_at timestamp with time zone, screen_text text, source text, programme_id uuid, programme_name text, screen_lang text, home_id uuid, home_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    'community'::text, null::uuid, null::text, m.language,
    hm.id, hm.name
  from public.tracked_videos t
  left join public.submissions s on s.id = t.submission_id
  left join public.challenges c on c.id = t.challenge_id
  left join public.challenge_history h on h.id = t.history_id
  left join public.communities m on m.id = t.community_id
  left join public.profiles p on p.id = t.creator_id
  left join lateral (
    select c2.id, c2.name from public.community_members cm join public.communities c2 on c2.id = cm.community_id and c2.kind = 'chapter'
     where cm.profile_id = t.creator_id and cm.status = 'active' order by cm.is_home desc, cm.joined_at limit 1
  ) hm on true
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
    coalesce(vp.kind, 'vip'), vp.id, vp.name, m.language,
    vp.community_id, m.name
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
$function$

;
revoke all on function public.admin_tracked_videos() from public, anon;
grant execute on function public.admin_tracked_videos() to authenticated;
