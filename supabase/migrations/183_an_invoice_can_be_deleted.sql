-- ============================================================================
-- 183 - an invoice can be deleted. APPLIED 3 Sep 2026.
--
-- Ethan: "I created an example invoice, and there seems to be no way to delete
-- it. I need a way to delete an invoice as well, obviously. I sent it back, but
-- there still seems to be no way to delete it."
--
-- He is right that there was no way, and the reason is that every state an
-- invoice can be in was designed as a step FORWARD - draft, submitted,
-- approved, sent back, sent, paid, reopened. "Sending it back" is the closest
-- thing to undo and it does not remove anything; it hands the same document to
-- somebody to fix. A document created by mistake has nothing to fix.
--
-- WHY THIS IS AN RPC AND NOT JUST A CLIENT DELETE. Admins already hold `all` on
-- `invoices`, so the client could have issued the delete. Two things have to
-- happen atomically with it, and neither belongs in a component:
--
--   1. THE REWARD HAS TO COME BACK. `reward_follows_invoice` marks a reward
--      'distributed' when its invoice reaches sent/paid. Delete that invoice
--      and the reward is left claiming money went out with nothing to show what
--      it went out on - and it can never be re-invoiced, because
--      `raise_invoice_for_reward` only raises for rewards that are not
--      distributed. So a deleted invoice puts its reward back to 'pending'.
--
--   2. A PAID INVOICE IS A RECEIPT, NOT A DRAFT. If money actually left, the
--      document is the record that it did, and deleting it is how a payment
--      becomes untraceable. Refused, with the way out named in the message.
--
-- `trg_audit_invoices` already fires on DELETE, so this is on the money audit
-- trail like every other change.
--
-- VERIFIED in production under an admin's claims: a hand-made invoice deleted;
-- one attached to a distributed reward deleted and the reward came back as
-- 'pending' with distributed_at cleared; a paid one refused.
-- ============================================================================
create or replace function public.delete_invoice(p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_inv record;
begin
  if not public.is_admin() then
    raise exception 'Only the team can delete an invoice.';
  end if;

  select * into v_inv from public.invoices where id = p_id;
  if v_inv is null then
    raise exception 'That invoice no longer exists.';
  end if;

  if v_inv.paid_at is not null then
    raise exception 'This invoice is marked paid, so it is the record that the money went out. Un-mark it as paid first if that was a mistake.';
  end if;

  -- Only touched if this invoice is the reason the reward was distributed - a
  -- reward somebody settled by hand is left alone.
  if v_inv.reward_id is not null then
    update public.rewards
       set status = 'pending',
           distributed_at = null
     where id = v_inv.reward_id
       and status = 'distributed';
  end if;

  delete from public.invoices where id = p_id;
end;
$function$;

comment on function public.delete_invoice(uuid) is
  'Removes an invoice that should never have existed, and puts its reward back to pending so it can be raised again. Refuses a paid invoice - that document is the receipt.';

revoke all on function public.delete_invoice(uuid) from public, anon;
grant execute on function public.delete_invoice(uuid) to authenticated;
