-- 371: views GAINED in any stretch of days: the community's, the VIPs', or both - the weekly numbers for the country-manager meeting.
--
-- 9 Oct 2026. Ethan: "from the admin panel, under analytics, I want to be able to get the views from the general community
-- channel, per week ... and also the total views, including the VIP. Also just one or the other." And: "I'm running these weekly
-- meetings with all the country managers ... a weekly snapshot ... and an SVG that I can share."
--
-- WHAT "VIEWS" MEANS HERE: views GAINED inside the days asked for, not lifetime totals. A video that has 1M views today and had
-- 990k on Monday contributed 10k to this week. That is the number a week-on-week conversation needs, and it is the same definition
-- the VIP analytics already use (vip_daily_gained), so the two halves add up.
--
-- COST, because the 7 Oct outage was standing load: this is read ON REQUEST by an admin with a day range of at most 400 days, over
-- an indexed table (view_snapshots has an index on (submission_id, captured_at)); nothing is scheduled, nothing is stored, and the
-- result is one JSON document. The VIP half reuses vip_daily_gained unchanged.

create or replace function public.admin_views_gained(p_from date, p_to date)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_len int; v_pf date; v_pt date;
  v_vip_ok boolean; v_ids uuid[];
  v_daily jsonb; v_cur jsonb; v_prev jsonb; v_markets jsonb; v_top jsonb;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'Pick a start day and an end day after it.'; end if;
  v_len := (p_to - p_from) + 1;
  if v_len > 400 then raise exception 'That is more than a year of days. Pick a shorter stretch.'; end if;
  v_pf := p_from - v_len; v_pt := p_from - 1;
  v_vip_ok := public.vip_has_access();
  v_ids := case when v_vip_ok then (select array_agg(id) from public.vip_programmes where active) else null end;

  -- COMMUNITY: one row per (day, entry) of views gained, from the saved readings.
  create temporary table if not exists _vg_c (d date, submission_id uuid, creator uuid, market uuid, gained numeric) on commit drop;
  truncate _vg_c;
  insert into _vg_c
  with sub as (
    select s.id, s.creator_id, s.submitted_at,
           coalesce((select cm.community_id from public.community_members cm join public.communities c2 on c2.id = cm.community_id and c2.kind = 'chapter'
                      where cm.profile_id = s.creator_id and cm.status = 'active' order by cm.is_home desc, cm.joined_at limit 1), ch.community_id) market
      from public.submissions s
      join public.profiles p on p.id = s.creator_id
      left join public.challenges ch on ch.id = s.challenge_id
     where not coalesce(p.is_test, false) and not coalesce(p.is_sandbox, false)
  ), day_end as (
    select sn.submission_id, (sn.captured_at at time zone 'UTC')::date d, max(sn.views) v
      from public.view_snapshots sn join sub on sub.id = sn.submission_id
     where sn.captured_at >= (v_pf::timestamp - interval '1 day') and sn.captured_at < (p_to::timestamp + interval '1 day')
     group by 1, 2
  ), ordered as (
    select de.*, lag(de.v) over (partition by de.submission_id order by de.d) prev_v,
           row_number() over (partition by de.submission_id order by de.d) rn
      from day_end de
  )
  select o.d, o.submission_id, sub.creator_id, sub.market,
         greatest(o.v - coalesce(
           o.prev_v,
           (select max(y.views) from public.view_snapshots y where y.submission_id = o.submission_id and y.captured_at < (o.d::timestamp)),
           -- No earlier reading at all: a video entered in the last few days has gained everything it has; an old one that was
           -- simply first read now has gained nothing we can date, so it counts from the next reading.
           case when sub.submitted_at >= (o.d::timestamp - interval '3 days') then 0 else o.v end
         ), 0)::numeric
    from ordered o join sub on sub.id = o.submission_id
   where o.d between v_pf and p_to;

  -- VIP: the same rows the VIP analytics use.
  create temporary table if not exists _vg_v (d date, profile_id uuid, video_id uuid, programme_id uuid, gained numeric, market uuid) on commit drop;
  truncate _vg_v;
  if v_vip_ok and v_ids is not null then
    insert into _vg_v
    select g.d, g.profile_id, g.video_id, g.programme_id, g.gained, vp.community_id
      from public.vip_daily_gained(v_ids, null, v_pf, p_to) g
      join public.vip_programmes vp on vp.id = g.programme_id
      join public.profiles p on p.id = g.profile_id
     where not coalesce(p.is_test, false) and not coalesce(p.is_sandbox, false);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('d', s.d, 'community', round(coalesce(c.g, 0))::bigint, 'vip', round(coalesce(v.g, 0))::bigint) order by s.d), '[]'::jsonb)
    into v_daily
    from (select generate_series(p_from, p_to, interval '1 day')::date d) s
    left join (select d, sum(gained) g from _vg_c where d between p_from and p_to group by d) c on c.d = s.d
    left join (select d, sum(gained) g from _vg_v where d between p_from and p_to group by d) v on v.d = s.d;

  select jsonb_build_object(
      'community', round(coalesce((select sum(gained) from _vg_c where d between p_from and p_to), 0))::bigint,
      'vip', round(coalesce((select sum(gained) from _vg_v where d between p_from and p_to), 0))::bigint,
      'videos', (select count(*) from public.submissions s join public.profiles p on p.id = s.creator_id
                  where not coalesce(p.is_test, false) and not coalesce(p.is_sandbox, false) and s.submitted_at::date between p_from and p_to),
      'vip_videos', case when v_vip_ok then (select count(*) from public.vip_videos x join public.profiles p on p.id = x.profile_id
                  where not coalesce(p.is_test, false) and not coalesce(p.is_sandbox, false) and x.status <> 'removed' and coalesce(x.posted_at, x.submitted_at)::date between p_from and p_to) else 0 end,
      'active_creators', (select count(distinct creator) from _vg_c where d between p_from and p_to and gained > 0)
                          + (select count(distinct profile_id) from _vg_v where d between p_from and p_to and gained > 0),
      'new_members', (select count(*) from public.profiles p where p.status = 'active' and not coalesce(p.is_test, false) and not coalesce(p.is_sandbox, false)
                       and p.accepted_at::date between p_from and p_to))
    into v_cur;
  select jsonb_build_object(
      'community', round(coalesce((select sum(gained) from _vg_c where d between v_pf and v_pt), 0))::bigint,
      'vip', round(coalesce((select sum(gained) from _vg_v where d between v_pf and v_pt), 0))::bigint,
      'videos', (select count(*) from public.submissions s join public.profiles p on p.id = s.creator_id
                  where not coalesce(p.is_test, false) and not coalesce(p.is_sandbox, false) and s.submitted_at::date between v_pf and v_pt),
      'vip_videos', case when v_vip_ok then (select count(*) from public.vip_videos x join public.profiles p on p.id = x.profile_id
                  where not coalesce(p.is_test, false) and not coalesce(p.is_sandbox, false) and x.status <> 'removed' and coalesce(x.posted_at, x.submitted_at)::date between v_pf and v_pt) else 0 end,
      'new_members', (select count(*) from public.profiles p where p.status = 'active' and not coalesce(p.is_test, false) and not coalesce(p.is_sandbox, false)
                       and p.accepted_at::date between v_pf and v_pt))
    into v_prev;

  -- By market (the creator's home market for the community half, the programme's market for the VIP half).
  select coalesce(jsonb_agg(row_to_json(m)::jsonb order by m.combined desc, m.name), '[]'::jsonb) into v_markets from (
    select c.id, c.name, c.slug,
           round(coalesce((select sum(g.gained) from _vg_c g where g.market = c.id and g.d between p_from and p_to), 0))::bigint community,
           round(coalesce((select sum(g.gained) from _vg_v g where g.market = c.id and g.d between p_from and p_to), 0))::bigint vip,
           round(coalesce((select sum(g.gained) from _vg_c g where g.market = c.id and g.d between p_from and p_to), 0)
               + coalesce((select sum(g.gained) from _vg_v g where g.market = c.id and g.d between p_from and p_to), 0))::bigint combined,
           round(coalesce((select sum(g.gained) from _vg_c g where g.market = c.id and g.d between v_pf and v_pt), 0)
               + coalesce((select sum(g.gained) from _vg_v g where g.market = c.id and g.d between v_pf and v_pt), 0))::bigint prev_combined,
           (select count(*) from public.submissions s join public.profiles p on p.id = s.creator_id
             where not coalesce(p.is_test, false) and not coalesce(p.is_sandbox, false) and s.submitted_at::date between p_from and p_to
               and (select cm.community_id from public.community_members cm join public.communities c2 on c2.id = cm.community_id and c2.kind = 'chapter'
                     where cm.profile_id = s.creator_id and cm.status = 'active' order by cm.is_home desc, cm.joined_at limit 1) = c.id) videos,
           (select count(*) from public.profiles p where p.status = 'active' and not coalesce(p.is_test, false) and not coalesce(p.is_sandbox, false)
              and p.accepted_at::date between p_from and p_to
              and (select cm.community_id from public.community_members cm join public.communities c2 on c2.id = cm.community_id and c2.kind = 'chapter'
                    where cm.profile_id = p.id and cm.status = 'active' order by cm.is_home desc, cm.joined_at limit 1) = c.id) new_members,
           (select count(distinct x.creator) from (select creator, market from _vg_c where d between p_from and p_to and gained > 0
                                                   union select profile_id, market from _vg_v where d between p_from and p_to and gained > 0) x where x.market = c.id) active_creators
      from public.communities c where c.kind = 'chapter'
  ) m;

  -- The six videos that gained most in the stretch, from either half.
  select coalesce(jsonb_agg(t order by t.views desc), '[]'::jsonb) into v_top from (
    select * from (
      select s.id, s.video_url url, s.platform, s.thumbnail_url thumb, pr.name, round(sum(g.gained))::bigint views, false vip
        from _vg_c g join public.submissions s on s.id = g.submission_id join public.profiles pr on pr.id = s.creator_id
       where g.d between p_from and p_to group by s.id, pr.name
      union all
      select x.id, x.video_url, x.platform, x.thumbnail_url, pr.name, round(sum(g.gained))::bigint, true
        from _vg_v g join public.vip_videos x on x.id = g.video_id join public.profiles pr on pr.id = x.profile_id
       where g.d between p_from and p_to group by x.id, pr.name
    ) u order by u.views desc limit 6
  ) t;

  return jsonb_build_object('from', p_from, 'to', p_to, 'days', v_len, 'vip_visible', v_vip_ok,
    'daily', v_daily, 'totals', v_cur, 'prev', v_prev, 'markets', v_markets, 'top_videos', v_top);
end $$;

revoke execute on function public.admin_views_gained(date, date) from public, anon;
grant execute on function public.admin_views_gained(date, date) to authenticated, service_role;
