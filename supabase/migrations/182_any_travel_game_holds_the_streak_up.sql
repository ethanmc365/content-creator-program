-- ============================================================================
-- 182 - any travel game holds the streak up, not only the three puzzles.
--       APPLIED 3 Sep 2026.
--
-- THE BUG. Ethan: "a streak should go up any time I play any of the travel
-- games. Today I just played the guess the flag game but the streak didn't come
-- up - it seems to be only counting the puzzles."
--
-- The rule he wrote months ago is the one the server was already trying to
-- implement: "you have to play at least one travel game every day for your
-- streak to go up, this can be a daily puzzle game or another travel game."
-- The streak counts `game_scores.day_key`. The three DAILY PUZZLES stamp it.
-- The QUIZ modes never have: in production, 35 rows of `flags`, 26 of
-- `currencies`, 24 of `airports` and 16 of `map`, every one with day_key NULL.
-- A hundred games played, none of them able to hold a run up.
--
-- WHY NOT JUST STAMP IT ON THE WAY IN. Because `day_key` is not a timestamp,
-- it is a LOCK: `unique (player_id, mode, day_key)` is what enforces "one go a
-- day" on the daily puzzles. A quiz is replayable and saves a row per round, so
-- writing day_key there turns the second "Play again" of the afternoon into a
-- constraint violation. (Tried it; that is exactly what happened.)
--
-- So the DAY is derived where it is READ instead. `game_day()` is the one
-- definition: the stamp when there is one, otherwise the London day the row was
-- created on - for a quiz round exactly as true, just not unique. Every
-- historical round became countable at the same moment, with no backfill.
--
-- All three readers move together, because a streak that reads one way on the
-- card and another on the leaderboard is the bug lib/gameStreak already fixed.
--
-- VERIFIED: the account whose only play today was `flags` went from "today not
-- counted" to a live 52-day run with today counted.
-- ============================================================================

-- STABLE, not IMMUTABLE: `timestamptz at time zone` depends on the tz database,
-- which is also why this cannot be a generated column on the table.
create or replace function public.game_day(p_day_key int, p_created_at timestamptz)
returns int
language sql
stable
set search_path to 'public'
as $function$
  select coalesce(
    p_day_key,
    floor(extract(epoch from (p_created_at at time zone 'Europe/London')) / 86400)::int
  );
$function$;

comment on function public.game_day(int, timestamptz) is
  'The London day a game round belongs to. Prefers the daily-puzzle stamp; falls back to the day the row was written, which is how replayable quiz rounds count towards a streak without taking the one-go-a-day lock that day_key carries.';

revoke all on function public.game_day(int, timestamptz) from public, anon, authenticated;

-- ------------------------------------------------------------------ the card
-- Body read from the database before editing. Two changes: the day list is
-- built with game_day() over EVERY row rather than only stamped ones, and
-- `v_first` holds the earliest day so the freeze loop no longer re-queries
-- min(day_key) (which would have gone back to only the stamped rows).
create or replace function public.my_game_streak(p_profile uuid default null::uuid)
returns table(current_streak integer, best_streak integer, freezes_left integer, frozen_days integer[])
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  c_freezes constant int := 5;   -- per calendar month
  v_me      uuid := coalesce(p_profile, auth.uid());
  v_today   int;
  v_days    int[];
  v_frozen  int[];
  v_month   text;
  v_used    int;
  v_cursor  int;
  v_run     int := 0;
  v_best    int := 0;
  v_cur     int := 0;
  v_gap     boolean;
  v_i       int;
  v_first   int;
begin
  if v_me is null then return; end if;

  v_today := floor(extract(epoch from (now() at time zone 'Europe/London')) / 86400)::int;

  -- EVERY GAME, not only the stamped ones. This is the whole fix.
  select coalesce(array_agg(distinct public.game_day(day_key, created_at)), '{}')
    into v_days
  from public.game_scores where player_id = v_me;

  if array_length(v_days, 1) is null then
    return query select 0, 0, c_freezes, '{}'::int[];
    return;
  end if;

  v_first := (select min(d) from unnest(v_days) d);

  for v_i in greatest(v_today - 60, v_first) .. v_today - 1 loop
    if v_i = any (v_days) then continue; end if;
    if not (v_i - 1 = any (v_days)) or not exists (
      select 1 from unnest(v_days) d where d > v_i
    ) then continue; end if;
    v_month := public.day_key_month(v_i);
    select count(*) into v_used from public.streak_freezes f
      where f.profile_id = v_me and public.day_key_month(f.day_key) = v_month;
    exit when v_used >= c_freezes and v_month = public.day_key_month(v_today);
    if v_used < c_freezes then
      insert into public.streak_freezes (profile_id, day_key) values (v_me, v_i)
      on conflict do nothing;
    end if;
  end loop;

  select coalesce(array_agg(day_key), '{}') into v_frozen
  from public.streak_freezes where profile_id = v_me;

  v_days := (select coalesce(array_agg(distinct d), '{}') from (
    select unnest(v_days) as d union select unnest(v_frozen)
  ) x);

  v_cursor := (select min(d) from unnest(v_days) d);
  while v_cursor <= v_today loop
    if v_cursor = any (v_days) then
      v_run := v_run + 1;
      if v_run > v_best then v_best := v_run; end if;
    else
      v_run := 0;
    end if;
    v_cursor := v_cursor + 1;
  end loop;

  v_gap := not (v_today = any (v_days));
  v_cursor := case when v_gap then v_today - 1 else v_today end;
  if v_cursor = any (v_days) then
    while v_cursor = any (v_days) loop
      v_cur := v_cur + 1;
      v_cursor := v_cursor - 1;
    end loop;
  end if;

  select c_freezes - count(*) into v_used from public.streak_freezes f
   where f.profile_id = v_me and public.day_key_month(f.day_key) = public.day_key_month(v_today);

  return query select v_cur, greatest(v_best, v_cur), greatest(v_used, 0), v_frozen;
end;
$function$;

-- ---------------------------------------------------------- the two boards
-- Same one-line change in each `days` CTE, so the boards agree with the card.
create or replace function public.streak_leaderboard(p_limit integer default 50)
returns table(profile_id uuid, name text, photo_url text, current_streak integer, played_today boolean)
language sql
stable security definer
set search_path to 'public'
as $function$
  with today as (
    select floor(extract(epoch from (now() at time zone 'Europe/London')) / 86400)::int as d
  ),
  days as (
    select g.player_id as pid, public.game_day(g.day_key, g.created_at) as d
      from public.game_scores g
    union
    select f.profile_id, f.day_key
      from public.streak_freezes f
  ),
  eligible as (
    select p.id, p.name, p.photo_url
      from public.profiles p
     where p.status = 'active'
       and coalesce(p.is_test, false) = false
       and p.deletion_requested_at is null
  ),
  islands as (
    select d.pid, d.d,
           d.d - row_number() over (partition by d.pid order by d.d) as grp
      from days d, today t
     where d.d <= t.d
  ),
  runs as (
    select i.pid, count(*)::int as len, max(i.d) as last_day
      from islands i
     group by i.pid, i.grp
  ),
  current_run as (
    select r.pid, r.len
      from runs r, today t
     where r.last_day >= t.d - 1        -- today, or yesterday's grace
  )
  select e.id, e.name, e.photo_url,
         coalesce(c.len, 0) as current_streak,
         exists (select 1 from days dd, today t where dd.pid = e.id and dd.d = t.d) as played_today
    from eligible e
    left join current_run c on c.pid = e.id
   where coalesce(c.len, 0) > 0
   order by coalesce(c.len, 0) desc, e.name asc
   limit greatest(1, least(p_limit, 200));
$function$;

create or replace function public.best_streak_leaderboard(p_limit integer default 50)
returns table(profile_id uuid, name text, photo_url text, best_streak integer, current_streak integer)
language sql
stable security definer
set search_path to 'public'
as $function$
  with today as (
    select floor(extract(epoch from (now() at time zone 'Europe/London')) / 86400)::int as d
  ),
  days as (
    select g.player_id as pid, public.game_day(g.day_key, g.created_at) as d
      from public.game_scores g
    union
    select f.profile_id, f.day_key
      from public.streak_freezes f
  ),
  eligible as (
    select p.id, p.name, p.photo_url
      from public.profiles p
     where p.status = 'active'
       and coalesce(p.is_test, false) = false
       and p.deletion_requested_at is null
  ),
  islands as (
    select d.pid, d.d,
           d.d - row_number() over (partition by d.pid order by d.d) as grp
      from days d, today t
     where d.d <= t.d
  ),
  runs as (
    select i.pid, count(*)::int as len, max(i.d) as last_day
      from islands i
     group by i.pid, i.grp
  ),
  best as (
    select r.pid, max(r.len) as len
      from runs r
     group by r.pid
  ),
  current_run as (
    select r.pid, r.len
      from runs r, today t
     where r.last_day >= t.d - 1
  )
  select e.id, e.name, e.photo_url,
         coalesce(b.len, 0) as best_streak,
         coalesce(c.len, 0) as current_streak
    from eligible e
    join best b on b.pid = e.id
    left join current_run c on c.pid = e.id
   where coalesce(b.len, 0) > 0
   order by coalesce(b.len, 0) desc, e.name asc
   limit greatest(1, least(p_limit, 200));
$function$;
