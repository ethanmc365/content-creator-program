-- 434: money alerts go to the owner only (19 Oct 2026).
--
-- Publishing the Global Challenge's winners drafted invoices and voucher rewards in one go, and every global admin
-- got a notification per invoice ("An invoice needs approving", 72 to nine people) and per voucher owed ("X is waiting
-- on a voucher code", nine each). Ethan: "I don't want every admin getting all those spam notifications... for me it's
-- fine". Both alerts now go to the owner, and nobody else.

create or replace function public.on_invoice_stage()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare r record;
begin
  if tg_op = 'UPDATE' and new.stage = old.stage then return new; end if;

  if new.stage = 'awaiting_approval' then
    for r in
      select id from public.profiles
      where platform_role = 'owner'
        and is_test = false and id <> coalesce(new.submitted_by, '00000000-0000-0000-0000-000000000000'::uuid)
    loop
      perform public.notify_user(
        r.id, 'reward', 'An invoice needs approving',
        'Tryp.com ' || lpad(new.number::text, 3, '0') || ' for ' || new.creator_name || ', ' ||
        new.currency || ' ' || to_char(new.amount, 'FM999999990.00') || '.',
        '/admin/rewards'
      );
    end loop;
  elsif tg_op = 'UPDATE' and new.stage in ('approved', 'rejected') and new.submitted_by is not null
        and new.submitted_by <> coalesce(new.decided_by, '00000000-0000-0000-0000-000000000000'::uuid) then
    perform public.notify_user(
      new.submitted_by, 'reward',
      case when new.stage = 'approved' then 'Invoice approved' else 'Invoice sent back' end,
      'Tryp.com ' || lpad(new.number::text, 3, '0') || ' for ' || new.creator_name ||
      coalesce(' - ' || new.decision_note, '') || '.',
      '/admin/rewards'
    );
  end if;
  return new;
end $function$;

create or replace function public.voucher_owed_alert(rw rewards)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_name text; v_test boolean; v_what text;
begin
  if rw.reward_type <> 'voucher' or rw.status <> 'pending' or coalesce(rw.voucher_code, '') <> ''
     or coalesce(rw.source, '') = 'vip' then
    return;
  end if;
  select name, coalesce(is_test, false) or coalesce(is_sandbox, false) into v_name, v_test from public.profiles where id = rw.creator_id;
  if v_test then return; end if;
  v_what := case
    when rw.milestone_id is not null then 'a milestone: ' || coalesce((select title from public.milestones where id = rw.milestone_id), 'milestone')
    when rw.challenge_id is not null then coalesce((select title from public.challenges where id = rw.challenge_id), 'a challenge')
    else coalesce(nullif(rw.payment_notes, ''), 'a reward') end;
  insert into public.notifications (recipient_id, type, title, body, link)
  select p.id, 'reward',
         coalesce(v_name, 'A creator') || ' is waiting on a voucher code',
         rw.currency || ' ' || to_char(rw.amount, 'FM999999990.00') || ' Tryp.com voucher for ' || v_what || '. Add the code on the Vouchers page so it lands in their wallet.',
         '/admin/rewards?tab=vouchers'
    from public.profiles p
   where p.platform_role = 'owner' and p.status = 'active' and not coalesce(p.is_sandbox, false)
     and not coalesce(p.is_test, false) and p.id <> rw.creator_id;
end $function$;
