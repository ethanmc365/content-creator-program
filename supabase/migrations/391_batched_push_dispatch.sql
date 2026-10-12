-- 391: one push call per INSERT statement, not per notification row (12 Oct 2026)
--
-- Supabase warned that the database was running out of connections. The cause:
-- a message in a big room (General has ~200 members) inserts ~200 notification
-- rows in ONE statement (notify_community), and the AFTER INSERT ... FOR EACH ROW
-- trigger fired the notify-dispatch edge function 200 times at once. Each call
-- made 3-4 REST requests (prefs, devices, ledger), so ~800 requests landed in
-- ten seconds, average concurrency hit 37 against a PostgREST pool of 20, and the
-- pool stayed at its high-water mark afterwards. Nine bursts in three days
-- (logs 10-12 Oct: 10:38, 14:50, 21:58, 19:57, 19:34 ...).
--
-- Now a STATEMENT trigger with a transition table posts the new rows in chunks
-- of 50 (`{records:[...]}`), and notify-dispatch does one prefs query, one device
-- query and one ledger insert per chunk: ~200 notifications = 4 calls, ~16 REST
-- requests instead of ~800. Loops that insert one row at a time behave exactly
-- as before (one call each). Deploy the function BEFORE this migration (it
-- accepts both shapes).

create or replace function public.dispatch_notifications_batch()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'private', 'extensions'
as $function$
declare
  secret text := (select value from private.config where key = 'webhook_secret');
  chunk jsonb;
begin
  for chunk in
    select jsonb_agg(j)
    from (select to_jsonb(n) j, (row_number() over () - 1) / 50 g from new_rows n) x
    group by g
  loop
    perform net.http_post(
      url := 'https://heuhqqoxyggawuckxocp.supabase.co/functions/v1/notify-dispatch',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer sb_publishable_TEGIiE8fyDhEDHsBRlM0-g_JzO27uos',
        'apikey', 'sb_publishable_TEGIiE8fyDhEDHsBRlM0-g_JzO27uos',
        'x-webhook-secret', coalesce(secret, '')
      ),
      body := jsonb_build_object('records', chunk),
      timeout_milliseconds := 20000
    );
  end loop;
  return null;
end;
$function$;

drop trigger if exists trg_dispatch_notification on public.notifications;
drop trigger if exists trg_dispatch_notifications on public.notifications;
create trigger trg_dispatch_notifications
  after insert on public.notifications
  referencing new table as new_rows
  for each statement execute function public.dispatch_notifications_batch();

insert into public.owner_only_rpcs (proname, why) values
  ('dispatch_notifications_batch', 'trigger function: posts notifications to the push function')
on conflict do nothing;
select public.lock_down_definer_functions();

-- The per-row trigger function has no other caller.
drop function if exists public.dispatch_notification();
