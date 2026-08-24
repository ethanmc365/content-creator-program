-- ============================================================================
-- 112 - a sync you can watch, and one place for the credentials
--
-- Two problems, both reported from actually using it:
--
-- 1. "Sync now" looked dead. It ran synchronously and a full sweep can take a
--    couple of minutes when a platform is timing out, so the button sat there,
--    the browser eventually gave up on the request, and pressing it again
--    started a SECOND overlapping run. Now a run publishes its progress as it
--    goes and the button polls it, so the UI shows "read 12 of 39" and refuses
--    to start a second run while one is going.
--
-- 2. The credentials were on the challenge results page, which is the page you
--    look at every week, to hold two values you touch once a year. They move to
--    /admin/settings; `view_sync_status()` still reports whether each is
--    present so the results page can say so without hosting the fields.
-- ============================================================================
set check_function_bodies = off;

-- The live run. One row, overwritten; history lives in view_snapshots.
insert into public.app_settings (key, value)
values ('view_sync_run', '{"running": false}'::jsonb)
on conflict (key) do nothing;

create or replace function public.view_sync_status()
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Only admins can read the view sync status';
  end if;

  select jsonb_build_object(
    'settings',  coalesce((select value from public.app_settings where key = 'view_sync'), '{"enabled": true, "interval_hours": 24}'::jsonb),
    'last_run',  (select value from public.app_settings where key = 'view_sync_last_run'),
    'run',       coalesce((select value from public.app_settings where key = 'view_sync_run'), '{"running": false}'::jsonb),
    'instagram_session', coalesce((select btrim(value) <> '' from private.config where key = 'instagram_sessionid'), false),
    'youtube_key',       coalesce((select btrim(value) <> '' from private.config where key = 'youtube_api_key'), false),
    'entries', (
      select jsonb_build_object(
        'total',      count(*),
        'automatic',  count(*) filter (where views_source <> 'manual'),
        'needing_attention', count(*) filter (where views_sync_error is not null)
      )
      from public.submissions s
      join public.challenges c on c.id = s.challenge_id
      where c.winners_published_at is null and c.end_date >= now() - interval '30 days'
    )
  ) into result;

  return result;
end;
$$;

revoke execute on function public.view_sync_status() from public, anon;
grant execute on function public.view_sync_status() to authenticated;

-- A run that died mid-flight (an isolate recycled, a deploy) would otherwise
-- leave `running: true` forever and lock the button out. Anything older than
-- fifteen minutes is treated as finished by whoever asks next.
create or replace function public.view_sync_running()
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce(
    (select (value ->> 'running')::boolean
            and (value ->> 'started_at')::timestamptz > now() - interval '15 minutes'
     from public.app_settings where key = 'view_sync_run'),
    false
  );
$$;

revoke execute on function public.view_sync_running() from public, anon;
grant execute on function public.view_sync_running() to authenticated, service_role;
