-- THE PRETEND PEOPLE WERE STANDING IN THE REAL COMMUNITY.
--
-- Ethan: "all the test data accounts you created seem to be in the actual
-- community and viewable to everyone, for example on the creator network page
-- etc, it should not be like this."
--
-- The eight Spanish demo creators were created with `is_test = false` ON
-- PURPOSE, and the reasoning was not silly: every roster, leaderboard, map and
-- directory filters `is_test` out, so flagging them would have made them
-- invisible to the Tryp.com team the demo was built for. That traded a working
-- demo for a polluted community, which is the wrong way round.
--
-- The mistake was treating this as a property of the ROW. It is a property of
-- the VIEWER. So the flag goes back on, and the database decides who may see a
-- flagged row: an admin may, and nobody else may. The client does the rest of
-- the distinction (a real admin does not want fake people in his own community
-- pages, a demo admin does) - see src/lib/testData.js. This half is the one
-- that has to hold even if the client is wrong, out of date, or bypassed
-- entirely by somebody talking to PostgREST with their own token.

-- 1. THE EIGHT DEMO CREATORS ARE TEST DATA AND NOW SAY SO.
update public.profiles p
   set is_test = true
  from auth.users u
 where u.id = p.id
   and u.email like '%@demo.trypcreators.test'
   and p.is_test is distinct from true;

-- 2. THE IDS OF EVERY TEST ACCOUNT, AS ONE ARRAY, EVALUATED ONCE PER QUERY.
--
--    A policy cannot sub-select from `profiles` directly: the sub-select is
--    itself subject to the profiles policy, for the same caller, which is how
--    an RLS recursion is written by accident. A SECURITY DEFINER function is
--    the standard way out. Returning the whole ARRAY rather than answering
--    per-creator matters for the plan: no arguments and STABLE means Postgres
--    evaluates it once and then does a cheap array membership test per row,
--    instead of a function call for every entry on a leaderboard.
create or replace function public.test_creator_ids()
returns uuid[]
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(array_agg(id), '{}'::uuid[]) from public.profiles where is_test;
$$;

comment on function public.test_creator_ids() is
  'Ids of every is_test profile. Used by the SELECT policies on profiles, submissions and results to keep demo data away from real creators. Reveals only which accounts are test accounts, which is not sensitive.';

-- 3. A TEST PROFILE IS NOT READABLE BY A CREATOR.
--
--    Your own row is always readable (that clause is first and unchanged, and
--    it is what keeps the QA creator account able to load itself).
drop policy if exists "profiles: read for members" on public.profiles;
create policy "profiles: read for members" on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or (is_member() and (not is_test or public.is_admin()))
  );

-- 4. AND NEITHER ARE THEIR ENTRIES OR THEIR PLACES ON A LEADERBOARD.
--
--    Hiding the profile alone is not enough and is arguably worse: several
--    leaderboard queries (LeaderboardCard, lib/winners, MarketChallenges) embed
--    the profile WITHOUT any test filter, so hiding just the profile would have
--    left a nameless row sitting in first place on the Spanish board.
--
--    What a real creator then sees of "Descubre Espana con Tryp.com" is a live
--    challenge with no entries in it, which is the truth: not one real creator
--    has entered it. The demo account sees all twenty-four.
drop policy if exists "submissions: read for members" on public.submissions;
create policy "submissions: read for members" on public.submissions
  for select to authenticated
  using (
    is_member()
    and (
      public.is_admin()
      or creator_id = (select auth.uid())
      or not (creator_id = any (public.test_creator_ids()))
    )
  );

drop policy if exists "results: read for members" on public.results;
create policy "results: read for members" on public.results
  for select to authenticated
  using (
    is_member()
    and (
      public.is_admin()
      or creator_id = (select auth.uid())
      or not (creator_id = any (public.test_creator_ids()))
    )
  );
