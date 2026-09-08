-- INSTAGRAM CAN STOP READING VIEWS WITHOUT ANYTHING SAYING SO.
--
-- Ethan: "if there's any issue with Instagram view reading, ensure it shows up
-- as an error on the admin panel, as in, that needs to be fixed immediately so
-- that I can quickly fix it."
--
-- WHAT ACTUALLY BREAKS. Instagram view counts are read through a public Meta
-- GraphQL query id - a `doc_id`. It is not an account, a login, a token or a
-- session; it is a number that identifies the SHAPE of a query, like a version
-- on an endpoint, and Meta rotates it occasionally. When they do, every
-- Instagram read starts failing while TikTok and YouTube carry on exactly as
-- before. Nothing is down, nothing errors loudly, and the whole programme is
-- measured on views - so this is the failure most likely to sit unnoticed for a
-- month, which is precisely why it is worth a watchdog.
--
-- WHY THIS IS SQL AND NOT PART OF THE SYNC.
--
-- The obvious place is the edge function: count Instagram attempts, count
-- Instagram failures, report at the end of a run. That was written and then
-- thrown away, because it is the worse design in two ways. It needs a deploy of
-- a 1,100-line function to change a threshold, and - the real objection - it
-- can only report what happened INSIDE a run. The failure mode where the sync
-- stops running at all, or never reaches the Instagram rows, produces no run
-- and therefore no report. Nothing is more silent than a reporter that only
-- speaks when it is called.
--
-- The sync already writes the answer down: `submissions.views_sync_error` is
-- set on every failed read and cleared on every good one. So the honest
-- question is a query over persisted state - "of the Instagram entries this
-- platform tried lately, did every single one fail" - and it can be asked by
-- anything, at any time, whether or not a run happened.
--
-- THE THRESHOLD IS THREE, and it is a judgement about false alarms rather than
-- statistics. One failed read is a deleted reel, a private account, a changed
-- handle: normal, and the creator's own business. Below three, "every one
-- failed" is a sentence about a very small number and would fire the day two
-- creators both delete a post. At three or more, a clean sweep has stopped
-- being a coincidence.
--
-- IT CLEARS ITSELF. A window with any successful Instagram read ticks the row
-- off, so this cannot leave a stale red mark on the panel after Meta rotate
-- back or a new id is pasted in - which is exactly what would teach Ethan to
-- ignore it. Same rule as the cron watchdog in 205.
--
-- NOTHING TO SYNC IS NOT A FAULT. Checked against production while writing
-- this: no entry has been synced since 27 August, because the only challenge on
-- the platform is archived and the sweep has nothing live to read. The window
-- test means that state reports nothing at all, which is correct - "quiet"
-- and "broken" must not look the same, in either direction.

create or replace function public.check_instagram_reads(p_hours int default 6)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_tried  int;
  v_failed int;
begin
  select count(*), count(*) filter (where s.views_sync_error is not null)
    into v_tried, v_failed
  from public.submissions s
  where s.platform = 'Instagram'
    and s.views_synced_at > now() - make_interval(hours => p_hours);

  -- Too few to draw a conclusion from, or none at all. Say nothing.
  if v_tried < 3 then return; end if;

  if v_failed = v_tried then
    perform public.report_system_error(
      'integration',
      'instagram:view-reads',
      format('Instagram view counts have stopped updating (%s of %s reads failed)', v_failed, v_tried),
      'Every Instagram read in the last few hours failed, which usually means Meta has rotated the GraphQL doc_id.'
      || E'\n\n'
      || 'No Instagram account, login or token is involved. The fix is to put a current doc_id into private.config '
      || 'as ''instagram_reels_doc_id'' and ''instagram_post_doc_id'' - comma separated, tried in order, so a new one '
      || 'can be added before the old one dies. No deploy is needed. TikTok and YouTube reads are unaffected.',
      '/admin/analytics?tab=errors'
    );
  else
    perform public.clear_system_error('integration', 'instagram:view-reads');
  end if;
end;
$$;

revoke all on function public.check_instagram_reads(int) from public, anon, authenticated;
grant execute on function public.check_instagram_reads(int) to service_role;

-- IT RIDES THE WATCHDOG THAT ALREADY EXISTS.
--
-- A sixteenth cron job for this would be a sixteenth thing to monitor. The
-- health check already runs every fifteen minutes, already knows how to write
-- to the panel, and is already the thing that reports when it does not run - so
-- the Instagram check goes inside it. One heartbeat, two things checked.
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
      perform public.clear_system_error('cron', 'cron:' || r.jobname);
    end if;
  end loop;

  -- The integrations, checked on the same heartbeat. Wrapped so a fault in the
  -- watchdog cannot stop the heartbeat itself: a monitor that takes the system
  -- down with it is worse than no monitor.
  begin
    perform public.check_instagram_reads(6);
  exception when others then
    null;
  end;

  select value into v_url from private.config where key = 'healthchecks_cron_url';
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
