-- Game numbers for ONE profile, as a PURE read.
--
-- The profile rail needs plays, current streak and best-ever streak for whoever
-- is being looked at. Neither existing function can give it that:
--
--   my_game_streak(p_profile) WRITES. It spends streak freezes as a side effect,
--   so calling it to draw somebody's profile would silently burn their freezes
--   just because a stranger opened the page.
--
--   streak_leaderboard(p_limit) is pure but is a TOP-N over everybody, and it
--   drops anyone whose current streak is 0 - which is most people most of the
--   time, and exactly the profiles that still want to show a best-ever streak.
--
-- So: same definition of a qualifying day as both of those (played OR frozen,
-- Europe/London day keys), same gaps-and-islands run detection, same
-- today-or-yesterday grace on the current run. One definition, three callers.
create or replace function public.profile_game_stats(p_profile uuid)
returns table (plays integer, days integer, current_streak integer, best_streak integer)
language sql
stable
security definer
set search_path to 'public'
as $$
  with today as (
    select floor(extract(epoch from (now() at time zone 'Europe/London')) / 86400)::int as d
  ),
  -- Every day that counts: played, or covered by a freeze. Union, not union
  -- all, so a day with three puzzles on it is still one day.
  days as (
    select g.day_key as d
      from public.game_scores g
     where g.player_id = p_profile and g.day_key is not null
    union
    select f.day_key
      from public.streak_freezes f
     where f.profile_id = p_profile
  ),
  islands as (
    select d.d, d.d - row_number() over (order by d.d) as grp
      from days d, today t
     where d.d <= t.d
  ),
  runs as (
    select count(*)::int as len, max(i.d) as last_day
      from islands i
     group by i.grp
  )
  select
    (select count(*)::int from public.game_scores g where g.player_id = p_profile),
    (select count(*)::int from days),
    -- The run that is still alive: it has to reach today or yesterday.
    coalesce((select r.len from runs r, today t where r.last_day >= t.d - 1 limit 1), 0),
    coalesce((select max(r.len) from runs r), 0);
$$;

-- A definer function is granted EXECUTE to PUBLIC by default, and Supabase's
-- ALTER DEFAULT PRIVILEGES additionally grants it to anon BY NAME. It takes
-- BOTH revokes: half the fix reads exactly like the whole fix unless you look
-- at proacl. A safe one reads back as postgres/authenticated/service_role only.
revoke all on function public.profile_game_stats(uuid) from public;
revoke all on function public.profile_game_stats(uuid) from anon;
grant execute on function public.profile_game_stats(uuid) to authenticated;

notify pgrst, 'reload schema';
