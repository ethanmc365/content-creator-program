-- 446: TARGETS & PROFIT, A PLAN THAT RUNS ITSELF (20 Oct 2026).
--
-- Ethan: "January should be 17 million, start at that and work backwards and forwards" at 7% a month, "if I change
-- October to 10 million, then all the other ones would also go by 7%", or "change them one by one", and "the later
-- months should add automatically as we come to them".
--
--   ccc_plans            one row per side (community | vip): the ANCHOR (a month and its view target), the monthly
--                        GROWTH, the first month of the plan, and the default EPM / target CPM. Every month's target is
--                        anchor x (1 + growth) ^ (months from the anchor), forwards and backwards, so the plan has no
--                        last month: a new month is simply the next step.
--   ccc_targets          now only the EXCEPTIONS: a month whose target was set by hand (`pinned`), or whose EPM, CPM,
--                        other costs, achieved figure or note differ. view_target / epm / cpm are null = follow the plan.
--   admin_ccc_actuals    also returns `imported`: challenges that ran off the platform (challenge_history rows never
--                        linked to a platform challenge), whose views and prize money belong to the community months.
--
-- The plans seeded here: community anchored on January 2027 = 17,000,000 at 7%; VIP (VIP + official creators)
-- anchored on October 2026 = 16,000,000 (they are on pace for about 16.4M) at 7%, with September kept at the 5M that
-- was set for it. The old 'suggested' VIP rows and the uneven community steps (30%, 24%, 19%...) are replaced.

create table if not exists public.ccc_plans (
  segment text primary key check (segment in ('community', 'vip')),
  start_year int not null check (start_year between 2024 and 2100),
  start_month int not null check (start_month between 1 and 12),
  anchor_year int not null check (anchor_year between 2024 and 2100),
  anchor_month int not null check (anchor_month between 1 and 12),
  anchor_views bigint not null check (anchor_views >= 0),
  growth numeric(6, 4) not null default 0.07 check (growth > -0.5 and growth < 2),
  epm numeric(10, 4) not null default 0.90 check (epm >= 0),
  cpm numeric(10, 4) not null default 0.50 check (cpm >= 0),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.ccc_plans enable row level security;
revoke all on public.ccc_plans from anon;
drop policy if exists ccc_plans_admin on public.ccc_plans;
create policy ccc_plans_admin on public.ccc_plans for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
drop trigger if exists trg_ccc_plans_stamp on public.ccc_plans;
create trigger trg_ccc_plans_stamp before insert or update on public.ccc_plans
  for each row execute function public.ccc_targets_stamp();
drop trigger if exists trg_sandbox_read_only on public.ccc_plans;
create trigger trg_sandbox_read_only before insert or update or delete on public.ccc_plans
  for each row execute function public.sandbox_is_read_only();

insert into public.ccc_plans (segment, start_year, start_month, anchor_year, anchor_month, anchor_views, growth, epm, cpm) values
  ('community', 2026, 9, 2027, 1, 17000000, 0.07, 0.90, 0.50),
  ('vip', 2026, 9, 2026, 10, 16000000, 0.07, 0.90, 0.25)
on conflict (segment) do nothing;

alter table public.ccc_targets alter column view_target drop not null;
alter table public.ccc_targets alter column view_target drop default;
alter table public.ccc_targets alter column epm drop not null;
alter table public.ccc_targets alter column epm drop default;
alter table public.ccc_targets alter column cpm drop not null;
alter table public.ccc_targets alter column cpm drop default;
alter table public.ccc_targets add column if not exists pinned boolean not null default false;

-- Every month follows the plan now; only September VIP keeps a hand-set target. Rates equal to the plan's go back to
-- null (follow the plan). Notes stay.
update public.ccc_targets set view_target = null, pinned = false where true;
update public.ccc_targets t set epm = null where t.epm = (select p.epm from public.ccc_plans p where p.segment = t.segment);
update public.ccc_targets t set cpm = null where t.cpm = (select p.cpm from public.ccc_plans p where p.segment = t.segment);
update public.ccc_targets set view_target = 5000000, pinned = true where segment = 'vip' and year = 2026 and month = 9;
update public.ccc_targets set suggested = false where true;
update public.ccc_targets set note = 'The team sheet said 3,100k. Counted here: views gained inside September on the platform, plus challenges run off it (Desafio Setembro, spread by days).'
 where segment = 'community' and year = 2026 and month = 9;
-- A row that now says nothing the plan does not is noise.
delete from public.ccc_targets
 where not pinned and epm is null and cpm is null and coalesce(other_costs, 0) = 0 and achieved_override is null and note is null;

CREATE OR REPLACE FUNCTION public.admin_ccc_actuals(p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_vip_ok boolean;
  v_ids uuid[];
  v_months jsonb; v_challenges jsonb; v_other jsonb; v_vip_pay jsonb; v_imported jsonb;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'Pick a start month and an end month after it.'; end if;
  if p_to - p_from > 800 then raise exception 'Pick two years or less.'; end if;
  v_vip_ok := public.vip_has_access();
  v_ids := case when v_vip_ok then (select array_agg(id) from public.vip_programmes where active) else null end;

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
           case when v_vip_ok then (select sum(h.views) from public.vip_earnings_history h
             where make_date(h.year, h.month, 1) = s.m::date) else null end vip_sheet_views
      from generate_series(date_trunc('month', p_from::timestamp), date_trunc('month', p_to::timestamp), interval '1 month') s(m)
  ) m;

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

  -- 446: CHALLENGES THAT RAN OFF THE PLATFORM (imported into challenge_history, never linked to a platform challenge),
  -- e.g. Portugal's Desafio Setembro. Their views and prize money count for the community; the page spreads both over
  -- the days each one ran.
  select coalesce(jsonb_agg(h order by h.starts_at), '[]'::jsonb) into v_imported from (
    select ch.id, ch.title, ch.country_code, ch.starts_at, ch.ends_at, coalesce(ch.total_views, 0) total_views,
           coalesce(ch.prize_total, 0) prize_total, coalesce(ch.prize_currency, 'EUR') prize_currency, ch.creators, ch.posts
      from public.challenge_history ch
     where ch.challenge_id is null and ch.starts_at is not null and ch.ends_at is not null
       and ch.starts_at <= p_to and ch.ends_at >= p_from
  ) h;

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
    'months', v_months, 'challenges', v_challenges, 'imported', v_imported, 'other_rewards', v_other, 'vip_pay', coalesce(v_vip_pay, '[]'::jsonb));
end $function$;
