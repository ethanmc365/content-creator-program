-- A JOB THAT BLIPPED ONCE SHOULD NOT EMAIL ANYBODY.
--
-- Ethan: "I noticed healthchecks.io said Tryp was down for a while - is this
-- right, or just check that it's set up correctly and is working. I've been
-- getting constant emails saying that it's down and it's very annoying."
--
-- NOTHING WAS DOWN. Checked against production:
--
--   * `cron-health` has run 19 times since 10:30 and every one succeeded.
--   * ALL SIXTEEN cron jobs have zero non-succeeded runs in 48 hours, so the
--     database has never once posted to the `/fail` endpoint.
--   * healthchecks.io has returned HTTP 200 "OK" to every ping since 11:30,
--     on the quarter hour, with no gaps.
--
-- The alerts came from the hour between the two. The cron job shipped and
-- started running at 10:30, and it returns early - deliberately, that is how it
-- ships - while `healthchecks_cron_url` is unset. The URL was pasted into
-- `private.config` at about 11:30. So for that hour healthchecks.io had a check
-- expecting a ping every 15 minutes and was receiving nothing, which is exactly
-- what a check is for and exactly what it did. The monitor was watching an
-- unconnected pipe.
--
-- That is not a bug, and it is also not something to shrug at, because the
-- SECOND source of annoying email is real and has not fired yet only by luck:
--
-- ANY failure in the last 20 minutes posted to `/fail`, which marks the check
-- down and emails. Two of the sixteen jobs (`reconcile-leaderboards`,
-- `post-scheduled-announcements`) run EVERY MINUTE. One transient failure out
-- of the twenty runs in a window - a network blip reaching an edge function -
-- would have paged him about something that had already fixed itself before he
-- read the mail. Do that a few times and the alert stops meaning anything,
-- which is worse than having no alert at all.
--
-- THE RULE IS NOW "IS IT BROKEN NOW", NOT "DID ANYTHING GO WRONG RECENTLY".
-- A job is failing if its MOST RECENT run failed. A minute-ly job that blipped
-- and recovered has a successful latest run and says nothing; a daily job that
-- failed at 03:00 has a failed latest run and keeps saying so until it is
-- fixed, which is right - one failure of a once-a-day job IS the whole story.
-- It self-heals with no human action, so the check goes back up on its own.
--
-- AND IT LANDS ON THE PANEL, NOT ONLY IN A MAILBOX. Ethan: "if this is an error
-- thing, you should build this into the error monitoring page on the admin
-- panel, so that any error shows up on the On your desk thing on the admin
-- panel so that I can quickly fix them." Every failing job writes a row through
-- `report_system_error` (migration 204) and clears it through
-- `clear_system_error` the moment it runs clean again.

create or replace function public.ping_cron_health()
returns void
language plpgsql
security definer
set search_path to 'public', 'private', 'cron', 'net'
as $$
declare
  v_url    text;
  v_failed int := 0;
  v_detail text := '';
  r        record;
begin
  -- LATEST RUN PER JOB. `distinct on` with the ordering below gives exactly one
  -- row per job - its most recent run - which is the whole of the new rule.
  --
  -- `cron-health` is excluded: this function is itself a cron job, and a
  -- failure of the reporter cannot be reported by the reporter. That gap is
  -- covered by the check going quiet, which healthchecks.io alerts on by
  -- itself. It is the one failure mode email is genuinely better at.
  for r in
    select distinct on (d.jobid)
           j.jobname, d.status, d.return_message, d.end_time
      from cron.job_run_details d
      join cron.job j on j.jobid = d.jobid
     where j.jobname <> 'cron-health'
       and d.end_time is not null
     order by d.jobid, d.end_time desc
  loop
    if r.status <> 'succeeded' then
      v_failed := v_failed + 1;
      v_detail := v_detail || format('%s: %s', r.jobname, coalesce(r.return_message, r.status)) || E'\n';
      perform public.report_system_error(
        'cron',
        'cron:' || r.jobname,
        format('Scheduled job "%s" failed', r.jobname),
        coalesce(r.return_message, r.status),
        '/admin/analytics?tab=errors'
      );
    else
      -- Ticked off automatically. A job that recovered is not Ethan's problem.
      perform public.clear_system_error('cron', 'cron:' || r.jobname);
    end if;
  end loop;

  select value into v_url from private.config where key = 'healthchecks_cron_url';
  -- Not configured is not an error. It is the state this ships in - and it is
  -- also, for one hour on 8 September, the entire explanation for the alerts.
  if v_url is null or btrim(v_url) = '' then return; end if;

  if v_failed > 0 then
    perform net.http_post(
      url     := btrim(v_url) || '/fail',
      body    := jsonb_build_object('failed', v_failed, 'detail', left(v_detail, 4000)),
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
  else
    perform net.http_post(
      url     := btrim(v_url),
      body    := '{}'::jsonb,
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
  end if;
end;
$$;
