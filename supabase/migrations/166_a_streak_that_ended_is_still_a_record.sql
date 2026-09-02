-- 166: the longest run anybody has EVER had, not just the one they are on.
--
-- Ethan: "as well as the current streaks I want an all-time highest streaks
-- leaderboard, so we have those two leaderboards - one with the current streak
-- and one with the all-time highest, just so that when someone loses a streak
-- it is still recorded."
--
-- That last clause is the whole argument. `streak_leaderboard` only reports a
-- run that reaches today or yesterday, so the moment a forty-day run breaks it
-- vanishes from the product entirely. (It is not hypothetical: one creator in
-- production is sitting on a lost 42-day run that nothing anywhere remembered.)
--
-- IT IS THE SAME ISLANDS, ASKED A DIFFERENT QUESTION. `d - row_number()` is
-- constant across a consecutive block, so the current run is "the island whose
-- last day is today or yesterday" and the best run is "the longest island there
-- has ever been". Deliberately a SECOND function rather than a column on
-- `streak_leaderboard`: that one is called on every open of the streak popup
-- and this only when the reader asks for the record board.
create or replace function public.best_streak_leaderboard(p_limit integer default 50)
returns table(
  profile_id uuid,
  name text,
  photo_url text,
  best_streak integer,
  current_streak integer
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with today as (
    select floor(extract(epoch from (now() at time zone 'Europe/London')) / 86400)::int as d
  ),
  days as (
    select g.player_id as pid, g.day_key as d
      from public.game_scores g
     where g.day_key is not null
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
     where r.last_day >= t.d - 1        -- today, or yesterday's grace
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

revoke all on function public.best_streak_leaderboard(integer) from public;
grant execute on function public.best_streak_leaderboard(integer) to authenticated;
