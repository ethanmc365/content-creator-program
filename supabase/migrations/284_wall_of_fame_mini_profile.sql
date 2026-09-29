-- THE WALL OF FAME OPENS A CREATOR (1 Oct 2026).
--
-- Ethan: pressing a Wall of Fame card "seems to provide no information. It should just show the
-- information like when you click on Recently Active Creators." That dialog draws a bio and the
-- number of countries a creator has been to, and `public_wall_of_fame` did not return either, so
-- a card could only have opened an empty portrait. The same two fields `featured_creators`
-- already makes public are added here; nothing else changes (same people, same order, no ids,
-- no contact details).

drop function if exists public.public_wall_of_fame(integer);

create or replace function public.public_wall_of_fame(p_limit integer default 30)
returns table (name text, photo_url text, total_views bigint, wins integer, videos integer, bio text, countries integer)
language sql stable security definer set search_path to 'public'
as $function$
  with eligible as (
    select p.id, p.name, p.photo_url, p.bio, coalesce(array_length(p.countries_visited, 1), 0) as countries
      from public.profiles p
     where p.status = 'active' and not p.is_admin
       and not coalesce(p.is_test, false)
       and p.deletion_requested_at is null
       and coalesce(p.show_on_map, true)
  ),
  v as (
    select e.id, e.name, e.photo_url, e.bio, e.countries,
           coalesce(sum(s.logged_views), 0)::bigint as total_views,
           count(s.id)::integer as videos
      from eligible e
      left join public.submissions s on s.creator_id = e.id
     group by e.id, e.name, e.photo_url, e.bio, e.countries
  ),
  w as (
    select r.creator_id, count(*)::integer as wins
      from public.results r
      join public.challenges c on c.id = r.challenge_id
     where c.results_status = 'final' and r.rank is not null and r.rank <= 3
     group by r.creator_id
  ),
  top_viewers as (
    select id from v where total_views > 0
     order by total_views desc
     limit greatest(1, least(coalesce(p_limit, 30), 60))
  )
  select v.name, v.photo_url, v.total_views, coalesce(w.wins, 0), v.videos, v.bio, v.countries
    from v
    left join w on w.creator_id = v.id
   where v.id in (select id from top_viewers) or coalesce(w.wins, 0) > 0
   order by v.total_views desc, v.name
   limit 90;
$function$;

insert into public.public_rpc_allowlist (proname, reason)
values (
  'public_wall_of_fame',
  'Landing page wall of fame. Name, photo, bio, countries visited, accumulated views, podium count and video count for creators with show_on_map on. No ids, no contact details, no places.'
)
on conflict (proname) do update set reason = excluded.reason;

select public.lock_down_definer_functions();
