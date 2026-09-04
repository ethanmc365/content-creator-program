-- AN ARCHIVED CHALLENGE BELONGS TO THE WHOLE COMMUNITY, NOT TO ONE MARKET.
--
-- Ethan (4 Sep 2026): "creators are unable to see archived challenges. Creators
-- should be able to see archived challenges just like an admin can - the
-- results, the prizes, etcetera - from any market, not just their own. All the
-- archived challenges should be public to anyone. But obviously not the live
-- challenges, only the archive: once they're archived, anyone can see them."
--
-- WHY IT IS THE RIGHT CALL AND NOT JUST A REQUEST. A finished challenge is the
-- best answer this platform has to "what does good look like here" - the brief,
-- the winning videos, the view counts and what they paid. A creator in Portugal
-- joining next week has NOTHING to look at, because the only finished challenge
-- on the platform is the UK's and `my_scopes()` hides it from them. Marketing
-- the programme on its results and then hiding the results from the people
-- being recruited is the wrong way round.
--
-- WHAT STAYS SHUT. A LIVE challenge is still market-scoped, and that is a rule
-- about fairness rather than privacy: a brief you cannot enter is not something
-- to be shown a countdown for, and a Spanish creator reading the UK board while
-- it runs is reading somebody else's competition. `draft` is unchanged too -
-- nobody but an admin has ever seen one and nobody should.
--
--   BEFORE  status <> 'draft' AND (no community OR community in my_scopes())
--   AFTER   ... OR status = 'archived'
--
-- `is_member()` still guards both branches, so this opens an archive to every
-- approved creator and to nobody else. It is not public in the "logged out"
-- sense and must not become that: the entries are real people's videos.
drop policy if exists "challenges: read published" on public.challenges;

create policy "challenges: read published"
  on public.challenges
  for select
  using (
    is_admin()
    or (
      is_member()
      and status <> 'draft'
      and (
        -- Your own markets, live or finished, exactly as before.
        community_id is null
        or community_id in (select my_scopes())
        -- ...and every market's ARCHIVE.
        or status = 'archived'
      )
    )
  );

-- AND THE SCORING RULES WITH IT, OR THE PAGE IS HALF A PAGE.
--
-- `results` and `submissions` were already readable by any member (they carry
-- their own test-account fence rather than a market one) and the group tables
-- are open, so the leaderboard and the entries already cross markets. The one
-- thing that did not is `point_rules`, which is what a POINTS challenge's
-- detail page uses to explain how the score was arrived at - and without it a
-- visiting creator gets a board of numbers with nothing saying what earned
-- them. Same shape as above: your own markets always, plus anything attached to
-- an archived challenge.
drop policy if exists "point_rules_read" on public.point_rules;

create policy "point_rules_read"
  on public.point_rules
  for select
  using (
    community_id in (select my_scopes())
    or exists (
      select 1 from public.challenges c
      where c.id = point_rules.challenge_id
        and c.status = 'archived'
    )
  );
