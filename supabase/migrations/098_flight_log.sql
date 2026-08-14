-- 098  The flight log.
--
-- A creator's own record of every flight they have taken: where from, where to,
-- when, and optionally the airline, the flight number and the aircraft. The
-- page on top of it turns that into distance flown, hours in the air, airports,
-- countries, longest hop and the rest.
--
-- WHY `distance_km` IS STORED AND NOT DERIVED. The distance between two
-- airports is a pure function of two coordinates, so storing it is technically
-- redundant - but the coordinates live in a JavaScript file in the front end,
-- which means every aggregate ("how far has this market flown", a leaderboard,
-- a year in review) would otherwise have to be computed by shipping every row
-- to a browser first. One numeric column keeps all of that a `sum()`. It is
-- written by the client at insert time from the same table the page uses, so
-- the number and the map can never disagree.
--
-- WHY THERE IS NO AIRPORT TABLE. Three hundred rows of static reference data
-- that changes never, joined on every read, versus a constant in the bundle.
-- The IATA code IS the foreign key; it is stable, it is what people type, and
-- it is what a boarding pass says.
--
-- `share_with_community` EXISTS NOW AND IS USED BY NOTHING YET. The flight log
-- is going to feed the travel map on a profile and the collab board later, and
-- that is a change to who can SEE a row - which is a policy change, which is a
-- migration. Adding the column with the feature rather than with the display
-- means the answer to "did this creator agree to show these" is recorded from
-- the first flight anybody logs, instead of being back-filled with a guess.
-- Default false: nobody has been asked yet, and the honest default for a
-- question nobody has been asked is no.

create table if not exists public.flights (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  from_iata text not null check (from_iata ~ '^[A-Z]{3}$'),
  to_iata   text not null check (to_iata   ~ '^[A-Z]{3}$'),
  flown_on date not null,
  airline text,
  flight_number text,
  aircraft text,
  cabin text check (cabin in ('economy', 'premium', 'business', 'first')),
  -- Gate to gate, when the person knows it. Null means "estimate it from the
  -- distance", which the page does and labels as an estimate.
  duration_min integer check (duration_min is null or (duration_min > 0 and duration_min < 1200)),
  distance_km numeric(10,2) not null default 0,
  note text,
  share_with_community boolean not null default false,
  created_at timestamptz not null default now(),
  -- A flight from a place to itself is a typo, every time.
  constraint flights_not_a_loop check (from_iata <> to_iata)
);

create index if not exists flights_creator_idx on public.flights (creator_id, flown_on desc);

alter table public.flights enable row level security;

-- Yours, and the team's. Nothing here is readable by another creator today -
-- see the note on share_with_community above for why the column exists anyway.
create policy "flights: own read"
  on public.flights for select to authenticated
  using (creator_id = (select auth.uid()) or public.is_admin());

create policy "flights: own insert"
  on public.flights for insert to authenticated
  with check (creator_id = (select auth.uid()) and public.can_post());

create policy "flights: own update"
  on public.flights for update to authenticated
  using (creator_id = (select auth.uid()))
  with check (creator_id = (select auth.uid()));

create policy "flights: own delete"
  on public.flights for delete to authenticated
  using (creator_id = (select auth.uid()));
