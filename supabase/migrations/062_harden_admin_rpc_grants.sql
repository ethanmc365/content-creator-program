-- Security audit follow-up (Jul 25 2026).
--
-- 1. admin_list_last_seen() was the only admin_* RPC still granted to anon and
--    PUBLIC. It does guard internally (`if not public.is_admin() then raise`),
--    so nothing was ever exposed - but the grant was unnecessary and
--    inconsistent with every other admin function. Revoked as defence in depth.
--
-- 2. touch_admin_notes_updated_at() had a mutable search_path, the one function
--    flagged by the database linter. Pinned to `public`.

revoke execute on function public.admin_list_last_seen() from public;
revoke execute on function public.admin_list_last_seen() from anon;

create or replace function public.touch_admin_notes_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
