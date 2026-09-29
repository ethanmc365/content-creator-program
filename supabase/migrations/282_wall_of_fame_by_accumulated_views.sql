-- THE WALL OF FAME, RANKED BY WHAT A CREATOR HAS ACTUALLY EARNED THE PLATFORM.
--
-- Ethan (30 Sep 2026): it "should perhaps not show 1st, 2nd, 3rd ... and instead show
-- everything that has won a challenge (don't show place) and their accumulated views,
-- even if someone didn't win a challenge but has some of the highest views ... the top 30
-- is always loaded and scrollable to the side ... the person with the highest accumulated
-- views appears on the left."
--
-- So the wall is: everyone who has won a podium place in a FINAL result, plus the thirty
-- highest accumulated-view creators, sorted by views, most first. `wins` says how many
-- podiums a card has (0 = a top-viewed creator who has not won yet) but no place is ever
-- returned. Same privacy as before: active, not admin, not test, not leaving,
-- show_on_map on. No ids, no contact details.

drop function if exists public.public_wall_of_fame(integer);

create or replace function public.public_wall_of_fame(p_limit integer default 30)
returns table (name text, photo_url text, total_views bigint, wins integer, videos integer)
language sql stable security definer set search_path to 'public'
as $function$
  with eligible as (
    select p.id, p.name, p.photo_url
      from public.profiles p
     where p.status = 'active' and not p.is_admin
       and not coalesce(p.is_test, false)
       and p.deletion_requested_at is null
       and coalesce(p.show_on_map, true)
  ),
  v as (
    select e.id, e.name, e.photo_url,
           coalesce(sum(s.logged_views), 0)::bigint as total_views,
           count(s.id)::integer as videos
      from eligible e
      left join public.submissions s on s.creator_id = e.id
     group by e.id, e.name, e.photo_url
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
  select v.name, v.photo_url, v.total_views, coalesce(w.wins, 0), v.videos
    from v
    left join w on w.creator_id = v.id
   where v.id in (select id from top_viewers) or coalesce(w.wins, 0) > 0
   order by v.total_views desc, v.name
   limit 90;
$function$;

insert into public.public_rpc_allowlist (proname, reason)
values (
  'public_wall_of_fame',
  'Landing page wall of fame. Name, photo, accumulated views, podium count and video count for creators with show_on_map on. No ids, no contact details, no places.'
)
on conflict (proname) do update set reason = excluded.reason;

select public.lock_down_definer_functions();
