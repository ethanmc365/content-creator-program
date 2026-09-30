-- 300: A VIP'S PORTFOLIO SHOWS THEIR VIP VIDEOS (30 Sep 2026).
--
-- Ethan: "We should have the portfolios for the creators. They should have that for their own ones."
--
-- A VIP does not enter challenges, so their work is in `vip_videos`, not `submissions`, and the public portfolio read
-- only `submissions`. The list is now both, picked and ordered the same way (a `picks` array of ids: a VIP video's id
-- is a uuid like any other), and the headline numbers add them up. The column list is still written out by hand: it
-- is the security boundary (migration 224).
create or replace function public.public_portfolio(p_slug text)
returns json language sql stable security definer set search_path = public as $$
  with port as (
    select cp.*, pr.name, pr.photo_url, pr.bio, pr.city, pr.country, pr.country_code,
           pr.instagram_url, pr.tiktok_url, pr.youtube_url, pr.facebook_url, pr.linkedin_url,
           pr.other_links, pr.created_at as joined_at
    from public.creator_portfolios cp
    join public.profiles pr on pr.id = cp.profile_id
    where cp.is_public
      and cp.slug = lower(btrim(p_slug))
      and pr.status = 'active'
      and pr.deletion_requested_at is null
      and coalesce(pr.is_test, false) = false
  )
  select case when not exists (select 1 from port) then null else (
    select json_build_object(
      'creator', json_build_object(
        'name', port.name, 'photo_url', port.photo_url, 'bio', port.bio,
        'city', port.city, 'country', port.country, 'country_code', port.country_code,
        'joined_at', port.joined_at,
        'links', json_build_object(
          'instagram', port.instagram_url, 'tiktok', port.tiktok_url,
          'youtube', port.youtube_url, 'facebook', port.facebook_url,
          'linkedin', port.linkedin_url, 'other', port.other_links
        )
      ),
      'portfolio', json_build_object(
        'headline', port.headline, 'intro', port.intro, 'about', port.about,
        'tools', port.tools, 'extra_platforms', port.extra_platforms,
        'copy', port.copy, 'published_at', port.published_at
      ),
      'videos', coalesce((
        select json_agg(v order by v.position) from (
          select u.*,
                 -- THE CREATOR'S ORDER WINS, AND VIEWS DECIDE THE REST (unpicked ids get null from array_position).
                 coalesce(array_position(port.picks, u.id), 1000 + row_number() over (order by u.views desc nulls last)) as position
          from (
            select s.id, s.platform, s.video_url, s.thumbnail_url, s.caption,
                   s.logged_views as views, s.submitted_at,
                   com.name as market, c.title as challenge
            from public.submissions s
            left join public.challenges c on c.id = s.challenge_id
            left join public.communities com on com.id = coalesce(s.community_id, c.community_id)
            where s.creator_id = port.profile_id
            union all
            select vv.id, vv.platform, vv.video_url, vv.thumbnail_url, vv.caption,
                   vv.logged_views as views, vv.submitted_at,
                   com2.name as market, null::text as challenge
            from public.vip_videos vv
            join public.vip_programmes vp on vp.id = vv.programme_id
            join public.communities com2 on com2.id = vp.community_id
            where vv.profile_id = port.profile_id and vv.status = 'tracking'
          ) u
          where cardinality(port.picks) = 0 or u.id = any(port.picks)
          order by position
          limit 10
        ) v
      ), '[]'::json),
      'certificates', coalesce((
        select json_agg(json_build_object(
          'title', d.title, 'tier', d.tier, 'accent', d.accent, 'emblem', d.emblem,
          'facts', a.facts, 'serial', a.serial, 'awarded_at', a.awarded_at
        ) order by a.awarded_at desc)
        from public.certificate_awards a
        join public.certificate_designs d on d.id = a.design_id
        where a.profile_id = port.profile_id
          and public.certificates_live()
      ), '[]'::json),
      'stats', (
        select json_build_object(
          'videos', count(*) + (select count(*) from public.vip_videos vv where vv.profile_id = port.profile_id and vv.status = 'tracking'),
          'views', coalesce(sum(s.logged_views), 0)
                   + (select coalesce(sum(vv.logged_views), 0) from public.vip_videos vv where vv.profile_id = port.profile_id and vv.status = 'tracking'),
          'challenges', count(distinct s.challenge_id),
          'markets', count(distinct coalesce(s.community_id, c2.community_id))
        )
        from public.submissions s
        left join public.challenges c2 on c2.id = s.challenge_id
        where s.creator_id = port.profile_id
      )
    ) from port
  ) end;
$$;
