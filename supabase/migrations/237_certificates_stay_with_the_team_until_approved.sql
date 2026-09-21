-- 237: CERTIFICATES ARE THE TEAM'S UNTIL ETHAN APPROVES THEM.
--
-- Ethan, 21 Sep 2026: "ensure that the creators don't actually have access to
-- these certificates yet because I don't approve them, although creators can
-- have access to their portfolios." The 16 Sep build put a certificate wall on
-- /rewards on main, three real certificates had been awarded, and those three
-- creators could open them.
--
-- ONE SWITCH, IN THE DATABASE, because every creator-facing surface reads the
-- same table: /rewards, the portfolio's certificate page, the profile embed and
-- the public /p/:slug page (through public_portfolio). Hiding it in the UI would
-- need four gates to agree; this needs one.
--
--   app_settings.certificates_live = {"enabled": false}
--
-- While it is off: a creator reads NO certificate rows (admins read all, so the
-- studio and the Awarded tab work), public_portfolio returns no certificates,
-- and awarding one notifies nobody. The awards themselves are kept, so turning
-- it on shows everything earned in the meantime. Turn it on with
--   update app_settings set value = '{"enabled": true}' where key = 'certificates_live';
insert into public.app_settings (key, value)
values ('certificates_live', '{"enabled": false}'::jsonb)
on conflict (key) do nothing;

create or replace function public.certificates_live()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce((select (value ->> 'enabled')::boolean from public.app_settings where key = 'certificates_live'), false)
$$;
revoke all on function public.certificates_live() from public, anon;
grant execute on function public.certificates_live() to authenticated;

drop policy if exists "creators read their certificates" on public.certificate_awards;
create policy "creators read their certificates" on public.certificate_awards
  for select using (
    (select public.is_admin())
    or (profile_id = (select auth.uid()) and (select public.certificates_live()))
  );

drop trigger if exists certificate_awarded_notifies on public.certificate_awards;
create trigger certificate_awarded_notifies
  after insert on public.certificate_awards
  for each row when (public.certificates_live())
  execute function public.on_certificate_awarded();

-- The public page shows certificates only once they are live. Otherwise the
-- function is exactly as it was.
CREATE OR REPLACE FUNCTION public.public_portfolio(p_slug text)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
                 coalesce(array_position(port.picks, s.id), 1000 + row_number() over (order by s.logged_views desc nulls last)) as position
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
          and public.certificates_live()
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
$function$;
