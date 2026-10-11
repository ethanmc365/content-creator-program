-- 382: entries posted before a challenge opened are disqualified by themselves; the cron health check reports a
-- failure once instead of every five minutes; the view sync stops writing its progress into the audit log; the test
-- survey goes and the Global Challenge gets its end-of-challenge survey (11 Oct 2026).

-- ================================================================ 1. posted before the challenge opened
-- Ethan: "the disqualified entries, like entries that were submitted before the actual start of the challenge date,
-- were still just showing up and asking me to disqualify them ... If it was posted before the challenge started, it
-- should be disqualified automatically, and that appears in the disqualified section. The creator would receive the
-- message with the explanation."
--
-- Two moments, because the date is known at two different times:
--   * AT ENTRY, when the link itself carries the date (a full TikTok link, any Instagram link, or a short TikTok link
--     the app already resolved): the entry is refused with a sentence the app shows straight away, so nothing is
--     ever scored and nobody gets a notification about an entry they just watched fail.
--   * LATER, when view-sync resolves a short link or reads the date off YouTube or Facebook and `posted_at` arrives:
--     the entry moves to `submission_disqualifications` (the same place the team's own disqualifications go, so it
--     shows in the Disqualified section and Reinstate works) and the creator is told why.
-- The opening moment is `challenge_starts_at` (midnight of the start date in the market's own timezone), the same rule
-- the results page used to highlight these. A challenge whose winners are published is never touched.

create or replace function public.posted_before_start(p_challenge uuid, p_posted timestamptz)
returns boolean language sql stable security definer set search_path = public as $$
  select p_posted is not null
     and exists (select 1 from public.challenges c where c.id = p_challenge and c.winners_published_at is null)
     and p_posted < public.challenge_starts_at(p_challenge)
$$;

create or replace function public.submission_refuse_early()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_start timestamptz;
begin
  -- Reinstating a disqualified entry puts the same row back on purpose.
  if coalesce(current_setting('tryp.reinstating', true), '') = 'on' then return new; end if;
  if not public.posted_before_start(new.challenge_id, new.posted_at) then return new; end if;
  v_start := public.challenge_starts_at(new.challenge_id);
  raise exception using
    errcode = 'P0001',
    message = 'POSTED_BEFORE_START: This video was posted before the challenge started, so it cannot be entered.',
    detail = to_char(new.posted_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    hint = to_char(v_start at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
end;
$$;

-- Named to sort after trg_submission_posted_at: BEFORE triggers run in name order, and that one fills posted_at.
drop trigger if exists trg_submission_zz_refuse_early on public.submissions;
create trigger trg_submission_zz_refuse_early before insert on public.submissions
  for each row execute function public.submission_refuse_early();

create or replace function public.submission_disqualify_early()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_title text;
  v_start timestamptz;
  v_tz    text;
  v_reason text;
  s public.submissions%rowtype;
begin
  if not public.posted_before_start(new.challenge_id, new.posted_at) then return new; end if;
  -- Another trigger on this same update may already have removed it (a resolved duplicate).
  select * into s from public.submissions where id = new.id;
  if not found then return new; end if;

  select c.title, coalesce(m.timezone, 'Europe/London') into v_title, v_tz
    from public.challenges c left join public.communities m on m.id = c.community_id
   where c.id = new.challenge_id;
  v_start := public.challenge_starts_at(new.challenge_id);
  v_reason := 'This video was posted on ' || to_char(new.posted_at at time zone v_tz, 'FMDD Mon')
    || ', before the challenge started on ' || to_char(v_start at time zone v_tz, 'FMDD Mon')
    || ', so it cannot be entered. Post a new video to take part.';

  begin
    insert into public.submission_disqualifications (id, challenge_id, creator_id, snapshot, reason, disqualified_by)
    values (s.id, s.challenge_id, s.creator_id, to_jsonb(s), v_reason, null)
    on conflict (id) do update set snapshot = excluded.snapshot, reason = excluded.reason,
      disqualified_by = null, disqualified_at = now();
    delete from public.submissions where id = s.id;
  exception when others then
    -- A sandbox row cannot be deleted, and nothing here may break the sync that wrote the date.
    raise warning 'could not disqualify early entry %: %', s.id, sqlerrm;
    return new;
  end;

  begin
    perform public.notify_user(s.creator_id, 'submission',
      'An entry was removed from ' || coalesce(v_title, 'the challenge'), v_reason, '/challenges/' || s.challenge_id);
  exception when others then
    raise warning 'could not notify % about early entry %: %', s.creator_id, s.id, sqlerrm;
  end;
  return new;
end;
$$;

-- Not "UPDATE OF posted_at": a column set by a BEFORE trigger does not fire a column-list trigger, and posted_at is
-- usually filled by trg_submission_posted_at when view-sync writes the resolved video id.
drop trigger if exists trg_submission_zz_disqualify_early on public.submissions;
create trigger trg_submission_zz_disqualify_early after update on public.submissions
  for each row when (new.posted_at is not null and old.posted_at is distinct from new.posted_at)
  execute function public.submission_disqualify_early();

revoke all on function public.posted_before_start(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.submission_refuse_early() from public, anon, authenticated;
revoke all on function public.submission_disqualify_early() from public, anon, authenticated;

-- Reinstating: the team's decision stands over the date rule.
create or replace function public.reinstate_submission(p_submission uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare d public.submission_disqualifications%rowtype;
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  if exists (select 1 from public.profiles where id = auth.uid() and is_sandbox) then
    raise exception 'SANDBOX_READ_ONLY: this demo account cannot reinstate entries.';
  end if;
  select * into d from public.submission_disqualifications where id = p_submission for update;
  if not found then raise exception 'No disqualified entry with that id.'; end if;
  perform set_config('tryp.reinstating', 'on', true);
  insert into public.submissions select * from jsonb_populate_record(null::public.submissions, d.snapshot);
  perform set_config('tryp.reinstating', 'off', true);
  delete from public.submission_disqualifications where id = d.id;

  begin
    perform public.sync_tracked_videos_internal();
  exception when others then
    raise warning 'video tracker sync after reinstating %: %', d.id, sqlerrm;
  end;
end;
$function$;

-- ================================================================ 2. the cron health check
-- Ethan: "There's a scheduled job, VIP award perks, that failed 22 times". It failed TWICE in two days (10:50 on 11 Oct
-- and 16:50 on 9 Oct, both "connection failed": pg_cron could not open a connection at the moment eight jobs started
-- together). The 22 was ping_cron_health counting the same failed run again on every five-minute tick until the next
-- hourly run succeeded, and each of those ticks also told healthchecks.io the site was down, which is the run of
-- "Tryp.com is down" emails.
--
-- Now: a run is judged once, on the first tick after it ended; a one-off "connection failed" or "startup timeout" on
-- a job that has been succeeding is a blip (the next run does the work) and is not reported; and healthchecks.io hears
-- "down" only for a real, fresh failure.
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
    if r.status = 'succeeded' then
      perform public.clear_system_error('cron', 'cron:' || r.jobname);
      continue;
    end if;
    -- Judged once: only a run that ended since the previous tick (every five minutes) is new.
    if r.end_time < now() - interval '6 minutes' then continue; end if;

    v_blip := false;
    if coalesce(r.return_message, '') ~* '(startup timeout|connection failed|could not connect|too many clients)' then
      -- The run before it succeeded: a transient connection problem, not a broken job.
      select coalesce(bool_and(x.status = 'succeeded'), false) into v_blip
        from (select status from cron.job_run_details
               where jobid = r.jobid and end_time is not null and end_time < r.end_time
               order by end_time desc limit 1) x;
    end if;
    if v_blip then continue; end if;

    v_failed := v_failed + 1;
    v_detail := v_detail || format('%s: %s', r.jobname, coalesce(r.return_message, r.status)) || E'\n';
    perform public.report_system_error(
      'cron',
      'cron:' || r.jobname,
      format('Scheduled job "%s" failed', r.jobname),
      coalesce(r.return_message, r.status),
      '/admin/analytics?tab=errors'
    );
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

-- The hourly perk award ran at :50, the same second as five */5 jobs and the two every-minute ones. :53 has company
-- from the every-minute jobs only.
select cron.alter_job(jobid, schedule := '53 * * * *') from cron.job where jobname = 'vip-award-perks';

-- Instagram: "78 of 78 failed" counted every read, including links that are simply wrong. Only reads that never got an
-- answer (blocked / fetch failed) say anything about Instagram itself.
create or replace function public.check_instagram_reads(p_hours integer default 6)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_tried  int;
  v_failed int;
begin
  select count(*), count(*) filter (where s.views_sync_error in ('blocked', 'fetch_failed', 'no_video_id'))
    into v_tried, v_failed
  from public.submissions s
  where s.platform = 'Instagram'
    and s.views_synced_at > now() - make_interval(hours => p_hours);

  if v_tried < 3 then return; end if;

  if v_failed = v_tried then
    perform public.report_system_error(
      'integration',
      'instagram:view-reads',
      format('Instagram view counts have stopped updating (%s of %s reads failed)', v_failed, v_tried),
      'Every Instagram read in the last few hours failed. View-sync now asks again from other Supabase regions when '
      || 'Instagram refuses one, so this means every region was refused, or Meta has rotated the GraphQL doc_id.'
      || E'\n\n'
      || 'No Instagram account, login or token is involved. If it is the doc_id, put a current one into private.config '
      || 'as ''instagram_reels_doc_id'' and ''instagram_post_doc_id'' - comma separated, tried in order. No deploy is '
      || 'needed. TikTok and YouTube reads are unaffected.',
      '/admin/analytics?tab=errors'
    );
  else
    perform public.clear_system_error('integration', 'instagram:view-reads');
  end if;
end;
$function$;

-- ================================================================ 3. the audit log's noise
-- The view sync writes its progress into app_settings on every chunk, and the audit trigger logged each write: 4,129
-- of the last week's 4,513 audit rows, which is why the log page showed "four things" per hundred loaded.
drop trigger if exists trg_audit_app_settings on public.app_settings;
create trigger trg_audit_app_settings after insert on public.app_settings
  for each row when (new.key not in ('view_sync_run', 'view_sync_last_run', 'fx_rates'))
  execute function public.audit_change('settings', 'setting', 'key');
drop trigger if exists trg_audit_app_settings_del on public.app_settings;
create trigger trg_audit_app_settings_del after delete on public.app_settings
  for each row execute function public.audit_change('settings', 'setting', 'key');
drop trigger if exists trg_audit_app_settings_upd on public.app_settings;
create trigger trg_audit_app_settings_upd after update on public.app_settings
  for each row when (new.key not in ('view_sync_run', 'view_sync_last_run', 'fx_rates'))
  execute function public.audit_change('settings', 'setting', 'key', 'value');

delete from public.admin_audit_log
 where entity = 'app_settings' and target_name in ('view_sync_run', 'view_sync_last_run', 'fx_rates');

-- ================================================================ 4. surveys
-- "You can delete the test survey now and make sure that we have a survey set up for the end of the global challenge
-- so they get notified and fill it in at the end."
delete from public.survey_responses where survey_id in (select id from public.surveys where is_test);
delete from public.surveys where is_test;

insert into public.surveys (title, intro, questions, audience, challenge_id, status, timing, thanks, is_test)
select
  'The Global Challenge: how did it go?',
  'Two minutes. Every answer is read by the team and shapes the next challenge.',
  jsonb_build_array(
    jsonb_build_object('id', 'q1', 'type', 'rating', 'prompt', 'How much did you enjoy the Global Challenge?', 'required', true),
    jsonb_build_object('id', 'q2', 'type', 'choice', 'prompt', 'How many videos did you post for it?', 'required', true,
      'options', jsonb_build_array('1', '2 to 4', '5 to 9', '10 or more')),
    jsonb_build_object('id', 'q3', 'type', 'multi', 'prompt', 'What made you post?', 'required', false,
      'options', jsonb_build_array('The prizes', 'The points and the leaderboard', 'The bonus rounds', 'Double points days',
        'The video ideas and hooks', 'The community')),
    jsonb_build_object('id', 'q4', 'type', 'multi', 'prompt', 'What held you back from posting more?', 'required', false,
      'options', jsonb_build_array('Not enough time', 'Ran out of ideas', 'Unsure what would do well',
        'The prizes felt out of reach', 'Views were slow to update', 'Nothing, I posted as much as I wanted')),
    jsonb_build_object('id', 'q5', 'type', 'scale', 'prompt', 'How likely are you to take part in the next challenge?',
      'help', '0 is not at all, 10 is definitely.', 'required', true),
    jsonb_build_object('id', 'q6', 'type', 'text', 'prompt', 'One thing that would make the next challenge better?', 'required', false)
  ),
  'challenge',
  c.id,
  'live',
  'now',
  'Thank you! The team reads every answer before planning the next challenge.',
  false
from public.challenges c
where c.id = '93c6a3c9-7c42-4f92-ad1f-cfcb60dae5a5'
  and not exists (select 1 from public.surveys s where s.challenge_id = c.id and not s.is_test);

-- Told when it opens: the day a challenge ends (archive_ended_challenges flips it to 'archived'), everybody who
-- entered and has a live survey waiting for that challenge gets one notification pointing at it.
create or replace function public.challenge_survey_notice()
returns trigger language plpgsql security definer set search_path = public as $$
declare v record;
begin
  for v in
    select distinct s.creator_id, sv.id as survey_id
      from public.surveys sv
      join public.submissions s on s.challenge_id = sv.challenge_id
     where sv.challenge_id = new.id and sv.status = 'live' and not sv.is_test and sv.audience = 'challenge'
       and s.creator_id is not null
       and not exists (select 1 from public.survey_responses r where r.survey_id = sv.id and r.profile_id = s.creator_id)
  loop
    begin
      perform public.notify_user(v.creator_id, 'challenge',
        coalesce(new.title, 'The challenge') || ' has ended: two minutes?',
        'Tell the team how it went. Your answers shape the next challenge.', '/feedback');
    exception when others then
      raise warning 'survey notice to % failed: %', v.creator_id, sqlerrm;
    end;
  end loop;
  return new;
end;
$$;
revoke all on function public.challenge_survey_notice() from public, anon, authenticated;
drop trigger if exists trg_challenge_survey_notice on public.challenges;
create trigger trg_challenge_survey_notice after update of status on public.challenges
  for each row when (old.status = 'active' and new.status = 'archived')
  execute function public.challenge_survey_notice();
