-- 318 (3 Oct 2026): three changes Ethan asked for on the VIP tools.
--
-- 1. PAYOUTS ANY TIME, OVER A THRESHOLD. "they can request to get a voucher at any time over ten euro ... cash can be
--    withdrawn when it's over a hundred euro. Or we can actually set this in settings." The payout window is gone from
--    the request: a VIP asks whenever the balance reaches the voucher minimum (new `voucher_min`, default 10) or the
--    cash threshold (`min_payout`, 100). Automatic payouts are untouched.
-- 2. PERKS THAT PAY THEMSELVES. "we want everything to be automated ... prizes that will then be automatically given
--    out, like cash prizes." A perk can carry a reward: cash goes straight into the VIP's balance the moment it is
--    unlocked (and the perk is marked delivered), a voucher is raised as a pending voucher reward for the team to send.
-- 3. BONUSES FOR A FUTURE MONTH. "I should have the option to click future months as well to actually prepare this."
--    A rule can name a calendar month (`for_year`, `for_month`) that has no vip_months row yet; the close matches it.

alter table public.vip_programmes add column if not exists voucher_min numeric not null default 10 check (voucher_min >= 0);
update public.vip_programmes set min_payout = 100 where coalesce(min_payout, 0) = 0;

alter table public.vip_perks add column if not exists reward_kind text not null default 'none' check (reward_kind in ('none', 'cash', 'voucher'));
alter table public.vip_perks add column if not exists reward_amount numeric check (reward_amount is null or reward_amount >= 0);

alter table public.vip_bonus_rules add column if not exists for_year integer;
alter table public.vip_bonus_rules add column if not exists for_month integer check (for_month is null or for_month between 1 and 12);

-- ---------------------------------------------------------------------------------------------- 1. payouts any time
create or replace function public.vip_request_payout(p_kind text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare m public.vip_members; p public.vip_programmes; v_bal numeric;
begin
  if nullif(current_setting('vip.preview_as', true), '') is not null then raise exception 'A preview cannot ask for money.'; end if;
  select * into m from public.vip_members where profile_id = auth.uid();
  if m is null then raise exception 'Only a VIP can ask for a payout.'; end if;
  select * into p from public.vip_programmes where id = m.programme_id;
  v_bal := public.vip_balance(auth.uid());
  if p_kind = 'voucher' and v_bal < coalesce(p.voucher_min, 0) then
    raise exception 'Vouchers start at % %. Let your balance grow a little first.', p.currency, to_char(p.voucher_min, 'FM999990');
  end if;
  return public.vip_pay_out(auth.uid(), p_kind, false);
end $function$;

drop function if exists public.vip_set_rules(uuid, numeric, integer, boolean, integer, bigint);
create or replace function public.vip_set_rules(p_programme uuid, p_threshold numeric, p_request_days integer, p_req_on boolean,
  p_req_videos integer, p_req_views bigint, p_voucher_min numeric default null)
returns void language plpgsql security definer set search_path to 'public' as $function$
begin
  if not public.vip_can_manage(p_programme) then raise exception 'Only the market lead or the team can change this.'; end if;
  update public.vip_programmes set
    min_payout = coalesce(p_threshold, min_payout),
    voucher_min = coalesce(p_voucher_min, voucher_min),
    request_days = coalesce(p_request_days, request_days),
    req_on = coalesce(p_req_on, req_on),
    req_videos = coalesce(p_req_videos, req_videos),
    req_single_views = coalesce(p_req_views, req_single_views)
  where id = p_programme;
end $function$;

-- The wallet tells the page the voucher minimum too.
do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.vip_my_wallet()'::regprocedure);
  assert position($q$'threshold', coalesce(p.min_payout, 0),$q$ in v_def) > 0, 'vip_my_wallet threshold line not found';
  v_def := replace(v_def, $q$'threshold', coalesce(p.min_payout, 0),$q$, $q$'threshold', coalesce(p.min_payout, 0), 'voucher_min', coalesce(p.voucher_min, 0),$q$);
  execute v_def;
end $$;

-- ---------------------------------------------------------------------------------------------- 2. perks that pay
create or replace function public.vip_set_perk_reward(p_id uuid, p_kind text, p_amount numeric)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare pk public.vip_perks;
begin
  select * into pk from public.vip_perks where id = p_id;
  if pk is null then raise exception 'That perk no longer exists.'; end if;
  if not public.vip_scope_ok(pk.programme_id) then raise exception 'Only the market lead or the team can change this.'; end if;
  if p_kind not in ('none', 'cash', 'voucher') then raise exception 'Unknown reward.'; end if;
  if p_kind <> 'none' and coalesce(p_amount, 0) <= 0 then raise exception 'Say how much the reward is worth.'; end if;
  update public.vip_perks set reward_kind = p_kind, reward_amount = case when p_kind = 'none' then null else p_amount end where id = p_id;
end $function$;

create or replace function public.vip_award_perks()
returns integer language plpgsql security definer set search_path to 'public' as $function$
declare r record; n int := 0; v_reward uuid; v_note text;
begin
  for r in select m.profile_id, m.programme_id, pk.id as perk_id, pk.title, pk.kind, pk.reward_kind, pk.reward_amount,
                  pf.name as pname, pg.currency, pg.community_id
             from public.vip_members m
             join public.profiles pf on pf.id = m.profile_id
             join public.vip_programmes pg on pg.id = m.programme_id
             join public.vip_perks pk on pk.active and pk.metric <> 'manual' and (pk.programme_id is null or pk.programme_id = m.programme_id)
            where m.status = 'active'
              and not exists (select 1 from public.vip_perk_awards a where a.perk_id = pk.id and a.profile_id = m.profile_id)
              and public.vip_metric(m.profile_id, pk.metric) >= pk.threshold loop
    insert into public.vip_perk_awards (perk_id, profile_id) values (r.perk_id, r.profile_id) on conflict do nothing;
    if found then
      v_note := null;
      if r.reward_kind = 'cash' and coalesce(r.reward_amount, 0) > 0 then
        insert into public.vip_ledger (profile_id, programme_id, kind, amount, currency, note, auto)
        values (r.profile_id, r.programme_id, 'adjust', r.reward_amount, r.currency, 'Unlocked: ' || r.title, true);
        update public.vip_perk_awards set status = 'delivered', delivered_at = now(), note = 'Added to your balance'
         where perk_id = r.perk_id and profile_id = r.profile_id;
        v_note := r.currency || ' ' || to_char(r.reward_amount, 'FM999990.00') || ' has been added to your VIP balance.';
      elsif r.reward_kind = 'voucher' and coalesce(r.reward_amount, 0) > 0 then
        insert into public.rewards (creator_id, reward_type, amount, currency, status, community_id, source, payment_notes)
        values (r.profile_id, 'voucher', r.reward_amount, r.currency, 'pending', r.community_id, 'vip', 'VIP perk unlocked: ' || r.title)
        returning id into v_reward;
        update public.vip_perk_awards set status = 'claimed', claimed_at = now(), note = 'Voucher on its way'
         where perk_id = r.perk_id and profile_id = r.profile_id;
        v_note := 'A ' || r.currency || ' ' || to_char(r.reward_amount, 'FM999990') || ' Tryp.com voucher is on its way. The code appears under Rewards.';
      end if;
      insert into public.notifications (recipient_id, type, title, body, link)
      values (r.profile_id, 'vip', 'Unlocked: ' || r.title,
              coalesce(v_note, case when r.kind = 'trip' then 'Open your VIP page to claim it. Your market lead will be in touch to plan it with you.'
                   else 'Open your VIP page to see it and claim it.' end), '/vip?tab=perks');
      insert into public.notifications (recipient_id, type, title, body, link)
      select mgr, 'vip', coalesce(r.pname, 'A VIP') || ' unlocked ' || r.title,
             case when r.reward_kind = 'cash' then 'The reward was added to their balance automatically.'
                  when r.reward_kind = 'voucher' then 'Send their voucher code from the Vouchers page.'
                  else 'Mark it delivered once it has been sorted.' end,
             case when r.reward_kind = 'voucher' then '/admin/rewards?tab=vouchers' else '/vip?mode=tools&tab=content&part=perks' end
        from public.vip_manager_ids(r.programme_id) mgr where mgr <> r.profile_id;
      n := n + 1;
    end if;
  end loop;
  return n;
end $function$;

-- ---------------------------------------------------------------------------------------------- 3. future months
do $$
declare v_def text; v_old text := '(r.month_id is null or r.month_id = p_month)';
begin
  v_def := pg_get_functiondef('public.vip_compute_statements(uuid)'::regprocedure);
  assert position(v_old in v_def) > 0, 'vip_compute_statements rule filter not found';
  v_def := replace(v_def, v_old,
    '(r.month_id = p_month or (r.month_id is null and (r.for_year is null or exists (select 1 from public.vip_months fm where fm.id = p_month and fm.year = r.for_year and fm.month = r.for_month))))');
  execute v_def;
end $$;

-- 318b: the default-privileges trap (see 303) re-granted the cron-only function.
revoke execute on function public.vip_award_perks() from authenticated;
