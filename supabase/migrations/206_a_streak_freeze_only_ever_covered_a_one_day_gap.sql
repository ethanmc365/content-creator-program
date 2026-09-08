-- A STREAK FREEZE ONLY EVER COVERED A ONE-DAY GAP.
--
-- Ethan: "I might have found a problem with the streaks on the games page. I
-- didn't play yesterday, or maybe a couple of days, yet I have streak freezes
-- that didn't seem to get used. They obviously should have been used until I
-- hadn't any left. If I hadn't any left, then yes, my streak should have ended."
--
-- Reproduced against his own row. Today is day 20704. He played 20699, 20700,
-- 20701, missed 20702 AND 20703, played again today. His freezes are
-- 20670, 20677, 20687, 20692, 20702 - so 20702 was frozen and 20703 was not,
-- and the walk back from today stops dead at 20703. Streak: 1, out of a run
-- reaching back to 20648.
--
-- TWO FAULTS, AND THE FIRST IS ONE LINE.
--
-- 1. THE ARRAY THE LOOP TESTS AGAINST WAS NEVER UPDATED BY THE LOOP.
--
--        if not (v_i - 1 = any (v_days)) then continue; end if;
--        ...
--        insert into public.streak_freezes ... values (v_me, v_i);
--
--    `v_days` is the days he PLAYED. A freeze granted for 20702 went into the
--    table but not into `v_days`, so one day later the test "was the day before
--    this one covered" asked about 20702, found it unplayed, and gave up. A
--    freeze could therefore only ever bridge a gap of exactly one day, however
--    many freezes were sitting unused. Every multi-day gap broke the streak
--    while the counter cheerfully reported five freezes left - which is exactly
--    what he saw.
--
-- 2. A FREEZE WAS ONLY GRANTED IF HE HAD ALREADY COME BACK.
--
--        or not exists (select 1 from unnest(v_days) d where d > v_i)
--
--    That clause refused to cover any day after the last one played, so the
--    streak was always dead for as long as somebody was away and only revived
--    retroactively when they returned. A freeze that does not hold the streak
--    up WHILE you are away is not a freeze; the number on the games page is
--    supposed to survive the gap, not be repaired after it. Removed, which
--    also makes the behaviour match the sentence Ethan used: they get spent
--    until there are none left, and then the streak ends.
--
-- 3. `exit when` LEFT THE WHOLE LOOP when the CURRENT month was out of
--    freezes. The loop runs oldest to newest, so that abandoned every gap after
--    it. It is a `continue` now - one month being spent says nothing about
--    another.
--
-- THE BUDGET IS UNCHANGED: five freezes per calendar month, spent when the
-- streak is read. Somebody who stops playing burns their five and the streak
-- then ends, which is the rule Ethan stated and the one the games page has
-- always claimed.
--
-- Everything else in this function is untouched, read out of `pg_get_functiondef`
-- rather than retyped - see supabase/migrations/README.md.

create or replace function public.my_game_streak(p_profile uuid default null::uuid)
returns table(current_streak integer, best_streak integer, freezes_left integer, frozen_days integer[])
language plpgsql
security definer
set search_path to 'public'
as $$
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

  -- EVERY GAME, not only the stamped ones.
  select coalesce(array_agg(distinct public.game_day(day_key, created_at)), '{}')
    into v_days
  from public.game_scores where player_id = v_me;

  if array_length(v_days, 1) is null then
    return query select 0, 0, c_freezes, '{}'::int[];
    return;
  end if;

  v_first := (select min(d) from unnest(v_days) d);

  for v_i in greatest(v_today - 60, v_first) .. v_today - 1 loop
    -- Played that day. Nothing to cover.
    if v_i = any (v_days) then continue; end if;

    -- A FREEZE EXTENDS A RUN; IT DOES NOT START ONE. The day before has to be
    -- covered already - either played, or frozen by an earlier turn of this
    -- same loop, which is the case fault 1 above could not see.
    if not (v_i - 1 = any (v_days)) then continue; end if;

    v_month := public.day_key_month(v_i);
    select count(*) into v_used from public.streak_freezes f
      where f.profile_id = v_me and public.day_key_month(f.day_key) = v_month;

    -- Out of freezes for THAT month: the run ends there. A `continue` and not
    -- an `exit`, because a later month may still have some.
    if v_used >= c_freezes then continue; end if;

    insert into public.streak_freezes (profile_id, day_key) values (v_me, v_i)
    on conflict do nothing;

    -- THE LINE THE WHOLE BUG WAS MISSING. A day that has just been frozen is
    -- covered, so the next day round the loop can build on it.
    v_days := v_days || v_i;
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
$$;
