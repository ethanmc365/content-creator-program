-- 258: KPIs FOR A MONTH AS WELL AS A QUARTER (24 Sep 2026)
--
-- Ethan: "Currently we just have quarterly tracking, but you can also build in
-- tracking for each month, like KPIs for September, October, or the quarter."
--
-- A monthly target is a kpi_targets row with `month` set (1-12); `quarter`
-- still holds the quarter that month falls in, so every existing query that
-- reads a quarter keeps working and a CHECK stops the two disagreeing. A
-- quarterly target is `month is null`, exactly as every row was before.
-- Uniqueness now includes the month, so "Views, September" and "Views, Q3"
-- can both exist.
--
-- kpi_actuals gains an optional p_month: given, it counts that calendar month;
-- omitted, the quarter as before (so the old three-argument call is unchanged).

alter table public.kpi_targets add column if not exists month int;
alter table public.kpi_targets drop constraint if exists kpi_targets_month_check;
alter table public.kpi_targets add constraint kpi_targets_month_check
  check (month is null or (month between 1 and 12 and ((month - 1) / 3) + 1 = quarter));

alter table public.kpi_targets drop constraint if exists kpi_targets_community_id_year_quarter_metric_label_key;
create unique index if not exists kpi_targets_period_metric_key
  on public.kpi_targets (community_id, year, quarter, coalesce(month, 0), metric, label);

drop function if exists public.kpi_actuals(uuid, int, int);

CREATE OR REPLACE FUNCTION public.kpi_actuals(p_community_id uuid, p_year integer, p_quarter integer, p_month integer DEFAULT NULL::integer)
 RETURNS TABLE(metric text, value numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

revoke all on function public.kpi_actuals(uuid, int, int, int) from public;
grant execute on function public.kpi_actuals(uuid, int, int, int) to authenticated;
