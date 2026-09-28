-- 268: THE STORY BEHIND ONE KPI (28 Sep 2026).
--
-- Ethan: "whenever I click on it, it shows a graph of how it was met over time,
-- this target, who's recruited, and everything else."
--
-- `kpi_actuals` (254) answers one number per metric. This answers, for ONE
-- metric in one scope and period, how that number built up day by day and who
-- or what it is made of. Same definitions, word for word, as `kpi_actuals`, so
-- the chart always ends on the number printed on the card:
--
--   challenges_run         challenges starting in the period (the scope's, or all for a network)
--   creators_recruited     memberships of the scope that began in the period, test accounts out
--   creators_participated  distinct creators with an entry in the period
--   views                  views on entries submitted in the period
--
-- Returns jsonb: { series: [{ d, v }], people: [...], challenges: [...] }.
-- `series` is the value landing on each day (the page accumulates it).
-- Admin only, like kpi_actuals. The definer sweep (migration 170) grants it to
-- signed-in users and never to anon; the is_admin() check is the real gate.

create or replace function public.kpi_detail(
  p_community_id uuid, p_year int, p_quarter int, p_month int default null, p_metric text default 'views'
) returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_kind text;
  v_start timestamptz;
  v_end timestamptz;
  v_series jsonb := '[]'::jsonb;
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
  if p_month is not null then
    v_start := make_date(p_year, p_month, 1)::timestamptz;
    v_end := v_start + interval '1 month';
  else
    v_start := make_date(p_year, (p_quarter - 1) * 3 + 1, 1)::timestamptz;
    v_end := v_start + interval '3 months';
  end if;

  if p_metric = 'challenges_run' then
    select coalesce(jsonb_agg(jsonb_build_object('d', d, 'v', n) order by d), '[]'::jsonb) into v_series
    from (
      select c.start_date::date as d, count(*) as n
      from public.challenges c
      where c.start_date >= v_start and c.start_date < v_end
        and (v_kind = 'network' or c.community_id = p_community_id)
      group by 1
    ) x;
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'title', c.title, 'start_date', c.start_date, 'end_date', c.end_date, 'status', c.status,
      'entries', (select count(*) from public.submissions s where s.challenge_id = c.id),
      'views', (select coalesce(sum(s.logged_views), 0) from public.submissions s where s.challenge_id = c.id)
    ) order by c.start_date), '[]'::jsonb) into v_challenges
    from public.challenges c
    where c.start_date >= v_start and c.start_date < v_end
      and (v_kind = 'network' or c.community_id = p_community_id);

  elsif p_metric = 'creators_recruited' then
    select coalesce(jsonb_agg(jsonb_build_object('d', d, 'v', n) order by d), '[]'::jsonb) into v_series
    from (
      select cm.joined_at::date as d, count(*) as n
      from public.community_members cm
      join public.profiles p on p.id = cm.profile_id
      where cm.community_id = p_community_id
        and cm.joined_at >= v_start and cm.joined_at < v_end
        and coalesce(p.is_test, false) = false
      group by 1
    ) x;
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'name', p.name, 'photo_url', p.photo_url, 'at', cm.joined_at
    ) order by cm.joined_at desc), '[]'::jsonb) into v_people
    from public.community_members cm
    join public.profiles p on p.id = cm.profile_id
    where cm.community_id = p_community_id
      and cm.joined_at >= v_start and cm.joined_at < v_end
      and coalesce(p.is_test, false) = false;

  else
    -- participation and views are both read off the period's entries
    if p_metric = 'creators_participated' then
      -- the day each creator FIRST entered in the period, so the line counts people once
      select coalesce(jsonb_agg(jsonb_build_object('d', d, 'v', n) order by d), '[]'::jsonb) into v_series
      from (
        select first_at::date as d, count(*) as n from (
          select s.creator_id, min(s.submitted_at) as first_at
          from public.submissions s
          join public.challenges c on c.id = s.challenge_id
          join public.profiles p on p.id = s.creator_id
          where s.submitted_at >= v_start and s.submitted_at < v_end
            and (v_kind = 'network' or c.community_id = p_community_id)
            and coalesce(p.is_test, false) = false
          group by s.creator_id
        ) f group by 1
      ) x;
    else
      select coalesce(jsonb_agg(jsonb_build_object('d', d, 'v', n) order by d), '[]'::jsonb) into v_series
      from (
        select s.submitted_at::date as d, coalesce(sum(s.logged_views), 0) as n
        from public.submissions s
        join public.challenges c on c.id = s.challenge_id
        join public.profiles p on p.id = s.creator_id
        where s.submitted_at >= v_start and s.submitted_at < v_end
          and (v_kind = 'network' or c.community_id = p_community_id)
          and coalesce(p.is_test, false) = false
        group by 1
      ) x;
    end if;
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'name', name, 'photo_url', photo_url, 'entries', entries, 'views', views, 'at', first_at
    ) order by views desc, entries desc), '[]'::jsonb) into v_people
    from (
      select p.id, p.name, p.photo_url, count(*) as entries, coalesce(sum(s.logged_views), 0) as views, min(s.submitted_at) as first_at
      from public.submissions s
      join public.challenges c on c.id = s.challenge_id
      join public.profiles p on p.id = s.creator_id
      where s.submitted_at >= v_start and s.submitted_at < v_end
        and (v_kind = 'network' or c.community_id = p_community_id)
        and coalesce(p.is_test, false) = false
      group by p.id, p.name, p.photo_url
      limit 200
    ) t;
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'title', title, 'entries', entries, 'views', views
    ) order by views desc), '[]'::jsonb) into v_challenges
    from (
      select c.id, c.title, count(*) as entries, coalesce(sum(s.logged_views), 0) as views
      from public.submissions s
      join public.challenges c on c.id = s.challenge_id
      join public.profiles p on p.id = s.creator_id
      where s.submitted_at >= v_start and s.submitted_at < v_end
        and (v_kind = 'network' or c.community_id = p_community_id)
        and coalesce(p.is_test, false) = false
      group by c.id, c.title
    ) t;
  end if;

  return jsonb_build_object('series', v_series, 'people', v_people, 'challenges', v_challenges,
    'start', v_start, 'end', v_end);
end;
$$;
