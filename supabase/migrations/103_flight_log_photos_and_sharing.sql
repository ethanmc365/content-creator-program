-- 103  The flight log becomes a shared thing: a photo per trip, and the two
--      questions a log can only answer if other people's logs are in it.
--
-- WHAT THIS ADDS
--
--   photo_url   One image per trip. The log already records where and when; a
--               photograph is the only part of a flight anybody actually wants
--               to look at again, and it is what turns a row into a memory.
--               ONE, not a gallery: a gallery is the travel gallery on a
--               profile, which already exists, and a second one attached to
--               flights would be two places to put the same photo. Public
--               bucket (`gallery`), same as every other creator image.
--
--   share_with_community  ALREADY EXISTED, unwritten, since migration 098 -
--               added then precisely so that the answer to "did this creator
--               agree to show these" would be recorded from the first flight
--               anybody logged rather than back-filled with a guess. This is
--               the migration that starts asking, and the two functions below
--               are the only things that ever read a row it is false on.
--
-- WHAT IS SHARED, AND WHAT IS NEVER SHARED
--
-- A flight row is a map of somebody's life: where they live, when they were
-- away, which seat, what they wrote about it. None of that is opened up here.
-- Both functions return ONLY:
--
--     who flew, how many times, how far, and between which airports
--
-- and only for rows the creator has explicitly ticked. No dates, no seat, no
-- flight number, no note, no photo. The distinction matters because "3 other
-- creators have flown LIS to NRT" is a useful thing to know about a community
-- and "Ana was in Tokyo from the 4th to the 19th of March" is a thing about
-- Ana that she did not agree to publish.
--
-- RLS on `flights` itself is UNCHANGED - still own-read-only. These are
-- SECURITY DEFINER functions with a fixed, narrow projection, which is the only
-- way to expose an aggregate over private rows without opening the rows.

alter table public.flights
  add column if not exists photo_url text;

-- The lookup both functions do: a route is UNORDERED (Lisbon to Tokyo and Tokyo
-- to Lisbon are the same line on a map and the same pair of places in a life),
-- so it is indexed on the sorted pair.
create index if not exists flights_shared_route_idx
  on public.flights (least(from_iata, to_iata), greatest(from_iata, to_iata))
  where share_with_community;

create index if not exists flights_shared_creator_idx
  on public.flights (creator_id, flown_on)
  where share_with_community;

-- ---------------------------------------------------------------------------
-- WHO ELSE HAS FLOWN THIS.
--
-- The point of the feature is the introduction, so it names people rather than
-- returning a bare count: "3 other creators have flown this" is trivia, and
-- "Ana, Marco and Sofia have flown this" is a reason to open a DM.
--
-- The caller is excluded - being told you have flown your own route is not an
-- introduction - and so is anybody the rest of the app already hides: test
-- accounts, deactivated profiles and anyone mid-deletion.
create or replace function public.route_flyers(p_a text, p_b text)
returns table (creator_id uuid, name text, photo_url text, flights bigint)
language sql
security definer
set search_path = public
stable
as $$
  select f.creator_id, p.name, p.photo_url, count(*)::bigint
    from public.flights f
    join public.profiles p on p.id = f.creator_id
   where f.share_with_community
     and least(f.from_iata, f.to_iata)    = least(upper(p_a), upper(p_b))
     and greatest(f.from_iata, f.to_iata) = greatest(upper(p_a), upper(p_b))
     and f.creator_id <> (select auth.uid())
     and p.is_test = false
     and p.status = 'active'
     and p.deletion_requested_at is null
   group by f.creator_id, p.name, p.photo_url
   order by count(*) desc, p.name
   limit 12
$$;

-- ---------------------------------------------------------------------------
-- THE COMMUNITY LEADERBOARD, over a window the caller names.
--
-- WHY IT RETURNS AIRPORT CODES RATHER THAN A COUNTRY COUNT. The database has
-- no idea what an airport is - there is deliberately no airport table (see
-- migration 098: three hundred rows of static reference data that changes never
-- versus a constant in the bundle). So "most countries" cannot be computed
-- here, and the honest thing is to return the distinct codes and let the page
-- that already owns the airport table do the mapping. The codes are three
-- letters of a route the creator has agreed to share, which is exactly what
-- `route_flyers` above already exposes about the same rows.
--
-- The window is a parameter rather than "this year" so the page can put this
-- year and last year side by side without a second function.
create or replace function public.flight_leaderboard(p_from date, p_to date)
returns table (
  creator_id uuid,
  name text,
  photo_url text,
  km numeric,
  flights bigint,
  airports text[]
)
language sql
security definer
set search_path = public
stable
as $$
  select
    f.creator_id,
    p.name,
    p.photo_url,
    coalesce(sum(f.distance_km), 0)::numeric,
    count(*)::bigint,
    array_agg(distinct f.from_iata) || array_agg(distinct f.to_iata)
    from public.flights f
    join public.profiles p on p.id = f.creator_id
   where f.share_with_community
     and f.flown_on >= p_from
     and f.flown_on <= p_to
     and p.is_test = false
     and p.status = 'active'
     and p.deletion_requested_at is null
   group by f.creator_id, p.name, p.photo_url
   order by sum(f.distance_km) desc nulls last
   limit 25
$$;

-- REVOKE FROM ANON EXPLICITLY.
--
-- Supabase's ALTER DEFAULT PRIVILEGES grants EXECUTE on every new function to
-- anon, authenticated AND service_role BY NAME, and `revoke ... from public`
-- does NOT remove a named grant. Migrations 081 and 097 both shipped definer
-- functions that were callable by anon because of exactly this. Check `proacl`
-- after any new function.
revoke all on function public.route_flyers(text, text) from public;
revoke all on function public.route_flyers(text, text) from anon;
grant execute on function public.route_flyers(text, text) to authenticated;

revoke all on function public.flight_leaderboard(date, date) from public;
revoke all on function public.flight_leaderboard(date, date) from anon;
grant execute on function public.flight_leaderboard(date, date) to authenticated;
