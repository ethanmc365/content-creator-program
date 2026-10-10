-- 381: OFFICIAL CREATORS ARE PAID EVERY MONTH, AND HEAR IT IN THEIR OWN WORDS (11 Oct 2026).
--
-- * Their contract (Content Creator Agreement ES, clause 4) is a monthly invoice paid within 30 days, not a balance that
--   waits for a minimum. So every official creator who is paid through the platform has `auto_payout` on: approving the
--   month's statement turns the whole balance into a cash reward with its invoice approved (min payout is 0 there).
--   A member moved into an official programme gets it switched on by vip_set_team.
-- * The VIP functions write "Your October VIP statement is ready", "Your VIP payout is on its way" and so on. One BEFORE
--   INSERT trigger on notifications rewrites those words for an official creator, instead of a branch in a dozen
--   functions that would drift. Cheap: it returns at once unless the type is 'vip' and the recipient is official.
-- * The invoice line for an official creator's monthly pay says what it is.

update public.vip_members m set auto_payout = true
  from public.vip_programmes p
 where p.id = m.programme_id and p.kind = 'official' and not m.invoice_outside and not coalesce(m.auto_payout, false);

create or replace function public.official_notice_words()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.type <> 'vip' or public.vip_kind_of(new.recipient_id) is distinct from 'official' then return new; end if;
  new.title := public.official_words(new.title);
  new.body := public.official_words(new.body);
  return new;
end $$;

create or replace function public.official_words(p text)
returns text language sql immutable set search_path = public as $$
  select regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(coalesce(p, ''),
    'the Tryp\.com VIP creators', 'the official Tryp.com creators', 'g'),
    'VIP creators', 'official creators', 'g'),
    'VIP (statement|payout|balance|month|place|page|room|challenge|agreement|programme)', '\1', 'g'),
    'VIPs', 'official creators', 'g'),
    '\mVIP\M ', '', 'g'),
    '\mVIP\M', 'official', 'g')
$$;

drop trigger if exists trg_ab_official_notice_words on public.notifications;
create trigger trg_ab_official_notice_words before insert on public.notifications
  for each row execute function public.official_notice_words();

CREATE OR REPLACE FUNCTION public.vip_pay_out(p_profile uuid, p_kind text, p_auto boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare m public.vip_members; p public.vip_programmes; v_bal numeric; v_reward uuid; v_inv uuid; v_name text; v_label text;
begin
  perform pg_advisory_xact_lock(hashtext('vip_wallet:' || p_profile::text));
  select * into m from public.vip_members where profile_id = p_profile;
  if m is null then raise exception 'That creator is not a VIP.'; end if;
  select * into p from public.vip_programmes where id = m.programme_id;
  v_bal := public.vip_balance(p_profile);
  if v_bal <= 0 then raise exception 'There is nothing in the balance yet.'; end if;
  if p_kind = 'cash' then
    if v_bal < coalesce(p.min_payout, 0) then
      raise exception 'Cash payouts start at % %. Take it as a Tryp.com travel voucher instead, or let it keep growing.', p.currency, to_char(p.min_payout, 'FM999990');
    end if;
    if not public.vip_payment_ready(p_profile, p.currency) then
      raise exception 'Add your payment details in Settings first, then ask again.';
    end if;
    insert into public.rewards (creator_id, reward_type, amount, currency, status, community_id, source, payment_notes)
    values (p_profile, 'cash', v_bal, p.currency, 'pending', p.community_id, 'vip',
            case when p.kind = 'official' then 'Tryp.com official content creator, monthly pay (fee and views): '
                 else 'VIP balance paid out: ' end || p.currency || ' ' || to_char(v_bal, 'FM999999990.00') || case when p.kind = 'official' then '.' else ' of views earnings.' end)
    returning id into v_reward;
    insert into public.vip_ledger (profile_id, programme_id, kind, amount, currency, reward_id, note, auto, created_by)
    values (p_profile, p.id, 'payout', -v_bal, p.currency, v_reward, case when p_auto then 'Paid automatically' else 'Cash payout' end, p_auto, auth.uid());
    select id into v_inv from public.invoices where reward_id = v_reward;
    if v_inv is not null then
      perform set_config('tryp.system_invoice', 'on', true);
      update public.invoices set stage = 'approved', status = 'approved', decided_at = now(), decided_by = auth.uid()
       where id = v_inv and stage = 'awaiting_approval';
      perform set_config('tryp.system_invoice', 'off', true);
    end if;
    v_label := 'cash payout';
  elsif p_kind = 'voucher' then
    insert into public.rewards (creator_id, reward_type, amount, currency, status, community_id, source, payment_notes)
    values (p_profile, 'voucher', v_bal, p.currency, 'pending', p.community_id, 'vip',
            'VIP balance as a Tryp.com travel voucher: ' || p.currency || ' ' || to_char(v_bal, 'FM999999990.00') || '.')
    returning id into v_reward;
    insert into public.vip_ledger (profile_id, programme_id, kind, amount, currency, reward_id, note, created_by)
    values (p_profile, p.id, 'voucher', -v_bal, p.currency, v_reward, 'Tryp.com travel voucher', auth.uid());
    v_label := 'Tryp.com travel voucher';
  else
    raise exception 'Unknown payout.';
  end if;

  select name into v_name from public.profiles where id = p_profile;
  insert into public.notifications (recipient_id, type, title, body, link)
  select mgr, 'vip', v_name || ' asked for a ' || v_label,
         p.name || ': ' || p.currency || ' ' || to_char(v_bal, 'FM999999990.00') ||
         case when p_kind = 'voucher' then '. Issue the voucher code on the Vouchers page.' else '. The invoice is approved and ready to pay.' end,
         '/vip?mode=tools&tab=wallets'
    from public.vip_manager_ids(p.id) mgr where mgr <> p_profile;
  perform public.notify_user(p_profile, 'vip',
    case when p_kind = 'voucher' then 'Your Tryp.com voucher is on its way' else 'Your VIP payout is on its way' end,
    p.currency || ' ' || to_char(v_bal, 'FM999999990.00') ||
      case when p_kind = 'voucher' then '. The team sends your voucher code shortly; it appears under Rewards.'
           else case when p_auto then ', paid automatically now that your balance reached the threshold.' else '. Your invoice is approved.' end end,
    '/vip?tab=payouts');
  return jsonb_build_object('reward_id', v_reward, 'amount', v_bal, 'kind', p_kind);
end $function$;

CREATE OR REPLACE FUNCTION public.vip_set_team(p_profile uuid, p_programme uuid, p_team boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare m public.vip_members; cur public.vip_programmes; v_to uuid; mo public.vip_months; v_name text;
begin
  select * into m from public.vip_members where profile_id = p_profile;
  if m.profile_id is null then raise exception 'They are not in a VIP or official programme.'; end if;
  select * into cur from public.vip_programmes where id = m.programme_id;
  if not public.vip_can_manage(cur.id) then
    raise exception 'Only the team running this programme can change that.';
  end if;
  if coalesce(p_team, false) = (cur.kind = 'official') then return coalesce(p_team, false); end if;
  if p_team then
    v_to := public.vip_official_programme(cur.community_id);
  else
    select id into v_to from public.vip_programmes where community_id = cur.community_id and kind = 'vip';
    if v_to is null then raise exception 'This market has no VIP community to move them to.'; end if;
  end if;
  if not public.vip_can_manage(v_to) then raise exception 'You do not run the programme they would move to.'; end if;
  mo := public.vip_ensure_month(cur.id);
  perform set_config('tryp.vip_quiet', 'on', true);
  update public.vip_members set programme_id = v_to, is_team = coalesce(p_team, false), auto_home = false,
         auto_payout = case when p_team then not invoice_outside else auto_payout end
   where profile_id = p_profile;
  update public.vip_videos set programme_id = v_to
   where profile_id = p_profile and programme_id = cur.id and coalesce(posted_at, submitted_at) >= mo.starts_at;
  perform set_config('tryp.vip_quiet', 'off', true);
  perform public.vip_ensure_month(v_to);
  select name into v_name from public.vip_programmes where id = v_to;
  insert into public.notifications (recipient_id, type, title, body, link)
  values (p_profile, 'vip',
          case when p_team then 'You are an official Tryp.com creator' else 'You are with the VIP creators' end,
          case when p_team then 'Your page, board, challenges and room are now the official creators'' own. This month''s videos came with you.'
               else 'Your page, board and room are the VIP community''s again. This month''s videos came with you.' end,
          '/vip');
  return coalesce(p_team, false);
end $function$;


insert into public.owner_only_rpcs (proname, why) values
  ('official_notice_words', 'trigger only'),
  ('official_words', 'internal helper')
on conflict (proname) do nothing;
select count(*) from public.lock_down_definer_functions();
