-- 369: Video Ideas reads the words on the video, includes VIP videos, and starts at 100,000 views.
--
-- 9 Oct 2026. Ethan: "you have pulled the hooks from all these videos because they're visibly on the screen, but they're in a
-- different language. You could actually pull the text from it ... translate it to any language." TikTok keeps every text sticker
-- a creator typed in its editor (`stickerText`), in the embed page the view reader already downloads for the play count, so the
-- hook costs nothing extra to read: view-sync stores it ONCE per video (when the column is empty) and never again.
--
--  * screen_text on submissions, vip_videos and tracked_videos (the last is the team's own correction, if they type one).
--  * video_ideas(p_min) now starts at 100,000 (was 50,000), adds VIP videos (finished, real VIP creators only), and returns
--    screen_text + screen_lang (the market's language, which is what the creator wrote in).
--  * admin_set_screen_text lets the team type or fix a hook for a video the platform gives no text for.
--  * No trigger, no cron: it is read at the moment the page asks and written at the moment a view count is. Nothing here runs
--    on a timer, so it adds no standing load (the 7 Oct outage was standing load).

alter table public.submissions    add column if not exists screen_text text;
alter table public.vip_videos     add column if not exists screen_text text;
alter table public.tracked_videos add column if not exists screen_text text;

drop function if exists public.video_ideas(bigint);

create function public.video_ideas(p_min bigint default 100000)
returns table(id uuid, platform text, video_url text, thumbnail_url text, posted_at timestamptz, views bigint, hook text, caption text,
              tags text[], creator_id uuid, creator_name text, creator_handle text, creator_photo text, market_name text, market_slug text,
              challenge_title text, pinned boolean, screen_text text, screen_lang text, is_vip boolean)
language sql stable security definer set search_path = public as $$
  select * from (
    select t.id, t.platform, t.video_url, t.thumbnail_url, t.posted_at, t.views,
           t.hook, left(t.caption, 400), t.tags, t.creator_id, coalesce(t.creator_name, p.name), t.creator_handle,
           p.photo_url, m.name, m.slug, coalesce(c.title, h.title), t.pinned,
           nullif(btrim(coalesce(t.screen_text, s.screen_text, '')), ''), m.language, false
      from public.tracked_videos t
      left join public.submissions s on s.id = t.submission_id
      left join public.profiles p on p.id = t.creator_id
      left join public.communities m on m.id = t.community_id
      left join public.challenges c on c.id = t.challenge_id
      left join public.challenge_history h on h.id = t.history_id
     where public.is_member()
       and t.qualifies
       and coalesce(t.views, 0) >= greatest(coalesce(p_min, 100000), 100000)
    union all
    select v.id, v.platform, v.video_url, v.thumbnail_url, v.posted_at, v.logged_views,
           null::text, left(v.caption, 400), null::text[], v.profile_id, p.name, null::text,
           p.photo_url, m.name, m.slug, null::text, false,
           nullif(btrim(coalesce(v.screen_text, '')), ''), m.language, true
      from public.vip_videos v
      join public.profiles p on p.id = v.profile_id
      left join public.vip_programmes vp on vp.id = v.programme_id
      left join public.communities m on m.id = vp.community_id
     where public.is_member()
       and v.status = 'tracking'
       and coalesce(v.logged_views, 0) >= greatest(coalesce(p_min, 100000), 100000)
       and not (coalesce(p.is_test, false) or coalesce(p.is_sandbox, false))
       and coalesce(p.onboarded, false) and p.status = 'active'
  ) x
  order by x.views desc nulls last
  limit 200
$$;
revoke execute on function public.video_ideas(bigint) from public, anon;
grant execute on function public.video_ideas(bigint) to authenticated, service_role;

create or replace function public.admin_set_screen_text(p_kind text, p_id uuid, p_text text)
returns void language plpgsql security definer set search_path = public as $$
declare v_text text := nullif(btrim(coalesce(p_text, '')), '');
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  if exists (select 1 from public.profiles where id = auth.uid() and is_sandbox) then
    raise exception 'SANDBOX_READ_ONLY: this demo account cannot edit hooks.';
  end if;
  if p_kind = 'vip' then update public.vip_videos set screen_text = v_text where id = p_id;
  elsif p_kind = 'tracked' then update public.tracked_videos set screen_text = v_text where id = p_id;
  else raise exception 'Unknown kind.'; end if;
end $$;
revoke execute on function public.admin_set_screen_text(text, uuid, text) from public, anon;
grant execute on function public.admin_set_screen_text(text, uuid, text) to authenticated, service_role;
