-- 078: scope challenge visibility to the viewer's markets.
--
-- WHY THIS IS URGENT RATHER THAN PLANNED
--
-- Opening Spain with a live challenge in 077 exposed a real leak. The SELECT
-- policy on `challenges` was written when there was exactly one market:
--
--     (is_member() and status <> 'draft') or is_admin()
--
-- `is_member()` means "is an approved creator", not "is a creator HERE". So the
-- moment a second market had a challenge, every UK creator could see it. The
-- live /challenges page selects every row with no filter, so the Spanish
-- challenge would have appeared in the list for all 44 of them.
--
-- This is phase 3 work arriving early because phase 2 made it necessary. It is
-- deliberately ONE table: the same flaw exists on submissions, results, rewards
-- and events, and each needs the same persona check before it is touched.
--
-- WHY IT CANNOT CHANGE WHAT A UK CREATOR SEES
--
-- Every creator is an active member of UK & Ireland, and 073 scoped every
-- pre-existing challenge to UK. So `community_id in (select my_scopes())` is
-- true for every row they can see today. The clause only ever removes rows
-- belonging to a market they are not in, and today that is Spain alone.
--
-- `community_id is null` stays visible so an unscoped challenge, if one is ever
-- created by a code path that forgets the column, fails open to the old
-- behaviour rather than vanishing from the app.
--
-- Reversal:
--   drop policy "challenges: read published" on public.challenges;
--   create policy "challenges: read published" on public.challenges
--     for select to authenticated
--     using ((is_member() and status <> 'draft') or is_admin());

drop policy if exists "challenges: read published" on public.challenges;

create policy "challenges: read published" on public.challenges
  for select to authenticated
  using (
    (
      is_member()
      and status <> 'draft'
      and (
        community_id is null
        or community_id in (select public.my_scopes())
      )
    )
    or is_admin()
  );
