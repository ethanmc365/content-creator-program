-- The flight log grows up: round trips, a few things worth remembering, and one
-- number the whole community can see.
--
-- WHAT THIS ADDS AND WHY EACH ONE EARNED ITS COLUMN. The rule applied here is
-- the same one that got the cabin picker removed: a field is worth asking for
-- only if something on the page is going to COUNT it. Everything below either
-- feeds a statistic or answers a question the log could not answer before.
--
--   return_of   Round trips. Ethan asked for "the option to put in return
--               dates, if this is a round trip or just a single trip". The
--               model is deliberately TWO ROWS rather than one row with two
--               dates: a return IS a second flight. It has its own date, its
--               own distance and its own place in the year-by-year bars, and
--               storing it as a single row would quietly halve everybody's
--               distance and hours. This column only records that the two rows
--               belong together, so the log can show them as a pair and
--               deleting the outbound does not orphan anything (`on delete set
--               null` - the return still happened).
--
--   seat        The one detail people actually remember and nobody records.
--               It costs one small field and it is what makes a row read like
--               a memory rather than like a database entry.
--
--   purpose     Why the trip happened. This is the column that turns the log
--               into something useful for a CREATOR programme specifically:
--               "how many of my flights last year were for content" is a
--               question a creator has and cannot currently answer.
--
--   rating      One to five. What it buys is "your best flight this year" and
--               "which airline you rate", neither of which can be derived from
--               anything already stored.
--
-- WHAT IS DELIBERATELY NOT HERE. No seat map, no fare, no booking reference, no
-- PNR. A fare is the one thing on a boarding pass people do not want stored,
-- and a booking reference plus a surname is enough to change somebody's flight.

alter table public.flights
  add column if not exists return_of uuid references public.flights(id) on delete set null,
  add column if not exists seat text,
  add column if not exists purpose text,
  add column if not exists rating smallint;

-- Constraints as separate statements so re-running the migration is safe: there
-- is no `add constraint if not exists`.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'flights_seat_len') then
    alter table public.flights add constraint flights_seat_len check (seat is null or char_length(seat) <= 8);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'flights_purpose_known') then
    alter table public.flights add constraint flights_purpose_known
      check (purpose is null or purpose in ('leisure', 'work', 'creator', 'family', 'commute', 'other'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'flights_rating_range') then
    alter table public.flights add constraint flights_rating_range
      check (rating is null or (rating between 1 and 5));
  end if;
end $$;

create index if not exists flights_return_of_idx on public.flights (return_of);

-- ---------------------------------------------------------------------------
-- ONE NUMBER THE WHOLE COMMUNITY CAN SEE.
--
-- The worldwide hub's welcome card lost "Countries reached" (it counted a
-- column onboarding barely fills) and wanted a figure in its place that is
-- honest, grows, and is about travelling. Total distance flown by everybody is
-- exactly that.
--
-- WHY A DEFINER FUNCTION. `flights` is own-read-only under RLS and stays that
-- way: a creator's flight history is a map of where they live and when they are
-- away, and nothing about a community stat justifies opening it. This returns
-- two SCALARS over the whole table and nothing that could identify a row -
-- there is no group-by, no minimum count to worry about, and no way to
-- difference two calls into somebody's itinerary.
--
-- Test accounts are excluded for the same reason they are excluded from every
-- other roster and leaderboard: QA flights are not community flights.
create or replace function public.community_flight_totals()
returns table (total_km numeric, total_flights bigint)
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(sum(f.distance_km), 0)::numeric, count(*)::bigint
    from public.flights f
    join public.profiles p on p.id = f.creator_id
   where p.is_test = false
     and p.status = 'active'
     and p.deletion_requested_at is null
$$;

-- REVOKE FROM ANON EXPLICITLY.
--
-- Supabase's ALTER DEFAULT PRIVILEGES grants EXECUTE on every new function to
-- anon, authenticated AND service_role BY NAME, and `revoke ... from public`
-- does NOT remove a named grant. Migrations 081 and 097 both shipped
-- definer functions that were callable by anon because of exactly this. Check
-- `proacl` after any new function.
revoke all on function public.community_flight_totals() from public;
revoke all on function public.community_flight_totals() from anon;
grant execute on function public.community_flight_totals() to authenticated;
