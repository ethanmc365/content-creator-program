-- THE PORTFOLIO AS A STRANGER SEES IT.
--
-- APPLIED 16 Sep 2026 as `a_portfolio_anybody_can_open`.
--
-- Ethan: "they should have the option to share it as a link, public profile
-- page at a real URL, opt-in, indexable. People viewing the link will obviously
-- only be able to see the portfolio, nothing else."
--
-- SO THE COLUMN LIST IS THE SECURITY BOUNDARY, and it is written out rather
-- than selected with `p.*`. This function is SECURITY DEFINER and reachable
-- with the PUBLISHABLE key, which ships in the JS bundle - see the security
-- notes on why `verify_jwt: true` does not mean "signed-in only". The definer's
-- rights would happily hand over a date of birth, a home town's coordinates, an
-- email or the referral graph if anything here said `*`. Everything below is
-- either something the creator typed INTO their portfolio or something already
-- on their public profile card.
--
-- NOT HERE, deliberately: dob, age, city_lat/lng, referral_code, referred_by,
-- notif_prefs, status, platform_role, and everything in creator_private.
create or replace function public.public_portfolio(p_slug text)
returns json language sql stable security definer set search_path to 'public' as $$
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
          select s.id, s.platform, s.video_url, s.thumbnail_url, s.caption,
                 s.logged_views as views, s.submitted_at,
                 com.name as market, c.title as challenge,
                 -- THE CREATOR'S ORDER WINS, AND VIEWS DECIDE THE REST.
                 -- `array_position` returns null for anything not picked, so a
                 -- portfolio nobody has arranged falls through to views desc,
                 -- which is the sensible default and the state every one of
                 -- them starts in.
                 coalesce(array_position(port.picks, s.id),
                          1000 + row_number() over (order by s.logged_views desc nulls last)) as position
          from public.submissions s
          left join public.challenges c on c.id = s.challenge_id
          left join public.communities com on com.id = coalesce(s.community_id, c.community_id)
          where s.creator_id = port.profile_id
            and (cardinality(port.picks) = 0 or s.id = any(port.picks))
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
      ), '[]'::json),
      'stats', (
        select json_build_object(
          'videos', count(*),
          'views', coalesce(sum(s.logged_views), 0),
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

-- THE ALLOWLIST IS THE ONLY CORRECT WAY TO MAKE THIS ANON-CALLABLE. Do NOT
-- hand-write `grant execute ... to anon` here: migration 170 exists because a
-- hand revoke/grant in a creating migration was undone four separate times. The
-- event trigger `no_new_function_is_public` re-runs the sweep on every CREATE
-- FUNCTION, and the sweep reads this table. A row here is the declaration; the
-- grant is a consequence.
insert into public.public_rpc_allowlist (proname, reason)
values ('public_portfolio',
        'A creator''s own portfolio, opt-in and off by default. Column list is written out, not p.*; no dob, coordinates, email or private rows.')
on conflict (proname) do update set reason = excluded.reason;

select public.lock_down_definer_functions();
