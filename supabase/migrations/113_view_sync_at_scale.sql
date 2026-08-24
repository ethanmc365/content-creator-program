-- ============================================================================
-- 113 - automatic views at real scale, and the end of "lower than recorded"
--
-- Two changes, both from running it for real.
--
-- 1. SCALE. A UK challenge has 39 entries. A Spanish one has 400 to 500, and a
--    worldwide brief could have thousands, all needing a daily read. The sweep
--    was one invocation doing everything, capped at 300, gated on "has the
--    interval elapsed since the last RUN".
--
--    That is the wrong unit. Staleness belongs to the ENTRY, not to the run.
--    The cron now fires hourly and always asks; the function takes the entries
--    whose own reading is older than `interval_hours`, oldest first, in a chunk
--    it can finish comfortably, and continues itself while more remain. A
--    thousand entries refresh across a few hourly ticks instead of one heroic
--    invocation that times out at 900 and leaves the rest stale forever.
--
-- 2. A number no longer refuses to go down. `lower_than_recorded` held the
--    saved figure whenever a reading came in below it, on the theory that views
--    only rise. They do - but the SAVED number was sometimes just wrong (typed
--    from the wrong video), and the guard then preserved the error permanently
--    and flagged the truth as the problem. The platform is the source of truth
--    now; a number typed by hand fills the gaps the platform cannot answer.
-- ============================================================================
set check_function_bodies = off;

-- Oldest-first selection over tens of thousands of rows wants an index. NULLS
-- FIRST matches the query: an entry never read is the most urgent one there is.
create index if not exists submissions_views_staleness_idx
  on public.submissions (views_synced_at nulls first);

-- Retire the flag. Any row still carrying it was holding a number the platform
-- disagreed with, so it is cleared and the next sweep writes the real figure.
update public.submissions
   set views_sync_error = null
 where views_sync_error = 'lower_than_recorded';

-- The cron's job is now simply to ask. The function decides whether anything is
-- stale enough to read, which is what makes a big programme drain steadily
-- instead of in one burst a day.
create or replace function public.run_view_sync(p_force boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  cfg     jsonb := coalesce((select value from public.app_settings where key = 'view_sync'), '{}'::jsonb);
  enabled boolean := coalesce((cfg ->> 'enabled')::boolean, true);
  secret  text := (select value from private.config where key = 'webhook_secret');
begin
  if not p_force and not enabled then
    return jsonb_build_object('fired', false, 'reason', 'disabled');
  end if;

  -- Never start a second sweep on top of a running one.
  if not p_force and public.view_sync_running() then
    return jsonb_build_object('fired', false, 'reason', 'already_running');
  end if;

  perform net.http_post(
    url := 'https://heuhqqoxyggawuckxocp.supabase.co/functions/v1/view-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', coalesce(secret, '')
    ),
    body := '{}'::jsonb
  );

  return jsonb_build_object('fired', true);
end;
$$;

revoke execute on function public.run_view_sync(boolean) from public, anon, authenticated;

-- How many entries are waiting to be read, for the panel to show honestly when
-- a programme is big enough that a sweep takes more than one tick.
create or replace function public.view_sync_backlog()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  every_hrs numeric := coalesce(
    ((select value from public.app_settings where key = 'view_sync') ->> 'interval_hours')::numeric, 24);
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Only admins can read the view sync backlog';
  end if;

  select jsonb_build_object(
    'eligible', count(*),
    'stale', count(*) filter (
      where s.views_synced_at is null
         or s.views_synced_at < now() - make_interval(mins => (every_hrs * 60)::int))
  ) into result
  from public.submissions s
  join public.challenges c on c.id = s.challenge_id
  where c.winners_published_at is null and c.end_date >= now() - interval '30 days';

  return result;
end;
$$;

revoke execute on function public.view_sync_backlog() from public, anon;
grant execute on function public.view_sync_backlog() to authenticated;
