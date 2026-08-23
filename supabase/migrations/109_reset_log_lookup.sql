-- One indexed lookup instead of scanning every account.
--
-- `auth-gate` logs password-reset requests to the admin email log, and to fill
-- in `recipient_id` it was pulling the first 1000 users out of the auth admin
-- API on EVERY request to an unauthenticated endpoint, then filtering them in
-- memory. That is O(all users) work per request, on a path an attacker can hit
-- for free, and it silently stopped matching anybody past the thousandth
-- account.
--
-- SERVICE ROLE ONLY, and that restriction is the whole design of this function:
-- it maps an email address to a user id, which is precisely the
-- account-enumeration oracle the password-reset flow is otherwise careful never
-- to be (it answers 200 whether or not the address exists). It is reachable only
-- from inside an edge function that already holds the service key.
--
-- Applied to production 23 Aug 2026.
create or replace function public.admin_find_user_id_by_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1;
$$;

revoke all on function public.admin_find_user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.admin_find_user_id_by_email(text) to service_role;
