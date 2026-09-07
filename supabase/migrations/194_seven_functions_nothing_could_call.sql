-- SEVEN FUNCTIONS NOTHING COULD CALL (7 Sep 2026)
--
-- A dead SECURITY DEFINER function is not free. Migration 138 is the reason
-- this file exists: `payment_snapshot` shipped as definer, Postgres granted
-- EXECUTE to PUBLIC by default, and anon could have read anyone's IBAN. Five
-- of the seven below are definer functions still granted to `authenticated`,
-- so they were live API surface that no screen in the product calls.
--
-- Each one was checked against EVERY way a function can be reached before it
-- was dropped - other function bodies, regular triggers, event triggers,
-- cron.job commands, RLS policies, views, materialised views, check
-- constraints, column defaults and rewrite rules - and against the whole repo
-- (src/, supabase/functions/, scripts/). All zero for all seven.
--
--   on_wall_published           a trigger function for the Wall of Fame, a
--                               feature that no longer exists. It was attached
--                               to no trigger and referenced `new.published`
--                               on a table that is gone.
--   send_deadline_reminders     the ORIGINAL reminder pass from
--                               001_initial_schema.sql, superseded by
--                               send_challenge_reminders, which is the one the
--                               `challenge-reminders` cron job actually runs.
--                               Two reminder engines, one of them unreachable.
--   sandbox_joins_every_market  a one-off backfill that put the sandbox account
--                               into every market. The trigger
--                               `sandbox_follows_new_market` does this
--                               continuously now.
--   public_flag                 an alternative reader for `tour_enabled` /
--                               `install_gate_enabled`. The app reads
--                               app_settings directly via lib/appFlags.readFlag,
--                               which is what migration 192 made possible.
--   admin_get_email             one creator's email. AdminApplications uses
--                               admin_list_emails instead.
--   admin_remind_incomplete     nudged a half-finished applicant. Superseded by
--                               the follow-up mark an admin makes (migration
--                               191).
--   email_usage                 send counts for the admin email page, which
--                               reads email_log instead.
--
-- NOT dropped, deliberately: `leave_market(text)` and `set_home_market(text)`
-- are also uncalled, but they are real creator capabilities that simply have no
-- screen yet, rather than superseded code.

drop function if exists public.on_wall_published();
drop function if exists public.send_deadline_reminders();
drop function if exists public.sandbox_joins_every_market();
drop function if exists public.public_flag(text);
drop function if exists public.admin_get_email(uuid);
drop function if exists public.admin_remind_incomplete(uuid);
drop function if exists public.email_usage();

notify pgrst, 'reload schema';
