-- FIFTEEN CRON JOBS AND NOBODY WATCHING ANY OF THEM.
--
-- Ethan, 8 Sep 2026: "you said the fifteen pg_cron jobs are unmonitored, so we
-- can use healthchecks.io. What do you need from me to set it up, or how do I
-- set it up? Give me the exact steps if I can do it."
--
-- WHAT WAS ACTUALLY UNMONITORED, because it is worth being precise. The jobs
-- run and `cron.job_run_details` records whether each one succeeded - so the
-- information exists. What does not exist is anybody LOOKING at it. A silent
-- failure of `view-sync` means every Instagram entry stops updating and the
-- first symptom is a creator asking why their views are stuck; a silent failure
-- of `reconcile-leaderboards` means a challenge ends on a stale board.
--
-- WHY THIS IS ONE CHECK AND NOT FIFTEEN. The obvious approach is a
-- healthchecks.io URL pinged at the end of each job, which means editing
-- fifteen cron commands, holding fifteen URLs, and getting a wall of alerts
-- when the database itself is the problem. It also cannot report a job that
-- FAILED - a job whose function raised never reaches its own ping, so the check
-- goes quiet, which is the same signal as the whole database being down.
--
-- This reads the run log instead and reports on everything at once:
--
--   every job succeeded in the window  -> ping the success URL
--   anything failed                    -> ping <url>/fail with the job names
--                                         and the errors in the body
--
-- So a failure is reported as a failure, immediately, with the reason in the
-- alert - rather than as an absence of a signal twenty minutes later.
--
-- WHAT ETHAN HAS TO DO: make one check at healthchecks.io, copy its ping URL,
-- and paste it in. Nothing else. Until he does, this function does nothing at
-- all and costs one query every fifteen minutes.
--
--   insert into private.config (key, value)
--   values ('healthchecks_cron_url', 'https://hc-ping.com/<uuid>')
--   on conflict (key) do update set value = excluded.value;
--
-- `private.config` rather than a constant, for the same reason the Instagram
-- query ids live there: a URL that can be rotated must not need a deploy.
--
-- THE WINDOW IS 20 MINUTES AGAINST A 15-MINUTE SCHEDULE, deliberately. Equal
-- windows leave a seam - a failure landing in the gap between two runs is seen
-- by neither - so they overlap. The cost of the overlap is that one failure can
-- be reported twice, which is the right way round: a repeated alert is noise, a
-- missed one is the thing this exists to prevent.
--
-- Applied 8 Sep 2026. Verified: runs clean as a no-op with no URL configured,
-- the job is scheduled and active, and the detection query returns 0 failures
-- against a run log that currently has none.
create or replace function public.ping_cron_health()
returns void
language plpgsql
security definer
set search_path to 'public', 'private', 'cron', 'net'
as $$
declare
  v_url     text;
  v_failed  int;
  v_detail  text;
begin
  select value into v_url from private.config where key = 'healthchecks_cron_url';
  -- Not configured is not an error. It is the state this ships in.
  if v_url is null or btrim(v_url) = '' then return; end if;

  select count(*),
         coalesce(string_agg(format('%s: %s', j.jobname, coalesce(d.return_message, d.status)), E'\n'), '')
    into v_failed, v_detail
  from cron.job_run_details d
  join cron.job j on j.jobid = d.jobid
  where d.start_time > now() - interval '20 minutes'
    and d.status <> 'succeeded'
    -- This function is itself a cron job; a failure of the reporter cannot be
    -- reported by the reporter, so it is left out rather than pretended about.
    and j.jobname <> 'cron-health';

  if v_failed > 0 then
    perform net.http_post(
      url := btrim(v_url) || '/fail',
      body := jsonb_build_object('failed', v_failed, 'detail', left(v_detail, 4000)),
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
  else
    perform net.http_post(
      url := btrim(v_url),
      body := '{}'::jsonb,
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
  end if;
end;
$$;

-- Nobody calls this from the API. It is a cron job and only postgres runs it.
revoke all on function public.ping_cron_health() from public, anon, authenticated;

select cron.schedule('cron-health', '*/15 * * * *', 'select public.ping_cron_health();');
