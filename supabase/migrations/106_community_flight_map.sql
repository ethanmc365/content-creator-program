-- 106: the community's own flight map, and what it flies.
--
-- `/flights/community` could rank people and nothing else. The one thing this
-- data is actually good at - showing the shape of where a whole community goes -
-- was missing, because there was no way to ask for the ROUTES: `flight_leader-
-- board` returns a set of airport codes per creator, which cannot be joined back
-- into pairs without knowing who flew what, and knowing that is exactly what
-- these functions exist to prevent.
--
-- SO THEY ARE AGGREGATES, AND THEY RETURN NO PERSON AT ALL.
--
-- Every rule from migration 103 still holds and is repeated here rather than
-- assumed: opt-in only (`share_with_community`), no test accounts, no deleted or
-- deactivated profiles, and NOTHING but the pair of airports and two counts. No
-- date, no seat, no note, no photograph, no creator id. A route row says "eleven
-- flights, four creators, LIS-LHR" and there is no query you can put on top of
-- it that turns that back into a person's movements.
--
-- `flown_on <= current_date` is what keeps an UPCOMING flight out of it. A
-- future trip is a plan, and this is a record.

-- WHICH PAIRS OF AIRPORTS THE COMMUNITY ACTUALLY FLIES.
-- Normalised with least/greatest so LHR->LIS and LIS->LHR are one route, which
-- is the same normalisation `route_flyers` uses - a map that drew both would
-- draw every return trip twice, on top of itself.
create or replace function public.community_routes()
returns table(a text, b text, flights bigint, creators bigint)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    least(f.from_iata, f.to_iata)    as a,
    greatest(f.from_iata, f.to_iata) as b,
    count(*)::bigint                 as flights,
    count(distinct f.creator_id)::bigint as creators
    from public.flights f
    join public.profiles p on p.id = f.creator_id
   where f.share_with_community
     and f.from_iata is not null
     and f.to_iata is not null
     and f.from_iata <> f.to_iata
     and f.flown_on <= current_date
     and p.is_test = false
     and p.status = 'active'
     and p.deletion_requested_at is null
   group by 1, 2
   order by count(*) desc
   limit 400
$$;

-- WHAT THE COMMUNITY FLIES ON. The same aggregate shape, over the free-text
-- aircraft column, so the page can say "nine of us have been on an A350" - which
-- is the fact that makes somebody open the aircraft collection.
create or replace function public.community_aircraft()
returns table(aircraft text, flights bigint, creators bigint)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    btrim(f.aircraft)                as aircraft,
    count(*)::bigint                 as flights,
    count(distinct f.creator_id)::bigint as creators
    from public.flights f
    join public.profiles p on p.id = f.creator_id
   where f.share_with_community
     and coalesce(btrim(f.aircraft), '') <> ''
     and f.flown_on <= current_date
     and p.is_test = false
     and p.status = 'active'
     and p.deletion_requested_at is null
   group by 1
   order by count(distinct f.creator_id) desc, count(*) desc
   limit 40
$$;

-- THE SINGLE LONGEST FLIGHT ANYBODY HAS SHARED, as a route and a distance and
-- nothing else. A record wall needs a record; a record with a name on it would
-- be a person's movements.
create or replace function public.community_flight_records()
returns table(longest_km numeric, longest_a text, longest_b text, airports bigint)
language sql
stable
security definer
set search_path to 'public'
as $$
  with shared as (
    select f.*
      from public.flights f
      join public.profiles p on p.id = f.creator_id
     where f.share_with_community
       and f.flown_on <= current_date
       and p.is_test = false
       and p.status = 'active'
       and p.deletion_requested_at is null
  ),
  longest as (
    select distance_km, from_iata, to_iata
      from shared
     where distance_km is not null
     order by distance_km desc
     limit 1
  ),
  ports as (
    select count(*)::bigint as n from (
      select from_iata as c from shared union select to_iata from shared
    ) u
  )
  select
    (select distance_km from longest),
    (select from_iata   from longest),
    (select to_iata     from longest),
    (select n from ports)
$$;

-- IT TAKES BOTH REVOKES, AND CHECKING `proacl` IS WHAT PROVED IT.
--
-- The standing note in this repo is that `revoke ... from public` does not take
-- away Supabase's NAMED `anon` grant, which is true and is why 081 and 097 both
-- shipped definer functions a signed-out visitor could call. What that note
-- does not say, and what `proacl` showed the moment these three were applied,
-- is that the reverse is also true: revoking from `anon` alone left
-- `=X/postgres` on all three - the grant to PUBLIC, which `anon` inherits. Half
-- the fix looks exactly like the whole fix unless you go and look.
--
-- So: both, and then read `proacl` back. A safe function here ends up as
-- exactly `{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}`
-- and anything else is a hole.
revoke execute on function public.community_routes() from public;
revoke execute on function public.community_aircraft() from public;
revoke execute on function public.community_flight_records() from public;
revoke execute on function public.community_routes() from anon;
revoke execute on function public.community_aircraft() from anon;
revoke execute on function public.community_flight_records() from anon;
