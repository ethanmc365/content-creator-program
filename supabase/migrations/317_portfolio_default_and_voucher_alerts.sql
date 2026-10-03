-- 317 (3 Oct 2026): portfolios on profiles by default, and the team told when a voucher is owed.

-- 1. A PORTFOLIO SHOWS ON THE PROFILE UNLESS ITS OWNER SAYS NO. Ethan: "the portfolios are no longer showing on the
--    profile pages ... it should all be on automatically already." Four of six rows had never been switched on (the
--    column defaulted to false); the client also treats a missing row as "on, with the defaults".
alter table public.creator_portfolios alter column show_on_profile set default true;
update public.creator_portfolios set show_on_profile = true where not show_on_profile;

-- 2. A VOUCHER SOMEBODY HAS EARNED IS A JOB FOR THE TEAM. Ethan: "it didn't get notified that one of the creators
--    reached a milestone and was waiting on a voucher code." Noemi's EUR 10 milestone voucher (2 Oct) produced no
--    alert at all: nothing on the platform told anybody a code was owed. Now every pending voucher reward tells the
--    owner, the global admins and that market's managers, with a link to the vouchers page. VIP payouts already notify
--    their VIP managers (vip_pay_out), so they are left to that; test and sandbox creators never alert anybody.
create or replace function public.voucher_owed_alert(rw public.rewards)
returns void language plpgsql security definer set search_path = public as $$
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
   where p.is_admin and p.status = 'active' and not coalesce(p.is_sandbox, false) and p.id <> rw.creator_id
     and (p.platform_role in ('owner', 'global_admin')
          or exists (select 1 from public.community_members cm
                      where cm.profile_id = p.id and cm.role = 'manager' and cm.status = 'active'
                        and cm.community_id = rw.community_id));
end $$;

create or replace function public.on_voucher_owed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.voucher_owed_alert(new);
  return null;
exception when others then
  -- an alert must never stop a reward being written; the failure is still recorded for the error panel
  perform public.report_system_error('notify', 'voucher-owed', 'Could not alert the team about a voucher', sqlerrm, '/admin/rewards?tab=vouchers');
  return null;
end $$;

drop trigger if exists trg_on_voucher_owed on public.rewards;
create trigger trg_on_voucher_owed after insert on public.rewards
  for each row execute function public.on_voucher_owed();
revoke all on function public.on_voucher_owed() from public, anon, authenticated;
revoke all on function public.voucher_owed_alert(public.rewards) from public, anon, authenticated;

-- The ones already waiting (on 3 Oct: Noemi's milestone voucher) are announced once now.
select public.voucher_owed_alert(r) from public.rewards r
 where r.reward_type = 'voucher' and r.status = 'pending' and coalesce(r.voucher_code, '') = '' and coalesce(r.source, '') <> 'vip';
