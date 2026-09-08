-- ONLY THE SERVER MAY WRITE A SYSTEM ERROR.
--
-- Migration 204 added `report_system_error` / `clear_system_error` and revoked
-- them from `public, anon, authenticated` in the same file. Checked afterwards
-- against `pg_proc.proacl` and `authenticated` STILL held EXECUTE on both.
--
-- Supabase's default privileges grant EXECUTE on new functions in `public` to
-- `anon` and `authenticated`, and they are re-applied around a migration - so a
-- revoke that runs in the same transaction as the CREATE does not necessarily
-- survive. The lesson is the one this repo already learned once and wrote an
-- event trigger for: A GRANT YOU DID NOT ASK FOR IS THE DEFAULT HERE, so the
-- grant has to be VERIFIED after the fact and never assumed from the SQL.
--
-- What it would have allowed is not dramatic but it is real: any signed-in
-- creator could have written arbitrary rows into the admin error panel, or
-- ticked off a genuine fault. The panel is the thing Ethan is meant to trust to
-- tell him something is broken, and a trust signal anybody can write to is
-- worse than no signal.
--
-- `report_client_error` deliberately stays open to `authenticated`: it is
-- called from the error boundary in a creator's browser, which is the entire
-- point of it, and it writes only under a fingerprint it derives itself.

revoke execute on function public.report_system_error(text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.clear_system_error(text, text) from public, anon, authenticated;
grant  execute on function public.report_system_error(text, text, text, text, text) to service_role;
grant  execute on function public.clear_system_error(text, text) to service_role;
