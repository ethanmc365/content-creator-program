-- 036_drop_old_connection_trigger.sql
-- Migration 035 replaced instant connections with a request/accept flow and
-- added trg_on_connection_request. The OLD trg_on_new_connection (from the
-- instant-connect era) still fired on insert and posted a second, now-inaccurate
-- "X connected with you" notification. Remove it so a request notifies once.
drop trigger if exists trg_on_new_connection on public.connections;
drop function if exists public.on_new_connection();
