-- 091  INVOICE AUTOMATION AND AN APPROVAL QUEUE
--
-- Two problems, one lifecycle.
--
-- THE AUTOMATION. Awarding a cash prize and invoicing for it were separate acts
-- performed by the same person from two different tabs: mark the reward, then
-- open the composer, then find the creator again, then retype the amount, then
-- find the challenge title, then hope their bank details are saved. Every one of
-- those fields is already known the moment the reward row exists. So a cash
-- reward now MAKES its invoice, as a draft, with everything filled in - the
-- admin's job shrinks to reading it and pressing send.
--
-- THE QUEUE. `invoices.status` defaulted to 'sent' and there was no state before
-- it: an invoice existed because somebody had already emailed it. Money left the
-- company on one person's judgement with no record of a second opinion and no
-- way to see what was about to go out. There is a stage now, and sending is
-- gated on it.
--
--   draft -> awaiting_approval -> approved -> sent -> paid
--                    \-> rejected (back to draft when edited)
--
-- FOUR EYES, WITH ONE DELIBERATE EXCEPTION. You cannot approve an invoice you
-- submitted - that is the entire point of an approval step - unless you are the
-- owner, who has nobody above them and would otherwise be unable to pay anybody
-- without asking permission from staff they appointed. Everyone else needs a
-- second admin. With three admins that is a real control and not a ritual.

-- ------------------------------------------------------------- 1. the shape

alter table public.invoices
  add column if not exists reward_id      uuid references public.rewards(id) on delete set null,
  add column if not exists stage          text not null default 'draft',
  add column if not exists submitted_at   timestamptz,
  add column if not exists submitted_by   uuid references public.profiles(id) on delete set null,
  add column if not exists decided_at     timestamptz,
  add column if not exists decided_by     uuid references public.profiles(id) on delete set null,
  add column if not exists decision_note  text,
  add column if not exists auto_generated boolean not null default false,
  add column if not exists paid_at        timestamptz;

-- EVERY INVOICE THAT ALREADY EXISTS WAS SENT. Marking history as unapproved
-- would fill the queue on day one with work nobody can do - the emails went out
-- months ago - and would make the one number the queue exists to show (what is
-- about to leave) wrong.
update public.invoices
   set stage = case when status = 'paid' then 'paid' else 'sent' end
 where stage = 'draft' and sent_at is not null;

alter table public.invoices drop constraint if exists invoices_stage_chk;
alter table public.invoices
  add constraint invoices_stage_chk
  check (stage in ('draft', 'awaiting_approval', 'approved', 'rejected', 'sent', 'paid'));

-- One invoice per reward. Without this a double-click on "add reward", a retry,
-- or the trigger firing twice quietly produces two payables for one prize.
create unique index if not exists invoices_reward_unique
  on public.invoices(reward_id) where reward_id is not null;

create index if not exists invoices_stage_idx on public.invoices(stage);

-- A CREATOR SEES THEIR INVOICE ONCE IT IS REAL, NOT WHILE IT IS BEING DECIDED.
-- `invoices: own read` was written when the only rows that existed were ones
-- already emailed. Now a draft appears the moment a prize is awarded, and
-- letting the creator read it would leak both the intent to pay them and, if it
-- were rejected, an internal decision - about money, before anybody told them.
drop policy if exists "invoices: own read" on public.invoices;
create policy "invoices: own read" on public.invoices
  for select using (
    creator_id = (select auth.uid()) and stage in ('sent', 'paid')
  );

-- --------------------------------------------------------- 2. the numbering
--
-- `number` had no default and no uniqueness: the client read the highest one it
-- could see and added one. That is fine for a person clicking a button and
-- wrong for a trigger, so the allocator moves to the database behind a
-- transaction-scoped advisory lock. Two rewards awarded in the same second get
-- two different numbers instead of a duplicate nobody notices until an accountant
-- does.
create or replace function public.next_invoice_number()
returns integer language plpgsql security definer set search_path to 'public' as $$
declare n integer;
begin
  perform pg_advisory_xact_lock(hashtext('tryp.invoice.number'));
  select coalesce(max(number), 0) + 1 into n from public.invoices;
  return n;
end $$;

revoke execute on function public.next_invoice_number() from public;
grant execute on function public.next_invoice_number() to authenticated;

-- ------------------------------------------------------- 3. the automation

create or replace function public.on_reward_draft_invoice()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_name   text;
  v_desc   text;
  v_bill   text;
  v_priv   record;
  v_pay    jsonb;
begin
  -- Only cash creates a payable. A t-shirt is a reward and is not an invoice.
  if new.reward_type is distinct from 'cash' or coalesce(new.amount, 0) <= 0 then
    return new;
  end if;
  if exists (select 1 from public.invoices where reward_id = new.id) then
    return new;
  end if;

  select name into v_name from public.profiles where id = new.creator_id;
  select coalesce('Prize for ' || title, 'Creator prize') into v_desc
    from public.challenges where id = new.challenge_id;
  v_desc := coalesce(v_desc, 'Creator prize');
  select coalesce(value ->> 'text', '') into v_bill
    from public.app_settings where key = 'invoice_bill_to';

  -- A SNAPSHOT OF THE BANK DETAILS, NOT A REFERENCE TO THEM. An invoice is a
  -- record of what was asked for on a date; if it read `creator_private` live,
  -- editing a sort code would silently rewrite history on every invoice ever
  -- issued. Blank here is fine and informative - the queue shows it as blocked
  -- until the creator fills their details in, and `submit_invoice` re-reads
  -- them at that point.
  select * into v_priv from public.creator_private where id = new.creator_id;
  v_pay := jsonb_build_object(
    'currency',      coalesce(v_priv.pay_currency, new.currency, 'GBP'),
    'name',          coalesce(v_priv.pay_name, ''),
    'bank',          coalesce(v_priv.pay_bank, ''),
    'sortCode',      coalesce(v_priv.pay_sort_code, ''),
    'accountNumber', coalesce(v_priv.pay_account_number, ''),
    'iban',          coalesce(v_priv.pay_iban, ''),
    'bic',           coalesce(v_priv.pay_bic, ''),
    'address',       coalesce(v_priv.pay_address, '')
  );

  insert into public.invoices (
    number, reward_id, creator_id, creator_name, amount, currency, description,
    bill_to, payment, stage, status, auto_generated, community_id, created_by
  ) values (
    public.next_invoice_number(), new.id, new.creator_id, coalesce(v_name, 'Creator'),
    new.amount, coalesce(new.currency, 'GBP'), v_desc,
    coalesce(v_bill, ''), v_pay, 'draft', 'draft', true, new.community_id, auth.uid()
  );
  return new;
end $$;

drop trigger if exists trg_on_reward_draft_invoice on public.rewards;
create trigger trg_on_reward_draft_invoice
  after insert on public.rewards
  for each row execute function public.on_reward_draft_invoice();

-- ----------------------------------------------------------- 4. the queue
--
-- Every transition is an RPC rather than an UPDATE policy, because a stage is
-- not a field somebody sets - it is a move somebody makes, and the rules about
-- who may make it (and from where) do not fit in a WITH CHECK.

create or replace function public.submit_invoice(p_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  v_inv  record;
  v_priv record;
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

  update public.invoices set
    stage = case when p_approve then 'approved' else 'rejected' end,
    status = case when p_approve then 'approved' else 'rejected' end,
    decided_at = now(),
    decided_by = auth.uid(),
    decision_note = nullif(btrim(coalesce(p_note, '')), '')
  where id = p_id;
end $$;

create or replace function public.mark_invoice_paid(p_id uuid, p_paid boolean default true)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_inv record;
begin
  if not public.is_global_admin() then
    raise exception 'Only the team can mark an invoice paid.';
  end if;
  select * into v_inv from public.invoices where id = p_id;
  if v_inv is null then raise exception 'No such invoice.'; end if;
  if p_paid and v_inv.stage not in ('sent', 'approved') then
    raise exception 'Only an approved or sent invoice can be marked paid.';
  end if;

  update public.invoices set
    stage = case when p_paid then 'paid' else 'sent' end,
    status = case when p_paid then 'paid' else 'sent' end,
    paid_at = case when p_paid then now() else null end
  where id = p_id;

  -- The reward and the invoice are two views of one payment, so paying one
  -- settles the other. Without this the payouts tab keeps saying "pending"
  -- about money that has left the account.
  if p_paid and v_inv.reward_id is not null then
    update public.rewards
       set status = 'distributed',
           distributed_at = coalesce(distributed_at, now())
     where id = v_inv.reward_id and status <> 'distributed';
  end if;
end $$;

revoke execute on function public.submit_invoice(uuid) from public;
revoke execute on function public.decide_invoice(uuid, boolean, text) from public;
revoke execute on function public.mark_invoice_paid(uuid, boolean) from public;
grant execute on function public.submit_invoice(uuid) to authenticated;
grant execute on function public.decide_invoice(uuid, boolean, text) to authenticated;
grant execute on function public.mark_invoice_paid(uuid, boolean) to authenticated;

-- ------------------------------------------------ 5. telling somebody about it
--
-- A queue nobody looks at is a queue that stops payments instead of controlling
-- them. Submitting notifies every OTHER global admin - not the submitter, who
-- knows - and a decision notifies the person who asked.

create or replace function public.on_invoice_stage()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare r record;
begin
  if new.stage = old.stage then return new; end if;

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
  elsif new.stage in ('approved', 'rejected') and new.submitted_by is not null
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

drop trigger if exists trg_on_invoice_stage on public.invoices;
create trigger trg_on_invoice_stage
  after update of stage on public.invoices
  for each row execute function public.on_invoice_stage();
