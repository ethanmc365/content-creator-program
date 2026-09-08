-- THE LANDING BAND STILL THOUGHT THE PROGRAMME STARTED IN JULY.
--
-- Ethan, 8 Sep 2026: "please ensure that the prizes awarded now increases.
-- Because we uploaded that historical data of the challenges, we can now show
-- the number of how much you actually give out."
--
-- Migrations 197/198 imported forty-nine challenges the programme ran on a
-- spreadsheet before this platform existed - EUR 9,235 of prizes, reconciled
-- against the sheet's own total row. `landing_stats` was written before that
-- table existed and never learned about it, so the public page was telling a
-- stranger the programme had run ONE challenge and given away EUR 750.
--
-- Read first, per supabase/migrations/README.md. The live body was:
--
--   'creators',   count(profiles where active, not admin, not test, not deleting)
--   'challenges', count(challenges where status <> 'draft')
--   'prizes',     500 + sum(rewards.amount where status = 'distributed')
--
-- Three changes, and `creators` is untouched.
--
-- 1. THE 500 BASELINE GOES. It was a hand-entered stand-in for exactly the
--    challenges that are now in `challenge_history` as real rows. Keeping both
--    would count the pre-platform programme twice, once as a guess and once as
--    a fact.
--
-- 2. `challenge_id is null` IS THE ANTI-DOUBLE-COUNT, and it is the same rule
--    analytics already applies (see 197). One row in the history - the UK
--    challenge that ran 20 Jul to 20 Aug - is ALSO a live challenge here,
--    because the team tracked it in both places while the platform was being
--    built. A linked history row is metadata about a contest the live tables
--    already own: its prizes and its existence are counted from the live side
--    and the sheet's copy is ignored. Without this the landing page would claim
--    one more challenge and EUR 190 more than the programme has run.
--
-- 3. PRIZES ARE STILL THE EXACT TOTAL HERE. The rounding to the thousand and
--    the "+" that Ethan asked for are presentation and live in the page
--    (`prizeFloor` in src/pages/Landing.jsx). An RPC that returns a rounded
--    number cannot be reused by anything that needs the real one, and the admin
--    analytics reads real money out of these same tables.
--
-- Applied 8 Sep 2026. Returns { creators: 44, challenges: 49, prizes: 9295 },
-- which the page prints as 44 / 49 / "EUR 9,000+".
create or replace function public.landing_stats()
returns json
language sql
stable
security definer
set search_path to 'public'
as $$
  select json_build_object(
    'creators',   (select count(*) from public.profiles
                   where status = 'active' and not is_admin and coalesce(is_test,false) = false
                     and deletion_requested_at is null),
    'challenges', (select count(*) from public.challenges where status <> 'draft')
                  + (select count(*) from public.challenge_history where challenge_id is null),
    'prizes',     (select coalesce(sum(amount), 0) from public.rewards where status = 'distributed')
                  + (select coalesce(sum(prize_total), 0) from public.challenge_history where challenge_id is null)
  );
$$;

-- Already on the allowlist (migration 170); re-granted explicitly because
-- `create or replace` is the moment a grant is easiest to lose.
grant execute on function public.landing_stats() to anon, authenticated;
