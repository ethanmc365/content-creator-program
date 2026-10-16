-- 432: Reconcile the green unpaid balances in the owner's 16 October PDF.
-- These are explicit outstanding totals, not the sheet's sometimes incorrect lifetime sums.
-- Ariadna is the existing confirmed alias of Arixsavi. Ana is Rincones del Mapa.
-- Preserve all confirmed matches. Fátima stays former; her amount is recorded but NOT credited.
-- Credits are ledger adjustments, not additional earnings rows or automatic payout requests.
-- One immutable receipt per historical name prevents a retry from duplicating money.
create table if not exists public.vip_history_balances (
  community_id uuid not null,
  creator_name text not null,
  amount numeric(12,2) not null check (amount >= 0),
  currency text not null default 'EUR',
  source text not null,
  credited_profile_id uuid references public.profiles(id),
  ledger_id uuid unique references public.vip_ledger(id),
  created_at timestamptz not null default now(),
  primary key (community_id, creator_name),
  foreign key (community_id, creator_name) references public.vip_history_names(community_id, creator_name),
  check ((ledger_id is null) = (credited_profile_id is null))
);
alter table public.vip_history_balances enable row level security;
revoke all on public.vip_history_balances from public, anon, authenticated;

do $reconcile$
declare v_comm uuid; r record; n public.vip_history_names; m public.vip_members; v_ledger uuid; v_source text := 'Content Creator Program Overview (2).pdf; green balances; 2026-10-16; sha256: a9d8182c4af1f28c3f03cabd5c5cee0ae4867e032974258c5df05cdbee9747ab';
begin
  select id into strict v_comm from public.communities where kind = 'chapter' and name = 'Spain';
  for r in select * from (values
    ('Nadia', 5.55::numeric),
    ('Mary', 0::numeric),
    ('Eva', 94.52::numeric),
    ('Noeta', 0::numeric),
    ('Fátima', 76.81::numeric),
    ('Julia', 5.47::numeric),
    ('Miriam', 29.62::numeric),
    ('Irene', 18.21::numeric),
    ('Mel', 755.60::numeric),
    ('Leyre', 153.85::numeric),
    ('Nadine', 204.52::numeric),
    ('Ariadna', 12.15::numeric),
    ('Sara', 21.20::numeric),
    ('Ylenia', 0::numeric),
    ('Nerea', 4.56::numeric),
    ('Betty', 3.85::numeric),
    ('Ana', 7.97::numeric),
    ('Laura', 5.18::numeric),
    ('Alejandro', 1.93::numeric)
  ) x(name, amount) loop
    select * into strict n from public.vip_history_names where community_id = v_comm and creator_name = r.name for update;
    if n.status not in ('confirmed', 'former') then raise exception 'Unresolved match: %', r.name; end if;
    insert into public.vip_history_balances(community_id, creator_name, amount, source)
    values(v_comm, r.name, r.amount, v_source) on conflict do nothing;
    if exists(select 1 from public.vip_history_balances where community_id=v_comm and creator_name=r.name and (amount<>r.amount or source<>v_source)) then
      raise exception 'Conflicting reconciliation for %', r.name;
    end if;
    if n.status = 'former' or r.amount = 0 then continue; end if;
    if exists(select 1 from public.vip_history_balances where community_id=v_comm and creator_name=r.name and ledger_id is not null) then continue; end if;
    select * into strict m from public.vip_members where profile_id=n.profile_id;
    if not exists(select 1 from public.vip_programmes where id=m.programme_id and community_id=v_comm and currency='EUR') then
      raise exception 'Unexpected market or currency for %', r.name;
    end if;
    perform pg_advisory_xact_lock(hashtext('vip_wallet:' || n.profile_id::text));
    -- The preflight found no prior entries. Abort if that has changed rather than risk double credit.
    if exists(select 1 from public.vip_ledger where profile_id=n.profile_id) then raise exception 'Review existing ledger for %', r.name; end if;
    insert into public.vip_ledger(profile_id,programme_id,kind,amount,currency,note)
    values(n.profile_id,m.programme_id,'adjust',r.amount,'EUR','Unwithdrawn earnings before October 2026 — team sheet reconciliation, 16 October 2026') returning id into v_ledger;
    update public.vip_history_balances set ledger_id=v_ledger, credited_profile_id=n.profile_id
    where community_id=v_comm and creator_name=r.name;
  end loop;
end $reconcile$;

CREATE OR REPLACE FUNCTION public.vip_history_match(p_programme uuid, p_name text, p_profile uuid, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_comm uuid; v_other text;
begin
  if not public.vip_can_manage(p_programme) then raise exception 'Only the team running this market can match names.'; end if;
  if coalesce((select is_sandbox from public.profiles where id = auth.uid()), false) then
    raise exception 'SANDBOX: the demo account can look but not decide.';
  end if;
  if p_status not in ('confirmed', 'former', 'unmatched', 'suggested') then raise exception 'Unknown status.'; end if;
  select community_id into v_comm from public.vip_programmes where id = p_programme;
  if not exists (select 1 from public.vip_history_names where community_id = v_comm and creator_name = p_name) then
    raise exception 'That name is not in this market''s history.';
  end if;
  if p_status in ('confirmed', 'suggested') then
    if p_profile is null then raise exception 'Pick who this is.'; end if;
    if not exists (select 1 from public.vip_members m join public.vip_programmes p on p.id = m.programme_id
                    where m.profile_id = p_profile and p.community_id = v_comm) then
      raise exception 'That person is not a paid creator in this market.';
    end if;
    select creator_name into v_other from public.vip_history_names
     where community_id = v_comm and profile_id = p_profile and status = 'confirmed' and creator_name <> p_name limit 1;
    if v_other is not null and p_status = 'confirmed' then
      raise exception 'They are already matched to "%". Unmatch that name first.', v_other;
    end if;
  end if;

  -- A name tied to an actual money credit cannot be reassigned by the matching UI.
  if exists (select 1 from public.vip_history_balances b where b.community_id=v_comm and b.creator_name=p_name
               and b.ledger_id is not null and (p_status is distinct from 'confirmed' or p_profile is distinct from b.credited_profile_id)) then
    raise exception 'This history has credited a balance. Ask the owner to reconcile the credit before changing its match.';
  end if;

  update public.vip_history_names
     set profile_id = case when p_status in ('confirmed', 'suggested') then p_profile end,
         status = p_status, decided_by = auth.uid(), decided_at = now()
   where community_id = v_comm and creator_name = p_name;

  update public.vip_earnings_history h
     set profile_id = case when p_status = 'confirmed' then p_profile end
    from public.vip_programmes hp
   where hp.id = h.programme_id and hp.community_id = v_comm and h.creator_name = p_name;
end $function$
;

CREATE OR REPLACE FUNCTION public.vip_history_names_list(p_programme uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_comm uuid; v_names jsonb; v_people jsonb;
begin
  if not public.vip_can_manage(p_programme) then raise exception 'Only the team running this market can match names.'; end if;
  select community_id into v_comm from public.vip_programmes where id = p_programme;

  select coalesce(jsonb_agg(jsonb_build_object(
           'name', n.creator_name, 'status', n.status, 'profile_id', n.profile_id,
           'profile_name', pf.name, 'photo_url', pf.photo_url,
           'decided_by', db.name, 'decided_at', n.decided_at,
           'outstanding_import', b.amount, 'credited', b.ledger_id is not null,
           'balance', case when n.status='confirmed' then public.vip_balance(n.profile_id) end,
           'months', t.months, 'views', t.views, 'earned', t.earned, 'first', t.first_m, 'last', t.last_m, 'series', t.series
         ) order by t.earned desc, n.creator_name), '[]'::jsonb)
    into v_names
    from public.vip_history_names n
    left join public.vip_history_balances b on b.community_id=n.community_id and b.creator_name=n.creator_name
    left join public.profiles pf on pf.id = n.profile_id
    left join public.profiles db on db.id = n.decided_by
    cross join lateral (
      select count(*) months, coalesce(sum(h.views), 0) views, coalesce(sum(h.earned), 0) earned,
             min(h.year * 100 + h.month) first_m, max(h.year * 100 + h.month) last_m,
             coalesce(jsonb_agg(jsonb_build_object('y', h.year, 'm', h.month, 'views', h.views, 'earned', h.earned) order by h.year, h.month), '[]'::jsonb) series
        from public.vip_earnings_history h join public.vip_programmes hp on hp.id = h.programme_id
       where hp.community_id = n.community_id and h.creator_name = n.creator_name
    ) t
   where n.community_id = v_comm;

  -- Everybody who is or was a paid creator in this market, in either programme, so a name can be matched to someone
  -- who has since moved to the official creators (Julia) or left.
  select coalesce(jsonb_agg(distinct jsonb_build_object('id', pf.id, 'name', pf.name, 'photo_url', pf.photo_url,
           'kind', p.kind, 'status', m.status)), '[]'::jsonb)
    into v_people
    from public.vip_members m
    join public.vip_programmes p on p.id = m.programme_id
    join public.profiles pf on pf.id = m.profile_id
   where p.community_id = v_comm and not coalesce(pf.is_test, false) and not coalesce(pf.is_sandbox, false);

  return jsonb_build_object('names', v_names, 'people', v_people);
end $function$
;

CREATE OR REPLACE FUNCTION public.vip_my_earnings()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_me uuid := public.vip_who(); v_rows jsonb; v_cpm numeric;
begin
  if v_me is null then return null; end if;
  if not exists (select 1 from public.vip_members where profile_id = v_me) then return null; end if;
  select coalesce(m.cpm, p.cpm) into v_cpm
    from public.vip_members m join public.vip_programmes p on p.id = m.programme_id
   where m.profile_id = v_me order by (m.status = 'active') desc limit 1;

  with progs as (
    select p.id, p.community_id, p.kind,
           (select max(h.year * 12 + h.month) from public.vip_earnings_history h
              join public.vip_programmes hp on hp.id = h.programme_id where hp.community_id = p.community_id) cut
      from public.vip_programmes p
     where p.id in (select programme_id from public.vip_members where profile_id = v_me)
  ), hist as (
    select h.year, h.month, h.views, h.earned pay, 0::numeric extra, h.rate, 'sheet'::text src, false live
      from public.vip_earnings_history h
      join public.vip_history_names n on n.creator_name = h.creator_name
      join public.vip_programmes hp on hp.id = h.programme_id and hp.community_id = n.community_id
     where n.status = 'confirmed' and n.profile_id = v_me
  ), plat as (
    select r.year, r.month, r.views, coalesce(r.base, 0) pay, coalesce(r.bonus, 0) extra,
           case when r.views > 0 then round(coalesce(r.base, 0) / r.views * 1000, 4) end rate, 'platform'::text src,
           (r.month_status = 'open') live
      from progs pr cross join lateral public.vip_month_rows(array[pr.id]) r
     where r.profile_id = v_me and r.year * 12 + r.month > coalesce(pr.cut, 0)
  ), allrows as (select * from hist union all select * from plat)
  select coalesce(jsonb_agg(jsonb_build_object('year', a.year, 'month', a.month, 'views', a.views, 'pay', a.pay,
           'extra', a.extra, 'rate', a.rate, 'source', a.src, 'live', a.live) order by a.year, a.month), '[]'::jsonb)
    into v_rows from allrows a;
  return jsonb_build_object('currency', 'EUR', 'cpm', v_cpm, 'rows', v_rows,
    'balance', public.vip_balance(v_me),
    'history_credit', (select coalesce(sum(amount),0) from public.vip_history_balances where credited_profile_id=v_me),
    'cash_threshold', (select p.min_payout from public.vip_members m join public.vip_programmes p on p.id=m.programme_id where m.profile_id=v_me),
    'voucher_min', (select p.voucher_min from public.vip_members m join public.vip_programmes p on p.id=m.programme_id where m.profile_id=v_me));
end $function$
;

CREATE OR REPLACE FUNCTION public.vip_my_wallet()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare m public.vip_members; p public.vip_programmes; mo public.vip_months; v_who uuid := public.vip_who();
  v_views bigint; v_live numeric; v_cap numeric; v_entries jsonb; v_history jsonb;
begin
  select * into m from public.vip_members where profile_id = v_who;
  if m is null then return null; end if;
  select * into p from public.vip_programmes where id = m.programme_id;
  mo := public.vip_ensure_month(p.id);
  select s.views into v_views from public.vip_month_stats(mo.id) s where s.profile_id = v_who;
  v_live := public.vip_views_pay(coalesce(v_views, 0), coalesce(m.cpm, p.cpm), coalesce(m.tiers, p.tiers), case when m.tiers is null then m.cpm end);
  v_cap := coalesce(m.monthly_cap, p.monthly_cap);
  if v_cap is not null and v_live > v_cap then v_live := v_cap; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', l.id, 'kind', l.kind, 'amount', l.amount, 'currency', l.currency, 'note', l.note, 'auto', l.auto,
      'at', l.created_at, 'year', mm.year, 'month', mm.month,
      'reward_status', r.status, 'voucher_code', r.voucher_code, 'invoice_stage', i.stage, 'invoice_number', i.number,
      'invoice_id', i.id, 'paid_at', i.paid_at) order by l.created_at desc), '[]'::jsonb)
    into v_entries
    from public.vip_ledger l
    left join public.vip_months mm on mm.id = l.month_id
    left join public.rewards r on r.id = l.reward_id
    left join public.invoices i on i.reward_id = l.reward_id
   where l.profile_id = v_who;

  -- Month by month, for the "CPM panel": views, the rate and what it earned (statements), newest first.
  select coalesce(jsonb_agg(jsonb_build_object('year', mm.year, 'month', mm.month, 'views', s.views, 'videos', s.videos,
      'cpm', s.cpm, 'earned', s.total, 'status', s.status) order by mm.starts_at desc), '[]'::jsonb)
    into v_history
    from public.vip_statements s join public.vip_months mm on mm.id = s.month_id
   where s.profile_id = v_who and s.status <> 'void';

  return jsonb_build_object(
    'balance', public.vip_balance(v_who),
    'history_credit', (select coalesce(sum(amount),0) from public.vip_history_balances where credited_profile_id=v_who),
    'currency', p.currency,
    'threshold', coalesce(p.min_payout, 0), 'voucher_min', coalesce(p.voucher_min, 0),
    'payment_ready', public.vip_payment_ready(v_who, p.currency),
    'auto_payout', m.auto_payout,
    'window', public.vip_window(v_who),
    'this_month', jsonb_build_object('year', mo.year, 'month', mo.month, 'earned', v_live, 'views', coalesce(v_views, 0),
        'ends_at', mo.ends_at, 'cpm', coalesce(m.cpm, p.cpm)),
    'requirement', public.vip_req_check(v_who, mo.id),
    'entries', v_entries,
    'history', v_history,
    'lifetime_earned', (select coalesce(sum(amount), 0) from public.vip_ledger where profile_id = v_who and kind in ('earned', 'adjust')),
    'lifetime_paid', (select coalesce(-sum(amount), 0) from public.vip_ledger where profile_id = v_who and kind in ('payout', 'voucher')));
end $function$
;

