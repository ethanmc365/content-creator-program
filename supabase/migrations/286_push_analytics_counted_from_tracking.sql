-- PUSH ANALYTICS THAT ADD UP (1 Oct 2026).
--
-- Ethan: "it shows notifications: 3,503, but 'Sent to a phone' only shows 1, which is weird."
-- The ledger (migration 283) only began on 30 Sep, but the funnel counted every notification in
-- the chosen window, so a month of notifications nobody could have tracked all read as unsent.
-- The window now starts where the ledger does, whichever is later, and says so (`counted_from`).
--
-- He also wants the latest five on screen, scrollable back to fifty, with "load more": the
-- recent list takes a page size and an offset, and reports how many groups there are.

drop function if exists public.admin_push_analytics(integer);

create or replace function public.admin_push_analytics(p_days integer default 30, p_recent integer default 50, p_offset integer default 0)
returns jsonb
language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  window_start timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365)));
  tracked timestamptz := (select min(created_at) from public.push_events);
  -- ONLY WHAT THE LEDGER COULD HAVE SEEN. Before tracking began every notification reads as
  -- "never sent", which is how 3,503 notifications came to sit over 1 send.
  -- A minute of slack: a notification is written a few milliseconds before its own first ledger row.
  since timestamptz := greatest(window_start, coalesce(tracked - interval '1 minute', now()));
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
    'tracking_since', tracked,
    'counted_from', case when since > window_start then tracked else since end,
    'recent_total', (select count(*) from (select 1 from per group by type, title, date_trunc('minute', created_at)) g),
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
          order by min(created_at) desc
          limit greatest(1, least(coalesce(p_recent, 50), 200)) offset greatest(0, coalesce(p_offset, 0))) t), '[]'::jsonb)
  ) into out;
  return out;
end
$function$;

select public.lock_down_definer_functions();
