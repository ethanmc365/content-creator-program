-- 408: small fixes from the 13 Oct audit.
--
-- M1  view-sync run lock, claimed atomically. The edge function used to read view_sync_running() and then write
--     the flag, so a button press and the cron landing in the same second could both start a sweep.
--     view_sync_claim() does it in one statement; view_sync_release() frees a claim that found nothing to do.
-- M2  push receipts: unique (notification_id, event), so a retried "delivered"/"clicked" cannot count twice.
--     641 duplicate pairs existed; the earliest row of each is kept.
-- L4  cron history kept 8 days (weekly jobs had no visible history most of the week).
-- L7  notify_inactive_creators evaluated "quiet" twice (notify, then mark); one CTE now does both.
--     Body patched from the live definition; the selection is unchanged.
-- The retired resources bucket no longer accepts SVG (an SVG can carry script).

create or replace function public.view_sync_claim()
 returns text
 language sql
 security definer
 set search_path to 'public'
as $function$
  insert into public.app_settings (key, value, updated_at)
  values ('view_sync_run', jsonb_build_object('running', true, 'started_at', now()), now())
  on conflict (key) do update
     set value = excluded.value, updated_at = now()
   where not coalesce((public.app_settings.value ->> 'running')::boolean
                      and (public.app_settings.value ->> 'started_at')::timestamptz > now() - interval '15 minutes', false)
  returning value ->> 'started_at';
$function$;

create or replace function public.view_sync_release(p_started text)
 returns void
 language sql
 security definer
 set search_path to 'public'
as $function$
  update public.app_settings
     set value = value || '{"running": false}'::jsonb, updated_at = now()
   where key = 'view_sync_run' and value ->> 'started_at' = p_started;
$function$;

insert into public.owner_only_rpcs (proname, why) values
  ('view_sync_claim',   'view-sync run lock; edge function (service role) only'),
  ('view_sync_release', 'view-sync run lock; edge function (service role) only')
on conflict (proname) do nothing;
select count(*) from public.lock_down_definer_functions();

delete from public.push_events e
 using public.push_events k
 where k.notification_id = e.notification_id and k.event = e.event
   and (k.created_at, k.id) < (e.created_at, e.id);
create unique index if not exists push_events_one_per_event on public.push_events (notification_id, event);

select cron.alter_job((select jobid from cron.job where jobname = 'purge-cron-history'),
  command := 'delete from cron.job_run_details where end_time < now() - interval ''8 days''');

update storage.buckets set allowed_mime_types = array_remove(allowed_mime_types, 'image/svg+xml') where id = 'resources';

CREATE OR REPLACE FUNCTION public.notify_inactive_creators()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- One evaluation: the creators marked are exactly the creators the team is told about.
  with quiet as (
    select p.id, p.name, a.last_active_at
    from public.profiles p
    join public.creator_activity() a on a.id = p.id
    where p.status = 'active'
      and not p.is_admin
      and p.is_test = false
      and p.deletion_requested_at is null
      and a.last_active_at > 'epoch'::timestamptz
      and a.last_active_at < now() - interval '30 days'
      and (p.inactive_alerted_at is null or p.inactive_alerted_at < a.last_active_at)
  ), marked as (
    update public.profiles p
       set inactive_alerted_at = now()
      from quiet q
     where p.id = q.id
    returning q.id, q.name
  )
  insert into public.notifications (recipient_id, type, title, body, link)
  select adm.id, 'inactive', 'Creator has gone quiet',
         m.name || ' has not posted, entered or opened the app in over 30 days.',
         '/profile/' || m.id
  from marked m cross join public.profiles adm where adm.is_admin and adm.is_test = false;
end; $function$;
