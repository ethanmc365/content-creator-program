-- ===========================================================================
-- An invoice waits in the queue until it can be paid
-- ===========================================================================
--
-- Two things 133 left half-done, both found by looking at the queue on screen.
--
-- 1. BLOCKED WAS A STAGE, AND IT SHOULD BE A FACT ABOUT THE ROW.
--
--    133 moved unpayable invoices back to 'draft'. That is a third place for an
--    invoice to sit, and it means an invoice that was raised automatically has
--    to be MANUALLY re-submitted once the creator finally saves their bank
--    details - a step nobody will remember to take, for a reason nobody will
--    see. And it only caught rows at 'awaiting_approval': invoices 002 and 003
--    had already been APPROVED with a completely empty bank block (before 133
--    taught `decide_invoice` to refuse), so they sat in "approved, ready to
--    send" with nowhere to send the money.
--
--    So there is no blocked stage. An auto-raised invoice sits at
--    'awaiting_approval' from the moment the prize is won until somebody
--    approves it, and "blocked" is derived - it is simply an invoice whose
--    payment block is empty. `decide_invoice` already refuses to approve one.
--    When the creator saves their details the trigger below fills the block in
--    and the row becomes approvable where it already is. Nobody has to do
--    anything.
--
-- 2. NO DETAILS MEANT NO INVOICE, EVER.
--
--    `on_reward_draft_invoice` returns early when a creator has no bank details
--    - correctly, since there is nothing to put on the document. But nothing
--    ever came back for it. The prize sat in Payouts as "pending" and the
--    invoice was never raised, however long after the creator answered.
--    The refresh trigger now RAISES the missing ones as well as updating the
--    existing ones, so answering the "we need your payment details" prompt is
--    the only thing that has to happen.

-- ------------------------------------------------ one way to raise an invoice
--
-- Extracted from the trigger so that the trigger and the catch-up below cannot
-- drift into two different documents. Returns the invoice id, or null when the
-- reward does not want one (not cash, no amount, already has one, or nowhere to
-- send it).
create or replace function public.raise_invoice_for_reward(p_reward uuid)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  r        record;
  v_name   text;
  v_desc   text;
  v_bill   text;
  v_pay    jsonb;
  v_id     uuid;
begin
  select * into r from public.rewards where id = p_reward;
  if r is null then return null; end if;
  if r.reward_type is distinct from 'cash' or coalesce(r.amount, 0) <= 0 then return null; end if;
  if exists (select 1 from public.invoices where reward_id = r.id) then return null; end if;

  v_pay := public.payment_snapshot(r.creator_id, r.currency);
  if v_pay is null or not public.invoice_is_payable(v_pay) then return null; end if;

  select name into v_name from public.profiles where id = r.creator_id;
  select 'Prize for ' || title into v_desc from public.challenges where id = r.challenge_id;
  v_desc := coalesce(v_desc, case r.source
    when 'referral'  then 'Referral reward'
    when 'milestone' then 'Milestone reward'
    else 'Content creator prize' end);

  select coalesce(value ->> 'text', '') into v_bill
    from public.app_settings where key = 'invoice_bill_to';

  perform set_config('tryp.system_invoice', 'on', true);
  insert into public.invoices (
    number, reward_id, creator_id, creator_name, amount, currency, description,
    bill_to, payment, stage, status, auto_generated, community_id, created_by, submitted_at
  ) values (
    public.next_invoice_number(), r.id, r.creator_id, coalesce(v_name, 'Creator'),
    r.amount, coalesce(r.currency, 'GBP'), v_desc,
    coalesce(v_bill, ''), v_pay, 'awaiting_approval', 'awaiting_approval', true,
    r.community_id, auth.uid(), now()
  ) returning id into v_id;
  perform set_config('tryp.system_invoice', 'off', true);
  return v_id;
end $$;

-- ------------------------------------------------------- the prize side
create or replace function public.on_reward_draft_invoice()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid;
begin
  if new.reward_type is distinct from 'cash' or coalesce(new.amount, 0) <= 0 then
    return new;
  end if;

  -- NOTHING HERE MAY ABORT THE PRIZE. A bookkeeping side-effect must never be
  -- able to kill the thing it is bookkeeping; that is exactly how every cash
  -- prize for a payable creator came to be silently discarded for a day.
  begin
    v_id := public.raise_invoice_for_reward(new.id);

    if v_id is null and not exists (select 1 from public.invoices where reward_id = new.id) then
      perform public.notify_user(
        new.creator_id, 'reward', 'We need your payment details',
        'You have a prize waiting. Add your payment details in Settings and we will get it paid.',
        '/settings'
      );
    end if;
  exception when others then
    perform set_config('tryp.system_invoice', 'off', true);
    perform public.notify_user(
      p.id, 'reward', 'A prize was awarded but its invoice was not raised',
      coalesce(new.currency, 'GBP') || ' ' || to_char(new.amount, 'FM999999990.00') ||
      '. Raise it by hand on the Rewards page. (' || sqlerrm || ')',
      '/admin/rewards'
    )
    from public.profiles p
    where p.platform_role in ('global_admin', 'owner') and p.is_test = false;
  end;

  return new;
end $$;

-- ------------------------------- saving your details unblocks AND catches up
create or replace function public.refresh_pending_invoice_payment()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_pay jsonb; r record;
begin
  v_pay := public.payment_snapshot(new.id, null);
  if v_pay is null or not public.invoice_is_payable(v_pay) then return new; end if;

  -- Anything not yet gone takes the newest details. This is also the honest
  -- answer to "they gave us the wrong account number".
  update public.invoices
     set payment = v_pay,
         bill_to = case when coalesce(bill_to, '') = ''
                        then coalesce((select value ->> 'text' from public.app_settings
                                        where key = 'invoice_bill_to'), '')
                        else bill_to end
   where creator_id = new.id
     and stage in ('draft', 'awaiting_approval', 'approved', 'rejected')
     and payment is distinct from v_pay;

  -- And every prize that never got one, because at the time there was nowhere
  -- to send it.
  for r in
    select rw.id from public.rewards rw
    where rw.creator_id = new.id
      and rw.reward_type = 'cash'
      and coalesce(rw.amount, 0) > 0
      and rw.status <> 'distributed'
      and not exists (select 1 from public.invoices i where i.reward_id = rw.id)
  loop
    perform public.raise_invoice_for_reward(r.id);
  end loop;

  return new;
end $$;

-- --------------------------------------------------------------- repair work
--
-- Everything that cannot be paid goes back to waiting, wherever it drifted to,
-- and forgets the decision that should never have been possible.
update public.invoices
   set stage = 'awaiting_approval',
       status = 'awaiting_approval',
       submitted_at = coalesce(submitted_at, created_at),
       decided_at = null,
       decided_by = null,
       decision_note = null
 where stage in ('draft', 'approved', 'rejected')
   and not public.invoice_is_payable(payment);

notify pgrst, 'reload schema';
