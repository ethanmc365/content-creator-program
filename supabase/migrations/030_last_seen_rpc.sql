-- ============================================================================
-- 030 - admin-only RPC for last-sign-in times (drives the "Inactive" tag in
--   the Creators list). last_sign_in_at lives in auth.users.
-- ============================================================================
set check_function_bodies = off;

create or replace function public.admin_list_last_seen()
returns table (id uuid, last_sign_in_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  return query select u.id, u.last_sign_in_at from auth.users u;
end; $$;

revoke execute on function public.admin_list_last_seen() from public, anon;
grant execute on function public.admin_list_last_seen() to authenticated;
