-- I OPENED A HOLE AND THIS CLOSES IT.
--
-- Postgres grants EXECUTE to PUBLIC on a newly created function. Every
-- SECURITY DEFINER helper added in 133/134/137 therefore shipped callable by
-- `anon` and `authenticated` over PostgREST, and one of them is
-- `payment_snapshot(uuid, text)` - which returns a creator's IBAN, account
-- number, sort code and home address, with no permission check inside it
-- because it was only ever meant to be called by a trigger.
--
--   POST /rest/v1/rpc/payment_snapshot {"p_creator":"<any uuid>"}
--
-- would have handed anyone holding the publishable key somebody's bank
-- details. `raise_invoice_for_reward` was equally exposed and mints invoices.
--
-- Caught by running the security advisor before deploying, which is the only
-- reason it never reached production.
--
-- THE RULE, which the rest of this schema already follows: a SECURITY DEFINER
-- function called by a trigger or by another function is revoked from the API
-- roles. Only the ones an admin surface actually calls keep their grant, and
-- those check `is_admin()` on the way in. WHENEVER YOU ADD A DEFINER FUNCTION,
-- REVOKE IT IN THE SAME MIGRATION.

revoke all on function public.payment_snapshot(uuid, text) from public, anon, authenticated;
revoke all on function public.raise_invoice_for_reward(uuid) from public, anon, authenticated;
revoke all on function public.refresh_pending_invoice_payment() from public, anon, authenticated;
revoke all on function public.reward_payment_has_one_owner() from public, anon, authenticated;

-- `invoice_is_payable` is NOT security definer and reads nothing - it is a pure
-- function over a jsonb value you already hold - so it keeps its grant.

notify pgrst, 'reload schema';
