-- An admin can READ `creator_private` ("read own or admin") and cannot WRITE it
-- - the update policy is `id = auth.uid()`, own row only. That was the right
-- default and it is wrong in one real case: a creator types their account
-- number with a digit missing, the invoice bounces, and the only fix is to ask
-- them to go and edit it themselves - which for somebody already waiting on
-- money is a poor thing to have to say.
--
-- DELIBERATELY AN RPC, NOT A WIDENED RLS POLICY. A policy saying "admins may
-- update anybody's bank details" is true everywhere, forever, including from
-- any surface that ever calls `.from('creator_private')`. This is one door, it
-- checks `is_admin()`, and it writes an audit row naming who changed whose
-- details - which a policy could not do.
--
-- Writing here also fires `refresh_pending_invoice_payment`, so correcting the
-- details updates any invoice still waiting on them and raises one for any
-- prize that was blocked for want of them.
--
-- NB the audit table is `admin_audit_log`, not `audit_log`. The first version of
-- this function named the wrong table and would have raised at run time on the
-- first real use - the same shape of bug as migration 133's `pay_account_name`.
-- Check the table exists before you reference it.
create or replace function public.admin_set_payment_details(
  p_creator        uuid,
  p_currency       text default null,
  p_name           text default null,
  p_bank           text default null,
  p_sort_code      text default null,
  p_account_number text default null,
  p_iban           text default null,
  p_bic            text default null,
  p_address        text default null
) returns void language plpgsql security definer set search_path to 'public' as $$
declare v_who text; v_whose text;
begin
  if not public.is_admin() then
    raise exception 'Only the team can edit payment details.';
  end if;
  if not exists (select 1 from public.profiles where id = p_creator) then
    raise exception 'No such creator.';
  end if;

  insert into public.creator_private (
    id, pay_currency, pay_name, pay_bank, pay_sort_code, pay_account_number,
    pay_iban, pay_bic, pay_address, updated_at
  ) values (
    p_creator, nullif(btrim(coalesce(p_currency, '')), ''), nullif(btrim(coalesce(p_name, '')), ''),
    nullif(btrim(coalesce(p_bank, '')), ''), nullif(btrim(coalesce(p_sort_code, '')), ''),
    nullif(btrim(coalesce(p_account_number, '')), ''), nullif(btrim(coalesce(p_iban, '')), ''),
    nullif(btrim(coalesce(p_bic, '')), ''), nullif(btrim(coalesce(p_address, '')), ''), now()
  )
  on conflict (id) do update set
    pay_currency       = excluded.pay_currency,
    pay_name           = excluded.pay_name,
    pay_bank           = excluded.pay_bank,
    pay_sort_code      = excluded.pay_sort_code,
    pay_account_number = excluded.pay_account_number,
    pay_iban           = excluded.pay_iban,
    pay_bic            = excluded.pay_bic,
    pay_address        = excluded.pay_address,
    updated_at         = now();

  select name into v_who   from public.profiles where id = auth.uid();
  select name into v_whose from public.profiles where id = p_creator;
  insert into public.admin_audit_log
    (actor_id, actor_name, category, entity, entity_id, target_id, target_name, action, detail)
  values (auth.uid(), coalesce(v_who, 'Someone'), 'money', 'payment_details', p_creator,
          p_creator, coalesce(v_whose, 'a creator'), 'update',
          'Payment details edited by the team');
end $$;

revoke all on function public.admin_set_payment_details(uuid, text, text, text, text, text, text, text, text)
  from public, anon;
grant execute on function public.admin_set_payment_details(uuid, text, text, text, text, text, text, text, text)
  to authenticated;

notify pgrst, 'reload schema';
