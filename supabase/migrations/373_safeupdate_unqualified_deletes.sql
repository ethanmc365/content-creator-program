-- 373 (8 Oct 2026): "DELETE requires a WHERE clause" when a creator enters a video.
--
-- WHAT HAPPENED. Migration 363 (8 Oct) made rescoring write only the difference, and to do it the function
-- fills a temp table, which it empties first with a bare `delete from pg_temp._pa_new;`. The API role
-- (`authenticator`) preloads `pg_safeupdate`, which REFUSES any DELETE or UPDATE with no WHERE clause, so every
-- entry that rescored a POINTS challenge through the API (Spain's RETO OCTUBRE, the Global Challenge) failed with
-- that message. The cron and the SQL editor run as another role without the guard, so every rehearsal and every
-- test run in SQL passed - it could only ever fail for a creator pressing Submit.
--
-- THE FIX. `where true` satisfies the guard and changes nothing (the table is empty-on-commit and private to the
-- session). The same one-word fix goes on recalc_queued_points, whose `delete from points_recalc_queue` is the
-- same shape (it runs from cron today, so it was not failing, but it should not depend on who calls it).
--
-- Done by rewriting the LIVE bodies rather than pasting a copy, so nothing else in them can drift.

do $$
declare d text;
begin
  select pg_get_functiondef('public.recalc_challenge_points_internal(uuid)'::regprocedure) into d;
  d := replace(d, 'delete from pg_temp._pa_new;', 'delete from pg_temp._pa_new where true;');
  execute d;

  select pg_get_functiondef('public.recalc_queued_points()'::regprocedure) into d;
  d := replace(d, 'for c in delete from public.points_recalc_queue returning', 'for c in delete from public.points_recalc_queue where true returning');
  execute d;
end $$;
