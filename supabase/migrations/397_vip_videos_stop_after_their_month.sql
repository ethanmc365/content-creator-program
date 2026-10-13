-- 397 (13 Oct 2026): a VIP video stops being read once its month is over.
-- A video earns only in the month it was posted (vip_video_counted), so the team's "Stop counting" button is gone and
-- the reader leaves a video alone after its month's final reading. Same cutoff as vipReadCutoff() in view-sync: the
-- start of the current UTC month, six hours into the new month, less fourteen hours for markets east of UTC.
create or replace function public.vip_read_cutoff() returns timestamptz
 language sql stable set search_path to 'public'
as $$ select (date_trunc('month', (now() - interval '6 hours') at time zone 'UTC') at time zone 'UTC') - interval '14 hours' $$;

create or replace function public.vip_run_sync(p_force boolean default false, p_programme uuid default null::uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'private', 'extensions'
as $function$
declare
  secret text := (select value from private.config where key = 'webhook_secret');
  v_hours numeric := coalesce((select (value ->> 'interval_hours')::numeric from public.app_settings where key = 'vip_sync'), 12);
  v_due int;
begin
  select count(*) into v_due from public.vip_videos v
   where v.status = 'tracking' and (p_programme is null or v.programme_id = p_programme)
     and v.submitted_at >= public.vip_read_cutoff()
     and (p_force or v.views_synced_at is null or v.views_synced_at < now() - (v_hours * interval '1 hour'));
  if v_due = 0 then return jsonb_build_object('fired', false, 'reason', 'nothing_due'); end if;
  perform net.http_post(
    url := 'https://heuhqqoxyggawuckxocp.supabase.co/functions/v1/view-sync',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', coalesce(secret, '')),
    body := jsonb_build_object('vip_only', true, 'force', p_force, 'vip_interval_hours', v_hours)
  );
  return jsonb_build_object('fired', true, 'due', v_due);
end $function$;
