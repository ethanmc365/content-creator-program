-- PUSH ANALYTICS THAT TELL "NOT SHOWN" FROM "NOT REPORTED" (2 Oct 2026).
--
-- Ethan: "push notifications analytics seem inaccurate and why is it showing so many were sent to
-- devices that have them on but not actually reached the device?"
--
-- Measured on prod: 771 sends, 400 "shown". Per person the gap is not spread out, it is whole
-- people: twenty-odd creators with 6-12 sends each and ZERO shown, next to creators whose phones
-- report nearly every one. Those twenty have not opened the app since 30 Sep, so their phones are
-- still running the service worker from BEFORE delivery tracking existed (a service worker only
-- updates when the app is opened). Their pushes may well have arrived - the phone simply has no code
-- that says so. Counting them as "not shown" is what made the funnel look broken.
--
-- So a person counts as REPORTING once any of their devices has ever reported a push shown or
-- tapped. "Shown" is now measured against sends to reporting people, and sends to everybody else are
-- their own honest bucket: `unconfirmed` (arrived or not, we cannot know until they open the app).
--
-- AND A CRON BLIP IS NOT AN ERROR. The last two rows in Error monitoring were "job startup timeout"
-- on the two every-minute jobs at 20:45 on 1 Oct, cleared by the next run a minute later. pg_cron
-- writes that when its worker cannot start in time (a busy moment on the database); the job simply
-- runs again on its next tick. The heartbeat now only reports a startup timeout when the job's last
-- THREE runs all failed - any other failure is still reported on the first.

drop function if exists public.admin_push_analytics(integer, integer, integer);

create or replace function public.admin_push_analytics(p_days integer default 30, p_recent integer default 50, p_offset integer default 0)
returns jsonb
language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  window_start timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365)));
  tracked timestamptz := (select min(created_at) from public.push_events);
  since timestamptz := greatest(window_start, coalesce(tracked - interval '1 minute', now()));
  out jsonb;
begin
  if not public.is_admin() then raise exception 'admins only'; end if;

  with reporters as (
    select distinct recipient_id from public.push_events where event in ('delivered', 'clicked')
  ),
  n as (
    select nt.id, nt.type, nt.title, nt.created_at, nt.read, nt.recipient_id,
           (nt.recipient_id in (select recipient_id from reporters)) as reporting
      from public.notifications nt
      join public.profiles p on p.id = nt.recipient_id
     where nt.created_at >= since
       and not p.is_admin and not coalesce(p.is_test, false)
  ),
  e as (
    select pe.* from public.push_events pe where pe.created_at >= since and pe.notification_id in (select id from n)
  ),
  per as (
    select n.id, n.type, n.title, n.created_at, n.read, n.recipient_id, n.reporting,
           bool_or(e.event = 'sent') as was_sent,
           bool_or(e.event = 'failed') as was_failed,
           bool_or(e.event = 'no_device') as was_no_device,
           bool_or(e.event = 'muted') as was_muted,
           bool_or(e.event = 'delivered') as was_delivered,
           bool_or(e.event = 'clicked') as was_clicked
      from n left join e on e.notification_id = n.id
     group by n.id, n.type, n.title, n.created_at, n.read, n.recipient_id, n.reporting
  )
  select jsonb_build_object(
    'window_days', greatest(1, least(coalesce(p_days, 30), 365)),
    'tracking_since', tracked,
    'counted_from', case when since > window_start then tracked else since end,
    'recent_total', (select count(*) from (select 1 from per group by type, title, date_trunc('minute', created_at)) g),
    'totals', (select jsonb_build_object(
        'notifications', count(*),
        'sent', count(*) filter (where was_sent),
        'sent_reporting', count(*) filter (where was_sent and reporting),
        'unconfirmed', count(*) filter (where was_sent and not reporting and not was_delivered),
        'not_shown', count(*) filter (where was_sent and reporting and not was_delivered),
        'people_sent', count(distinct recipient_id) filter (where was_sent),
        'people_unconfirmed', count(distinct recipient_id) filter (where was_sent and not reporting),
        'failed', count(*) filter (where was_failed and not was_sent),
        'no_device', count(*) filter (where was_no_device),
        'muted', count(*) filter (where was_muted),
        'delivered', count(*) filter (where was_delivered),
        'clicked', count(*) filter (where was_clicked),
        'opened', count(*) filter (where read),
        'opened_of_sent', count(*) filter (where read and was_sent)
      ) from per),
    'by_type', coalesce((select jsonb_agg(x order by (x->>'notifications')::int desc) from (
        select jsonb_build_object('type', type, 'notifications', count(*),
          'sent', count(*) filter (where was_sent), 'delivered', count(*) filter (where was_delivered),
          'clicked', count(*) filter (where was_clicked), 'opened', count(*) filter (where read)) x
          from per group by type) t), '[]'::jsonb),
    'daily', coalesce((select jsonb_agg(x order by x->>'d') from (
        select jsonb_build_object('d', to_char(date_trunc('day', created_at), 'YYYY-MM-DD'),
          'sent', count(*) filter (where was_sent), 'delivered', count(*) filter (where was_delivered),
          'clicked', count(*) filter (where was_clicked)) x
          from per group by date_trunc('day', created_at)) t), '[]'::jsonb),
    'failures', coalesce((select jsonb_agg(x order by (x->>'n')::int desc) from (
        select jsonb_build_object('host', host, 'status', status_code, 'detail', left(detail, 160), 'n', count(*), 'last', max(created_at)) x
          from e where event in ('failed','removed') group by host, status_code, left(detail, 160) limit 20) t), '[]'::jsonb),
    'recent', coalesce((select jsonb_agg(x order by x->>'at' desc) from (
        select jsonb_build_object('title', title, 'type', type, 'at', min(created_at),
          'recipients', count(*), 'sent', count(*) filter (where was_sent), 'no_device', count(*) filter (where was_no_device),
          'failed', count(*) filter (where was_failed and not was_sent),
          'unconfirmed', count(*) filter (where was_sent and not reporting and not was_delivered),
          'delivered', count(*) filter (where was_delivered), 'clicked', count(*) filter (where was_clicked),
          'opened', count(*) filter (where read)) x
          from per group by type, title, date_trunc('minute', created_at)
          order by min(created_at) desc
          limit greatest(1, least(coalesce(p_recent, 50), 200)) offset greatest(0, coalesce(p_offset, 0))) t), '[]'::jsonb)
  ) into out;
  return out;
end
$function$;

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
  v_blip   boolean;
begin
  for r in
    select distinct on (d.jobid)
           j.jobid, j.jobname, d.status, d.return_message, d.end_time
      from cron.job_run_details d
      join cron.job j on j.jobid = d.jobid
     where j.jobname <> 'cron-health'
       and d.end_time is not null
     order by d.jobid, d.end_time desc
  loop
    v_blip := false;
    if r.status <> 'succeeded' and coalesce(r.return_message, '') ilike '%startup timeout%' then
      -- A blip unless the last three runs all failed.
      select count(*) filter (where x.status = 'succeeded') > 0 into v_blip
        from (select status from cron.job_run_details where jobid = r.jobid and end_time is not null
               order by end_time desc limit 3) x;
    end if;
    if r.status <> 'succeeded' and not v_blip then
      v_failed := v_failed + 1;
      v_detail := v_detail || format('%s: %s', r.jobname, coalesce(r.return_message, r.status)) || E'\n';
      perform public.report_system_error(
        'cron',
        'cron:' || r.jobname,
        format('Scheduled job "%s" failed', r.jobname),
        coalesce(r.return_message, r.status),
        '/admin/analytics?tab=errors'
      );
    elsif r.status = 'succeeded' then
      perform public.clear_system_error('cron', 'cron:' || r.jobname);
    end if;
  end loop;

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

select public.lock_down_definer_functions();
