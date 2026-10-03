-- 316 (3 Oct 2026): the team's VIP page without test accounts, and a heartbeat that survives a slow network.

-- 1. TEST ACCOUNTS OUT OF THE TEAM'S VIP LISTS. Ethan: "from the recent activity, remove ... the test account, then
--    Ethan joined ... Remove the test VIP from Needs and not junk payment details." The sandbox VIP (qa-vip) is already
--    hidden from the board and the balances by vip_hidden_profile (migration 307); the activity feed and the nudge list
--    were the two places that still drew it. The two leftover events (the sandbox joining and Ethan's own test claim,
--    whose membership was deleted on 1 Oct) are removed.
create or replace function public.vip_attention(p_programme uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare pr public.vip_programmes;
begin
  if not public.vip_can_see(p_programme) then raise exception 'Not yours to see.'; end if;
  select * into pr from public.vip_programmes where id = p_programme;
  return coalesce((
    select jsonb_agg(jsonb_build_object('profile_id', z.profile_id, 'name', z.name, 'photo', z.photo, 'reasons', z.reasons) order by jsonb_array_length(z.reasons) desc, z.name)
      from (
        select m.profile_id, p.name, p.photo_url photo,
               to_jsonb(array_remove(array[
                 case when not public.vip_payment_ready(m.profile_id, pr.currency) then 'no_payment' end,
                 case when m.terms_accepted_at is null or coalesce(m.terms_version, 0) < pr.terms_version then 'no_terms' end,
                 case when m.joined_on < current_date - 10
                       and not exists (select 1 from public.vip_videos v where v.profile_id = m.profile_id and v.submitted_at > now() - interval '10 days') then 'quiet' end,
                 case when exists (select 1 from public.vip_videos v where v.profile_id = m.profile_id and v.status = 'tracking' and v.views_sync_error is not null) then 'sync_error' end
               ], null)) reasons
          from public.vip_members m join public.profiles p on p.id = m.profile_id
         where m.programme_id = p_programme and m.status = 'active'
           and not public.vip_hidden_profile(m.profile_id)) z
     where jsonb_array_length(z.reasons) > 0), '[]'::jsonb);
end $function$;

create or replace function public.vip_timeline(p_programme uuid, p_profile uuid default null::uuid, p_limit integer default 40)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
begin
  if not public.vip_can_see(p_programme) then raise exception 'Not yours to see.'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', e.id, 'kind', e.kind, 'detail', e.detail, 'at', e.at, 'profile_id', e.profile_id,
             'name', pf.name, 'photo', pf.photo_url, 'actor', ac.name) order by e.at desc)
      from (select * from public.vip_events ev
             where ev.programme_id = p_programme and (p_profile is null or ev.profile_id = p_profile)
               and (ev.profile_id is null or not public.vip_hidden_profile(ev.profile_id))
             order by ev.at desc limit greatest(1, least(coalesce(p_limit, 40), 200))) e
      left join public.profiles pf on pf.id = e.profile_id
      left join public.profiles ac on ac.id = e.actor_id), '[]'::jsonb);
end $function$;

delete from public.vip_events e
 using public.profiles p
 where p.id = e.profile_id
   and e.kind = 'joined'
   and (p.is_sandbox or not exists (select 1 from public.vip_members m where m.profile_id = e.profile_id and m.programme_id = e.programme_id));

-- 2. THE HEARTBEAT, GIVEN TIME TO ARRIVE. Ethan got a "cron is down" email: the healthchecks.io ping at 14:45 on
--    3 Oct timed out inside pg_net's default 5 seconds (ten other outbound requests had timed out at 14:31 the same
--    way) - every job was running and succeeding. The ping now has 30 seconds, and a failed ping is retried on the
--    next run five minutes later instead of waiting a whole quarter of an hour (see the schedule change below).
create or replace function public.ping_cron_health()
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'private', 'cron', 'net'
as $function$
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
      -- A worker that could not start in time is a busy minute, not a broken job: only a run of five says otherwise.
      select count(*) filter (where x.status = 'succeeded') > 0 into v_blip
        from (select status from cron.job_run_details where jobid = r.jobid and end_time is not null
               order by end_time desc limit 5) x;
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
      headers := '{"Content-Type": "application/json"}'::jsonb,
      timeout_milliseconds := 30000
    );
  else
    perform net.http_post(
      url     := btrim(v_url),
      body    := '{}'::jsonb,
      headers := '{"Content-Type": "application/json"}'::jsonb,
      timeout_milliseconds := 30000
    );
  end if;
end;
$function$;

-- Every five minutes rather than fifteen: one lost ping no longer leaves a 30-minute hole for the monitor to fall into.
select cron.alter_job(jobid, schedule := '*/5 * * * *') from cron.job where jobname = 'cron-health';
