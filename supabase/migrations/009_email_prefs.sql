-- ============================================================================
-- 009 - email notification opt-in
-- ============================================================================
set check_function_bodies = off;

-- A single master opt-in for email notifications. Which categories actually
-- email is still governed by notif_prefs (so turning a category off stops both
-- in-app and email for it); this switch turns the email channel on or off.
alter table public.profiles add column if not exists email_opt_in boolean not null default true;
