-- 336 (4 Oct 2026): the sandbox VIP no longer counts in VIP analytics (members, views, cost, new members, top creators). Ethan: "it shows that there's someone actually in the VIP community ... it shouldn't be showing up in the analytics." Same filter the team's overview already uses (vip_hidden_profile).
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
             (select count(*) from public.vip_members vm where vm.programme_id = any (v_ids) and not public.vip_hidden_profile(vm.profile_id) and vm.joined_on >= make_date(mo.year, mo.month, 1) and vm.joined_on < make_date(mo.year, mo.month, 1) + interval '1 month') new_members,
             (select jsonb_build_object('name', pr2.name, 'views', s2.views) from public.vip_statements s2 join public.vip_months mo2 on mo2.id = s2.month_id join public.profiles pr2 on pr2.id = s2.profile_id
               where mo2.programme_id = any (v_ids) and mo2.year = mo.year and mo2.month = mo.month and s2.status <> 'void' and not public.vip_hidden_profile(s2.profile_id) order by s2.views desc limit 1) top
        from public.vip_months mo
        join public.vip_statements s on s.month_id = mo.id and s.status <> 'void' and not public.vip_hidden_profile(s.profile_id)
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
       where s.programme_id = any (v_ids) and s.status <> 'void' and not public.vip_hidden_profile(s.profile_id)
       group by s.profile_id, pr.name, pr.photo_url order by sum(s.views) desc limit 40
    ) z;

  return jsonb_build_object('months', v_months, 'top', v_top,
    'members', (select count(*) from public.vip_members where programme_id = any (v_ids) and status = 'active' and not public.vip_hidden_profile(profile_id)),
    'totals', (select jsonb_build_object('views', coalesce(sum(s.views), 0), 'cost', coalesce(sum(s.total), 0), 'videos', coalesce(sum(s.videos), 0))
                 from public.vip_statements s where s.programme_id = any (v_ids) and s.status <> 'void' and not public.vip_hidden_profile(s.profile_id)));
end $function$
;
