-- ============================================================================
-- 108 - automatic view counts, read off the submitted link
--
-- Logging views by hand was the single biggest recurring cost of running a
-- challenge: an admin opening forty links and typing forty numbers, repeatedly,
-- because the numbers move every day. The `view-sync` Edge Function now reads
-- them off the public page the creator already linked to.
--
-- This supersedes migration 068, which dropped the FIRST attempt at this. That
-- one went through the TikTok Display API and needed a reviewed developer app
-- plus per-creator OAuth, so it never went live. Nothing here asks a creator to
-- connect anything, and no column from 068 is resurrected by name except
-- `platform_video_id`, `views_source` and `views_synced_at`, which meant the
-- same things then and mean them now.
-- ============================================================================
set check_function_bodies = off;

-- ---------------------------------------------------------------- submissions
alter table public.submissions
  add column if not exists platform_video_id text,
  add column if not exists views_source text not null default 'manual',
  add column if not exists views_synced_at timestamptz,
  add column if not exists views_sync_error text;

alter table public.submissions drop constraint if exists submissions_views_source_check;
alter table public.submissions add constraint submissions_views_source_check
  check (views_source in ('manual', 'tiktok', 'instagram'));

comment on column public.submissions.platform_video_id is
  'Canonical numeric TikTok id / Instagram shortcode, cached the first time a share-sheet short link is followed so later syncs are a single request.';
comment on column public.submissions.views_sync_error is
  'Why the last read produced nothing: no_video_id, needs_session, session_expired, blocked, no_count_in_page, lower_than_recorded. Null when the last read was clean.';

-- ------------------------------------------------------------- view_snapshots
--
-- Every reading is kept, including ones that never reach the leaderboard. Two
-- reasons: a wrong number is only obvious next to the ones either side of it,
-- and a challenge's growth curve is worth having for the programme analytics.
create table if not exists public.view_snapshots (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions (id) on delete cascade,
  views integer not null,
  source text not null check (source in ('manual', 'tiktok', 'instagram')),
  captured_at timestamptz not null default now()
);

create index if not exists view_snapshots_submission_idx
  on public.view_snapshots (submission_id, captured_at desc);

alter table public.view_snapshots enable row level security;

-- Read is the same audience as the leaderboard the numbers feed; writes are
-- service-role only (the Edge Function), so no insert/update/delete policy.
drop policy if exists "view_snapshots: read for signed-in users" on public.view_snapshots;
create policy "view_snapshots: read for signed-in users"
  on public.view_snapshots for select to authenticated using (true);

drop policy if exists "view_snapshots: admin manage" on public.view_snapshots;
create policy "view_snapshots: admin manage"
  on public.view_snapshots for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ------------------------------------------------------------------ settings
-- How often the sweep runs, in hours, and whether it runs at all. `interval_hours`
-- rather than a cron expression so the admin panel can offer plain choices and
-- the schedule itself never has to be rewritten.
insert into public.app_settings (key, value)
values ('view_sync', '{"enabled": true, "interval_hours": 24}'::jsonb)
on conflict (key) do nothing;

-- ------------------------------------------------------------------ the sweep
--
-- pg_cron ticks hourly and this decides whether the interval has elapsed, so
-- changing the cadence is one UPDATE on app_settings rather than a re-scheduled
-- job. Returns what it decided so a dry run in the Testing Centre can show it.
create or replace function public.run_view_sync(p_force boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  cfg        jsonb  := coalesce((select value from public.app_settings where key = 'view_sync'), '{}'::jsonb);
  last_run   timestamptz;
  every_hrs  numeric := coalesce((cfg ->> 'interval_hours')::numeric, 24);
  enabled    boolean := coalesce((cfg ->> 'enabled')::boolean, true);
  secret     text    := (select value from private.config where key = 'webhook_secret');
begin
  if not p_force and not enabled then
    return jsonb_build_object('fired', false, 'reason', 'disabled');
  end if;

  select ((value ->> 'at')::timestamptz) into last_run
    from public.app_settings where key = 'view_sync_last_run';

  if not p_force and last_run is not null and now() - last_run < make_interval(mins => (every_hrs * 60)::int) then
    return jsonb_build_object('fired', false, 'reason', 'not_due', 'last_run', last_run, 'next_due', last_run + make_interval(mins => (every_hrs * 60)::int));
  end if;

  perform net.http_post(
    url := 'https://heuhqqoxyggawuckxocp.supabase.co/functions/v1/view-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', coalesce(secret, '')
    ),
    body := '{}'::jsonb
  );

  return jsonb_build_object('fired', true, 'last_run', last_run, 'interval_hours', every_hrs);
end;
$$;

-- Same lockdown as every other definer helper (migration 020): nobody holds
-- EXECUTE except the scheduler running as postgres.
revoke execute on function public.run_view_sync(boolean) from public, anon, authenticated;

select cron.unschedule('view-sync')
  where exists (select 1 from cron.job where jobname = 'view-sync');

select cron.schedule('view-sync', '7 * * * *', $$select public.run_view_sync();$$);
