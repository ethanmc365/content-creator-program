-- ============================================================================
-- 185 - the milestone engine has been a no-op since the day it shipped, and a
--       destructive one. APPLIED 3 Sep 2026.
--
-- FOUND while checking the admin brief's claim that "the live ladder gates on a
-- referral nobody has ever made". That claim is stale - four referrals exist -
-- but chasing it turned up something worse.
--
-- JACOB PULLEY HAS 14 VIDEOS AND 23,568 VIEWS. "Getting Started" asks for 3 and
-- 3,000. `milestone_state` agreed he had reached it. He had never been awarded
-- it, and neither had any other real creator: every row in `creator_milestones`
-- belonged to a Spanish DEMO account, all written in one batch by the seed.
--
-- WHY. `creator_metrics` ends with
--
--     where p_profile = (select auth.uid()) or public.is_admin()
--
-- which is right for a function a creator calls about themselves. But
-- `milestone_state` CROSS JOINs it, `milestone_progress` is built on
-- `milestone_state`, and `reconcile_milestones` - the pg_cron job that runs
-- every ten minutes - calls that for every creator on the platform.
--
-- SECURITY DEFINER changes the executing ROLE. It does not invent a JWT. Under
-- cron `auth.uid()` is null and `is_admin()` is false, so the guard rejected
-- every profile, `creator_metrics` returned no rows, the cross join produced
-- nothing, and `milestone_state` was an empty set for everybody.
--
-- THAT IS NOT MERELY "NOTHING IS AWARDED". `milestone_progress` also withdraws
-- what no longer qualifies, and with the state empty `not exists` is true for
-- every row - so the job had been DELETING earned milestones every ten minutes.
-- The demo accounts kept theirs only because reconcile skips `is_test`.
--
-- THE FIX IS THE PATTERN THIS SCHEMA ALREADY USES for exactly this problem (see
-- `recalc_challenge_points` / `_internal`, migration 081): the guard belongs on
-- the function a CLIENT calls, not on the arithmetic underneath it. Each of the
-- three grows an `_internal` twin that does the work unguarded and is revoked
-- from every API role; the public one keeps its check and delegates.
--
-- AND THE WITHDRAWAL LEARNS TO DOUBT ITSELF. An empty state now means "I could
-- not compute this", not "they have earned nothing", so nothing is deleted. A
-- bookkeeping pass must never be able to destroy the thing it keeps books on -
-- the rule migration 131 wrote after an invoice trigger aborted its own award.
--
-- VERIFIED: running the job as cron does (no JWT) awarded "Getting Started" to
-- the five real creators who had earned it - Denisa Hadarau, Jacob Pulley, Lisa
-- Burns, Shannon J Ormsby, Telayah - and set their earned_role. A second pass
-- awarded nothing. An ordinary creator reading another creator's ladder, state
-- or metrics gets 0 rows; her own gets 5; an admin gets anybody's.
-- ============================================================================

-- ------------------------------------------------------- metrics, unguarded
create or replace function public.creator_metrics_internal(p_profile uuid)
returns table(videos numeric, views numeric, referrals numeric, challenges numeric, days numeric, podiums numeric, best_video numeric)
language sql
stable security definer
set search_path to 'public'
as $function$
  select
    (select count(*) from public.submissions where creator_id = p_profile)::numeric,
    (select coalesce(sum(coalesce(logged_views, 0)), 0) from public.submissions where creator_id = p_profile)::numeric,
    (select count(distinct r.id) from public.profiles r
       join public.submissions s on s.creator_id = r.id
      where r.referred_by = p_profile and r.status = 'active')::numeric,
    (select count(distinct challenge_id) from public.submissions where creator_id = p_profile)::numeric,
    (select greatest(0, extract(epoch from (now() - coalesce(accepted_at, created_at))) / 86400)
       from public.profiles where id = p_profile)::numeric,
    (select count(*) from public.results where creator_id = p_profile and rank between 1 and 3)::numeric,
    (select coalesce(max(coalesce(logged_views, 0)), 0) from public.submissions where creator_id = p_profile)::numeric
  where exists (select 1 from public.profiles where id = p_profile);
$function$;

revoke all on function public.creator_metrics_internal(uuid) from public, anon, authenticated;

-- Unchanged in behaviour: same guard, same shape, now delegating.
create or replace function public.creator_metrics(p_profile uuid)
returns table(videos numeric, views numeric, referrals numeric, challenges numeric, days numeric, podiums numeric, best_video numeric)
language sql
stable security definer
set search_path to 'public'
as $function$
  select * from public.creator_metrics_internal(p_profile)
   where p_profile = (select auth.uid()) or public.is_admin();
$function$;

-- --------------------------------------------------------- state, unguarded
-- Body identical to the previous `milestone_state` except that it reads
-- `creator_metrics_internal`.
create or replace function public.milestone_state_internal(p_profile uuid)
returns table(id uuid, title text, description text, reward text, reward_kind text, role_title text, icon text, sort_order integer, criteria jsonb, met boolean, reached boolean, blocked boolean)
language sql
stable security definer
set search_path to 'public'
as $function$
  with k as (select * from public.creator_metrics_internal(p_profile)),
  scored as (
    select ms.id, ms.title, ms.description, ms.reward, ms.reward_kind,
           ms.role_title, ms.icon, ms.sort_order,
           coalesce(
             jsonb_agg(
               jsonb_build_object(
                 'metric', c.metric, 'threshold', c.threshold, 'unit', c.unit,
                 'value', case c.metric
                            when 'videos' then k.videos
                            when 'views' then k.views
                            when 'referrals' then k.referrals
                            when 'challenges' then k.challenges
                            when 'days' then k.days
                            when 'podiums' then k.podiums
                            when 'best_video' then k.best_video
                          end,
                 'done', case c.metric
                            when 'videos' then k.videos
                            when 'views' then k.views
                            when 'referrals' then k.referrals
                            when 'challenges' then k.challenges
                            when 'days' then k.days
                            when 'podiums' then k.podiums
                            when 'best_video' then k.best_video
                          end >= c.threshold
               ) order by c.threshold desc
             ) filter (where c.id is not null),
             '[]'::jsonb
           ) as criteria,
           coalesce(bool_and(
             case c.metric
               when 'videos' then k.videos
               when 'views' then k.views
               when 'referrals' then k.referrals
               when 'challenges' then k.challenges
               when 'days' then k.days
               when 'podiums' then k.podiums
               when 'best_video' then k.best_video
             end >= c.threshold
           ), false) as met
    from public.milestones ms
    cross join k
    left join public.milestone_criteria c on c.milestone_id = ms.id
    where ms.is_active
    group by ms.id
  )
  select s.id, s.title, s.description, s.reward, s.reward_kind,
         s.role_title, s.icon, s.sort_order, s.criteria, s.met,
         bool_and(s.met) over (order by s.sort_order, s.id
                               rows between unbounded preceding and current row) as reached,
         s.met and not bool_and(s.met) over (order by s.sort_order, s.id
                               rows between unbounded preceding and current row) as blocked
  from scored s
  order by s.sort_order, s.id;
$function$;

revoke all on function public.milestone_state_internal(uuid) from public, anon, authenticated;

create or replace function public.milestone_state(p_profile uuid)
returns table(id uuid, title text, description text, reward text, reward_kind text, role_title text, icon text, sort_order integer, criteria jsonb, met boolean, reached boolean, blocked boolean)
language sql
stable security definer
set search_path to 'public'
as $function$
  select * from public.milestone_state_internal(p_profile)
   where p_profile = (select auth.uid()) or public.is_admin();
$function$;

-- ------------------------------------------------------ progress, unguarded
-- NOTE: superseded by migration 186, which moves the notification out of the
-- voucher loop so that reaching ANY stop tells the creator. The version applied
-- here is otherwise identical.

-- The client's entry point: your own ladder, or anybody's if you are the team.
create or replace function public.milestone_progress(p_profile uuid default null::uuid)
returns table(id uuid, title text, description text, reward text, reward_kind text, role_title text, icon text, sort_order integer, criteria jsonb, met boolean, reached boolean, blocked boolean, reached_at timestamp with time zone)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_me uuid := coalesce(p_profile, auth.uid());
begin
  if v_me is null then return; end if;
  if v_me <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
     and not public.is_admin() then
    return;
  end if;
  return query select * from public.milestone_progress_internal(v_me);
end;
$function$;

-- ---------------------------------------------------------------- the cron
create or replace function public.reconcile_milestones()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r record;
  n integer := 0;
begin
  for r in
    select p.id from public.profiles p
     where p.status = 'active'
       and p.is_test = false
       and p.is_admin = false
       and coalesce(p.is_sandbox, false) = false
       and p.deletion_requested_at is null
  loop
    -- The INTERNAL one. The public wrapper checks `auth.uid()`, and there is no
    -- JWT on a cron connection - which is the entire reason this job had been
    -- silently doing nothing since it was created.
    perform public.milestone_progress_internal(r.id);
    n := n + 1;
  end loop;
  return n;
end;
$function$;
