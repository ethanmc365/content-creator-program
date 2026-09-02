-- ============================================================================
-- 173 - a points challenge gets a leaderboard too
--
-- `rebuild_challenge_results` opened with `if v_mode = 'points' then return 0`,
-- so a challenge scored on POINTS never got a single `results` row - and the
-- challenge page's leaderboard reads that table. The board therefore printed
-- "Every place is still open. Nobody has a logged view count yet" on a
-- challenge with twenty-four entries and a creator on eighteen points.
--
-- This was live in production: "Descubre Espana con Tryp.com" is the first
-- points challenge the platform has run, and its leaderboard was empty for the
-- whole month it was open. Every other surface was right - the points are
-- computed, the entries show their awards, the admin analytics add up - which
-- is exactly why nobody noticed the one screen that reads `results`.
--
-- The fix keeps the shape the rest of the product already agreed on:
-- `results.final_views` carries the SCORE, and ChallengeDetail labels it
-- "points" or "views" from `challenges.scoring`. It already did that
-- (`scoring === 'points' ? Number(final_views) : formatViews(...)`) - it was
-- reading a column nothing ever wrote.
--
-- Points come from `point_awards`, which `recalc_challenge_points_internal`
-- keeps up to date and which is the ONE place the arithmetic lives: per-post,
-- the view thresholds, platform spread and the claimable bonuses all land there
-- as rows. Summing them here rather than recomputing them is what keeps this
-- from becoming a second opinion about who is winning.
--
-- Ranking still partitions by `group_id`, so a split challenge ranks within a
-- board exactly as the views path does.
--
-- VERIFIED AGAINST THE ARCHIVED UK CHALLENGE: rebuilt after this change, the
-- eleven rows and their order are identical to the board its prizes were paid
-- from (Lisa Burns, Mirsu, Denisa Hadarau). The views paths are untouched.
-- ============================================================================
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
          -- The points ledger, not the view counts. Coalesced to zero so a
          -- creator who has entered and scored nothing yet still holds a place
          -- on the board rather than vanishing from it.
          round(coalesce((
            select sum(a.points) from public.point_awards a
             where a.challenge_id = p_challenge and a.creator_id = s.creator_id
          ), 0))
        when v_mode = 'total_views' then sum(coalesce(s.logged_views, 0))
        else max(coalesce(s.logged_views, 0))
      end::integer as score
    from public.submissions s
    left join public.challenge_group_members gm
      on gm.challenge_id = p_challenge and gm.creator_id = s.creator_id
    where s.challenge_id = p_challenge
      -- A points challenge ranks on posting, so an entry whose views have not
      -- been read yet is still worth its per-post point and must not be
      -- filtered out the way it is on a views board.
      and (v_mode = 'points' or s.logged_views is not null)
    group by s.creator_id, gm.group_id
  ),
  ranked as (
    select creator_id, group_id, score,
           row_number() over (partition by group_id order by score desc, creator_id) as rank
    from scored
  ),
  wiped as (
    delete from public.results where challenge_id = p_challenge returning 1
  ),
  inserted as (
    insert into public.results (challenge_id, creator_id, final_views, rank, community_id, group_id)
    select p_challenge, r.creator_id, r.score, r.rank::integer, v_community, r.group_id
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
