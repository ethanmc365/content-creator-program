-- 254: THE KPI TRACKER.
--
-- Ethan: "for each quarter, the admins will set KPIs... in reference to the
-- number of challenges run, the number of creators recruited, the number of
-- creators who participated, the number of views... plus some other random
-- KPIs... I want a really clean UI so we can compare them at the end and see
-- the progress. Are we on track? Are we off track?... I think all the admins
-- should have access to all the market KPIs and see everything, but only
-- admins can edit the KPIs of the markets they're leading."
--
-- ONE TABLE HOLDS WHAT AN ADMIN SETS, NOT WHAT IS TRUE. A target is a plan:
-- "200 views this quarter". Whether that plan is being met is either read
-- LIVE off the tables that already exist (challenges, submissions,
-- community_members) or, for a KPI nothing on the platform can count, typed
-- in by hand. Storing "how many views so far" as a column that has to be
-- kept in sync would drift the moment a view-sync run changed a number this
-- table did not know to re-read - the same trap `results.final_views` was
-- built to avoid. So `current_value` exists ONLY for a manual KPI; an
-- automated one is never stored, only computed, by `kpi_actuals` below.
--
-- WORLDWIDE IS NOT A FIFTH SCOPE BOLTED ON. `communities` already has the
-- Worldwide row every creator belongs to (kind = 'network') sitting beside
-- the market chapters - see [[tryp-global-network]], "Global challenge = a
-- challenge whose community_id is the Worldwide row". A worldwide KPI is
-- simply a `kpi_targets` row whose `community_id` is that row, and
-- `kpi_actuals` reads it as "every market, summed" rather than "just this
-- one" - see the branch on `v_kind = 'network'` below. That is what makes a
-- worldwide "creators recruited" total correct without a second code path:
-- everyone gets a Worldwide `community_members` row the day they join, so
-- counting joins into THAT row is already the whole platform's recruitment
-- number. Challenges, participants and views are not automatically
-- worldwide-shaped the same way (a market challenge's `community_id` is that
-- market, never Worldwide's), so those three explicitly widen to every
-- community when the scope itself is Worldwide.
--
-- PERMISSION REUSES WHAT ALREADY EXISTS. `is_admin()` (any admin, market or
-- global) may READ every scope's KPIs - Ethan asked for that explicitly, so a
-- Spain lead can see how Germany is doing without asking. `my_managed_scopes()`
-- (migration 074: every community for a global admin, otherwise the chapters
-- you manage) is exactly "the markets I am leading", so it is reused rather
-- than reinvented for INSERT/UPDATE/DELETE.

create table public.kpi_targets (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  year int not null check (year between 2020 and 2100),
  quarter int not null check (quarter between 1 and 4),
  -- 'challenges_run' | 'creators_recruited' | 'creators_participated' |
  -- 'views' are the four standard, automated metrics `kpi_actuals` knows how
  -- to read live. 'custom' is anything else an admin wants to track by hand -
  -- Ethan's "some other random KPIs I'm not sure about" - and its `label` IS
  -- the metric, since nothing on the platform knows what it means.
  metric text not null check (metric in ('challenges_run', 'creators_recruited', 'creators_participated', 'views', 'custom')),
  label text not null,
  target_value numeric not null check (target_value >= 0),
  is_automated boolean not null default false,
  -- Only meaningful when NOT automated. Never read for a standard metric -
  -- `kpi_actuals` is the only source of truth for those four.
  current_value numeric,
  notes text,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One row per (scope, quarter, metric) for a standard metric; `label`
  -- widens that to allow several differently-named custom KPIs in the same
  -- quarter without colliding.
  unique (community_id, year, quarter, metric, label)
);

comment on table public.kpi_targets is
  'Quarterly KPI targets an admin sets for a market or for Worldwide. Actual progress on the four standard metrics is never stored here - see kpi_actuals().';

alter table public.kpi_targets enable row level security;

create policy "kpi_targets: any admin can read" on public.kpi_targets
  for select using (public.is_admin());

create policy "kpi_targets: managers can insert into their scopes" on public.kpi_targets
  for insert
  with check (
    community_id in (select public.my_managed_scopes())
    and created_by = auth.uid()
  );

create policy "kpi_targets: managers can update their scopes" on public.kpi_targets
  for update
  using (community_id in (select public.my_managed_scopes()))
  with check (community_id in (select public.my_managed_scopes()));

create policy "kpi_targets: managers can delete in their scopes" on public.kpi_targets
  for delete
  using (community_id in (select public.my_managed_scopes()));

create or replace function public.kpi_targets_touch()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

create trigger kpi_targets_touch
  before update on public.kpi_targets
  for each row execute function public.kpi_targets_touch();

-- ---------------------------------------------------------------- actuals

-- THE LIVE NUMBER BEHIND EACH STANDARD METRIC, FOR ONE SCOPE AND ONE
-- QUARTER. Returns all four every time (a target for only one of them is
-- common; the caller filters). `security definer` because a market manager
-- reading Germany's KPIs has no RLS right to read Germany's raw submissions
-- or roster directly - the whole point of this function is to answer the
-- one question ("how many") without handing over the rows behind it - so it
-- checks admin-ness itself rather than relying on the tables underneath.
create or replace function public.kpi_actuals(p_community_id uuid, p_year int, p_quarter int)
returns table(metric text, value numeric)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_kind text;
  v_start timestamptz;
  v_end timestamptz;
begin
  if not public.is_admin() then
    raise exception 'Not authorised.';
  end if;
  if p_quarter < 1 or p_quarter > 4 then
    raise exception 'Quarter must be 1-4.';
  end if;

  select kind into v_kind from public.communities where id = p_community_id;
  if v_kind is null then
    raise exception 'No such community.';
  end if;

  v_start := make_date(p_year, (p_quarter - 1) * 3 + 1, 1)::timestamptz;
  v_end := v_start + interval '3 months';

  return query
  select 'challenges_run'::text, count(*)::numeric
  from public.challenges c
  where c.start_date >= v_start and c.start_date < v_end
    and (v_kind = 'network' or c.community_id = p_community_id)
  union all
  select 'creators_recruited'::text, count(*)::numeric
  from public.community_members cm
  join public.profiles p on p.id = cm.profile_id
  where cm.community_id = p_community_id
    and cm.joined_at >= v_start and cm.joined_at < v_end
    and coalesce(p.is_test, false) = false
  union all
  select 'creators_participated'::text, count(distinct s.creator_id)::numeric
  from public.submissions s
  join public.challenges c on c.id = s.challenge_id
  join public.profiles p on p.id = s.creator_id
  where s.submitted_at >= v_start and s.submitted_at < v_end
    and (v_kind = 'network' or c.community_id = p_community_id)
    and coalesce(p.is_test, false) = false
  union all
  select 'views'::text, coalesce(sum(s.logged_views), 0)::numeric
  from public.submissions s
  join public.challenges c on c.id = s.challenge_id
  join public.profiles p on p.id = s.creator_id
  where s.submitted_at >= v_start and s.submitted_at < v_end
    and (v_kind = 'network' or c.community_id = p_community_id)
    and coalesce(p.is_test, false) = false;
end;
$$;

comment on function public.kpi_actuals(uuid, int, int) is
  'Live counts for the four standard KPI metrics, for one scope and one calendar quarter. Worldwide widens challenges/participants/views to every market; creators_recruited never needs to, because everyone gets a Worldwide community_members row the day they join.';

revoke all on function public.kpi_actuals(uuid, int, int) from public;
grant execute on function public.kpi_actuals(uuid, int, int) to authenticated;
