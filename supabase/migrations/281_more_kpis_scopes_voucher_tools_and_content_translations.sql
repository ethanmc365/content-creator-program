-- 281: MORE KPIs THAT MEASURE THEMSELVES, TOTAL VS GLOBAL SCOPES, VOUCHER TOOLS,
-- WHO CAME THROUGH WHICH TEAM LINK, AND A CACHE FOR TRANSLATED BRIEFS (29 Sep 2026)
--
-- Ethan, the night before setting Q4 KPIs with the market leads: "average entries
-- per creator ... what other KPIs could we add and track automatically ... still
-- have the ability to add your own ... set global KPIs, so KPIs for absolutely
-- everything ... for global challenges and also total."
--
-- ---------------------------------------------------------------------------
-- 1. KPIs
-- ---------------------------------------------------------------------------
-- The four standard metrics of migration 254 become TWENTY-ONE, all computed live
-- from tables that already exist, so nothing has to be typed in and nothing can
-- drift. They share ONE function (`kpi_compute`) so a definition is written once:
-- the card, the year overview and the detail chart can all only ever disagree
-- about a metric if two copies of it exist, and now they do not.
--
-- TWO WORLDWIDE SCOPES. The Worldwide community row has always meant "every market,
-- summed", which is a TOTAL. A GLOBAL CHALLENGE is different: a challenge whose
-- community_id is the Worldwide row itself. `basis` says which one a target on the
-- Worldwide row is about: 'all' (the total, and what every existing row already
-- means) or 'global' (global challenges only). A market row is always 'all'.
--
-- CUSTOM KPIs GAIN A UNIT AND A DIRECTION. A hand-typed KPI can be a count, a
-- decimal, a percentage, views or money; it can be a running total (pace matters)
-- or a level (an average, where pace does not); and it can be one where LOWER is
-- better (a cost per view). The standard metrics carry the same facts in the app's
-- registry (lib/kpiTracker), not here, because they are properties of the
-- definition rather than of a row.

alter table public.kpi_targets drop constraint if exists kpi_targets_metric_check;
alter table public.kpi_targets add constraint kpi_targets_metric_check check (metric in (
  'challenges_run', 'creators_recruited', 'creators_participated', 'views',
  'entries', 'avg_entries_per_creator', 'entries_per_challenge', 'avg_creators_per_challenge',
  'avg_views_per_entry', 'avg_views_per_creator', 'videos_10k', 'top_video_views',
  'participation_rate', 'first_time_creators', 'return_rate', 'activation_rate',
  'referrals', 'creators_total', 'chat_messages', 'game_players', 'connections_made',
  'custom'
));

alter table public.kpi_targets
  add column if not exists basis text not null default 'all',
  add column if not exists unit text not null default 'number',
  add column if not exists higher_is_better boolean not null default true,
  add column if not exists cumulative boolean not null default true;

alter table public.kpi_targets drop constraint if exists kpi_targets_basis_check;
alter table public.kpi_targets add constraint kpi_targets_basis_check check (basis in ('all', 'global'));
alter table public.kpi_targets drop constraint if exists kpi_targets_unit_check;
alter table public.kpi_targets add constraint kpi_targets_unit_check
  check (unit in ('number', 'decimal', 'percent', 'views', 'currency'));

-- 'global' only means something on the Worldwide row. A trigger, because a CHECK
-- cannot look at another table.
create or replace function public.kpi_targets_basis_guard()
returns trigger language plpgsql set search_path to 'public'
as $$
begin
  if new.basis = 'global' and not exists (
    select 1 from public.communities c where c.id = new.community_id and c.kind = 'network'
  ) then
    raise exception 'Only the Worldwide scope can be about global challenges.';
  end if;
  return new;
end;
$$;
drop trigger if exists kpi_targets_basis_guard on public.kpi_targets;
create trigger kpi_targets_basis_guard before insert or update on public.kpi_targets
  for each row execute function public.kpi_targets_basis_guard();

drop index if exists public.kpi_targets_period_metric_key;
create unique index kpi_targets_period_metric_key
  on public.kpi_targets (community_id, basis, year, quarter, coalesce(month, 0), metric, label);

-- ---------------------------------------------------------------- the maths
--
-- ONE SCOPE PREDICATE, USED FOR EVERY CHALLENGE-SHAPED METRIC:
--   Worldwide + 'all'     every challenge on the platform (the total)
--   Worldwide + 'global'  challenges whose community_id IS the Worldwide row
--   a market              that market's challenges
-- PEOPLE-SHAPED metrics (recruited, roster, games, connections) read membership of
-- the scope's community row, which for Worldwide is everybody, because everyone
-- gets a Worldwide membership the day they join.
--
-- Test accounts are out of every number, as before. Admins are out of the roster
-- and of the chat count: a KPI about the community is about creators.

create or replace function public.kpi_compute(
  p_community_id uuid, p_basis text, p_start timestamptz, p_end timestamptz
) returns table(metric text, value numeric)
language plpgsql stable security definer set search_path to 'public'
as $$
declare
  v_kind text;
  v_wide boolean;
begin
  select kind into v_kind from public.communities where id = p_community_id;
  v_wide := v_kind = 'network' and coalesce(p_basis, 'all') <> 'global';

  return query
  with ent as (
    select s.id, s.creator_id, s.challenge_id, coalesce(s.logged_views, 0) as views
    from public.submissions s
    join public.challenges c on c.id = s.challenge_id
    join public.profiles p on p.id = s.creator_id
    where s.submitted_at >= p_start and s.submitted_at < p_end
      and (v_wide or c.community_id = p_community_id)
      and coalesce(p.is_test, false) = false
  ),
  agg as (
    select count(*)::numeric as entries,
           count(distinct creator_id)::numeric as creators,
           coalesce(sum(views), 0)::numeric as views,
           count(*) filter (where views >= 10000)::numeric as v10k,
           coalesce(max(views), 0)::numeric as top,
           count(distinct challenge_id)::numeric as chs,
           (select count(*) from (select distinct challenge_id, creator_id from ent) q)::numeric as pairs
    from ent
  ),
  chn as (
    select count(*)::numeric as n from public.challenges c
    where c.start_date >= p_start and c.start_date < p_end
      and (v_wide or c.community_id = p_community_id)
  ),
  rec as (
    select cm.profile_id, p.referred_by
    from public.community_members cm
    join public.profiles p on p.id = cm.profile_id
    where cm.community_id = p_community_id
      and cm.joined_at >= p_start and cm.joined_at < p_end
      and coalesce(p.is_test, false) = false
  ),
  roster as (
    select count(*)::numeric as n
    from public.community_members cm
    join public.profiles p on p.id = cm.profile_id
    where cm.community_id = p_community_id
      and cm.joined_at < p_end
      and p.status = 'active'
      and coalesce(p.is_admin, false) = false
      and coalesce(p.is_test, false) = false
  ),
  -- Creators whose FIRST entry in this scope falls inside the period.
  newbies as (
    select count(*)::numeric as n from (
      select e.creator_id from ent e group by e.creator_id
      having not exists (
        select 1 from public.submissions s2
        join public.challenges c2 on c2.id = s2.challenge_id
        where s2.creator_id = e.creator_id and s2.submitted_at < p_start
          and (v_wide or c2.community_id = p_community_id)
      )
    ) x
  ),
  -- Of the people who joined in the period, how many have entered anything by its end.
  act as (
    select count(*) filter (where exists (
             select 1 from public.submissions s
             join public.challenges c on c.id = s.challenge_id
             where s.creator_id = r.profile_id and s.submitted_at < p_end
               and (v_wide or c.community_id = p_community_id)
           ))::numeric as done,
           count(*)::numeric as total
    from rec r
  ),
  msgs as (
    select count(*)::numeric as n
    from public.messages m
    join public.profiles p on p.id = m.sender_id
    where m.created_at >= p_start and m.created_at < p_end
      and not coalesce(m.deleted, false)
      and coalesce(p.is_test, false) = false and coalesce(p.is_admin, false) = false
      and (v_wide or m.community_id = p_community_id)
  ),
  gp as (
    select count(distinct g.player_id)::numeric as n
    from public.game_scores g
    join public.profiles p on p.id = g.player_id
    where g.created_at >= p_start and g.created_at < p_end
      and coalesce(p.is_test, false) = false
      and (v_kind = 'network' or exists (
        select 1 from public.community_members cm
        where cm.community_id = p_community_id and cm.profile_id = g.player_id))
  ),
  cx as (
    select count(*)::numeric as n
    from public.connections k
    join public.profiles p on p.id = k.creator_id
    where k.status = 'accepted' and k.accepted_at >= p_start and k.accepted_at < p_end
      and coalesce(p.is_test, false) = false
      and (v_kind = 'network' or exists (
        select 1 from public.community_members cm
        where cm.community_id = p_community_id and cm.profile_id = k.creator_id))
  )
  select m.metric, m.value from (
    select 'challenges_run'::text as metric, (select n from chn) as value
    union all select 'creators_recruited', (select count(*)::numeric from rec)
    union all select 'creators_participated', (select creators from agg)
    union all select 'views', (select views from agg)
    union all select 'entries', (select entries from agg)
    union all select 'avg_entries_per_creator',
      case when (select creators from agg) > 0 then round((select entries from agg) / (select creators from agg), 2) else 0 end
    union all select 'entries_per_challenge',
      case when (select chs from agg) > 0 then round((select entries from agg) / (select chs from agg), 2) else 0 end
    union all select 'avg_creators_per_challenge',
      case when (select chs from agg) > 0 then round((select pairs from agg) / (select chs from agg), 2) else 0 end
    union all select 'avg_views_per_entry',
      case when (select entries from agg) > 0 then round((select views from agg) / (select entries from agg), 0) else 0 end
    union all select 'avg_views_per_creator',
      case when (select creators from agg) > 0 then round((select views from agg) / (select creators from agg), 0) else 0 end
    union all select 'videos_10k', (select v10k from agg)
    union all select 'top_video_views', (select top from agg)
    union all select 'participation_rate',
      case when (select n from roster) > 0
        then least(100, round(100 * (select creators from agg) / (select n from roster), 1)) else 0 end
    union all select 'first_time_creators', (select n from newbies)
    union all select 'return_rate',
      case when (select creators from agg) > 0
        then round(100 * ((select creators from agg) - (select n from newbies)) / (select creators from agg), 1) else 0 end
    union all select 'activation_rate',
      case when (select total from act) > 0 then round(100 * (select done from act) / (select total from act), 1) else 0 end
    union all select 'referrals', (select count(*)::numeric from rec where referred_by is not null)
    union all select 'creators_total', (select n from roster)
    union all select 'chat_messages', (select n from msgs)
    union all select 'game_players', (select n from gp)
    union all select 'connections_made', (select n from cx)
  ) m;
end;
$$;

revoke all on function public.kpi_compute(uuid, text, timestamptz, timestamptz) from public, anon, authenticated;

-- The public door: same name and behaviour as before, plus a basis. Admin only.
drop function if exists public.kpi_actuals(uuid, int, int, int);
create or replace function public.kpi_actuals(
  p_community_id uuid, p_year int, p_quarter int, p_month int default null, p_basis text default 'all'
) returns table(metric text, value numeric)
language plpgsql stable security definer set search_path to 'public'
as $$
declare
  v_start timestamptz;
  v_end timestamptz;
begin
  if not public.is_admin() then
    raise exception 'Not authorised.';
  end if;
  if p_quarter < 1 or p_quarter > 4 then
    raise exception 'Quarter must be 1-4.';
  end if;
  if not exists (select 1 from public.communities where id = p_community_id) then
    raise exception 'No such community.';
  end if;
  if p_month is not null then
    if p_month < 1 or p_month > 12 then
      raise exception 'Month must be 1-12.';
    end if;
    v_start := make_date(p_year, p_month, 1)::timestamptz;
    v_end := v_start + interval '1 month';
  else
    v_start := make_date(p_year, (p_quarter - 1) * 3 + 1, 1)::timestamptz;
    v_end := v_start + interval '3 months';
  end if;
  return query select * from public.kpi_compute(p_community_id, p_basis, v_start, v_end);
end;
$$;
revoke all on function public.kpi_actuals(uuid, int, int, int, text) from public, anon;
grant execute on function public.kpi_actuals(uuid, int, int, int, text) to authenticated;

-- ------------------------------------------------------------ the detail chart
--
-- The story behind one KPI. Returns, for any metric:
--   series      the numerator landing each day
--   series_den  the denominator landing each day (ratio metrics), else null
--   den_total   a fixed denominator (a roster), else null
--   people      who is behind it, challenges: which challenges
-- The page accumulates the series and divides, so a ratio's line ends on the number
-- printed on the card (kpi_compute above is the only definition of that number).
drop function if exists public.kpi_detail(uuid, int, int, int, text);
create or replace function public.kpi_detail(
  p_community_id uuid, p_year int, p_quarter int, p_month int default null,
  p_metric text default 'views', p_basis text default 'all'
) returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
-- VOLATILE, NOT STABLE: it stages the period's entries in a temporary table once and
-- every branch reads that, and Postgres does not allow CREATE TABLE in a stable function.
declare
  v_kind text;
  v_wide boolean;
  v_start timestamptz;
  v_end timestamptz;
  v_series jsonb := '[]'::jsonb;
  v_den jsonb := null;
  v_den_total numeric := null;
  v_people jsonb := '[]'::jsonb;
  v_challenges jsonb := '[]'::jsonb;
begin
  if not public.is_admin() then
    raise exception 'Not authorised.';
  end if;
  select kind into v_kind from public.communities where id = p_community_id;
  if v_kind is null then
    raise exception 'No such community.';
  end if;
  v_wide := v_kind = 'network' and coalesce(p_basis, 'all') <> 'global';
  if p_month is not null then
    v_start := make_date(p_year, p_month, 1)::timestamptz;
    v_end := v_start + interval '1 month';
  else
    v_start := make_date(p_year, (p_quarter - 1) * 3 + 1, 1)::timestamptz;
    v_end := v_start + interval '3 months';
  end if;

  -- Entries in scope, once, for every branch below.
  create temporary table if not exists _kd_ent (
    id uuid, creator_id uuid, challenge_id uuid, views int, at timestamptz
  ) on commit drop;
  truncate _kd_ent;
  insert into _kd_ent
  select s.id, s.creator_id, s.challenge_id, coalesce(s.logged_views, 0), s.submitted_at
  from public.submissions s
  join public.challenges c on c.id = s.challenge_id
  join public.profiles p on p.id = s.creator_id
  where s.submitted_at >= v_start and s.submitted_at < v_end
    and (v_wide or c.community_id = p_community_id)
    and coalesce(p.is_test, false) = false;

  if p_metric = 'challenges_run' or p_metric in ('entries_per_challenge', 'avg_creators_per_challenge') then
    -- challenges START in the period; the per-challenge averages divide by them
    if p_metric = 'challenges_run' then
      select coalesce(jsonb_agg(jsonb_build_object('d', d, 'v', n) order by d), '[]'::jsonb) into v_series
      from (select c.start_date::date as d, count(*) as n from public.challenges c
            where c.start_date >= v_start and c.start_date < v_end and (v_wide or c.community_id = p_community_id)
            group by 1) x;
    elsif p_metric = 'entries_per_challenge' then
      select coalesce(jsonb_agg(jsonb_build_object('d', d, 'v', n) order by d), '[]'::jsonb) into v_series
      from (select at::date as d, count(*) as n from _kd_ent group by 1) x;
      select coalesce(jsonb_agg(jsonb_build_object('d', d, 'v', n) order by d), '[]'::jsonb) into v_den
      from (select d, count(*) as n from (select challenge_id, min(at)::date as d from _kd_ent group by 1) f group by d) x;
    else
      select coalesce(jsonb_agg(jsonb_build_object('d', d, 'v', n) order by d), '[]'::jsonb) into v_series
      from (select d, count(*) as n from (select challenge_id, creator_id, min(at)::date as d from _kd_ent group by 1, 2) f group by d) x;
      select coalesce(jsonb_agg(jsonb_build_object('d', d, 'v', n) order by d), '[]'::jsonb) into v_den
      from (select d, count(*) as n from (select challenge_id, min(at)::date as d from _kd_ent group by 1) f group by d) x;
    end if;
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'title', c.title, 'start_date', c.start_date, 'end_date', c.end_date, 'status', c.status,
      'entries', (select count(*) from public.submissions s where s.challenge_id = c.id),
      'views', (select coalesce(sum(s.logged_views), 0) from public.submissions s where s.challenge_id = c.id)
    ) order by c.start_date), '[]'::jsonb) into v_challenges
    from public.challenges c
    where (p_metric = 'challenges_run' and c.start_date >= v_start and c.start_date < v_end
           and (v_wide or c.community_id = p_community_id))
       or (p_metric <> 'challenges_run' and c.id in (select challenge_id from _kd_ent));

  elsif p_metric in ('creators_recruited', 'referrals', 'activation_rate', 'creators_total') then
    select coalesce(jsonb_agg(jsonb_build_object('d', d, 'v', n) order by d), '[]'::jsonb) into v_series
    from (
      select cm.joined_at::date as d, count(*) as n
      from public.community_members cm
      join public.profiles p on p.id = cm.profile_id
      where cm.community_id = p_community_id
        and cm.joined_at >= v_start and cm.joined_at < v_end
        and coalesce(p.is_test, false) = false
        and (p_metric <> 'referrals' or p.referred_by is not null)
      group by 1
    ) x;
    if p_metric = 'activation_rate' then
      select coalesce(jsonb_agg(jsonb_build_object('d', d, 'v', n) order by d), '[]'::jsonb) into v_den
      from (
        select cm.joined_at::date as d, count(*) as n
        from public.community_members cm
        join public.profiles p on p.id = cm.profile_id
        where cm.community_id = p_community_id
          and cm.joined_at >= v_start and cm.joined_at < v_end
          and coalesce(p.is_test, false) = false
        group by 1
      ) x;
      -- the numerator is the ones who have entered: their join days
      select coalesce(jsonb_agg(jsonb_build_object('d', d, 'v', n) order by d), '[]'::jsonb) into v_series
      from (
        select cm.joined_at::date as d, count(*) as n
        from public.community_members cm
        join public.profiles p on p.id = cm.profile_id
        where cm.community_id = p_community_id
          and cm.joined_at >= v_start and cm.joined_at < v_end
          and coalesce(p.is_test, false) = false
          and exists (select 1 from public.submissions s join public.challenges c on c.id = s.challenge_id
                      where s.creator_id = cm.profile_id and s.submitted_at < v_end and (v_wide or c.community_id = p_community_id))
        group by 1
      ) x;
    end if;
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'name', p.name, 'photo_url', p.photo_url, 'at', cm.joined_at
    ) order by cm.joined_at desc), '[]'::jsonb) into v_people
    from public.community_members cm
    join public.profiles p on p.id = cm.profile_id
    where cm.community_id = p_community_id
      and cm.joined_at >= v_start and cm.joined_at < v_end
      and coalesce(p.is_test, false) = false
      and (p_metric <> 'referrals' or p.referred_by is not null);

  else
    -- everything that is read off the period's entries
    if p_metric in ('creators_participated', 'first_time_creators', 'return_rate', 'participation_rate') then
      select coalesce(jsonb_agg(jsonb_build_object('d', d, 'v', n) order by d), '[]'::jsonb) into v_series
      from (
        select first_at::date as d, count(*) as n from (
          select e.creator_id, min(e.at) as first_at from _kd_ent e
          where p_metric <> 'first_time_creators' or not exists (
            select 1 from public.submissions s2 join public.challenges c2 on c2.id = s2.challenge_id
            where s2.creator_id = e.creator_id and s2.submitted_at < v_start and (v_wide or c2.community_id = p_community_id))
          group by e.creator_id
        ) f group by 1
      ) x;
      if p_metric = 'participation_rate' then
        select count(*) into v_den_total
        from public.community_members cm join public.profiles p on p.id = cm.profile_id
        where cm.community_id = p_community_id and cm.joined_at < v_end and p.status = 'active'
          and coalesce(p.is_admin, false) = false and coalesce(p.is_test, false) = false;
      end if;
      if p_metric = 'return_rate' then
        select coalesce(jsonb_agg(jsonb_build_object('d', d, 'v', n) order by d), '[]'::jsonb) into v_den
        from (select first_at::date as d, count(*) as n from (select creator_id, min(at) as first_at from _kd_ent group by 1) f group by 1) x;
        -- numerator: those who had entered before
        select coalesce(jsonb_agg(jsonb_build_object('d', d, 'v', n) order by d), '[]'::jsonb) into v_series
        from (select first_at::date as d, count(*) as n from (
                select e.creator_id, min(e.at) as first_at from _kd_ent e
                where exists (select 1 from public.submissions s2 join public.challenges c2 on c2.id = s2.challenge_id
                              where s2.creator_id = e.creator_id and s2.submitted_at < v_start and (v_wide or c2.community_id = p_community_id))
                group by e.creator_id) f group by 1) x;
      end if;
    elsif p_metric in ('avg_entries_per_creator', 'avg_views_per_creator') then
      select coalesce(jsonb_agg(jsonb_build_object('d', d, 'v', n) order by d), '[]'::jsonb) into v_series
      from (select at::date as d, case when p_metric = 'avg_views_per_creator' then sum(views) else count(*) end as n from _kd_ent group by 1) x;
      select coalesce(jsonb_agg(jsonb_build_object('d', d, 'v', n) order by d), '[]'::jsonb) into v_den
      from (select first_at::date as d, count(*) as n from (select creator_id, min(at) as first_at from _kd_ent group by 1) f group by 1) x;
    elsif p_metric = 'avg_views_per_entry' then
      select coalesce(jsonb_agg(jsonb_build_object('d', d, 'v', n) order by d), '[]'::jsonb) into v_series
      from (select at::date as d, sum(views) as n from _kd_ent group by 1) x;
      select coalesce(jsonb_agg(jsonb_build_object('d', d, 'v', n) order by d), '[]'::jsonb) into v_den
      from (select at::date as d, count(*) as n from _kd_ent group by 1) x;
    elsif p_metric = 'videos_10k' then
      select coalesce(jsonb_agg(jsonb_build_object('d', d, 'v', n) order by d), '[]'::jsonb) into v_series
      from (select at::date as d, count(*) as n from _kd_ent where views >= 10000 group by 1) x;
    elsif p_metric = 'top_video_views' then
      select coalesce(jsonb_agg(jsonb_build_object('d', d, 'v', n) order by d), '[]'::jsonb) into v_series
      from (select at::date as d, max(views) as n from _kd_ent group by 1) x;
    elsif p_metric = 'chat_messages' then
      select coalesce(jsonb_agg(jsonb_build_object('d', d, 'v', n) order by d), '[]'::jsonb) into v_series
      from (select m.created_at::date as d, count(*) as n
            from public.messages m join public.profiles p on p.id = m.sender_id
            where m.created_at >= v_start and m.created_at < v_end and not coalesce(m.deleted, false)
              and coalesce(p.is_test, false) = false and coalesce(p.is_admin, false) = false
              and (v_wide or m.community_id = p_community_id)
            group by 1) x;
    elsif p_metric = 'game_players' then
      select coalesce(jsonb_agg(jsonb_build_object('d', d, 'v', n) order by d), '[]'::jsonb) into v_series
      from (select first_at::date as d, count(*) as n from (
              select g.player_id, min(g.created_at) as first_at
              from public.game_scores g join public.profiles p on p.id = g.player_id
              where g.created_at >= v_start and g.created_at < v_end and coalesce(p.is_test, false) = false
                and (v_kind = 'network' or exists (select 1 from public.community_members cm where cm.community_id = p_community_id and cm.profile_id = g.player_id))
              group by g.player_id) f group by 1) x;
    elsif p_metric = 'connections_made' then
      select coalesce(jsonb_agg(jsonb_build_object('d', d, 'v', n) order by d), '[]'::jsonb) into v_series
      from (select k.accepted_at::date as d, count(*) as n
            from public.connections k join public.profiles p on p.id = k.creator_id
            where k.status = 'accepted' and k.accepted_at >= v_start and k.accepted_at < v_end
              and coalesce(p.is_test, false) = false
              and (v_kind = 'network' or exists (select 1 from public.community_members cm where cm.community_id = p_community_id and cm.profile_id = k.creator_id))
            group by 1) x;
    elsif p_metric = 'entries' then
      select coalesce(jsonb_agg(jsonb_build_object('d', d, 'v', n) order by d), '[]'::jsonb) into v_series
      from (select at::date as d, count(*) as n from _kd_ent group by 1) x;
    else
      -- views
      select coalesce(jsonb_agg(jsonb_build_object('d', d, 'v', n) order by d), '[]'::jsonb) into v_series
      from (select at::date as d, coalesce(sum(views), 0) as n from _kd_ent group by 1) x;
    end if;

    select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'name', name, 'photo_url', photo_url, 'entries', entries, 'views', views, 'at', first_at
    ) order by views desc, entries desc), '[]'::jsonb) into v_people
    from (
      select p.id, p.name, p.photo_url, count(*) as entries, coalesce(sum(e.views), 0) as views, min(e.at) as first_at
      from _kd_ent e join public.profiles p on p.id = e.creator_id
      group by p.id, p.name, p.photo_url
      limit 200
    ) t;
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'title', title, 'entries', entries, 'views', views
    ) order by views desc), '[]'::jsonb) into v_challenges
    from (
      select c.id, c.title, count(*) as entries, coalesce(sum(e.views), 0) as views
      from _kd_ent e join public.challenges c on c.id = e.challenge_id
      group by c.id, c.title
    ) t;
  end if;

  return jsonb_build_object('series', v_series, 'series_den', v_den, 'den_total', v_den_total,
    'people', v_people, 'challenges', v_challenges, 'start', v_start, 'end', v_end);
end;
$$;
revoke all on function public.kpi_detail(uuid, int, int, int, text, text) from public, anon;
grant execute on function public.kpi_detail(uuid, int, int, int, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. VOUCHERS THE TEAM CAN COMBINE, RECODE, MARK USED AND SPLIT
-- ---------------------------------------------------------------------------
-- Ethan: two EUR 10 vouchers in two challenges should become ONE EUR 20 voucher; a
-- creator may have already spent the first; the six that were sent by chat are not
-- "being prepared". So:
--   issued_via     'chat' = it was handed over outside the platform. Said on the
--                  ticket instead of "being prepared".
--   voucher_group  rows that share one code because they were combined. Every row
--                  keeps its own challenge and amount (so spend by challenge and the
--                  totals never move); the WALLET draws the group as ONE ticket.
--   used_by        who ticked it: the creator, or somebody on the team for them.
alter table public.rewards
  add column if not exists issued_via text,
  add column if not exists voucher_group uuid,
  add column if not exists used_by uuid references public.profiles(id) on delete set null;

alter table public.rewards drop constraint if exists rewards_issued_via_check;
alter table public.rewards add constraint rewards_issued_via_check check (issued_via is null or issued_via = 'chat');
create index if not exists rewards_voucher_group_idx on public.rewards (voucher_group) where voucher_group is not null;

comment on column public.rewards.issued_via is 'chat = the voucher was handed over outside the platform (before codes lived here).';
comment on column public.rewards.voucher_group is 'Rows sharing one combined voucher code. Amounts stay on the rows; the wallet shows the group as one ticket.';

-- The six that went out by DM before codes lived here.
update public.rewards
   set issued_via = 'chat'
 where reward_type = 'voucher' and status = 'distributed'
   and nullif(btrim(coalesce(voucher_code, '')), '') is null
   and issued_via is null;

-- A notification per row would tell somebody three times that one voucher changed.
-- The RPCs below set this flag for their own transaction and send ONE message.
create or replace function public.on_reward_distributed()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_became boolean := new.status = 'distributed'
    and (tg_op = 'INSERT' or old.status is distinct from new.status);
  v_code_added boolean := tg_op = 'UPDATE' and new.status = 'distributed'
    and old.status = 'distributed'
    and nullif(btrim(coalesce(new.voucher_code, '')), '') is not null
    and new.voucher_code is distinct from old.voucher_code;
begin
  if coalesce(current_setting('tryp.silent_reward', true), '') = 'on' then
    return new;
  end if;
  if v_became then
    if new.reward_type = 'voucher' and nullif(btrim(coalesce(new.voucher_code, '')), '') is not null then
      perform public.notify_user(
        new.creator_id, 'reward', 'Your voucher is here! 🎉',
        'Your Tryp.com voucher code is waiting on your Rewards page.',
        '/rewards'
      );
    else
      perform public.notify_user(
        new.creator_id, 'reward', 'Reward on its way! 🎉',
        'Your ' || new.reward_type || ' reward has been marked as distributed.',
        '/rewards'
      );
    end if;
  elsif v_code_added then
    perform public.notify_user(
      new.creator_id, 'reward', 'Your voucher code is ready',
      'Your Tryp.com voucher code is waiting on your Rewards page.',
      '/rewards'
    );
  end if;
  return new;
end;
$function$;

-- COMBINE: two or more of one creator's unspent vouchers become one code. The new
-- code is for the summed amount, issued by the team; every row takes it.
create or replace function public.admin_combine_vouchers(p_rewards uuid[], p_code text, p_note text default null)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_creator uuid;
  v_ccy text;
  v_total numeric;
  v_group uuid := gen_random_uuid();
  v_code text := nullif(btrim(coalesce(p_code, '')), '');
begin
  if not public.is_admin() then raise exception 'Not authorised.'; end if;
  if v_code is null then raise exception 'Enter the code for the combined voucher.'; end if;
  if coalesce(array_length(p_rewards, 1), 0) < 2 then raise exception 'Pick at least two vouchers to combine.'; end if;

  if (select count(*) from public.rewards r where r.id = any (p_rewards)) <> array_length(p_rewards, 1) then
    raise exception 'One of those vouchers no longer exists.';
  end if;
  if exists (select 1 from public.rewards r where r.id = any (p_rewards) and (r.reward_type <> 'voucher' or r.status <> 'distributed')) then
    raise exception 'Only vouchers that have been handed over can be combined.';
  end if;
  if (select count(distinct creator_id) from public.rewards r where r.id = any (p_rewards)) <> 1 then
    raise exception 'Those vouchers belong to different creators.';
  end if;
  if (select count(distinct currency) from public.rewards r where r.id = any (p_rewards)) <> 1 then
    raise exception 'Those vouchers are in different currencies.';
  end if;
  if exists (select 1 from public.rewards r where r.id = any (p_rewards) and r.used_at is not null) then
    raise exception 'One of those has already been used. Combine only the unspent ones.';
  end if;

  -- Rows already in a group bring their whole group with them: a code cannot be
  -- half-changed.
  perform set_config('tryp.silent_reward', 'on', true);
  update public.rewards
     set voucher_group = v_group, voucher_code = v_code, issued_via = null, used_at = null, used_by = null,
         payment_notes = coalesce(nullif(btrim(coalesce(p_note, '')), ''), payment_notes)
   where id = any (p_rewards)
      or (voucher_group is not null and voucher_group in (select voucher_group from public.rewards where id = any (p_rewards)));

  select sum(amount) into v_total from public.rewards where voucher_group = v_group;
  select creator_id, currency into v_creator, v_ccy from public.rewards where voucher_group = v_group limit 1;
  perform public.notify_user(
    v_creator, 'reward', 'Your vouchers are now one 🎟️',
    'We combined your vouchers into a single ' || regexp_replace(to_char(v_total, 'FM999990.00'), '\.00$', '') || ' ' || v_ccy || ' code. It is on your Rewards page.',
    '/rewards'
  );
  return jsonb_build_object('group', v_group, 'total', v_total, 'currency', v_ccy);
end;
$$;

-- RECODE / ADD A CODE. On a grouped voucher the change reaches the whole group.
create or replace function public.admin_set_voucher_code(p_reward uuid, p_code text, p_via text default null)
returns void
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_row public.rewards;
  v_code text := nullif(btrim(coalesce(p_code, '')), '');
begin
  if not public.is_admin() then raise exception 'Not authorised.'; end if;
  select * into v_row from public.rewards where id = p_reward;
  if v_row.id is null or v_row.reward_type <> 'voucher' then raise exception 'That is not a voucher.'; end if;
  if v_code is null and coalesce(p_via, '') <> 'chat' then
    raise exception 'Enter the code, or say it was sent by chat.';
  end if;
  update public.rewards
     set voucher_code = v_code,
         issued_via = case when v_code is null then 'chat' else null end
   where id = p_reward or (v_row.voucher_group is not null and voucher_group = v_row.voucher_group);
end;
$$;

-- USED / NOT USED, BY THE TEAM. The creator has their own tick (set_reward_used);
-- this is for "they told us they spent it" and for undoing a mistaken tick.
create or replace function public.admin_set_voucher_used(p_reward uuid, p_used boolean)
returns timestamptz
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_row public.rewards;
  v_at timestamptz := case when p_used then now() else null end;
begin
  if not public.is_admin() then raise exception 'Not authorised.'; end if;
  select * into v_row from public.rewards where id = p_reward;
  if v_row.id is null or v_row.reward_type <> 'voucher' or v_row.status <> 'distributed' then
    raise exception 'That voucher has not been handed over.';
  end if;
  update public.rewards
     set used_at = case when p_used then coalesce(used_at, v_at) else null end,
         used_by = case when p_used then auth.uid() else null end
   where id = p_reward or (v_row.voucher_group is not null and voucher_group = v_row.voucher_group);
  return v_at;
end;
$$;

-- SPLIT: undo a combine. The rows go back to being separate vouchers with no code,
-- because the combined code was for the total and is no use to either half.
create or replace function public.admin_split_vouchers(p_reward uuid)
returns integer
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_group uuid;
  n integer;
begin
  if not public.is_admin() then raise exception 'Not authorised.'; end if;
  select voucher_group into v_group from public.rewards where id = p_reward;
  if v_group is null then raise exception 'That voucher is not part of a combined one.'; end if;
  perform set_config('tryp.silent_reward', 'on', true);
  update public.rewards set voucher_group = null, voucher_code = null, used_at = null, used_by = null
   where voucher_group = v_group;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- THE CREATOR'S OWN TICK now reaches the whole group, so a combined voucher cannot be
-- half spent.
create or replace function public.set_reward_used(p_reward uuid, p_used boolean)
returns timestamptz
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_at timestamptz;
  v_group uuid;
begin
  select voucher_group into v_group from public.rewards
   where id = p_reward and creator_id = auth.uid() and reward_type = 'voucher' and status = 'distributed';
  if not found then
    raise exception 'That voucher is not yours to mark, or it has not been issued yet.';
  end if;
  update public.rewards
     set used_at = case when p_used then coalesce(used_at, now()) else null end,
         used_by = case when p_used then auth.uid() else null end
   where creator_id = auth.uid() and reward_type = 'voucher' and status = 'distributed'
     and (id = p_reward or (v_group is not null and voucher_group = v_group))
  returning used_at into v_at;
  return v_at;
end;
$$;

revoke all on function public.admin_combine_vouchers(uuid[], text, text) from public, anon;
revoke all on function public.admin_set_voucher_code(uuid, text, text) from public, anon;
revoke all on function public.admin_set_voucher_used(uuid, boolean) from public, anon;
revoke all on function public.admin_split_vouchers(uuid) from public, anon;
revoke all on function public.set_reward_used(uuid, boolean) from public, anon;
grant execute on function public.admin_combine_vouchers(uuid[], text, text) to authenticated;
grant execute on function public.admin_set_voucher_code(uuid, text, text) to authenticated;
grant execute on function public.admin_set_voucher_used(uuid, boolean) to authenticated;
grant execute on function public.admin_split_vouchers(uuid) to authenticated;
grant execute on function public.set_reward_used(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. WHICH TEAM LINK SOMEBODY CAME THROUGH
-- ---------------------------------------------------------------------------
-- The applications queue now says "applied to join the Tryp.com team" in words and
-- names the link they used, so the approver can tell which hiring round a person
-- belongs to.
alter table public.profiles
  add column if not exists team_invite_id uuid references public.team_invites(id) on delete set null;

create or replace function public.claim_team_invite(p_token text)
returns boolean
language plpgsql security definer set search_path to 'public'
as $function$
declare v_ok boolean; v_title text; v_invite uuid;
begin
  if auth.uid() is null then return false; end if;
  select valid, role_title into v_ok, v_title from public.team_invite_check(p_token);
  if not coalesce(v_ok, false) then return false; end if;
  select id into v_invite from public.team_invites where token = p_token;

  update public.profiles
     set team_application = true,
         requested_role_title = coalesce(requested_role_title, v_title),
         team_invite_id = coalesce(team_invite_id, v_invite)
   where id = auth.uid();

  update public.team_invites set uses = uses + 1 where token = p_token;
  return true;
end;
$function$;
revoke all on function public.claim_team_invite(text) from public, anon;
grant execute on function public.claim_team_invite(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. TRANSLATED CONTENT, CACHED
-- ---------------------------------------------------------------------------
-- Ethan: briefs should be readable in a creator's own language without a second copy
-- of every challenge. A challenge keeps ONE text - what its author wrote. This table
-- holds what that text says in another language, keyed on a hash of the exact source
-- and the target language. Edit the source and its hash changes, so an old
-- translation can never be shown against words it was not made from.
--   auto        machine-made. A market lead can correct it, which sets auto = false
--               and reviewed_by, and it is then never overwritten.
--   src_lang    the language the source was detected to be in.
--   same        the source was already in the target language: nothing to show.
create table if not exists public.content_translations (
  source_hash text not null,
  locale text not null,
  source text not null,
  value text not null,
  src_lang text,
  same boolean not null default false,
  auto boolean not null default true,
  reviewed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (source_hash, locale)
);
alter table public.content_translations enable row level security;

drop policy if exists "content_translations: signed-in read" on public.content_translations;
create policy "content_translations: signed-in read" on public.content_translations
  for select to authenticated using (true);

-- Who may correct a translation: whoever may edit that language's interface words.
drop policy if exists "content_translations: language managers edit" on public.content_translations;
create policy "content_translations: language managers edit" on public.content_translations
  for update to authenticated
  using (public.can_edit_locale(locale)) with check (public.can_edit_locale(locale));
drop policy if exists "content_translations: language managers delete" on public.content_translations;
create policy "content_translations: language managers delete" on public.content_translations
  for delete to authenticated using (public.can_edit_locale(locale));

create index if not exists content_translations_locale_idx on public.content_translations (locale, updated_at desc);

select public.lock_down_definer_functions();
