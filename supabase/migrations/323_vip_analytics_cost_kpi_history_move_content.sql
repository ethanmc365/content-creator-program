-- 323 (4 Oct 2026): VIP ANALYTICS THAT SHOW WHAT EACH CREATOR COSTS, MORE KPIs WITH A HISTORY, CONTENT THAT CAN MOVE MARKET.
--
-- Ethan, 4 Oct 2026:
--   * The Creators view should show each VIP's CPM "coming out of everything: how much we're giving them and how much it is
--     actually costing us", and the month-versus-month view "more details". vip_analytics now carries, per month, the views pay and
--     the bonuses apart, the new VIPs and the month's top creator; per creator, the videos, the bonuses and the full cost.
--   * The KPI page gets more to measure (new VIPs, cost per 1,000 views, VIPs who kept their place, videos per VIP) and each KPI
--     a six-month history (vip_kpi_history) to draw beside the number.
--   * A perk, trip, challenge or guide can be moved to another market (or to every market) after it is made.
--
-- Function bodies are the live ones with only the changed parts replaced (migrations README: never retype a live function).
alter table public.vip_kpi_targets drop constraint if exists vip_kpi_targets_metric_check;
alter table public.vip_kpi_targets add constraint vip_kpi_targets_metric_check check (metric = any (array[
  'views', 'videos', 'active_creators', 'spend', 'hit_target', 'new_vips', 'cpm', 'stay_in', 'videos_per_vip']));

CREATE OR REPLACE FUNCTION public.vip_analytics(p_programme uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_months jsonb; v_top jsonb; v_ids uuid[];
begin
  if p_programme is null then
    select array_agg(id) into v_ids from public.vip_programmes where public.vip_can_see(id);
    if v_ids is null then raise exception 'Not yours to see.'; end if;
  else
    if not public.vip_can_see(p_programme) then raise exception 'Not yours to see.'; end if;
    v_ids := array[p_programme];
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'year', y, 'month', mth,
      'views', views, 'cost', cost, 'members', members, 'videos', videos,
      'cpm', case when views > 0 then round(cost / (views / 1000.0), 4) end,
      'base', base, 'bonus', cost - base, 'new_members', new_members, 'top', top) order by y, mth), '[]'::jsonb)
    into v_months
    from (
      select mo.year y, mo.month mth,
             coalesce(sum(s.views), 0) views,
             coalesce(sum(s.base + (select coalesce(sum((b ->> 'amount')::numeric), 0) from jsonb_array_elements(s.bonuses) b)), 0) cost,
             count(distinct s.profile_id) filter (where s.views > 0) members,
             coalesce(sum(s.videos), 0) videos,
             coalesce(sum(s.base), 0) base,
             (select count(*) from public.vip_members vm where vm.programme_id = any (v_ids) and vm.joined_on >= make_date(mo.year, mo.month, 1) and vm.joined_on < make_date(mo.year, mo.month, 1) + interval '1 month') new_members,
             (select jsonb_build_object('name', pr2.name, 'views', s2.views) from public.vip_statements s2 join public.vip_months mo2 on mo2.id = s2.month_id join public.profiles pr2 on pr2.id = s2.profile_id
               where mo2.programme_id = any (v_ids) and mo2.year = mo.year and mo2.month = mo.month and s2.status <> 'void' order by s2.views desc limit 1) top
        from public.vip_months mo
        join public.vip_statements s on s.month_id = mo.id and s.status <> 'void'
       where mo.programme_id = any (v_ids)
       group by mo.year, mo.month
       order by mo.year desc, mo.month desc limit 12
    ) t;

  select coalesce(jsonb_agg(jsonb_build_object('profile_id', profile_id, 'name', name, 'photo', photo, 'views', views, 'earned', earned, 'months', months, 'videos', videos, 'bonus', bonus)
                            order by views desc), '[]'::jsonb)
    into v_top from (
      select s.profile_id, pr.name, pr.photo_url photo, sum(s.views) views, sum(s.total) earned, count(*) filter (where s.views > 0) months, sum(s.videos) videos,
             sum((select coalesce(sum((b ->> 'amount')::numeric), 0) from jsonb_array_elements(s.bonuses) b)) bonus
        from public.vip_statements s join public.profiles pr on pr.id = s.profile_id
       where s.programme_id = any (v_ids) and s.status <> 'void'
       group by s.profile_id, pr.name, pr.photo_url order by sum(s.views) desc limit 40
    ) z;

  return jsonb_build_object('months', v_months, 'top', v_top,
    'members', (select count(*) from public.vip_members where programme_id = any (v_ids) and status = 'active'),
    'totals', (select jsonb_build_object('views', coalesce(sum(s.views), 0), 'cost', coalesce(sum(s.total), 0), 'videos', coalesce(sum(s.videos), 0))
                 from public.vip_statements s where s.programme_id = any (v_ids) and s.status <> 'void'));
end $function$;

CREATE OR REPLACE FUNCTION public.vip_kpi_actuals(p_programme uuid, p_year integer, p_month integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare mo public.vip_months; p public.vip_programmes; v_views bigint; v_videos int; v_active int; v_spend numeric; v_hit int; v_new int; v_stay int;
begin
  if not public.vip_can_see(p_programme) then raise exception 'Not yours to see.'; end if;
  select * into p from public.vip_programmes where id = p_programme;
  select * into mo from public.vip_months where programme_id = p_programme and year = p_year and month = p_month;
  if mo is null then
    return jsonb_build_object('views', 0, 'videos', 0, 'active_creators', 0, 'spend', 0, 'hit_target', 0, 'new_vips', 0, 'cpm', 0, 'stay_in', 0, 'videos_per_vip', 0);
  end if;
  select coalesce(sum(views), 0), coalesce(sum(videos), 0), count(*) filter (where views > 0)
    into v_views, v_videos, v_active from public.vip_month_stats(mo.id);
  select coalesce(sum(base + (select coalesce(sum((b ->> 'amount')::numeric), 0) from jsonb_array_elements(bonuses) b)), 0)
    into v_spend from public.vip_statements where month_id = mo.id and status <> 'void';
  if v_spend = 0 then
    select coalesce(sum(public.vip_views_pay(s.views, coalesce(vm.cpm, p.cpm), coalesce(vm.tiers, p.tiers), case when vm.tiers is null then vm.cpm end)), 0) into v_spend
      from public.vip_month_stats(mo.id) s join public.vip_members vm on vm.profile_id = s.profile_id;
  end if;
  select count(*) into v_hit from public.vip_month_stats(mo.id) s join public.vip_members vm on vm.profile_id = s.profile_id
   where (vm.target_videos is not null or vm.target_views is not null)
     and (vm.target_videos is null or s.videos >= vm.target_videos)
     and (vm.target_views is null or s.views >= vm.target_views);
  select count(*) into v_new from public.vip_members vm where vm.programme_id = p_programme
     and vm.joined_on >= make_date(p_year, p_month, 1) and vm.joined_on < make_date(p_year, p_month, 1) + interval '1 month';
  select count(*) into v_stay from public.vip_members vm
   where vm.programme_id = p_programme and vm.status = 'active' and not public.vip_hidden_profile(vm.profile_id)
     and coalesce((public.vip_req_check(vm.profile_id, mo.id) ->> 'met')::boolean, false);
  return jsonb_build_object('views', v_views, 'videos', v_videos, 'active_creators', v_active, 'spend', round(v_spend, 2), 'hit_target', v_hit,
    'new_vips', v_new, 'stay_in', v_stay,
    'cpm', case when v_views > 0 then round(v_spend / (v_views / 1000.0), 4) else 0 end,
    'videos_per_vip', case when v_active > 0 then round(v_videos::numeric / v_active, 1) else 0 end);
end $function$;


create or replace function public.vip_kpi_history(p_programme uuid, p_months integer default 6)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare v_out jsonb := '[]'::jsonb; i int; y int; m int; d date;
begin
  if not public.vip_can_see(p_programme) then raise exception 'Not yours to see.'; end if;
  for i in reverse greatest(1, least(coalesce(p_months, 6), 12)) - 1 .. 0 loop
    d := (date_trunc('month', now()) - make_interval(months => i))::date;
    y := extract(year from d)::int; m := extract(month from d)::int;
    v_out := v_out || jsonb_build_array(jsonb_build_object('year', y, 'month', m, 'actuals', public.vip_kpi_actuals(p_programme, y, m)));
  end loop;
  return v_out;
end $function$;
revoke execute on function public.vip_kpi_history(uuid, integer) from public, anon;
grant execute on function public.vip_kpi_history(uuid, integer) to authenticated;

-- Moving a piece of content to another market, or to every market (programme_id null), once it exists. Both the place it
-- leaves and the place it goes to must be ones the person may change (the owner for "every market").
create or replace function public.vip_move_content(p_table text, p_id uuid, p_programme uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_from uuid; v_found boolean := false;
begin
  if p_table not in ('vip_perks', 'vip_briefs', 'vip_guides') then raise exception 'Not something that can be moved.'; end if;
  execute format('select programme_id from public.%I where id = $1', p_table) into v_from using p_id;
  get diagnostics v_found = row_count;
  if not found then raise exception 'That does not exist any more.'; end if;
  if not public.vip_scope_ok(v_from) or not public.vip_scope_ok(p_programme) then
    raise exception 'You can only move content between markets you manage; only the owner can make it for every market.';
  end if;
  execute format('update public.%I set programme_id = $2 where id = $1', p_table) using p_id, p_programme;
end $function$;
revoke execute on function public.vip_move_content(text, uuid, uuid) from public, anon;
grant execute on function public.vip_move_content(text, uuid, uuid) to authenticated;
