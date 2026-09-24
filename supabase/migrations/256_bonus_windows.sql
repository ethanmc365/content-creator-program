-- 256: A BONUS CAN RUN FOR PART OF A CHALLENGE (24 Sep 2026)
--
-- Ethan: "I sent an announcement saying [the bonus] is only active until
-- Sunday. The problem is there's no way with the bonus points to actually
-- settle them... I should have the ability to set the start date and the end
-- date for the bonus point, so I could set this up so that there's a different
-- bonus point every week. Currently the only way to stop it would be deleting
-- it, which would lose the points for people."
--
-- Deleting a rule cascades its claims (and trg_point_rule_takes_its_awards
-- takes the awards), so "stop this bonus on Sunday" had no answer that kept
-- what people had already earned. Now:
--
--   starts_at / ends_at   null = open at that end (the whole challenge).
--   The window is judged on the ENTRY'S submitted_at, the moment the creator
--   ticks the box, so what the submit form offers and what scores agree.
--   Ending a bonus hides the tick box and stops new entries counting; every
--   entry submitted inside the window keeps its points.
--
-- trg_points_on_rule_change already rescores on UPDATE, so moving a window
-- mid-challenge lands through the one path that keeps the ledger honest.

alter table public.point_rules
  add column if not exists starts_at timestamptz,
  add column if not exists ends_at timestamptz;

alter table public.point_rules drop constraint if exists point_rules_window_order;
alter table public.point_rules add constraint point_rules_window_order
  check (starts_at is null or ends_at is null or ends_at > starts_at);

comment on column public.point_rules.starts_at is 'Bonus only: entries submitted before this do not earn it. Null = from the challenge start.';
comment on column public.point_rules.ends_at is 'Bonus only: entries submitted after this do not earn it. Null = until the deadline.';

-- The creator's own claim: only on an entry submitted inside the window.
drop policy if exists submission_bonus_claims_own on public.submission_bonus_claims;
create policy submission_bonus_claims_own on public.submission_bonus_claims
  for insert to authenticated
  with check (
    creator_id = (select auth.uid())
    and exists (
      select 1
        from public.submissions s
        join public.point_rules r on r.id = submission_bonus_claims.rule_id
        join public.challenges c on c.id = s.challenge_id
       where s.id = submission_bonus_claims.submission_id
         and s.creator_id = (select auth.uid())
         and s.challenge_id = submission_bonus_claims.challenge_id
         and r.challenge_id = s.challenge_id
         and r.kind = 'bonus'
         and r.is_active
         and nullif(btrim(coalesce(r.prompt, '')), '') is not null
         and c.status = 'active'
         and (r.starts_at is null or s.submitted_at >= r.starts_at)
         and (r.ends_at is null or s.submitted_at <= r.ends_at)
    )
  );

CREATE OR REPLACE FUNCTION public.recalc_challenge_points_internal(p_challenge uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_community uuid;
  v_mode      text;
  v_scoring   text;
  v_start     timestamptz;
  v_end       timestamptz;
begin
  select community_id, threshold_mode, scoring, start_date, end_date
    into v_community, v_mode, v_scoring, v_start, v_end
  from public.challenges where id = p_challenge;
  if v_community is null then return; end if;

  delete from public.point_awards where challenge_id = p_challenge and is_auto;

  -- Per video posted, capped.
  insert into public.point_awards (community_id, challenge_id, creator_id, rule_id, points, reason, is_auto)
  select v_community, p_challenge, s.creator_id, r.id,
         least(count(s.id) * r.points, coalesce(r.max_points, count(s.id) * r.points)),
         r.label, true
  from public.point_rules r
  join public.submissions s on s.challenge_id = p_challenge
  where r.challenge_id = p_challenge and r.kind = 'per_post' and r.is_active
  group by v_community, s.creator_id, r.id, r.points, r.max_points, r.label
  having least(count(s.id) * r.points, coalesce(r.max_points, count(s.id) * r.points)) > 0;

  -- View milestones, per video.
  if v_mode = 'cumulative' then
    insert into public.point_awards (community_id, challenge_id, creator_id, rule_id, submission_id, points, reason, is_auto)
    select v_community, p_challenge, s.creator_id, r.id, s.id, r.points, r.label, true
    from public.submissions s
    join public.point_rules r
      on r.challenge_id = p_challenge and r.kind = 'views_threshold' and r.is_active
     and coalesce(s.logged_views, 0) >= r.threshold
    where s.challenge_id = p_challenge;
  else
    insert into public.point_awards (community_id, challenge_id, creator_id, rule_id, submission_id, points, reason, is_auto)
    select community_id, challenge_id, creator_id, rule_id, submission_id, points, label, true
    from (
      select v_community as community_id, p_challenge as challenge_id, s.creator_id,
             r.id as rule_id, s.id as submission_id, r.points, r.label,
             row_number() over (partition by s.id order by r.threshold desc) as rn
      from public.submissions s
      join public.point_rules r
        on r.challenge_id = p_challenge and r.kind = 'views_threshold' and r.is_active
       and coalesce(s.logged_views, 0) >= r.threshold
      where s.challenge_id = p_challenge
    ) ranked
    where rn = 1;
  end if;

  -- Total-views milestones, per creator.
  if v_mode = 'cumulative' then
    insert into public.point_awards (community_id, challenge_id, creator_id, rule_id, points, reason, is_auto)
    select v_community, p_challenge, t.creator_id, r.id, r.points, r.label, true
    from (
      select s.creator_id, coalesce(sum(s.logged_views), 0) as views
      from public.submissions s where s.challenge_id = p_challenge
      group by s.creator_id
    ) t
    join public.point_rules r
      on r.challenge_id = p_challenge and r.kind = 'total_views_threshold' and r.is_active
     and t.views >= r.threshold;
  else
    insert into public.point_awards (community_id, challenge_id, creator_id, rule_id, points, reason, is_auto)
    select community_id, challenge_id, creator_id, rule_id, points, label, true
    from (
      select v_community as community_id, p_challenge as challenge_id, t.creator_id,
             r.id as rule_id, r.points, r.label,
             row_number() over (partition by t.creator_id order by r.threshold desc) as rn
      from (
        select s.creator_id, coalesce(sum(s.logged_views), 0) as views
        from public.submissions s where s.challenge_id = p_challenge
        group by s.creator_id
      ) t
      join public.point_rules r
        on r.challenge_id = p_challenge and r.kind = 'total_views_threshold' and r.is_active
       and t.views >= r.threshold
    ) ranked
    where rn = 1;
  end if;

  -- Per platform posted on, capped.
  insert into public.point_awards (community_id, challenge_id, creator_id, rule_id, points, reason, is_auto)
  select v_community, p_challenge, s.creator_id, r.id,
         least(count(distinct s.platform) * r.points,
               coalesce(r.max_points, count(distinct s.platform) * r.points)),
         r.label, true
  from public.point_rules r
  join public.submissions s on s.challenge_id = p_challenge
  where r.challenge_id = p_challenge and r.kind = 'platform_spread' and r.is_active
    and coalesce(s.platform, '') <> ''
  group by v_community, s.creator_id, r.id, r.points, r.max_points, r.label
  having least(count(distinct s.platform) * r.points,
               coalesce(r.max_points, count(distinct s.platform) * r.points)) > 0;

  -- BONUSES: every claim, whoever made it (the creator's tick box or an admin
  -- on their behalf), gated on the entry's views and capped per creator per
  -- rule in submission order. A legacy hand-given award for the same rule
  -- counts towards the cap first.
  insert into public.point_awards (community_id, challenge_id, creator_id, rule_id, submission_id, points, reason, is_auto)
  select v_community, p_challenge, q.creator_id, q.rule_id, q.submission_id, q.award, q.label, true
  from (
    select b.*,
           case
             when b.max_points is null then b.points
             else greatest(0, least(b.points, b.max_points - b.manual - coalesce(b.prior, 0)))
           end as award
    from (
      select c.creator_id, r.id as rule_id, c.submission_id, r.label, r.points, r.max_points,
             coalesce((
               select sum(a.points) from public.point_awards a
                where a.challenge_id = p_challenge and a.rule_id = r.id
                  and a.creator_id = c.creator_id and not a.is_auto
             ), 0) as manual,
             sum(r.points) over (
               partition by c.creator_id, r.id
               order by s.submitted_at, s.id
               rows between unbounded preceding and 1 preceding
             ) as prior
        from public.submission_bonus_claims c
        join public.point_rules r on r.id = c.rule_id
        join public.submissions s on s.id = c.submission_id
       where c.challenge_id = p_challenge
         and s.challenge_id = p_challenge
         and r.challenge_id = p_challenge
         and r.kind = 'bonus'
         and r.is_active
         and coalesce(s.logged_views, 0) >= coalesce(r.min_views, 0)
         -- 256: a bonus can run for part of the challenge. It counts for the
         -- entries SUBMITTED inside its window; ending it keeps every point
         -- already earned inside it.
         and (r.starts_at is null or s.submitted_at >= r.starts_at)
         and (r.ends_at is null or s.submitted_at <= r.ends_at)
    ) b
  ) q
  where q.award > 0;

  -- CONSISTENCY: an entry in every window between the start and the deadline.
  -- An entry outside the range (published early, or in the minutes before the
  -- archive cron) is counted in the nearest window rather than dropped.
  if v_start is not null and v_end is not null and v_end > v_start then
    insert into public.point_awards (community_id, challenge_id, creator_id, rule_id, points, reason, is_auto)
    select v_community, p_challenge, t.creator_id, r.id, r.points, r.label, true
    from public.point_rules r
    cross join lateral (
      select greatest(1, ceil(extract(epoch from (v_end - v_start)) / (r.period_days * 86400.0)))::int as n
    ) np
    join lateral (
      select s.creator_id,
             count(distinct least(greatest(
               floor(extract(epoch from (s.submitted_at - v_start)) / (r.period_days * 86400.0))::int, 0), np.n - 1)) as covered
        from public.submissions s
       where s.challenge_id = p_challenge
       group by s.creator_id
    ) t on t.covered >= np.n
    where r.challenge_id = p_challenge and r.kind = 'consistency' and r.is_active
      and coalesce(r.period_days, 0) > 0 and r.points > 0;
  end if;

  if v_scoring = 'points' then
    perform public.rebuild_challenge_results(p_challenge);
  end if;
end $function$;
