-- ============================================================================
-- 181 - the leaderboard carries its views, a bonus can wait for them, and the
--       snapshot cannot go stale.
--
-- APPLIED 3 Sep 2026. Bodies below were read out of the database with
-- pg_get_functiondef before being edited, never retyped from this folder.
--
-- THREE FAULTS, ONE TABLE.
--
-- 1. DRIFT. `results` is a snapshot and nothing rebuilt it automatically. The
--    Spain board printed 15,400 against its leader: that row was written while
--    the challenge scored on a best video's views, the challenge became a
--    POINTS challenge, and nobody re-pressed the button. The ledger was right
--    the whole time - `challenge_standings` said 18 - but the one screen
--    creators read was a month out of date, and it said a number that made the
--    whole points system look broken. Every path that can change a score now
--    ends in a rebuild.
--
-- 2. THE VIEWS VANISHED. On a points board `final_views` holds POINTS, so the
--    podium could show 18 or 28,736 and never both. `results.total_views`
--    carries the view count alongside the score on every board.
--
-- 3. A BONUS COULD NOT WAIT. `point_rules.min_views` holds the bonus back until
--    the entry passes a view count the admin chooses. The claim is kept either
--    way - only the award waits - so the point lands by itself on the sync that
--    gets the video there, and the creator keeps every other point meanwhile.
--
-- VERIFIED IN PRODUCTION, all three:
--   - manual +99 to the last-placed creator moved them 8th -> 1st with no
--     button pressed, and withdrawing it put them back to 8th.
--   - a bonus with min_views 1000 claimed on a 384-view entry paid 0; the
--     entry synced to 1,500 and it paid 5 on its own; corrected back down, it
--     came off again. The per-post point never moved.
--   - the archived UK board rebuilt to the identical eleven rows and order its
--     prizes were paid from (Lisa Burns, Mirsu, Denisa Hadarau).
-- ============================================================================

alter table public.point_rules add column if not exists min_views int;
comment on column public.point_rules.min_views is
  'Claimable bonuses only. The entry must have at least this many logged views before the bonus pays out. Null means it pays as soon as it is claimed. The claim is kept either way - only the award waits.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'point_rules_min_views_check') then
    alter table public.point_rules add constraint point_rules_min_views_check
      check (min_views is null or min_views >= 0);
  end if;
end $$;

alter table public.results add column if not exists total_views int not null default 0;
comment on column public.results.total_views is
  'The creator''s combined logged views for this challenge. Carried on every board regardless of what the board RANKS on.';

-- Identical to 173 except `total_views` is selected alongside the score and
-- written with it. Ranking, group partition and the three scoring branches are
-- untouched.
create or replace function public.rebuild_challenge_results(p_challenge uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_mode      text;
  v_community uuid;
  v_rows      integer;
begin
  select scoring, community_id into v_mode, v_community
  from public.challenges where id = p_challenge;

  if v_mode is null then
    return 0;
  end if;

  with scored as (
    select
      s.creator_id,
      gm.group_id,
      case
        when v_mode = 'points' then
          round(coalesce((
            select sum(a.points) from public.point_awards a
             where a.challenge_id = p_challenge and a.creator_id = s.creator_id
          ), 0))
        when v_mode = 'total_views' then sum(coalesce(s.logged_views, 0))
        else max(coalesce(s.logged_views, 0))
      end::integer as score,
      -- ALWAYS the sum, on every board. On a total_views board this is the same
      -- number as the score, which is correct and not a duplication: the score
      -- is what ranks, this is what it means.
      sum(coalesce(s.logged_views, 0))::integer as total_views
    from public.submissions s
    left join public.challenge_group_members gm
      on gm.challenge_id = p_challenge and gm.creator_id = s.creator_id
    where s.challenge_id = p_challenge
      and (v_mode = 'points' or s.logged_views is not null)
    group by s.creator_id, gm.group_id
  ),
  ranked as (
    select creator_id, group_id, score, total_views,
           row_number() over (partition by group_id order by score desc, creator_id) as rank
    from scored
  ),
  wiped as (
    delete from public.results where challenge_id = p_challenge returning 1
  ),
  inserted as (
    insert into public.results (challenge_id, creator_id, final_views, total_views, rank, community_id, group_id)
    select p_challenge, r.creator_id, r.score, r.total_views, r.rank::integer, v_community, r.group_id
    from ranked r
    where (select count(*) from wiped) >= 0
    returning 1
  )
  select count(*) into v_rows from inserted;

  update public.challenges
     set results_updated_at = now(),
         results_status = case when results_status = 'none' then 'interim' else results_status end
   where id = p_challenge;

  return coalesce(v_rows, 0);
end;
$function$;

-- Two changes against the deployed body: the claimable-bonus insert joins the
-- submission so it can honour `min_views`, and the whole thing ends by
-- refreshing the board it just changed.
create or replace function public.recalc_challenge_points_internal(p_challenge uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_community uuid;
  v_mode      text;
  v_scoring   text;
begin
  select community_id, threshold_mode, scoring
    into v_community, v_mode, v_scoring
  from public.challenges where id = p_challenge;
  if v_community is null then return; end if;

  delete from public.point_awards where challenge_id = p_challenge and is_auto;

  insert into public.point_awards (community_id, challenge_id, creator_id, rule_id, points, reason, is_auto)
  select v_community, p_challenge, s.creator_id, r.id,
         least(count(s.id) * r.points, coalesce(r.max_points, count(s.id) * r.points)),
         r.label, true
  from public.point_rules r
  join public.submissions s on s.challenge_id = p_challenge
  where r.challenge_id = p_challenge and r.kind = 'per_post' and r.is_active
  group by v_community, s.creator_id, r.id, r.points, r.max_points, r.label
  having least(count(s.id) * r.points, coalesce(r.max_points, count(s.id) * r.points)) > 0;

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

  -- CLAIMED BONUSES, NOW GATED ON THE VIEW COUNT.
  -- The join to `submissions` is the only structural change: a claim whose
  -- entry has not reached `min_views` yet produces no row this pass, and
  -- produces one on the pass after the sync that gets it there. A null
  -- `min_views` compares against 0 and so behaves exactly as before.
  insert into public.point_awards (community_id, challenge_id, creator_id, rule_id, submission_id, points, reason, is_auto)
  select v_community, p_challenge, c.creator_id, r.id, c.submission_id, r.points, r.label, true
  from public.submission_bonus_claims c
  join public.point_rules r on r.id = c.rule_id
  join public.submissions s on s.id = c.submission_id
  where c.challenge_id = p_challenge
    and r.challenge_id = p_challenge
    and r.kind = 'bonus'
    and r.is_active
    and r.prompt is not null
    and coalesce(s.logged_views, 0) >= coalesce(r.min_views, 0);

  -- THE BOARD FOLLOWS THE LEDGER, ALWAYS. Without this the standings were
  -- correct and the leaderboard was whatever it happened to be when somebody
  -- last pressed a button.
  if v_scoring = 'points' then
    perform public.rebuild_challenge_results(p_challenge);
  end if;
end $function$;

-- A RULE EDIT IS A SCORING CHANGE TOO. Editing a rule's points, threshold or
-- min_views mid-challenge had no effect until the next submission happened to
-- touch the challenge. Deleting one already took its awards with it (139).
create or replace function public.trg_recalc_points_for_rule()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_challenge uuid;
begin
  v_challenge := coalesce(new.challenge_id, old.challenge_id);
  if v_challenge is null then return coalesce(new, old); end if;
  if exists (select 1 from public.challenges where id = v_challenge and scoring = 'points') then
    perform public.recalc_challenge_points_internal(v_challenge);
  end if;
  return coalesce(new, old);
end;
$function$;

drop trigger if exists trg_points_on_rule_change on public.point_rules;
create trigger trg_points_on_rule_change
  after insert or update on public.point_rules
  for each row execute function public.trg_recalc_points_for_rule();

-- A HAND-GIVEN BONUS REACHES THE BOARD TOO. Auto awards arrive through recalc,
-- which now ends in a rebuild; a MANUAL award is written straight into the
-- ledger by an admin and had no path to the board at all. Guarded on `is_auto`
-- so recalc's own churn does not rebuild the board a dozen times per pass.
create or replace function public.trg_results_follow_manual_award()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_challenge uuid;
begin
  if coalesce(new.is_auto, old.is_auto, true) then return coalesce(new, old); end if;
  v_challenge := coalesce(new.challenge_id, old.challenge_id);
  if v_challenge is null then return coalesce(new, old); end if;
  if exists (select 1 from public.challenges where id = v_challenge and scoring = 'points') then
    perform public.rebuild_challenge_results(v_challenge);
  end if;
  return coalesce(new, old);
end;
$function$;

drop trigger if exists trg_results_follow_manual_award on public.point_awards;
create trigger trg_results_follow_manual_award
  after insert or update or delete on public.point_awards
  for each row execute function public.trg_results_follow_manual_award();

revoke all on function public.trg_recalc_points_for_rule() from public, anon, authenticated;
revoke all on function public.trg_results_follow_manual_award() from public, anon, authenticated;

-- Backfill: every existing board rebuilt once so `total_views` is populated.
-- select id, public.rebuild_challenge_results(id) from public.challenges;
