-- WHO FLIES THIS ROUTE, AND HOW MUCH THEY FLY.
--
-- The community map's route card says "Jacob Pulley - 2 flights", meaning two
-- flights ON THIS ROUTE. Ethan: "it should also show the total amount of
-- flights they've logged... it says two for the flight he's been on, but then
-- it should say, like, in total, ten flights."
--
-- Two flights on a route is a fact about the ROUTE; ten flights logged is a
-- fact about the PERSON, and the second is the one that makes a face on a card
-- worth pressing. So the function returns both and the card can say both.
--
-- THE TOTAL COUNTS SHARED FLIGHTS ONLY, which is the same definition
-- `flight_leaderboard` already uses for the number it publishes beside these
-- same faces. Counting private rows here would make the map disagree with the
-- leaderboard and would publish a number the creator opted out of.
--
-- The return type changes, so this is a DROP and a CREATE rather than a
-- REPLACE. Nothing but the app calls it.
drop function if exists public.route_creators(text, text);

create function public.route_creators(p_a text, p_b text)
returns table (
  creator_id uuid,
  name text,
  photo_url text,
  flights bigint,
  total_flights bigint
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with on_route as (
    select f.creator_id, count(*)::bigint as flights
      from public.flights f
     where f.share_with_community
       and least(f.from_iata, f.to_iata)    = least(upper(p_a), upper(p_b))
       and greatest(f.from_iata, f.to_iata) = greatest(upper(p_a), upper(p_b))
       and f.flown_on <= current_date
     group by f.creator_id
  ),
  -- Counted over the creators on this route only, so this is a handful of
  -- index lookups rather than a scan of the whole log.
  lifetime as (
    select f.creator_id, count(*)::bigint as total_flights
      from public.flights f
     where f.share_with_community
       and f.flown_on <= current_date
       and f.creator_id in (select creator_id from on_route)
     group by f.creator_id
  )
  select r.creator_id, p.name, p.photo_url, r.flights,
         coalesce(l.total_flights, r.flights) as total_flights
    from on_route r
    join public.profiles p on p.id = r.creator_id
    left join lifetime l on l.creator_id = r.creator_id
   where p.is_test = false
     and p.status = 'active'
     and p.deletion_requested_at is null
   order by r.flights desc, p.name
   limit 24
$$;

grant execute on function public.route_creators(text, text) to authenticated;
