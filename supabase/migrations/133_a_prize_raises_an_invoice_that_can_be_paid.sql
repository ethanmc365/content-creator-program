-- ===========================================================================
-- A prize raises an invoice that can actually be paid
-- ===========================================================================
--
-- OVERLAPS WITH 132, DELIBERATELY. 132 fixed the one broken identifier
-- (`pay_account_name` -> `pay_name`) and nothing else, from a session running in
-- parallel with this one. This was applied after it and rewrites the whole
-- function, so 132's fix is contained in this one - the two are not in conflict
-- and 132 should stay in the repo as the record of when the bug was found.
-- Everything below the payee line is only in this file.
--
-- Ethan: "the payment thing is not working correctly". It was not, and the
-- reason is worth writing down, because the shape of the mistake will happen
-- again.
--
-- WHAT WAS BROKEN. `on_reward_draft_invoice` is the trigger that turns a cash
-- prize into a draft invoice. Migration 114 wrote it correctly. Migration
-- `invoices_one_per_prize_...` (25 Aug) needed to change ONE thing about it -
-- which stage the row starts at - and, because that migration was hand-applied
-- through the Management API rather than written as a patch, the whole function
-- body was retyped from memory. Three things came out wrong:
--
--   1. `v_priv.pay_account_name`. There is no such column; it is `pay_name`.
--      A `record` field is resolved at RUN time, so this compiled fine and then
--      raised on every execution. The trigger is AFTER INSERT on rewards, so
--      the exception aborted the INSERT - meaning awarding a cash prize to a
--      creator who HAS bank details failed outright, and "publish the winners"
--      failed with it. The only cash prizes that worked were the ones for
--      creators we could not pay.
--   2. The payment snapshot lost `name`, `bank` and `currency` and gained an
--      `accountName` nothing reads. Everything downstream - the payable check
--      in the queue, `submit_invoice`, the PDF - looks for `name`.
--   3. `bill_to` was set to the CREATOR's home address. It is the company block
--      from `app_settings.invoice_bill_to`: the invoice is billed TO Tryp.com,
--      by the creator.
--
-- THE LESSON, and the reason for the exception handler below: a bookkeeping
-- side-effect must never be able to abort the thing it is bookkeeping. Losing
-- the invoice is an inconvenience somebody can fix in a minute. Losing the
-- prize - silently, at the moment a challenge's winners are published - is not.
--
-- WHILE HERE, four more faults in the same workflow:
--
--   * Two invoices (002, 003) are sitting in the approval queue with a
--     COMPLETELY EMPTY bank block, and nothing stops an admin approving and
--     sending them. `decide_invoice` never checked. It does now.
--   * A creator saving their bank details did nothing for the invoice already
--     waiting on them. Now it refreshes itself.
--   * An invoice inserted straight into the queue notified nobody, because the
--     notify trigger only fired on UPDATE OF stage. That is the "auto-created
--     invoice missing from the approval queue" report: it was in the list, but
--     nothing had said so.
--   * Marking a reward "distributed" by hand while its invoice still sat at
--     awaiting_approval left the two disagreeing forever. One of them has to be
--     the truth; for cash, it is the invoice.

-- ------------------------------------------------------------- one path only
--
-- An earlier draft of this file had an approval THRESHOLD - small invoices
-- clearing themselves, large ones queueing. Ethan's answer: do not overcomplicate
-- it. There is exactly one path and it has three steps.
--
--   a creator wins a cash prize
--     -> the invoice is raised automatically, from their saved bank details
--     -> it appears in the queue for an admin to APPROVE
--     -> an admin SENDS it
--
-- Nothing else, no settings, no branch.

-- Somewhere for the money to go. Used in three places below, so it is one
-- definition rather than three that can drift apart.
create or replace function public.invoice_is_payable(p_payment jsonb)
returns boolean language sql immutable as $$
  select coalesce(p_payment ->> 'name', '') <> ''
     and (coalesce(p_payment ->> 'iban', '') <> ''
       or coalesce(p_payment ->> 'accountNumber', '') <> '')
$$;

-- The creator's bank details, in the shape every reader expects. One function,
-- so the snapshot the trigger takes and the snapshot `submit_invoice` takes can
-- never again be two different sets of keys.
create or replace function public.payment_snapshot(p_creator uuid, p_currency text)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object(
    'currency',      coalesce(cp.pay_currency, p_currency, 'GBP'),
    'name',          coalesce(cp.pay_name, ''),
    'bank',          coalesce(cp.pay_bank, ''),
    'sortCode',      coalesce(cp.pay_sort_code, ''),
    'accountNumber', coalesce(cp.pay_account_number, ''),
    'iban',          coalesce(cp.pay_iban, ''),
    'bic',           coalesce(cp.pay_bic, ''),
    'address',       coalesce(cp.pay_address, '')
  )
  from public.creator_private cp where cp.id = p_creator
$$;

-- ------------------------------------------------ a prize becomes an invoice
create or replace function public.on_reward_draft_invoice()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_name      text;
  v_desc      text;
  v_bill      text;
  v_pay       jsonb;
begin
  if new.reward_type is distinct from 'cash' or coalesce(new.amount, 0) <= 0 then
    return new;
  end if;
  if exists (select 1 from public.invoices where reward_id = new.id) then
    return new;
  end if;

  -- NOTHING BELOW MAY ABORT THE PRIZE. See the note at the top of this file.
  begin
    v_pay := public.payment_snapshot(new.creator_id, new.currency);

    -- No payment details, no invoice: a document with an empty bank block looks
    -- finished, reaches an accountant, and bounces. Ask the creator instead.
    -- The trigger on creator_private below picks the prize up the moment they
    -- answer, so this is a pause, not a dead end.
    if v_pay is null or not public.invoice_is_payable(v_pay) then
      perform public.notify_user(
        new.creator_id, 'reward', 'We need your payment details',
        'You have a prize waiting. Add your payment details in Settings and we will get it paid.',
        '/settings'
      );
      return new;
    end if;

    select name into v_name from public.profiles where id = new.creator_id;
    select 'Prize for ' || title into v_desc
      from public.challenges where id = new.challenge_id;
    v_desc := coalesce(v_desc, case new.source
      when 'referral'  then 'Referral reward'
      when 'milestone' then 'Milestone reward'
      else 'Content creator prize' end);

    -- The COMPANY's block, not the creator's address. This invoice is billed to
    -- Tryp.com by the creator, so bill_to is Tryp.com.
    select coalesce(value ->> 'text', '') into v_bill
      from public.app_settings where key = 'invoice_bill_to';

    perform set_config('tryp.system_invoice', 'on', true);
    insert into public.invoices (
      number, reward_id, creator_id, creator_name, amount, currency, description,
      bill_to, payment, stage, status, auto_generated, community_id, created_by,
      submitted_at
    ) values (
      public.next_invoice_number(), new.id, new.creator_id, coalesce(v_name, 'Creator'),
      new.amount, coalesce(new.currency, 'GBP'), v_desc,
      coalesce(v_bill, ''), v_pay, 'awaiting_approval', 'awaiting_approval', true,
      new.community_id, auth.uid(), now()
    );
    perform set_config('tryp.system_invoice', 'off', true);
  exception when others then
    -- The prize stands. Tell the team the paperwork did not.
    perform set_config('tryp.system_invoice', 'off', true);
    perform public.notify_user(
      p.id, 'reward', 'A prize was awarded but its invoice was not raised',
      coalesce(v_name, 'A creator') || ' - ' || coalesce(new.currency, 'GBP') || ' ' ||
      to_char(new.amount, 'FM999999990.00') || '. Raise it by hand on the Rewards page. (' ||
      sqlerrm || ')',
      '/admin/rewards'
    )
    from public.profiles p
    where p.platform_role in ('global_admin', 'owner') and p.is_test = false;
  end;

  return new;
end $$;

-- ------------------------------------------ an invoice in the queue says so
--
-- Was AFTER UPDATE OF stage only, so a row INSERTED straight into the queue -
-- which is how every auto-raised invoice arrives - announced itself to nobody.
create or replace function public.on_invoice_stage()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare r record;
begin
  if tg_op = 'UPDATE' and new.stage = old.stage then return new; end if;

  if new.stage = 'awaiting_approval' then
    for r in
      select id from public.profiles
      where platform_role in ('global_admin', 'owner')
        and is_test = false and id <> coalesce(new.submitted_by, '00000000-0000-0000-0000-000000000000'::uuid)
    loop
      perform public.notify_user(
        r.id, 'reward', 'An invoice needs approving',
        'Tryp.com ' || lpad(new.number::text, 3, '0') || ' for ' || new.creator_name || ', ' ||
        new.currency || ' ' || to_char(new.amount, 'FM999999990.00') || '.',
        '/admin/rewards?tab=queue'
      );
    end loop;
  elsif tg_op = 'UPDATE' and new.stage in ('approved', 'rejected') and new.submitted_by is not null
        and new.submitted_by <> coalesce(new.decided_by, '00000000-0000-0000-0000-000000000000'::uuid) then
    perform public.notify_user(
      new.submitted_by, 'reward',
      case when new.stage = 'approved' then 'Invoice approved' else 'Invoice sent back' end,
      'Tryp.com ' || lpad(new.number::text, 3, '0') || ' for ' || new.creator_name ||
      coalesce(' - ' || new.decision_note, '') || '.',
      '/admin/rewards?tab=queue'
    );
  end if;
  return new;
end $$;

drop trigger if exists trg_on_invoice_insert on public.invoices;
create trigger trg_on_invoice_insert
  after insert on public.invoices
  for each row execute function public.on_invoice_stage();

-- ------------------------------------- you cannot approve what cannot be paid
create or replace function public.decide_invoice(p_id uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  v_inv   record;
  v_owner boolean;
begin
  if not public.is_global_admin() then
    raise exception 'Only the team can approve an invoice.';
  end if;
  select * into v_inv from public.invoices where id = p_id;
  if v_inv is null then raise exception 'No such invoice.'; end if;
  if v_inv.stage <> 'awaiting_approval' then
    raise exception 'That invoice is not waiting for approval.';
  end if;

  select platform_role = 'owner' into v_owner from public.profiles where id = auth.uid();
  if not coalesce(v_owner, false) and v_inv.submitted_by = auth.uid() then
    raise exception 'Somebody else has to approve an invoice you submitted.';
  end if;

  -- Approving an invoice with an empty bank block sends a document nobody can
  -- act on. Two of these were sitting in the queue when this was written.
  if p_approve and not public.invoice_is_payable(v_inv.payment) then
    raise exception '% has no bank details on it. The creator has to save them in Settings first.',
      'Tryp.com ' || lpad(v_inv.number::text, 3, '0');
  end if;

  update public.invoices set
    stage = case when p_approve then 'approved' else 'rejected' end,
    status = case when p_approve then 'approved' else 'rejected' end,
    decided_at = now(),
    decided_by = auth.uid(),
    decision_note = nullif(btrim(coalesce(p_note, '')), '')
  where id = p_id;
end $$;

-- -------------------------- saving your bank details unblocks your own prize
--
-- The creator was notified to add them; nothing then connected the two. An
-- invoice that has not gone out yet takes the newest details every time, which
-- is also the honest answer to "they gave us the wrong account number".
create or replace function public.refresh_pending_invoice_payment()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_pay jsonb;
begin
  v_pay := public.payment_snapshot(new.id, null);
  if v_pay is null or not public.invoice_is_payable(v_pay) then return new; end if;

  update public.invoices
     set payment = v_pay,
         bill_to = case when coalesce(bill_to, '') = ''
                        then coalesce((select value ->> 'text' from public.app_settings
                                        where key = 'invoice_bill_to'), '')
                        else bill_to end
   where creator_id = new.id
     and stage in ('draft', 'awaiting_approval', 'approved', 'rejected')
     and payment is distinct from v_pay;
  return new;
end $$;

drop trigger if exists trg_refresh_pending_invoice_payment on public.creator_private;
create trigger trg_refresh_pending_invoice_payment
  after insert or update on public.creator_private
  for each row execute function public.refresh_pending_invoice_payment();

-- ------------------------------- one truth about whether a prize has been paid
--
-- A cash prize is paid by its invoice. Marking the reward distributed by hand
-- while the invoice still sits in the queue leaves the payouts list saying
-- "paid" and the invoice list saying "waiting", forever, with no way to tell
-- which is right. Vouchers have no invoice and are unaffected.
create or replace function public.reward_payment_has_one_owner()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_ref text;
begin
  if new.status <> 'distributed' or coalesce(old.status, '') = 'distributed' then
    return new;
  end if;
  select 'Tryp.com ' || lpad(number::text, 3, '0') into v_ref
    from public.invoices
   where reward_id = new.id and stage in ('draft', 'awaiting_approval', 'approved', 'rejected')
   limit 1;
  if v_ref is not null then
    raise exception 'This prize is being paid by invoice %. Send that invoice, or mark it paid, and this settles itself.', v_ref;
  end if;
  return new;
end $$;

drop trigger if exists trg_reward_payment_has_one_owner on public.rewards;
create trigger trg_reward_payment_has_one_owner
  before update of status on public.rewards
  for each row execute function public.reward_payment_has_one_owner();

-- --------------------------------------------------------------- repair work
--
-- 002 and 003 are empty shells that reached the approval queue before the
-- payable check existed. Put them back where they belong - blocked, waiting on
-- the creator - rather than one click from being sent to an accountant.
update public.invoices
   set stage = 'draft', status = 'draft', submitted_at = null, submitted_by = null
 where stage = 'awaiting_approval' and not public.invoice_is_payable(payment);

-- `status` drifted from `stage` on every auto-raised row (stage in the queue,
-- status still 'draft'). Two columns that mean the same thing must agree.
update public.invoices set status = stage where status is distinct from stage;

-- Two identical partial unique indexes on the same column, from two migrations
-- that both fixed the duplicate-invoice bug. One is enough.
drop index if exists public.invoices_reward_unique;

notify pgrst, 'reload schema';
