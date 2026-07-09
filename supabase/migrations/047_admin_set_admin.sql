-- ============================================================================
-- 047 - admin_set_admin RPC
--   Promote / demote a creator to admin through a SECURITY DEFINER function
--   instead of a bare `update profiles set is_admin`. A bare update under RLS
--   silently touches 0 rows (no error) if anything about the policy check is
--   off, so a failed promotion looked like "nothing happened" in the UI. This
--   RPC runs as the owner (bypasses RLS), is admin-gated, and raises a clear
--   error the client can surface. The existing audit-log + protect-columns
--   triggers still fire (auth.uid() is preserved inside the definer call).
-- ============================================================================
set check_function_bodies = off;

create or replace function public.admin_set_admin(target uuid, make_admin boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if target = auth.uid() then raise exception 'You cannot change your own admin status'; end if;
  update public.profiles set is_admin = make_admin where id = target;
  if not found then raise exception 'Creator not found'; end if;
end; $$;

revoke execute on function public.admin_set_admin(uuid, boolean) from public, anon;
grant execute on function public.admin_set_admin(uuid, boolean) to authenticated;
