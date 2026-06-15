-- ============================================================================
-- 010 - fire the notify-dispatch Edge Function on every new notification
-- (web push + email when the PWA is closed). Uses pg_net to POST the row.
-- ============================================================================
set check_function_bodies = off;

create extension if not exists pg_net;

-- Private config (not exposed via the API). The webhook secret is inserted
-- out-of-band so it is never committed:
--   insert into private.config(key, value) values ('webhook_secret', '<secret>')
--     on conflict (key) do update set value = excluded.value;
-- The same value is set as the function's WEBHOOK_SECRET secret.
create schema if not exists private;
create table if not exists private.config (key text primary key, value text);
-- The private schema is not exposed via the API; RLS with no policies is belt
-- and braces so only SECURITY DEFINER functions can read it.
alter table private.config enable row level security;

create or replace function public.dispatch_notification()
returns trigger
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  secret text := (select value from private.config where key = 'webhook_secret');
begin
  perform net.http_post(
    url := 'https://heuhqqoxyggawuckxocp.supabase.co/functions/v1/notify-dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer sb_publishable_TEGIiE8fyDhEDHsBRlM0-g_JzO27uos',
      'apikey', 'sb_publishable_TEGIiE8fyDhEDHsBRlM0-g_JzO27uos',
      'x-webhook-secret', coalesce(secret, '')
    ),
    body := jsonb_build_object('record', to_jsonb(new))
  );
  return new;
end;
$$;

drop trigger if exists trg_dispatch_notification on public.notifications;
create trigger trg_dispatch_notification
  after insert on public.notifications
  for each row execute function public.dispatch_notification();
