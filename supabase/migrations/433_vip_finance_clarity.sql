-- One source for creator wallet history and staff finance reporting. Historical sheet
-- earnings remain earnings; only the unpaid green portion was credited to wallets.
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
      'historical_import', hb.ledger_id is not null,
      'at', l.created_at, 'year', mm.year, 'month', mm.month,
      'reward_status', r.status, 'voucher_code', r.voucher_code, 'invoice_stage', i.stage, 'invoice_number', i.number,
      'invoice_id', i.id, 'paid_at', i.paid_at) order by l.created_at desc), '[]'::jsonb)
    into v_entries
    from public.vip_ledger l
    left join public.vip_history_balances hb on hb.ledger_id = l.id
    left join public.vip_months mm on mm.id = l.month_id
    left join public.rewards r on r.id = l.reward_id
    left join public.invoices i on i.reward_id = l.reward_id
   where l.profile_id = v_who;

  -- Confirmed pre-platform months and platform statements have separate sources and
  -- dates. Do not count an imported wallet credit as a second earned month.
  with hist as (
    select h.year, h.month, h.views, null::integer videos, h.rate cpm,
           h.earned, 'history'::text status, 'sheet'::text source
      from public.vip_earnings_history h
      join public.vip_history_names n on n.creator_name = h.creator_name
      join public.vip_programmes hp on hp.id = h.programme_id and hp.community_id = n.community_id
     where n.status = 'confirmed' and n.profile_id = v_who
  ), plat as (
    select mm.year, mm.month, s.views, s.videos, s.cpm, s.total earned,
           s.status::text, 'platform'::text source
      from public.vip_statements s join public.vip_months mm on mm.id = s.month_id
      join public.vip_programmes sp on sp.id = mm.programme_id
     where s.profile_id = v_who and s.status <> 'void' and sp.community_id = p.community_id
       and mm.year * 12 + mm.month > coalesce((select max(h.year * 12 + h.month)
         from public.vip_earnings_history h join public.vip_programmes hp on hp.id = h.programme_id
         where hp.community_id = p.community_id), 0)
  )
  select coalesce(jsonb_agg(jsonb_build_object('year', x.year, 'month', x.month,
    'views', x.views, 'videos', x.videos, 'cpm', x.cpm, 'earned', x.earned,
    'status', x.status, 'source', x.source) order by x.year desc, x.month desc), '[]'::jsonb)
    into v_history from (select * from hist union all select * from plat) x;

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
end $function$;

CREATE OR REPLACE FUNCTION public.vip_finance_summary(p_programme uuid DEFAULT NULL, p_market uuid DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_out jsonb;
begin
  if p_programme is null then
    if not public.is_admin() or not public.vip_has_access() then raise exception 'Admins with VIP access only'; end if;
  elsif not public.vip_can_manage(p_programme) then
    raise exception 'Only this programme team can see creator finances';
  end if;
  with members as (
    select m.profile_id, m.programme_id, m.status, p.community_id, p.kind,
           pf.name, pf.photo_url, c.name market
      from public.vip_members m join public.vip_programmes p on p.id=m.programme_id
      join public.profiles pf on pf.id=m.profile_id
      join public.communities c on c.id=p.community_id
     where p.active and m.status <> 'left'
       and (p_programme is null or p.id=p_programme)
       and (p_market is null or p.community_id=p_market)
       and not coalesce(pf.is_test,false) and not coalesce(pf.is_sandbox,false)
  ), sheet as (
    select h.profile_id, hp.community_id, sum(h.earned) earned,
           sum(h.views) views,
           jsonb_agg(jsonb_build_object('year',h.year,'month',h.month,'earned',h.earned,'views',h.views,'source','sheet') order by h.year,h.month) months
      from public.vip_earnings_history h
      join public.vip_programmes hp on hp.id=h.programme_id
      join public.vip_history_names n on n.community_id=hp.community_id and n.creator_name=h.creator_name
     where n.status='confirmed' and n.profile_id=h.profile_id
     group by h.profile_id,hp.community_id
  ), platform as (
    select r.profile_id, p.community_id, sum(coalesce(r.base,0)+coalesce(r.bonus,0)) earned,
           sum(r.views) views,
           sum(case when r.month_status='open' then coalesce(r.base,0)+coalesce(r.bonus,0) else 0 end) provisional,
           jsonb_agg(jsonb_build_object('year',r.year,'month',r.month,'earned',coalesce(r.base,0)+coalesce(r.bonus,0),
             'views',r.views,'source','platform','live',r.month_status='open') order by r.year,r.month) months
      from public.vip_programmes p cross join lateral public.vip_month_rows(array[p.id]) r
     where p.active and (p_programme is null or p.id=p_programme)
       and (p_market is null or p.community_id=p_market)
       and r.year*12+r.month > coalesce((select max(h.year*12+h.month) from public.vip_earnings_history h
         join public.vip_programmes hp on hp.id=h.programme_id where hp.community_id=p.community_id),0)
     group by r.profile_id,p.community_id
  ), ledger as (
    select l.profile_id,
           coalesce(-sum(l.amount) filter (where l.kind in ('payout','voucher')),0) withdrawn
      from public.vip_ledger l group by l.profile_id
  ), credited as (
    select b.credited_profile_id profile_id, sum(b.amount) amount
      from public.vip_history_balances b where b.ledger_id is not null group by b.credited_profile_id
  ), finance as (
    select m.*, coalesce(s.earned,0) historical_earned,
           coalesce(s.views,0)+coalesce(pl.views,0) views,
           coalesce(s.earned,0)+coalesce(pl.earned,0) lifetime,
           coalesce(pl.provisional,0) provisional,
           greatest(0,coalesce(s.earned,0)-coalesce(cr.amount,0))+coalesce(l.withdrawn,0) paid_out,
           public.vip_balance(m.profile_id) balance,
           coalesce(s.months,'[]'::jsonb)||coalesce(pl.months,'[]'::jsonb) months
      from members m
      left join sheet s on s.profile_id=m.profile_id and s.community_id=m.community_id
      left join platform pl on pl.profile_id=m.profile_id and pl.community_id=m.community_id
      left join ledger l on l.profile_id=m.profile_id
      left join credited cr on cr.profile_id=m.profile_id
  )
  select jsonb_build_object('rows',coalesce(jsonb_agg(jsonb_build_object(
    'profile_id',f.profile_id,'programme_id',f.programme_id,'status',f.status,'kind',f.kind,
    'name',f.name,'photo_url',f.photo_url,'market',f.market,
    'lifetime',f.lifetime,'historical_earned',f.historical_earned,'views',f.views,
    'provisional',f.provisional,'paid_out',f.paid_out,'balance',f.balance,'months',f.months
  ) order by f.lifetime desc,f.name),'[]'::jsonb)) into v_out from finance f;
  return v_out;
end $function$;
REVOKE ALL ON FUNCTION public.vip_finance_summary(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vip_finance_summary(uuid,uuid) TO authenticated, service_role;

-- Main analytics follows the current programme identity and excludes former creators.
CREATE OR REPLACE FUNCTION public.admin_vip_earnings(p_market uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ids uuid[];
  v_out jsonb;
begin
  if not public.is_admin() or not public.vip_has_access() then
    raise exception 'Admins with VIP access only';
  end if;
  select array_agg(p.id) into v_ids
    from public.vip_programmes p
   where p.active and (p_market is null or p.community_id = p_market);
  if v_ids is null then return jsonb_build_object('rows', '[]'::jsonb, 'currency', 'EUR'); end if;

  with progs as (
    select p.id, p.community_id, p.kind, p.cpm, c.name market,
           (select max(h.year * 12 + h.month) from public.vip_earnings_history h
              join public.vip_programmes hp on hp.id = h.programme_id
             where hp.community_id = p.community_id) cut
      from public.vip_programmes p join public.communities c on c.id = p.community_id
     where p.id = any (v_ids)
  ), hist as (
    select h.profile_id, h.creator_name, current_prog.kind, pr.market, h.year, h.month, h.views, h.earned pay, 0::numeric extra,
           h.rate, 'sheet'::text src, false live, n.status match
      from public.vip_earnings_history h join progs pr on pr.id = h.programme_id
      join public.vip_history_names n on n.community_id = pr.community_id and n.creator_name = h.creator_name and n.status = 'confirmed' and n.profile_id = h.profile_id
      join public.vip_members current_member on current_member.profile_id = h.profile_id and current_member.status <> 'left'
      join public.vip_programmes current_prog on current_prog.id = current_member.programme_id and current_prog.community_id = pr.community_id
  ), plat as (
    select r.profile_id, null::text creator_name, current_prog.kind, pr.market, r.year, r.month, r.views, coalesce(r.base, 0) pay,
           coalesce(r.bonus, 0) extra,
           case when r.views > 0 then round(coalesce(r.base, 0) / r.views * 1000, 4) end rate, 'platform'::text src,
           (r.month_status = 'open') live, 'platform'::text match
      from progs pr
      cross join lateral public.vip_month_rows(array[pr.id]) r
      join public.vip_members current_member on current_member.profile_id=r.profile_id and current_member.status <> 'left'
      join public.vip_programmes current_prog on current_prog.id=current_member.programme_id and current_prog.community_id=pr.community_id
     where r.year * 12 + r.month > coalesce(pr.cut, 0)

  ), allrows as (select * from hist union all select * from plat)
  select jsonb_build_object(
           'currency', 'EUR',
           'rows', coalesce(jsonb_agg(jsonb_build_object(
             'key', coalesce(a.profile_id::text, 'name:' || a.creator_name),
             'profile_id', a.profile_id,
             'name', coalesce(nullif(trim(p.name), ''), a.creator_name),
             'short', a.creator_name,
             'photo_url', p.photo_url,
             'kind', a.kind,
             'market', a.market,
             'year', a.year, 'month', a.month,
             'views', a.views, 'pay', a.pay, 'extra', a.extra, 'rate', a.rate,
             'source', a.src, 'live', a.live, 'match', a.match
           ) order by a.year, a.month), '[]'::jsonb))
    into v_out
    from allrows a left join public.profiles p on p.id = a.profile_id;
  return v_out;
end;
$function$;

