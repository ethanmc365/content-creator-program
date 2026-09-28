-- AN INVOICE CAN BE RAISED FOR SOMEBODY WHO IS NOT ON THE PLATFORM.
--
-- Ethan, 28 Sep 2026: "if there's anything like a challenge run off the platform
-- that we still want to create an invoice for a creator, they can do it super
-- easily on here and download it ... rather than choosing a creator, at the very
-- bottom there should be an option to just click Other, and then you can
-- actually type the specific name of the creator and the prize amount."
--
-- `invoices.creator_id` has been nullable since 049, and the composer now offers
-- "Other - someone not on the platform", which writes exactly that row. But
-- `submit_invoice` looked the payee up by that id before it would let the
-- invoice move:
--
--   select * into v_priv from public.creator_private where id = v_inv.creator_id;
--   if v_priv.pay_name is null or (...) then raise ... end if;
--
-- With a null id the select matches nothing, every field of `v_priv` is null,
-- and the invoice is refused with "That creator has not saved their payment
-- details yet" - about a creator who has no account to save anything in. The
-- off-platform invoice could be downloaded and never recorded, which is the
-- state this whole queue exists to prevent: money leaving with no row behind it.
--
-- So the lookup becomes conditional on there being somebody to look up. The
-- CHECK does not weaken: an invoice still cannot be submitted without a payee
-- name and somewhere to send the money. It reads that off the block typed onto
-- the row instead of off an account that does not exist.
--
-- Read from the live definition with pg_get_functiondef before it was edited
-- (see the rule at the top of supabase/migrations/README.md); the only changes
-- are the branch below and the message on the existing check.

create or replace function public.submit_invoice(p_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  v_inv  record;
  v_priv record;
  v_pay  jsonb;
begin
  if not public.is_global_admin() then
    raise exception 'Only the team can submit an invoice for approval.';
  end if;
  select * into v_inv from public.invoices where id = p_id;
  if v_inv is null then raise exception 'No such invoice.'; end if;
  if v_inv.stage not in ('draft', 'rejected') then
    raise exception 'That invoice is already %.', v_inv.stage;
  end if;
  if coalesce(v_inv.amount, 0) <= 0 then
    raise exception 'An invoice needs an amount before it can be approved.';
  end if;

  -- NOBODY TO RE-READ. An off-platform payee has no `creator_private` row, so
  -- the block on the invoice IS the record - it was typed by the admin writing
  -- it, and it is what the PDF already shows.
  if v_inv.creator_id is null then
    v_pay := coalesce(v_inv.payment, '{}'::jsonb);
    if coalesce(nullif(btrim(v_pay ->> 'name'), ''), '') = ''
       or (coalesce(nullif(btrim(v_pay ->> 'iban'), ''), '') = ''
           and coalesce(nullif(btrim(v_pay ->> 'accountNumber'), ''), '') = '') then
      raise exception 'This invoice needs an account holder and either an IBAN or an account number on it.';
    end if;

    update public.invoices set
      stage = 'awaiting_approval',
      status = 'awaiting_approval',
      submitted_at = now(),
      submitted_by = auth.uid(),
      decided_at = null, decided_by = null, decision_note = null
    where id = p_id;
    return;
  end if;

  -- Re-read the bank details at submission. The draft is created the moment the
  -- prize is awarded, which is often BEFORE the creator has filled them in.
  select * into v_priv from public.creator_private where id = v_inv.creator_id;
  if v_priv.pay_name is null or (v_priv.pay_iban is null and v_priv.pay_account_number is null) then
    raise exception 'That creator has not saved their payment details yet.';
  end if;

  update public.invoices set
    payment = jsonb_build_object(
      'currency',      coalesce(v_priv.pay_currency, v_inv.currency, 'GBP'),
      'name',          coalesce(v_priv.pay_name, ''),
      'bank',          coalesce(v_priv.pay_bank, ''),
      'sortCode',      coalesce(v_priv.pay_sort_code, ''),
      'accountNumber', coalesce(v_priv.pay_account_number, ''),
      'iban',          coalesce(v_priv.pay_iban, ''),
      'bic',           coalesce(v_priv.pay_bic, ''),
      'address',       coalesce(v_priv.pay_address, '')
    ),
    stage = 'awaiting_approval',
    status = 'awaiting_approval',
    submitted_at = now(),
    submitted_by = auth.uid(),
    decided_at = null, decided_by = null, decision_note = null
  where id = p_id;
end $$;

revoke execute on function public.submit_invoice(uuid) from public;
grant execute on function public.submit_invoice(uuid) to authenticated;
