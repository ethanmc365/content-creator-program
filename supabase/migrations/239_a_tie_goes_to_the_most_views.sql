-- A TIE ON A BOARD GOES TO WHOEVER HAS MORE TOTAL VIEWS (21 Sep 2026).
--
-- Ethan: "If there is a tie, which is unlikely, whoever's got the highest total
-- viewers will get the higher spot." Until now equal scores broke by
-- `creator_id` - a uuid, so effectively random, and on a points board with ten
-- paid places that is a coin toss over money at the 10th/11th boundary.
--
-- Order now: score, then total views across every entry, then whoever posted
-- their first entry earlier (so two creators with identical scores AND views
-- still resolve by something they did), and only then the id. On a
-- total_views board the second key equals the first, so it is the posting time
-- that settles an exact tie there. Everything that ranks - the leaderboard,
-- the payout, challenge_prize_standings - reads `results.rank`, so this is the
-- one place to change.

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
      sum(coalesce(s.logged_views, 0))::integer as total_views,
      min(s.submitted_at) as first_at
    from public.submissions s
    left join public.challenge_group_members gm
      on gm.challenge_id = p_challenge and gm.creator_id = s.creator_id
    where s.challenge_id = p_challenge
      and (v_mode = 'points' or s.logged_views is not null)
    group by s.creator_id, gm.group_id
  ),
  ranked as (
    select creator_id, group_id, score, total_views,
           row_number() over (
             partition by group_id
             order by score desc, total_views desc, first_at asc nulls last, creator_id
           ) as rank
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
