-- ============================================================================
-- 174 - reading your own notifications is not a write to anybody
--
-- Migration 172 put a blanket refusal on `notifications` because a row in that
-- table is a WEB PUSH to a real creator's phone. It is also, on the way back,
-- the thing the bell marks as read - an UPDATE, and a DELETE when you dismiss
-- one. So the demo account could not open its own bell without an error, which
-- is a wall in the middle of the first screen anybody presses.
--
-- The distinction is not the verb, it is WHOSE ROW IT IS. An insert reaches
-- somebody; an update or delete of your own row reaches nobody. So a sandbox
-- account may tidy its own inbox and may not create anything in anybody's.
-- ============================================================================
create or replace function public.sandbox_is_read_only()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- auth.uid() is null for the cron jobs, the webhooks and the service role.
  -- Those are the paths that must keep working: the view sync writes, the
  -- archive job writes, and a notification raised BY the platform about a
  -- sandbox account is not the sandbox account acting.
  if auth.uid() is null
     or not exists (select 1 from public.profiles where id = auth.uid() and is_sandbox) then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  -- Your own bell: marking read, dismissing, clearing. Reaches nobody.
  if tg_table_name = 'notifications' then
    if tg_op = 'UPDATE' and new.recipient_id = auth.uid() then return new; end if;
    if tg_op = 'DELETE' and old.recipient_id = auth.uid() then return old; end if;
  end if;

  raise exception 'SANDBOX_READ_ONLY: this demo account can look at everything here but cannot change money, mail or settings.';
end $$;
