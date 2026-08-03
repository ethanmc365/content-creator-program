-- 069: programme analytics.
--
-- The programme has been tracked in a spreadsheet whose real value is the
-- ECONOMICS of each challenge: what the prize pot bought, in views, posts and
-- creators. The platform held none of that - `challenges` had no market, no
-- numeric prize (only a prize_structure jsonb of "£105 cash" strings), no
-- format and no objective - so none of those numbers could be derived.
--
-- This adds the missing dimensions, then three admin RPCs that do the counting
-- in the database rather than shipping every submission to the browser.

-- ------------------------------------------------------- challenge economics
alter table public.challenges add column if not exists market text;
alter table public.challenges add column if not exists format text default 'monthly';
alter table public.challenges add column if not exists audience text default 'general';
-- The TOTAL pot, not per winner. Kept alongside prize_structure rather than
-- replacing it: the structure is what creators read, this is what finance needs.
alter table public.challenges add column if not exists prize_amount numeric(10,2);
alter table public.challenges add column if not exists prize_currency text default 'GBP';
alter table public.challenges add column if not exists winners_count int;
alter table public.challenges add column if not exists prize_type text;
alter table public.challenges add column if not exists content_type text;
alter table public.challenges add column if not exists objective text default 'views';
-- Per-challenge CPM target, so a market or a format can be judged on its own
-- terms instead of one global number.
alter table public.challenges add column if not exists cpm_target numeric(10,2) default 0.50;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'challenges_format_check') then
    alter table public.challenges add constraint challenges_format_check
      check (format is null or format in ('monthly', 'express', 'always_on'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'challenges_audience_check') then
    alter table public.challenges add constraint challenges_audience_check
      check (audience is null or audience in ('general', 'ugc', 'vip'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'challenges_currency_check') then
    alter table public.challenges add constraint challenges_currency_check
      check (prize_currency is null or prize_currency in ('GBP', 'EUR', 'USD'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'challenges_prize_type_check') then
    alter table public.challenges add constraint challenges_prize_type_check
      check (prize_type is null or prize_type in ('cash', 'voucher', 'cash_voucher', 'product', 'other'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'challenges_content_type_check') then
    alter table public.challenges add constraint challenges_content_type_check
      check (content_type is null or content_type in ('free', 'suggested', 'talking', 'hooks', 'other'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'challenges_objective_check') then
    alter table public.challenges add constraint challenges_objective_check
      check (objective is null or objective in ('views', 'videos', 'creativity', 'trust'));
  end if;
end $$;

-- Backfill the pot for challenges created before these columns existed, by
-- summing the currency amounts already written into prize_structure
-- (e.g. [{"place":"1st","prize":"£105 cash"}] -> 105). Only fills nulls, so it
-- can be re-run and never overwrites a figure an admin has typed.
update public.challenges c
set prize_amount = sub.total,
    winners_count = coalesce(c.winners_count, sub.places),
    prize_currency = coalesce(c.prize_currency,
      case when sub.sample like '%£%' then 'GBP'
           when sub.sample like '%$%' then 'USD'
           else 'EUR' end)
from (
  select c2.id,
         sum(coalesce(nullif(regexp_replace(p ->> 'prize', '[^0-9.]', '', 'g'), ''), '0')::numeric) as total,
         count(*) as places,
         string_agg(p ->> 'prize', ' ') as sample
  from public.challenges c2,
       lateral jsonb_array_elements(coalesce(c2.prize_structure, '[]'::jsonb)) p
  group by c2.id
) sub
where sub.id = c.id
  and c.prize_amount is null
  and sub.total > 0;

create index if not exists challenges_market_idx on public.challenges (market);

-- ------------------------------------------------- per-challenge performance
-- One row per challenge with the raw counts behind every derived metric. Ratios
-- (CPM, cost per post, views per creator) are left to the caller so it can
-- convert currencies and format in one place.
create or replace function public.admin_challenge_metrics()
returns table (
  id uuid,
  title text,
  market text,
  format text,
  audience text,
  status text,
  objective text,
  content_type text,
  prize_type text,
  start_date timestamptz,
  end_date timestamptz,
  days int,
  prize_amount numeric,
  prize_currency text,
  winners_count int,
  cpm_target numeric,
  total_views bigint,
  posts bigint,
  creators bigint,
  posts_with_views bigint,
  median_views numeric,
  best_views int
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  return query
    select
      c.id, c.title, c.market, c.format, c.audience, c.status, c.objective,
      c.content_type, c.prize_type, c.start_date, c.end_date,
      greatest(1, (c.end_date::date - c.start_date::date))::int as days,
      c.prize_amount, c.prize_currency, c.winners_count, c.cpm_target,
      coalesce(sum(s.logged_views), 0)::bigint as total_views,
      count(s.id)::bigint as posts,
      count(distinct s.creator_id)::bigint as creators,
      count(s.id) filter (where s.logged_views is not null)::bigint as posts_with_views,
      -- Median alongside the mean: one viral video drags an average badly, and a
      -- pitch deck that only shows means invites exactly that question.
      percentile_cont(0.5) within group (order by s.logged_views)
        filter (where s.logged_views is not null) as median_views,
      coalesce(max(s.logged_views), 0)::int as best_views
    from public.challenges c
    left join public.submissions s on s.challenge_id = c.id
    where c.status <> 'draft'
    group by c.id
    order by c.start_date desc;
end;
$$;

revoke all on function public.admin_challenge_metrics() from public, anon;
grant execute on function public.admin_challenge_metrics() to authenticated;

-- ------------------------------------------------------------ push adoption
-- push_subscriptions is owner-scoped by RLS (correct: nobody should read anyone
-- else's endpoints), so admins need a definer function to see the ROLL-UP. This
-- deliberately returns counts and names only, never an endpoint or a key.
create or replace function public.admin_push_adoption()
returns table (
  creator_id uuid,
  name text,
  is_admin boolean,
  devices bigint,
  first_enabled timestamptz,
  chat_push_on boolean,
  last_seen_at timestamptz
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  return query
    select
      p.id, p.name, p.is_admin,
      count(ps.id)::bigint as devices,
      min(ps.created_at) as first_enabled,
      coalesce((p.notif_prefs ->> 'chat')::boolean, true) as chat_push_on,
      p.last_seen_at
    from public.profiles p
    left join public.push_subscriptions ps on ps.user_id = p.id
    where p.status in ('active', 'muted')
      and not coalesce(p.is_test, false)
      and p.deletion_requested_at is null
    group by p.id
    order by count(ps.id) desc, p.name;
end;
$$;

revoke all on function public.admin_push_adoption() from public, anon;
grant execute on function public.admin_push_adoption() to authenticated;

-- -------------------------------------------------------- community activity
-- Weekly snapshots of the things the spreadsheet tracked by hand (community
-- size) plus the activity that shows whether the place is actually being used.
-- Derived from timestamps already in the tables, so there is nothing to keep
-- up to date and no way for it to drift.
create or replace function public.admin_weekly_activity(p_weeks int default 26)
returns table (
  week_start date,
  members int,
  joined int,
  posts int,
  chat_messages int,
  dms int,
  connections int,
  active_creators int
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  return query
    with weeks as (
      select generate_series(
        date_trunc('week', now())::date - ((p_weeks - 1) * 7),
        date_trunc('week', now())::date,
        '7 days'::interval
      )::date as week_start
    )
    select
      w.week_start,
      -- Cumulative: everyone accepted on or before the end of that week and not
      -- since deleted. This replaces the manual weekly member count.
      (select count(*)::int from public.profiles p
        where p.status in ('active', 'muted')
          and not coalesce(p.is_test, false)
          and coalesce(p.accepted_at, p.created_at)::date < w.week_start + 7)                    as members,
      (select count(*)::int from public.profiles p
        where p.status in ('active', 'muted')
          and not coalesce(p.is_test, false)
          and coalesce(p.accepted_at, p.created_at)::date >= w.week_start
          and coalesce(p.accepted_at, p.created_at)::date < w.week_start + 7)                    as joined,
      (select count(*)::int from public.submissions s
        where s.submitted_at::date >= w.week_start and s.submitted_at::date < w.week_start + 7)  as posts,
      (select count(*)::int from public.messages m
        where m.created_at::date >= w.week_start and m.created_at::date < w.week_start + 7
          and not coalesce(m.deleted, false))                                                    as chat_messages,
      (select count(*)::int from public.direct_messages d
        where d.created_at::date >= w.week_start and d.created_at::date < w.week_start + 7)      as dms,
      (select count(*)::int from public.connections cn
        where cn.status = 'accepted'
          and cn.created_at::date >= w.week_start and cn.created_at::date < w.week_start + 7)    as connections,
      -- Anyone who did something visible that week: posted, chatted or DMed.
      (select count(distinct x.uid)::int from (
          select s.creator_id as uid from public.submissions s
            where s.submitted_at::date >= w.week_start and s.submitted_at::date < w.week_start + 7
          union
          select m.sender_id from public.messages m
            where m.created_at::date >= w.week_start and m.created_at::date < w.week_start + 7
          union
          select d.sender_id from public.direct_messages d
            where d.created_at::date >= w.week_start and d.created_at::date < w.week_start + 7
        ) x)                                                                                     as active_creators
    from weeks w
    order by w.week_start;
end;
$$;

revoke all on function public.admin_weekly_activity(int) from public, anon;
grant execute on function public.admin_weekly_activity(int) to authenticated;

-- --------------------------------------------------------- creator scorecard
-- Per-creator participation, for spotting who carries the programme and who
-- joined and never posted. The funnel that matters for a pitch is: joined ->
-- posted once -> posted again.
create or replace function public.admin_creator_scorecard()
returns table (
  creator_id uuid,
  name text,
  country text,
  joined_at timestamptz,
  last_seen_at timestamptz,
  challenges_entered bigint,
  posts bigint,
  total_views bigint,
  first_post_at timestamptz,
  days_to_first_post int,
  chat_messages bigint,
  connections bigint,
  has_push boolean
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  return query
    select
      p.id, p.name, p.country,
      coalesce(p.accepted_at, p.created_at) as joined_at,
      p.last_seen_at,
      (select count(distinct s.challenge_id) from public.submissions s where s.creator_id = p.id)::bigint,
      (select count(*) from public.submissions s where s.creator_id = p.id)::bigint,
      (select coalesce(sum(s.logged_views), 0) from public.submissions s where s.creator_id = p.id)::bigint,
      (select min(s.submitted_at) from public.submissions s where s.creator_id = p.id),
      (select (min(s.submitted_at)::date - coalesce(p.accepted_at, p.created_at)::date)::int
         from public.submissions s where s.creator_id = p.id),
      (select count(*) from public.messages m where m.sender_id = p.id and not coalesce(m.deleted, false))::bigint,
      (select count(*) from public.connections cn
        where cn.status = 'accepted' and (cn.creator_id = p.id or cn.connected_creator_id = p.id))::bigint,
      exists (select 1 from public.push_subscriptions ps where ps.user_id = p.id)
    from public.profiles p
    where p.status in ('active', 'muted')
      and not coalesce(p.is_test, false)
      and not p.is_admin
      and p.deletion_requested_at is null
    order by p.name;
end;
$$;

revoke all on function public.admin_creator_scorecard() from public, anon;
grant execute on function public.admin_creator_scorecard() to authenticated;
