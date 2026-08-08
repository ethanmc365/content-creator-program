-- 081: stop anonymous callers rewriting the point ledger.
--
-- Found while wiring the challenge form to call it. `recalc_challenge_points`
-- was created in 076 without a grant statement, which in Postgres means it
-- keeps the default: EXECUTE to PUBLIC. Supabase exposes every public function
-- over PostgREST, so the actual reachable surface was:
--
--   curl -X POST .../rpc/recalc_challenge_points -d '{"p_challenge":"<uuid>"}'
--
-- with the anon key and no session. The function is SECURITY DEFINER, so it
-- runs as the owner and RLS does not apply inside it. It returns void and leaks
-- nothing, but it DELETES every automatic award for a challenge and rebuilds
-- them, so anyone who could guess or read a challenge id could wipe a live
-- leaderboard, repeatedly.
--
-- THE SPLIT, AND WHY IT IS NOT JUST A GRANT
--
-- A grant alone would break the product. The same function is called by
-- `trg_recalc_points` on every submission insert, update and delete, and the
-- creator submitting a video is emphatically NOT a manager of the market. So
-- the body moves to an internal function that is granted to nobody (the trigger
-- runs as definer and reaches it regardless), and the public name becomes a
-- thin wrapper that checks who is asking.
--
-- Reversal: drop the wrapper and internal, restore 076's single function, and
-- point trg_recalc_points back at it.

-- ------------------------------------------------------ the engine, unguarded
-- Identical to 076's body. Granted to nobody: only the two definer functions
-- below can reach it.
create or replace function public.recalc_challenge_points_internal(p_challenge uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_community uuid;
  v_mode      text;
begin
  select community_id, threshold_mode into v_community, v_mode
  from public.challenges where id = p_challenge;
  if v_community is null then return; end if;

  delete from public.point_awards where challenge_id = p_challenge and is_auto;

  -- Per post, capped. `least` applies the ceiling; a null max_points means no
  -- ceiling, which coalesce turns into the uncapped total.
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
    -- Highest tier only: rank the matching rules per submission and keep one.
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
end;
$$;

revoke all on function public.recalc_challenge_points_internal(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- the trigger
-- Unchanged behaviour, new callee.
create or replace function public.trg_recalc_points()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_challenge uuid;
begin
  v_challenge := coalesce(new.challenge_id, old.challenge_id);
  -- Only spend the work on challenges that actually score by points.
  if exists (select 1 from public.challenges where id = v_challenge and scoring = 'points') then
    perform public.recalc_challenge_points_internal(v_challenge);
  end if;
  return coalesce(new, old);
end;
$$;

-- ------------------------------------------------------------- the public RPC
-- Same name and signature as before, so the admin form's call site is
-- unchanged. It now answers "may you?" before doing anything.
create or replace function public.recalc_challenge_points(p_challenge uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_community uuid;
begin
  select community_id into v_community from public.challenges where id = p_challenge;
  if v_community is null then return; end if;

  if not (v_community in (select public.my_managed_scopes())) then
    raise exception 'Not yours to rescore';
  end if;

  perform public.recalc_challenge_points_internal(p_challenge);
end;
$$;

revoke all on function public.recalc_challenge_points(uuid) from public, anon;
grant execute on function public.recalc_challenge_points(uuid) to authenticated;
