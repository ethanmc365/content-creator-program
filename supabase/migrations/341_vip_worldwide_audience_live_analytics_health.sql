-- 341 (6 Oct 2026): VIP Worldwide audience, live analytics over any date range, creator health.
--
-- Ethan: "specific communities, for example Romanian and Spain with multiple VIP creators, then the VIP Worldwide for any other
-- creator, but this could also be like the global challenge setup with the general community, so the VIP creators in Spain and
-- Romania also have access to this. When setting rewards, prizes and challenges for the VIP Worldwide there should always be the
-- option on everything to decide if this is for every VIP creator or only the Worldwide creators that are not in another VIP market."
--
-- AND: "the views gained each day graph is not updating correctly and the CPM is weird."
-- Two real faults sat behind that:
--   1. A video's FIRST reading had no earlier reading to subtract, so every view a new video had when it was first read never
--      appeared in "views gained each day" (Roxanna's three videos: 38k views, a chart that said 3).
--   2. VIP analytics read only SETTLED statements. The open month has none until it closes, so the page showed last month (nothing)
--      and a cost per 1,000 views of "-" or a figure from a month with a monthly fee and no views.
-- Both are rebuilt to read the videos and the readings themselves, so a number is true the moment it is read.

-- ---------------------------------------------------------------------------------------------------- audience on bonuses
alter table public.vip_bonus_rules
  add column if not exists audience text not null default 'market' check (audience in ('market', 'all'));
comment on column public.vip_bonus_rules.audience is
  'market = the programme''s own VIPs; all = every VIP creator in every market (only meaningful on the Worldwide programme, which every market shares).';

-- A VIP in any market reads the rules that are for every VIP.
drop policy if exists "vip rules: read" on public.vip_bonus_rules;
create policy "vip rules: read" on public.vip_bonus_rules for select to authenticated
  using (public.vip_can_see(programme_id) or programme_id = public.vip_my_programme() or (audience = 'all' and public.is_active_vip()));

-- Whoever leads the Worldwide market may post to EVERY VIP creator (it was the owner only).
create or replace function public.vip_scope_ok(p_programme uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $$
  select case
    when p_programme is null then public.is_owner() or exists (
      select 1 from public.vip_managers m join public.vip_programmes p on p.id = m.programme_id
       where m.profile_id = auth.uid() and p.is_default)
    else public.vip_can_manage(p_programme) end
$$;

-- The close pays an "every VIP" rule from the Worldwide programme to everybody, in each one's own month.
do $mig$
declare d text; n text;
begin
  select pg_get_functiondef('public.vip_compute_statements(uuid)'::regprocedure) into d;
  n := d;
  n := replace(n,
    $$  v_existing record; v_has boolean;
begin$$,
    $$  v_existing record; v_has boolean; v_default uuid;
begin$$);
  assert n <> d, 'compute: declare anchor not found';
  d := n;
  n := replace(n,
    $$  select * into p from public.vip_programmes where id = m.programme_id;
$$,
    $$  select * into p from public.vip_programmes where id = m.programme_id;
  select id into v_default from public.vip_programmes where is_default limit 1;
$$);
  assert n <> d, 'compute: programme anchor not found';
  d := n;
  n := replace(n,
    $$       where r.programme_id = m.programme_id and r.active and (r.month_id = p_month or (r.month_id is null and (r.for_year is null or exists (select 1 from public.vip_months fm where fm.id = p_month and fm.year = r.for_year and fm.month = r.for_month))))
         and coalesce(mem.bonuses_on, true)$$,
    $$       where r.active and coalesce(mem.bonuses_on, true)
         and (r.programme_id = m.programme_id or (r.audience = 'all' and r.programme_id = v_default))
         and (r.month_id = p_month
              or (r.month_id is null and (r.for_year is null or (m.year = r.for_year and m.month = r.for_month)))
              or (r.audience = 'all' and r.month_id is not null and exists (select 1 from public.vip_months rm where rm.id = r.month_id and rm.year = m.year and rm.month = m.month)))$$);
  assert n <> d, 'compute: where anchor not found';
  d := n;
  -- an "every VIP" ranking ranks every VIP of the month, not one market
  n := replace(n, $$        if rl.scope = 'global' then
          select rk into v_rank from ($$, $$        if rl.scope = 'global' or rl.audience = 'all' then
          select rk into v_rank from ($$);
  assert n <> d, 'compute: top_n anchor not found';
  d := n;
  n := replace(n, $$        if rl.scope = 'global' then
          select v.profile_id, public.vip_video_counted(v, mm) into v_bv, v_bvviews$$, $$        if rl.scope = 'global' or rl.audience = 'all' then
          select v.profile_id, public.vip_video_counted(v, mm) into v_bv, v_bvviews$$);
  assert n <> d, 'compute: best_video anchor not found';
  execute n;
end
$mig$;

-- ---------------------------------------------------------------------------------------------------- views gained per day
-- EVERY VIEW A VIDEO GAINS, ON THE DAY IT WAS READ, INCLUDING THE FIRST READING.
-- A reading after the first is the difference from the one before it. The first reading of a video posted just before it was added
-- is spread over the days from posting to that reading (the platform gives no better answer), and one for an old video is not
-- counted at all, because those views were not gained while it was tracked.
create or replace function public.vip_daily_gained(p_programmes uuid[], p_profile uuid, p_from date, p_to date)
 returns table (d date, profile_id uuid, video_id uuid, programme_id uuid, gained numeric)
 language sql
 stable security definer
 set search_path to 'public'
as $$
  with v as (
    select x.id, x.profile_id, x.programme_id, coalesce(x.posted_at, x.submitted_at) posted, coalesce(c.timezone, 'UTC') tz
      from public.vip_videos x
      join public.vip_programmes p on p.id = x.programme_id
      left join public.communities c on c.id = p.community_id
     where x.programme_id = any (p_programmes) and (p_profile is null or x.profile_id = p_profile)
       and x.status = 'tracking' and not public.vip_hidden_profile(x.profile_id)
  ), r as (
    select rd.video_id, rd.read_at, rd.views,
           lag(rd.views) over w as prev, row_number() over w as rn
      from public.vip_view_readings rd join v on v.id = rd.video_id
     where rd.read_at >= (p_from::timestamp - interval '10 days')
    window w as (partition by rd.video_id order by rd.read_at)
  ), r2 as (
    select r.video_id, r.read_at, r.views,
           case when r.rn = 1 then (select y.views from public.vip_view_readings y where y.video_id = r.video_id and y.read_at < r.read_at order by y.read_at desc limit 1)
                else r.prev end as prev,
           r.rn = 1 and not exists (select 1 from public.vip_view_readings y where y.video_id = r.video_id and y.read_at < r.read_at) as first_ever
      from r
  ), inc as (
    select (r2.read_at at time zone v.tz)::date d, v.profile_id, v.id video_id, v.programme_id, greatest(r2.views - r2.prev, 0)::numeric gained
      from r2 join v on v.id = r2.video_id where r2.prev is not null
  ), fst as (
    select r2.video_id, v.profile_id, v.programme_id, r2.views,
           (least(v.posted, r2.read_at) at time zone v.tz)::date d0, (r2.read_at at time zone v.tz)::date d1
      from r2 join v on v.id = r2.video_id
     where r2.first_ever and r2.views > 0 and v.posted >= r2.read_at - interval '31 days'
  ), spread as (
    select gs::date d, f.profile_id, f.video_id, f.programme_id, f.views::numeric / (f.d1 - f.d0 + 1) gained
      from fst f cross join lateral generate_series(f.d0, f.d1, interval '1 day') gs
  )
  select s.d, s.profile_id, s.video_id, s.programme_id, s.gained
    from (select * from inc union all select * from spread) s
   where s.d between p_from and p_to
$$;
revoke execute on function public.vip_daily_gained(uuid[], uuid, date, date) from public, anon, authenticated;

-- The trend chart on the VIP page and the team's overview, now built on it. Same shape as before.
create or replace function public.vip_trend_core(p_programme uuid, p_profile uuid, p_days integer)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $$
declare v_tz text; v_days int := greatest(3, least(coalesce(p_days, 30), 400)); v_today date; v_daily jsonb; v_plat jsonb; v_top jsonb;
begin
  select coalesce(c.timezone, 'UTC') into v_tz from public.vip_programmes p left join public.communities c on c.id = p.community_id where p.id = p_programme;
  v_today := (now() at time zone coalesce(v_tz, 'UTC'))::date;
  select coalesce(jsonb_agg(jsonb_build_object('d', s.d, 'views', round(coalesce(g.gained, 0))::bigint) order by s.d), '[]'::jsonb) into v_daily
    from (select generate_series(v_today - (v_days - 1), v_today, interval '1 day')::date d) s
    left join (select x.d, sum(x.gained) gained from public.vip_daily_gained(array[p_programme], p_profile, v_today - (v_days - 1), v_today) x group by x.d) g on g.d = s.d;
  select coalesce(jsonb_agg(jsonb_build_object('platform', platform, 'videos', n, 'views', views) order by views desc), '[]'::jsonb) into v_plat
    from (select v.platform, count(*) n, coalesce(sum(v.logged_views), 0) views from public.vip_videos v
           where v.programme_id = p_programme and (p_profile is null or v.profile_id = p_profile) and v.status = 'tracking' group by v.platform) x;
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'platform', platform, 'url', video_url, 'views', logged_views, 'posted_at', posted_at) order by logged_views desc), '[]'::jsonb) into v_top
    from (select v.id, pr.name, v.platform, v.video_url, v.logged_views, v.posted_at from public.vip_videos v join public.profiles pr on pr.id = v.profile_id
           where v.programme_id = p_programme and (p_profile is null or v.profile_id = p_profile) and v.status = 'tracking'
           order by v.logged_views desc limit 5) t;
  return jsonb_build_object('daily', v_daily, 'platforms', v_plat, 'top', v_top);
end $$;

-- ---------------------------------------------------------------------------------------------------- months, live
-- One row per VIP per month: from the settled statement when the month has one, and worked out from the videos when it does not
-- (the open month, and any month nobody has drafted). `live` says which.
create or replace function public.vip_month_rows(p_ids uuid[])
 returns table (year int, month int, month_status text, profile_id uuid, views bigint, videos int, base numeric, bonus numeric, live boolean)
 language sql
 stable security definer
 set search_path to 'public'
as $$
  with ms as (
    select mo.id, mo.programme_id, mo.year, mo.month, mo.status, p.cpm, p.tiers, p.monthly_cap,
           exists (select 1 from public.vip_statements s where s.month_id = mo.id and s.status <> 'void') has_st
      from public.vip_months mo join public.vip_programmes p on p.id = mo.programme_id
     where mo.programme_id = any (p_ids)
  )
  select ms.year, ms.month, ms.status, s.profile_id, s.views::bigint, s.videos::int, s.base,
         (select coalesce(sum((b ->> 'amount')::numeric), 0) from jsonb_array_elements(s.bonuses) b), false
    from ms join public.vip_statements s on s.month_id = ms.id and s.status <> 'void'
   where ms.has_st and not public.vip_hidden_profile(s.profile_id)
  union all
  select ms.year, ms.month, ms.status, st.profile_id, st.views::bigint, st.videos::int,
         least(
           public.vip_views_pay(st.views, coalesce(vm.cpm, ms.cpm), coalesce(vm.tiers, ms.tiers), case when vm.tiers is null then vm.cpm end),
           coalesce(vm.monthly_cap, ms.monthly_cap, public.vip_views_pay(st.views, coalesce(vm.cpm, ms.cpm), coalesce(vm.tiers, ms.tiers), case when vm.tiers is null then vm.cpm end))),
         case when coalesce(vm.monthly_fee, 0) > 0 and vm.status = 'active' and st.videos >= coalesce(vm.fee_min_videos, 0) then vm.monthly_fee else 0 end,
         true
    from ms
    cross join lateral public.vip_month_stats(ms.id) st
    left join public.vip_members vm on vm.profile_id = st.profile_id and vm.programme_id = ms.programme_id
   where not ms.has_st and not public.vip_hidden_profile(st.profile_id)
$$;
revoke execute on function public.vip_month_rows(uuid[]) from public, anon, authenticated;

create or replace function public.vip_analytics(p_programme uuid DEFAULT NULL::uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare v_months jsonb; v_top jsonb; v_ids uuid[];
begin
  if p_programme is null then
    select array_agg(id) into v_ids from public.vip_programmes where public.vip_can_see(id);
    if v_ids is null then raise exception 'Not yours to see.'; end if;
  else
    if not public.vip_can_see(p_programme) then raise exception 'Not yours to see.'; end if;
    v_ids := array[p_programme];
  end if;

  create temporary table if not exists _vip_mr (year int, month int, month_status text, profile_id uuid, views bigint, videos int, base numeric, bonus numeric, live boolean) on commit drop;
  truncate _vip_mr;
  insert into _vip_mr select * from public.vip_month_rows(v_ids);

  select coalesce(jsonb_agg(jsonb_build_object(
      'year', y, 'month', mth, 'live', live,
      'views', views, 'cost', cost, 'members', members, 'videos', videos,
      'cpm', case when views > 0 then round(cost / (views / 1000.0), 4) end,
      'rate', case when views > 0 then round(base / (views / 1000.0), 4) end,
      'base', base, 'bonus', cost - base, 'new_members', new_members, 'top', top) order by y, mth), '[]'::jsonb)
    into v_months
    from (
      select u.year y, u.month mth, bool_or(u.live and u.month_status = 'open') live,
             coalesce(sum(u.views), 0) views, coalesce(sum(u.base + u.bonus), 0) cost,
             count(distinct u.profile_id) filter (where u.views > 0) members,
             coalesce(sum(u.videos), 0) videos, coalesce(sum(u.base), 0) base,
             (select count(*) from public.vip_members vm where vm.programme_id = any (v_ids) and not public.vip_hidden_profile(vm.profile_id)
                 and vm.joined_on >= make_date(u.year, u.month, 1) and vm.joined_on < make_date(u.year, u.month, 1) + interval '1 month') new_members,
             (select jsonb_build_object('name', pr2.name, 'views', u2.views) from _vip_mr u2
                join public.profiles pr2 on pr2.id = u2.profile_id
               where u2.year = u.year and u2.month = u.month and u2.views > 0 order by u2.views desc limit 1) top
        from _vip_mr u
       group by u.year, u.month
       order by u.year desc, u.month desc limit 12
    ) t;

  select coalesce(jsonb_agg(jsonb_build_object('profile_id', profile_id, 'name', name, 'photo', photo, 'views', views, 'earned', earned, 'months', months, 'videos', videos, 'bonus', bonus)
                            order by views desc), '[]'::jsonb)
    into v_top from (
      select u.profile_id, pr.name, pr.photo_url photo, sum(u.views) views, sum(u.base + u.bonus) earned,
             count(*) filter (where u.views > 0) months, sum(u.videos) videos, sum(u.bonus) bonus
        from _vip_mr u join public.profiles pr on pr.id = u.profile_id
       group by u.profile_id, pr.name, pr.photo_url order by sum(u.views) desc limit 40
    ) z;

  return jsonb_build_object('months', v_months, 'top', v_top,
    'members', (select count(*) from public.vip_members where programme_id = any (v_ids) and status = 'active' and not public.vip_hidden_profile(profile_id)),
    'totals', (select jsonb_build_object('views', coalesce(sum(u.views), 0), 'cost', coalesce(sum(u.base + u.bonus), 0), 'videos', coalesce(sum(u.videos), 0))
                 from _vip_mr u));
end $$;

-- ---------------------------------------------------------------------------------------------------- any date range
-- Everything the analytics page shows for a stretch of days, for one market or all of them: the day-by-day chart, the totals and how they
-- moved against the stretch just before, each platform, each creator (with their health), and the best videos.
create or replace function public.vip_range_analytics(p_programme uuid, p_from date, p_to date)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  v_ids uuid[]; v_len int; v_pf date; v_pt date;
  v_daily jsonb; v_cur jsonb; v_prev jsonb; v_plat jsonb; v_creators jsonb; v_top jsonb; v_before int; v_now int;
begin
  if not public.vip_can_see(p_programme) then raise exception 'Not yours to see.'; end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'Pick a start day and an end day after it.'; end if;
  v_len := (p_to - p_from) + 1;
  if v_len > 800 then raise exception 'That is more than two years of days. Pick a shorter stretch.'; end if;
  v_ids := case when p_programme is null then (select array_agg(id) from public.vip_programmes where active) else array[p_programme] end;
  v_pf := p_from - v_len; v_pt := p_from - 1;

  create temporary table if not exists _vip_rg (d date, profile_id uuid, video_id uuid, programme_id uuid, gained numeric) on commit drop;
  truncate _vip_rg;
  insert into _vip_rg select * from public.vip_daily_gained(v_ids, null, v_pf, p_to);

  select coalesce(jsonb_agg(jsonb_build_object('d', s.d, 'views', round(coalesce(g.views, 0))::bigint, 'creators', coalesce(g.creators, 0),
           'videos', coalesce(pv.n, 0), 'joined', coalesce(jn.n, 0)) order by s.d), '[]'::jsonb) into v_daily
    from (select generate_series(p_from, p_to, interval '1 day')::date d) s
    left join (select d, sum(gained) views, count(distinct profile_id) filter (where gained > 0) creators from _vip_rg where d between p_from and p_to group by d) g on g.d = s.d
    left join (select (coalesce(x.posted_at, x.submitted_at) at time zone coalesce(c.timezone, 'UTC'))::date d, count(*) n
                 from public.vip_videos x join public.vip_programmes p on p.id = x.programme_id left join public.communities c on c.id = p.community_id
                where x.programme_id = any (v_ids) and x.status <> 'removed' and not public.vip_hidden_profile(x.profile_id) group by 1) pv on pv.d = s.d
    left join (select vm.joined_on d, count(*) n from public.vip_members vm
                where vm.programme_id = any (v_ids) and not public.vip_hidden_profile(vm.profile_id) group by 1) jn on jn.d = s.d;

  select jsonb_build_object(
      'views', round(coalesce(sum(r.gained), 0))::bigint,
      'creators', count(distinct r.profile_id) filter (where r.gained > 0),
      'pay', round(coalesce(sum(r.gained / 1000.0 * coalesce(vm.cpm, p.cpm)), 0), 2))
    into v_cur
    from _vip_rg r join public.vip_programmes p on p.id = r.programme_id left join public.vip_members vm on vm.profile_id = r.profile_id
   where r.d between p_from and p_to;
  select jsonb_build_object(
      'views', round(coalesce(sum(r.gained), 0))::bigint,
      'creators', count(distinct r.profile_id) filter (where r.gained > 0),
      'pay', round(coalesce(sum(r.gained / 1000.0 * coalesce(vm.cpm, p.cpm)), 0), 2))
    into v_prev
    from _vip_rg r join public.vip_programmes p on p.id = r.programme_id left join public.vip_members vm on vm.profile_id = r.profile_id
   where r.d between v_pf and v_pt;
  -- videos posted and creators who joined, this stretch and the one before
  v_cur := v_cur || jsonb_build_object(
    'videos', (select count(*) from public.vip_videos x where x.programme_id = any (v_ids) and x.status <> 'removed' and not public.vip_hidden_profile(x.profile_id)
                 and coalesce(x.posted_at, x.submitted_at)::date between p_from and p_to),
    'joined', (select count(*) from public.vip_members vm where vm.programme_id = any (v_ids) and not public.vip_hidden_profile(vm.profile_id) and vm.joined_on between p_from and p_to));
  v_prev := v_prev || jsonb_build_object(
    'videos', (select count(*) from public.vip_videos x where x.programme_id = any (v_ids) and x.status <> 'removed' and not public.vip_hidden_profile(x.profile_id)
                 and coalesce(x.posted_at, x.submitted_at)::date between v_pf and v_pt),
    'joined', (select count(*) from public.vip_members vm where vm.programme_id = any (v_ids) and not public.vip_hidden_profile(vm.profile_id) and vm.joined_on between v_pf and v_pt));

  select coalesce(jsonb_agg(jsonb_build_object('platform', platform, 'videos', n, 'views', round(views)::bigint) order by views desc), '[]'::jsonb) into v_plat
    from (select x.platform, count(distinct r.video_id) n, sum(r.gained) views
            from _vip_rg r join public.vip_videos x on x.id = r.video_id where r.d between p_from and p_to group by x.platform) t;

  select coalesce(jsonb_agg(row_to_json(c)::jsonb order by c.views desc, c.name), '[]'::jsonb) into v_creators from (
    select vm.profile_id, pr.name, pr.photo_url photo, vm.programme_id, p.name programme, p.currency, vm.status, vm.joined_on,
           round(coalesce((select sum(r.gained) from _vip_rg r where r.profile_id = vm.profile_id and r.d between p_from and p_to), 0))::bigint views,
           round(coalesce((select sum(r.gained) from _vip_rg r where r.profile_id = vm.profile_id and r.d between v_pf and v_pt), 0))::bigint prev_views,
           (select count(*) from public.vip_videos x where x.profile_id = vm.profile_id and x.status <> 'removed' and coalesce(x.posted_at, x.submitted_at)::date between p_from and p_to) videos,
           round(coalesce((select sum(r.gained) from _vip_rg r where r.profile_id = vm.profile_id and r.d between p_from and p_to), 0) / 1000.0 * coalesce(vm.cpm, p.cpm), 2) pay,
           (select max(coalesce(x.posted_at, x.submitted_at)) from public.vip_videos x where x.profile_id = vm.profile_id and x.status <> 'removed') last_post,
           (select count(*) from public.push_subscriptions ps where ps.user_id = vm.profile_id) push_devices,
           coalesce((pr.notif_prefs ->> 'chat')::boolean, true) chat_push_on,
           pr.last_seen_at,
           public.vip_payment_ready(vm.profile_id, p.currency) payment_ready,
           vm.terms_accepted_at is not null terms_ok
      from public.vip_members vm
      join public.profiles pr on pr.id = vm.profile_id
      join public.vip_programmes p on p.id = vm.programme_id
     where vm.programme_id = any (v_ids) and vm.status in ('active', 'paused') and not public.vip_hidden_profile(vm.profile_id)
  ) c;

  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'url', t.video_url, 'platform', t.platform, 'thumb', t.thumbnail_url, 'name', t.name, 'photo', t.photo, 'views', t.views)), '[]'::jsonb) into v_top from (
    select x.id, x.video_url, x.platform, x.thumbnail_url, pr.name, pr.photo_url photo, round(sum(r.gained))::bigint views
      from _vip_rg r join public.vip_videos x on x.id = r.video_id join public.profiles pr on pr.id = x.profile_id
     where r.d between p_from and p_to group by x.id, pr.name, pr.photo_url order by sum(r.gained) desc limit 6
  ) t;

  select count(*) into v_before from public.vip_members vm where vm.programme_id = any (v_ids) and vm.status <> 'left' and not public.vip_hidden_profile(vm.profile_id) and vm.joined_on < p_from;
  select count(*) into v_now from public.vip_members vm where vm.programme_id = any (v_ids) and vm.status = 'active' and not public.vip_hidden_profile(vm.profile_id);

  return jsonb_build_object('from', p_from, 'to', p_to, 'days', v_len, 'daily', v_daily, 'totals', v_cur, 'prev', v_prev,
    'platforms', v_plat, 'creators', v_creators, 'top_videos', v_top, 'members_before', v_before, 'members_now', v_now);
end $$;

revoke execute on function public.vip_range_analytics(uuid, date, date) from public, anon;
grant execute on function public.vip_range_analytics(uuid, date, date) to authenticated;
revoke execute on function public.vip_analytics(uuid) from public, anon;
grant execute on function public.vip_analytics(uuid) to authenticated;
