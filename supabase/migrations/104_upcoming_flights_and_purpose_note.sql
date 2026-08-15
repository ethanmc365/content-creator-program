-- 104  The flight log learns about flights that have not happened yet, and
--      lets "Other" say what it actually was.
--
-- WHAT THIS ADDS
--
--   purpose_note   Free text beside `purpose = 'other'`. The taxonomy in 100 is
--                  six values behind a CHECK constraint, and that is right: the
--                  entire value of the field is that it can be COUNTED, and a
--                  free-text reason column is a column with four hundred
--                  distinct values in it and no chart. But "Other" on its own
--                  answers nothing at all - it is the app noting that it did not
--                  ask. Ethan: "whenever you're pressing what for, and click
--                  other, you should be able to type something in, not just it
--                  appears as other."
--                  So the countable field stays exactly as it was and the note
--                  rides beside it. Nothing aggregates on the note; it is shown
--                  on the row it belongs to and nowhere else.
--
-- WHAT THIS DOES NOT ADD, AND WHY THERE IS NO `is_upcoming` COLUMN
--
-- The log can now hold a flight you have not taken yet - which is what makes it
-- possible to say "I will be in Lisbon in March" once, in the place you were
-- already going to type it, and have it reach the collab board. There is no new
-- column for that and there must not be one: whether a flight is upcoming is a
-- fact about TODAY and the date already in the row, and a boolean saying the
-- same thing is a boolean that is wrong the morning after the flight and stays
-- wrong forever. `flown_on > current_date` is the whole definition.
--
-- The only real work is making sure a flight nobody has taken cannot be counted
-- as one that has. Three functions aggregate across creators, and all three
-- would happily have added next March's Tokyo trip to this year's kilometres:
--
--   community_flight_totals()  the figure on the worldwide hub
--   flight_leaderboard()       the three community boards on the log
--   route_flyers()             who else has flown a route you fly
--
-- All three now stop at today. A creator's OWN page can show their upcoming
-- flights (it reads the rows directly, under RLS, and it is their own data);
-- what nobody else's totals may include is a journey that has not happened.

alter table public.flights
  add column if not exists purpose_note text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'flights_purpose_note_len') then
    alter table public.flights add constraint flights_purpose_note_len
      check (purpose_note is null or char_length(purpose_note) <= 80);
  end if;
end $$;

-- An upcoming flight is read constantly by its owner's own page, and the
-- existing index is (creator_id, flown_on desc), which already serves it.

-- ---------------------------------------------------------------------------
-- THE THREE AGGREGATES, ALL NOW BOUNDED BY TODAY.
--
-- Identical to their previous definitions in migrations 100 and 103 except for
-- the `flown_on <= current_date` clause. Repeated in full rather than patched,
-- because `create or replace function` replaces the whole body and a diff in a
-- migration file is a body somebody has to reconstruct from two places.

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
     and f.flown_on <= current_date
$$;

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
     and f.flown_on <= current_date
     and p.is_test = false
     and p.status = 'active'
     and p.deletion_requested_at is null
   group by f.creator_id, p.name, p.photo_url
   order by count(*) desc, p.name
   limit 12
$$;

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
     and f.flown_on <= least(p_to, current_date)
     and p.is_test = false
     and p.status = 'active'
     and p.deletion_requested_at is null
   group by f.creator_id, p.name, p.photo_url
   order by sum(f.distance_km) desc nulls last
   limit 25
$$;

-- REVOKE FROM ANON EXPLICITLY.
--
-- `create or replace` on an existing function KEEPS its existing ACL, so these
-- are already correct - but Supabase's ALTER DEFAULT PRIVILEGES is the trap
-- that has bitten this project twice (migrations 081 and 097), and the cost of
-- restating it is nothing. Check `proacl` after any new function.
revoke all on function public.community_flight_totals() from public;
revoke all on function public.community_flight_totals() from anon;
grant execute on function public.community_flight_totals() to authenticated;

revoke all on function public.route_flyers(text, text) from public;
revoke all on function public.route_flyers(text, text) from anon;
grant execute on function public.route_flyers(text, text) to authenticated;

revoke all on function public.flight_leaderboard(date, date) from public;
revoke all on function public.flight_leaderboard(date, date) from anon;
grant execute on function public.flight_leaderboard(date, date) to authenticated;
