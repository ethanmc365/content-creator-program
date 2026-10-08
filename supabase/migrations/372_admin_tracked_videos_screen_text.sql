-- 372: the video tracker shows the words ON the video as the hook (9 Oct 2026); same function, one more column (screen_text).
-- Applied through the Supabase connector; the full body is the one below.
drop function if exists public.admin_tracked_videos();
create function public.admin_tracked_videos()
returns table(id uuid, submission_id uuid, challenge_id uuid, challenge_title text, history_id uuid, history_title text, community_id uuid, market_name text, market_slug text, creator_id uuid, creator_name text, creator_handle text, creator_photo text, platform text, video_url text, platform_video_id text, thumbnail_url text, posted_at timestamptz, views bigint, views_source text, views_synced_at timestamptz, hook text, hook_source text, caption text, notes text, tags text[], reason text, rank integer, qualifies boolean, pinned boolean, created_at timestamptz, updated_at timestamptz, screen_text text)
language sql stable security definer set search_path = public as $$
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
    nullif(btrim(coalesce(t.screen_text, s.screen_text, '')), '')
  from public.tracked_videos t
  left join public.submissions s on s.id = t.submission_id
  left join public.challenges c on c.id = t.challenge_id
  left join public.challenge_history h on h.id = t.history_id
  left join public.communities m on m.id = t.community_id
  left join public.profiles p on p.id = t.creator_id
  where public.is_admin()
  order by t.pinned desc, t.views desc nulls last, t.created_at desc
$$;
revoke execute on function public.admin_tracked_videos() from public, anon;
grant execute on function public.admin_tracked_videos() to authenticated, service_role;
