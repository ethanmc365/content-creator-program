-- DID THE PUSH ACTUALLY GO OUT, AND DID ANYONE OPEN IT?
--
-- Ethan (30 Sep 2026): "do we not have any push notification analytics, like can we see who
-- actually opened them, clicked on them etc, or ensure they were all sent correctly to everyone
-- that has push enabled."
--
-- Until now the answer was a console.log in notify-dispatch and a tally that nobody kept. This
-- is the ledger: one row per thing that happened to one notification.
--
--   sent       the push service accepted it for a device (Apple answers 201 even for a stale
--              endpoint, so this is "handed over", not "arrived")
--   failed     the push service refused it (status_code + host say why)
--   removed    the device was gone (404/410) and the subscription was deleted
--   no_device  the person has the bell but no device with push on
--   muted      the person switched that kind of notification off
--   delivered  the phone's service worker woke up and showed it (reported by public/sw.js)
--   clicked    they tapped it (reported by public/sw.js)
--
-- "Opened" needs no new column: `notifications.read` already says whether the bell item was
-- read, on any device, however they got there.
--
-- Written by the notify-dispatch function and the push-track function with the service role, so
-- there is NO insert policy: a signed-in user cannot write to it. Admins can read.

create table if not exists public.push_events (
  id bigint generated always as identity primary key,
  notification_id uuid,
  recipient_id uuid,
  type text,
  event text not null check (event in ('sent','failed','removed','no_device','muted','delivered','clicked')),
  status_code integer,
  host text,
  detail text,
  created_at timestamptz not null default now()
);
create index if not exists push_events_created_idx on public.push_events (created_at desc);
create index if not exists push_events_notification_idx on public.push_events (notification_id, event);

alter table public.push_events enable row level security;
revoke all on public.push_events from anon, authenticated;
grant select on public.push_events to authenticated;
drop policy if exists "push_events: admins read" on public.push_events;
create policy "push_events: admins read" on public.push_events for select to authenticated using (public.is_admin());

create or replace function public.admin_push_analytics(p_days integer default 30)
returns jsonb
language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  since timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365)));
  out jsonb;
begin
  if not public.is_admin() then raise exception 'admins only'; end if;

  with n as (
    select nt.id, nt.type, nt.title, nt.created_at, nt.read
      from public.notifications nt
      join public.profiles p on p.id = nt.recipient_id
     where nt.created_at >= since
       and not p.is_admin and not coalesce(p.is_test, false)
  ),
  e as (
    select pe.* from public.push_events pe where pe.created_at >= since and pe.notification_id in (select id from n)
  ),
  per as (
    select n.id, n.type, n.title, n.created_at, n.read,
           bool_or(e.event = 'sent') as was_sent,
           bool_or(e.event = 'failed') as was_failed,
           bool_or(e.event = 'no_device') as was_no_device,
           bool_or(e.event = 'muted') as was_muted,
           bool_or(e.event = 'delivered') as was_delivered,
           bool_or(e.event = 'clicked') as was_clicked
      from n left join e on e.notification_id = n.id
     group by n.id, n.type, n.title, n.created_at, n.read
  )
  select jsonb_build_object(
    'window_days', greatest(1, least(coalesce(p_days, 30), 365)),
    'tracking_since', (select min(created_at) from public.push_events),
    'totals', (select jsonb_build_object(
        'notifications', count(*),
        'sent', count(*) filter (where was_sent),
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
          'delivered', count(*) filter (where was_delivered), 'clicked', count(*) filter (where was_clicked),
          'opened', count(*) filter (where read)) x
          from per group by type, title, date_trunc('minute', created_at)
          order by min(created_at) desc limit 15) t), '[]'::jsonb)
  ) into out;
  return out;
end
$function$;

select public.lock_down_definer_functions();
