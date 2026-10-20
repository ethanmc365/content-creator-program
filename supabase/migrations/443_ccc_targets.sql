-- 443: CCC TARGETS AND PROFIT (20 Oct 2026).
--
-- Ethan and Francesco tracked the programme's month-by-month view targets, estimated earnings/costs and margin in a
-- sheet ("CCC Targets"), with the actual costs filled in as views x 0.50 because nothing better was to hand. This moves
-- the plan into the platform and measures the actuals from the platform's own data:
--
--   ccc_targets          the plan: one row per segment ('community' | 'vip') per month. View target, the EPM (what
--                        1,000 views earn Tryp), the target CPM (what 1,000 views should cost), other costs the
--                        platform cannot see (staff, ads, tools), and an optional override of the measured views.
--   admin_ccc_actuals    read on request only (nothing on a timer): views GAINED per month (same rule as the Weekly
--                        views tab), videos and active creators, every challenge's prize money, other rewards and VIP
--                        pay (team sheet history, then closed statements, then the live month). The page does the
--                        allocation and the maths (lib/cccTargets, unit tested).
--
-- 'vip' means every paid creator: the VIP and the official programmes. The team's VIP sheet (vip_earnings_history)
-- held both before the official programme was split out on 10 Oct, so keeping them together keeps the months comparable.

create table if not exists public.ccc_targets (
  id uuid primary key default gen_random_uuid(),
  segment text not null check (segment in ('community', 'vip')),
  year int not null check (year between 2024 and 2100),
  month int not null check (month between 1 and 12),
  view_target bigint not null default 0 check (view_target >= 0),
  epm numeric(10, 4) not null default 0.90 check (epm >= 0),
  cpm numeric(10, 4) not null default 0.50 check (cpm >= 0),
  other_costs numeric(12, 2) not null default 0 check (other_costs >= 0),
  achieved_override bigint check (achieved_override >= 0),
  note text check (char_length(note) <= 500),
  suggested boolean not null default false,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (segment, year, month)
);

alter table public.ccc_targets enable row level security;
-- Money plans are for the team only: no anon read (migration 441's trigger grants it to every new table).
revoke all on public.ccc_targets from anon;

drop policy if exists ccc_targets_admin on public.ccc_targets;
create policy ccc_targets_admin on public.ccc_targets for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Who changed it last, stamped by the database rather than trusted from the client. A saved row is no longer a
-- suggestion unless the save says so.
create or replace function public.ccc_targets_stamp() returns trigger
language plpgsql set search_path to 'public' as $$
begin
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists trg_ccc_targets_stamp on public.ccc_targets;
create trigger trg_ccc_targets_stamp before insert or update on public.ccc_targets
  for each row execute function public.ccc_targets_stamp();

-- THE TEAM'S SHEET, AS IT WAS ON 20 OCT 2026 (community). The sheet wrote targets in thousands; stored here in views.
insert into public.ccc_targets (segment, year, month, view_target, epm, cpm, note) values
  ('community', 2026, 9, 7500000, 0.90, 0.50, 'Team sheet recorded 3,100k achieved. The platform counts views gained inside September.'),
  ('community', 2026, 10, 9825000, 0.90, 0.50, null),
  ('community', 2026, 11, 12175000, 0.90, 0.50, null),
  ('community', 2026, 12, 14550000, 0.90, 0.50, null),
  ('community', 2027, 1, 16954000, 0.90, 0.50, null),
  ('community', 2027, 2, 18141000, 0.90, 0.50, null),
  ('community', 2027, 3, 19411000, 0.90, 0.50, null),
  ('community', 2027, 4, 20769000, 0.90, 0.50, null),
  ('community', 2027, 5, 22223000, 0.90, 0.50, null),
  ('community', 2027, 6, 23779000, 0.90, 0.50, null),
  ('community', 2027, 7, 25443000, 0.90, 0.50, null)
on conflict (segment, year, month) do nothing;

-- VIP: A SUGGESTED STARTING PLAN, flagged `suggested` so the page says so until somebody saves their own. Built from
-- what the paid creators actually did (5.1M in September from the team's sheet; VIP and official together on pace for
-- about 16M in October on 20 Oct), rising about 2M a month to January, then the same 7% a month the community plan
-- uses. Target CPM 0.25: VIP rates are 0.20-0.30. (The first seed had October at 12M; re-set the same day.)
insert into public.ccc_targets (segment, year, month, view_target, epm, cpm, suggested) values
  ('vip', 2026, 9, 5000000, 0.90, 0.25, true),
  ('vip', 2026, 10, 15000000, 0.90, 0.25, true),
  ('vip', 2026, 11, 17000000, 0.90, 0.25, true),
  ('vip', 2026, 12, 19000000, 0.90, 0.25, true),
  ('vip', 2027, 1, 21000000, 0.90, 0.25, true),
  ('vip', 2027, 2, 22470000, 0.90, 0.25, true),
  ('vip', 2027, 3, 24043000, 0.90, 0.25, true),
  ('vip', 2027, 4, 25726000, 0.90, 0.25, true),
  ('vip', 2027, 5, 27527000, 0.90, 0.25, true),
  ('vip', 2027, 6, 29454000, 0.90, 0.25, true),
  ('vip', 2027, 7, 31516000, 0.90, 0.25, true)
on conflict (segment, year, month) do nothing;

create or replace function public.admin_ccc_actuals(p_from date, p_to date)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_vip_ok boolean;
  v_ids uuid[];
  v_months jsonb; v_challenges jsonb; v_other jsonb; v_vip_pay jsonb;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'Pick a start month and an end month after it.'; end if;
  if p_to - p_from > 800 then raise exception 'Pick two years or less.'; end if;
  v_vip_ok := public.vip_has_access();
  v_ids := case when v_vip_ok then (select array_agg(id) from public.vip_programmes where active) else null end;

  -- COMMUNITY VIEWS GAINED PER DAY: the rule admin_views_gained uses (the Weekly views tab), so the two always agree.
  create temporary table if not exists _ccc_c (d date, submission_id uuid, creator uuid, gained numeric) on commit drop;
  truncate _ccc_c;
  insert into _ccc_c
  with sub as (
    select s.id, s.creator_id, s.submitted_at
      from public.submissions s join public.profiles p on p.id = s.creator_id
     where not coalesce(p.is_test, false) and not coalesce(p.is_sandbox, false)
  ), day_end as (
    select sn.submission_id, (sn.captured_at at time zone 'UTC')::date d, max(sn.views) v
      from public.view_snapshots sn join sub on sub.id = sn.submission_id
     where sn.captured_at >= (p_from::timestamp - interval '1 day') and sn.captured_at < (p_to::timestamp + interval '1 day')
     group by 1, 2
  ), ordered as (
    select de.*, lag(de.v) over (partition by de.submission_id order by de.d) prev_v from day_end de
  )
  select o.d, o.submission_id, sub.creator_id,
         greatest(o.v - coalesce(
           o.prev_v,
           (select max(y.views) from public.view_snapshots y where y.submission_id = o.submission_id and y.captured_at < (o.d::timestamp)),
           case when sub.submitted_at >= (o.d::timestamp - interval '3 days') then 0 else o.v end
         ), 0)::numeric
    from ordered o join sub on sub.id = o.submission_id
   where o.d between p_from and p_to;

  -- PAID CREATORS' VIEWS GAINED PER DAY (VIP and official), when this admin may see VIP numbers at all.
  create temporary table if not exists _ccc_v (d date, profile_id uuid, video_id uuid, kind text, gained numeric) on commit drop;
  truncate _ccc_v;
  if v_vip_ok and v_ids is not null then
    insert into _ccc_v
    select g.d, g.profile_id, g.video_id, vp.kind, g.gained
      from public.vip_daily_gained(v_ids, null, p_from, p_to) g
      join public.vip_programmes vp on vp.id = g.programme_id
      join public.profiles p on p.id = g.profile_id
     where not coalesce(p.is_test, false) and not coalesce(p.is_sandbox, false);
  end if;

  select coalesce(jsonb_agg(m order by m.month), '[]'::jsonb) into v_months from (
    select to_char(s.m, 'YYYY-MM') as month,
           round(coalesce((select sum(gained) from _ccc_c where date_trunc('month', d) = s.m), 0))::bigint community_views,
           round(coalesce((select sum(gained) from _ccc_v where date_trunc('month', d) = s.m and kind = 'vip'), 0))::bigint vip_views,
           round(coalesce((select sum(gained) from _ccc_v where date_trunc('month', d) = s.m and kind = 'official'), 0))::bigint official_views,
           (select count(distinct creator) from _ccc_c where date_trunc('month', d) = s.m and gained > 0) community_creators,
           (select count(distinct profile_id) from _ccc_v where date_trunc('month', d) = s.m and gained > 0) vip_creators,
           (select count(*) from public.submissions x join public.profiles p on p.id = x.creator_id
             where not coalesce(p.is_test, false) and not coalesce(p.is_sandbox, false)
               and date_trunc('month', x.submitted_at at time zone 'UTC') = s.m) community_videos,
           case when v_vip_ok then (select count(*) from public.vip_videos x join public.profiles p on p.id = x.profile_id
             where not coalesce(p.is_test, false) and not coalesce(p.is_sandbox, false) and x.status <> 'removed'
               and date_trunc('month', coalesce(x.posted_at, x.submitted_at) at time zone 'UTC') = s.m) else 0 end vip_videos,
           -- THE TEAM'S VIP SHEET for the months before the platform tracked VIP videos (to September 2026).
           case when v_vip_ok then (select sum(h.views) from public.vip_earnings_history h
             where make_date(h.year, h.month, 1) = s.m::date) else null end vip_sheet_views
      from generate_series(date_trunc('month', p_from::timestamp), date_trunc('month', p_to::timestamp), interval '1 month') s(m)
  ) m;

  -- EVERY CHALLENGE THAT TOUCHES THE RANGE (drafts included, flagged, so the page can show what is planned).
  select coalesce(jsonb_agg(c order by c.starts_at), '[]'::jsonb) into v_challenges from (
    select ch.id, ch.title, ch.status, ch.start_date starts_at, ch.end_date ends_at,
           coalesce(ch.prize_amount, 0) prize_amount, coalesce(ch.prize_currency, 'EUR') prize_currency,
           cm.name market,
           (select coalesce(jsonb_agg(jsonb_build_object('type', r.reward_type, 'amount', r.amount, 'currency', r.currency, 'status', r.status)), '[]'::jsonb)
              from public.rewards r join public.profiles p on p.id = r.creator_id
             where r.challenge_id = ch.id and r.status <> 'cancelled'
               and not coalesce(p.is_test, false) and not coalesce(p.is_sandbox, false)) rewards,
           (select coalesce(sum(x.logged_views), 0) from public.submissions x where x.challenge_id = ch.id) views
      from public.challenges ch
      left join public.communities cm on cm.id = ch.community_id
     where ch.status <> 'cancelled' and ch.start_date is not null and ch.end_date is not null
       and ch.start_date::date <= p_to and ch.end_date::date >= p_from
       and not coalesce(ch.title ilike 'test %' or ch.title ilike '%[test]%', false)
  ) c;

  -- REWARDS NOT TIED TO A CHALLENGE (milestones, referrals, weekly prizes...), by the month they were given.
  select coalesce(jsonb_agg(o order by o.month, o.source), '[]'::jsonb) into v_other from (
    select to_char(date_trunc('month', r.created_at at time zone 'UTC'), 'YYYY-MM') as month, coalesce(r.source, 'other') source,
           r.reward_type type, r.currency, sum(r.amount) amount, count(*) n
      from public.rewards r join public.profiles p on p.id = r.creator_id
     where r.challenge_id is null and r.status <> 'cancelled'
       and not coalesce(p.is_test, false) and not coalesce(p.is_sandbox, false)
       and coalesce(r.source, '') not ilike 'vip%'
       and not exists (select 1 from public.vip_statements st where st.reward_id = r.id or r.id = any (st.voucher_reward_ids))
       and (r.created_at at time zone 'UTC')::date between p_from and p_to
     group by 1, 2, 3, 4
  ) o;

  -- WHAT THE PAID CREATORS COST, per month: the team's sheet, then closed statements, then the live month.
  if v_vip_ok then
    select coalesce(jsonb_agg(v order by v.month, v.kind), '[]'::jsonb) into v_vip_pay from (
      select to_char(make_date(h.year, h.month, 1), 'YYYY-MM') as month, 'vip' kind, 'sheet' source, false live,
             sum(h.earned) amount, max(h.currency) currency, count(*) creators
        from public.vip_earnings_history h
       where make_date(h.year, h.month, 1) between date_trunc('month', p_from::timestamp)::date and p_to
       group by h.year, h.month
      union all
      select to_char(make_date(m.year, m.month, 1), 'YYYY-MM'), vp.kind, 'statements', false,
             sum(public.fx_convert(st.total, coalesce(st.currency, 'EUR'), 'EUR')), 'EUR', count(*)
        from public.vip_statements st
        join public.vip_months m on m.id = st.month_id
        join public.vip_programmes vp on vp.id = st.programme_id
        join public.profiles p on p.id = st.profile_id
       where m.status = 'closed' and not coalesce(p.is_test, false) and not coalesce(p.is_sandbox, false)
         and make_date(m.year, m.month, 1) between date_trunc('month', p_from::timestamp)::date and p_to
         and not exists (select 1 from public.vip_earnings_history h where h.year = m.year and h.month = m.month)
       group by m.year, m.month, vp.kind
      union all
      select to_char(make_date(r.year, r.month, 1), 'YYYY-MM'), vp.kind, 'live', true,
             sum(coalesce(r.base, 0) + coalesce(r.bonus, 0)), 'EUR', count(*)
        from public.vip_programmes vp
        cross join lateral public.vip_month_rows(array[vp.id]) r
        join public.profiles p on p.id = r.profile_id
       where vp.active and r.month_status <> 'closed' and not coalesce(p.is_test, false) and not coalesce(p.is_sandbox, false)
         and make_date(r.year, r.month, 1) between date_trunc('month', p_from::timestamp)::date and p_to
         and not exists (select 1 from public.vip_earnings_history h where h.year = r.year and h.month = r.month)
       group by r.year, r.month, vp.kind
    ) v;
  end if;

  return jsonb_build_object(
    'from', p_from, 'to', p_to, 'today', (now() at time zone 'UTC')::date, 'vip_visible', v_vip_ok,
    'fx', (select value from public.app_settings where key = 'fx_rates'),
    'months', v_months, 'challenges', v_challenges, 'other_rewards', v_other, 'vip_pay', coalesce(v_vip_pay, '[]'::jsonb));
end $function$;

revoke all on function public.admin_ccc_actuals(date, date) from public, anon;
grant execute on function public.admin_ccc_actuals(date, date) to authenticated;
