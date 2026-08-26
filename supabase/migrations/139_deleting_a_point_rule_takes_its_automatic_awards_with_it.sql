-- PHANTOM POINTS ON THE COMMUNITY LEADERBOARD.
--
-- `community_standings` and `network_standings` are `sum(points)` over the
-- whole of `point_awards`, with no join to the rules. Saving a challenge
-- deletes all of its `point_rules` and re-inserts them, and `point_awards`
-- references a rule with ON DELETE SET NULL - so every rescore that removed or
-- renamed a rule left its automatic awards behind with `rule_id = null`.
--
-- Nothing ever collected them. `recalc_challenge_points_internal` clears
-- `is_auto` rows for the challenge it is rebuilding, but it is only called for
-- a challenge still scored on points; the moment a challenge stops being a
-- points challenge, its awards are stranded and permanent.
--
-- FOUND BY AUDITING FOR DUPLICATES, not by looking at the leaderboard. One
-- archived BEST-VIDEO challenge with zero point rules was contributing 17
-- awards and 61 points to a creator's community and network totals. Nobody
-- could have found that from the challenge, because it does not score on
-- points and shows no leaderboard at all. Every point_award in the database
-- turned out to be one of these.
--
-- An automatic award is a fact derived from a rule: when the rule goes, the
-- fact goes with it. A BONUS is not - it is something a person decided, its
-- reason is stored on the row, and it survives.

create or replace function public.point_rule_takes_its_awards()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  delete from public.point_awards where rule_id = old.id and is_auto;
  return old;
end $$;

revoke all on function public.point_rule_takes_its_awards() from public, anon, authenticated;

drop trigger if exists trg_point_rule_takes_its_awards on public.point_rules;
create trigger trg_point_rule_takes_its_awards
  before delete on public.point_rules
  for each row execute function public.point_rule_takes_its_awards();

-- The ones already stranded. `is_auto` and no rule means nothing can ever
-- explain where the points came from, which is the definition of a phantom.
delete from public.point_awards where is_auto and rule_id is null;

notify pgrst, 'reload schema';
