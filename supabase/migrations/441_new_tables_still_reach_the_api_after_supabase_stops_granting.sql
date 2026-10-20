-- ============================================================================
-- 441 - a new table in public still reaches the API after 30 Oct 2026
--
-- Supabase emailed on 20 Oct 2026: from 30 Oct it stops automatically granting
-- Data API access to NEW tables in "public" on existing projects. Today that
-- comes from `ALTER DEFAULT PRIVILEGES ... ON TABLES TO anon, authenticated,
-- service_role` (owners postgres and supabase_admin). After the change, a
-- table created by a migration would answer every supabase-js call, and every
-- edge function using the service role, with "permission denied" until
-- somebody remembered to write the grants by hand.
--
-- Hand-written grants are exactly what migration 170 says not to rely on:
-- every hand-written revoke for functions got undone by the next migration.
-- So this is the same shape as `no_new_function_is_public`: an event trigger
-- that writes the grants for every new relation in public, whatever Supabase's
-- defaults turn into.
--
-- EXISTING TABLES ARE UNTOUCHED. The trigger only sees objects created by the
-- statement that fired it, so the tables already locked to the service role
-- (points_recalc_queue, ops_*, vip_history_*, rank_alerts, ...) keep their
-- revokes. A migration that wants a new table locked down still writes its
-- `revoke` after the `create table`; the trigger has already run by then, so
-- the revoke wins.
--
-- What a new relation gets (Supabase's recommended set, narrower than the old
-- defaults, which gave anon and authenticated everything incl. TRUNCATE):
--   anon           SELECT
--   authenticated  SELECT, INSERT, UPDATE, DELETE
--   service_role   ALL
--   sequences      USAGE, SELECT to authenticated and service_role (serial
--                  columns need it for an insert)
-- RLS still decides which rows; every public table here has RLS on. A feature
-- that needs anon to WRITE a new table must grant that explicitly.
--
-- IT MUST NEVER RAISE, for the same reason as 170: an event trigger that
-- throws fails the DDL that fired it.
-- ============================================================================

create or replace function public.new_tables_get_api_grants()
returns event_trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  obj record;
begin
  for obj in
    select object_type, object_identity
    from pg_event_trigger_ddl_commands()
    where schema_name = 'public'
  loop
    begin
      if obj.object_type in ('table', 'view', 'foreign table') then
        execute format('grant select on %s to anon', obj.object_identity);
        execute format('grant select, insert, update, delete on %s to authenticated', obj.object_identity);
        execute format('grant all on %s to service_role', obj.object_identity);
      elsif obj.object_type = 'materialized view' then
        execute format('grant select on %s to anon, authenticated, service_role', obj.object_identity);
      elsif obj.object_type = 'sequence' then
        execute format('grant usage, select on sequence %s to authenticated, service_role', obj.object_identity);
      end if;
    exception when others then
      raise warning 'new_tables_get_api_grants: % on %: %', obj.object_type, obj.object_identity, sqlerrm;
    end;
  end loop;
exception when others then
  raise warning 'new_tables_get_api_grants: %', sqlerrm;
end $$;

comment on function public.new_tables_get_api_grants() is
  'Grants Data API access on every new table/view/sequence in public (Supabase stopped doing it by default on 30 Oct 2026). Run by the new_tables_get_api_grants event trigger. Existing objects are never touched.';

drop event trigger if exists new_tables_get_api_grants;
create event trigger new_tables_get_api_grants
  on ddl_command_end
  when tag in (
    'CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO',
    'CREATE VIEW', 'CREATE MATERIALIZED VIEW',
    'CREATE FOREIGN TABLE', 'CREATE SEQUENCE'
  )
  execute function public.new_tables_get_api_grants();
