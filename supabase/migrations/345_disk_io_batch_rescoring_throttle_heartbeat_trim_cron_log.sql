-- 345 (6 Oct 2026): DISK IO BUDGET. Supabase warned the project is depleting its Disk IO budget.
-- Measured from pg_stat_statements / pg_stat_user_tables, the writers were:
--   * point_awards: 2.93M inserts + 2.94M deletes for ~413 live rows, results: 412k/412k for 64 live rows. Every single
--     logged_views change (view-sync writes one row per request, 17k of them) re-scored the WHOLE points challenge:
--     delete every auto award, re-insert them all, rebuild results. Hundreds of full rescores an hour, one per entry.
--   * touch_last_seen: 100k updates of a profiles row (and all of profiles' AFTER UPDATE triggers) - one per tab per minute.
--   * cron.job_run_details: 193k rows / 34 MB of run history nobody reads past a day or two.
--
-- 1. A view-sync write no longer rescores inline: it queues the challenge, and a cron (every minute) rescores each queued
--    challenge ONCE however many entries changed. A person editing (auth.uid() set) and every other column still rescore at
--    once, so an admin's correction is instant. The leaderboard now trails a sync by at most a minute.
create table if not exists public.points_recalc_queue (
  challenge_id uuid primary key,
  queued_at timestamptz not null default now()
);
alter table public.points_recalc_queue enable row level security;
revoke all on public.points_recalc_queue from anon, authenticated;

create or replace function public.trg_recalc_points()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare v_challenge uuid;
begin
  v_challenge := coalesce(new.challenge_id, old.challenge_id);
  if exists (select 1 from public.challenges where id = v_challenge and scoring = 'points') then
    -- THE VIEW SYNC'S WRITE (service role, only the view count moved): queue it, the cron rescores once for the whole batch.
    if tg_op = 'UPDATE' and auth.uid() is null
       and old.logged_views is distinct from new.logged_views
       and old.submitted_at is not distinct from new.submitted_at
       and old.challenge_id is not distinct from new.challenge_id
       and old.creator_id is not distinct from new.creator_id
       and old.platform is not distinct from new.platform then
      insert into public.points_recalc_queue (challenge_id) values (v_challenge) on conflict do nothing;
      return new;
    end if;
    perform pg_advisory_xact_lock(hashtext('recalc_points:' || v_challenge::text));
    perform public.recalc_challenge_points_internal(v_challenge);
  end if;
  return coalesce(new, old);
end;
$function$;

create or replace function public.recalc_queued_points()
returns integer language plpgsql security definer set search_path to 'public' as $function$
declare c uuid; n integer := 0;
begin
  for c in delete from public.points_recalc_queue returning challenge_id loop
    perform pg_advisory_xact_lock(hashtext('recalc_points:' || c::text));
    if exists (select 1 from public.challenges where id = c and scoring = 'points') then
      perform public.recalc_challenge_points_internal(c);
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$function$;
revoke all on function public.recalc_queued_points() from public;
revoke all on function public.recalc_queued_points() from anon;
revoke all on function public.recalc_queued_points() from authenticated;

select cron.schedule('recalc-queued-points', '* * * * *', 'select public.recalc_queued_points();');

-- 2. The presence heartbeat writes at most every two minutes per person (the online window is five), and not at all if the
--    profile was seen that recently - an unchanged-enough row is not worth a write plus every trigger on profiles.
create or replace function public.touch_last_seen()
returns void language plpgsql security definer set search_path to 'public' as $function$
begin
  update public.profiles set last_seen_at = now()
   where id = auth.uid() and (last_seen_at is null or last_seen_at < now() - interval '2 minutes');
end; $function$;

-- 3. Run history: keep two days, trim every night; the leaderboard safety net for non-points challenges needs minutes, not seconds.
select cron.schedule('purge-cron-history', '40 3 * * *', $$delete from cron.job_run_details where end_time < now() - interval '2 days'$$);
delete from cron.job_run_details where end_time < now() - interval '2 days';
select cron.alter_job((select jobid from cron.job where jobname = 'reconcile-leaderboards'), schedule := '*/5 * * * *');
