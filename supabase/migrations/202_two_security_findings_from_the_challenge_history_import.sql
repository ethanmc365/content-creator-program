-- TWO SECURITY FINDINGS THE CHALLENGE-HISTORY IMPORT LEFT BEHIND.
--
-- Both are Supabase database-linter findings raised against migrations 197/198,
-- and both are worth clearing before the platform is opened up worldwide.
--
-- 1. `challenge_history_metrics` WAS A SECURITY DEFINER VIEW.  (level: ERROR)
--
--    A view created without `security_invoker` runs with the privileges of its
--    OWNER, not of whoever selects from it - so it reads `challenge_history`
--    with row-level security bypassed. The table's own policy is admins-only,
--    and the view handed a way round it to anybody who could reach the view.
--    Nothing in the product currently selects it through PostgREST, which is
--    the only reason this has not leaked the programme's prize figures; a
--    latent hole is still a hole, and this one is one `grant` away from being
--    live.
--
--    `security_invoker = true` makes the view read as the CALLER, so the
--    table's policy applies through it exactly as it does to the table. That is
--    what a view over an RLS-protected table should always have been.
--
-- 2. `touch_challenge_history` HAD A MUTABLE search_path.  (level: WARN)
--
--    It is an `updated_at` trigger, so it is short and looks harmless. It is
--    also `plpgsql` with no `set search_path`, which means it resolves `now()`
--    against whatever search_path the CALLING session has set. Anybody able to
--    insert into this table can therefore put a schema in front of `pg_catalog`
--    and have their own function run inside the trigger. It costs one line to
--    close, and every other function in this database already has it - the
--    linter flags this one because it was written by hand during the import and
--    the pattern was not copied with it.
--
-- Applied 8 Sep 2026. Re-ran the advisor afterwards: the ERROR is gone and the
-- WARN is gone. What remains is the intended posture - six deny-all tables read
-- only through SECURITY DEFINER functions, and the five anon-callable landing
-- page RPCs on the allowlist from migration 170.
alter view public.challenge_history_metrics set (security_invoker = true);

create or replace function public.touch_challenge_history()
returns trigger
language plpgsql
set search_path to 'public', 'pg_catalog'
as $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;
