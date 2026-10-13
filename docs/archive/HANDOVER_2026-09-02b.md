# Second session, 2 Sep 2026: security, a demo account, and Ethan's list

Everything below is on `main` and deployed (Vercel READY, `trypcreators.vercel.app`).
The reader-facing version of this is the artifact:
https://claude.ai/code/artifact/178b2856-1f81-459d-8290-cb264cf1cd6d

## The security audit, in one paragraph

Four real vulnerabilities, all found by calling production with nothing but the
publishable key, all fixed and re-verified the same way. The worst was
`award_challenge_prizes_internal`: no auth check, writes `rewards` rows (which
raise draft invoices by trigger), reachable unauthenticated, and the challenge
id it needs is handed to anon by `public_live_challenge` by design. The second
was `milestone_progress`, an unauthenticated WRITE against any creator's row.
Eight more definer functions leaked creator names, photos, view counts and
metrics. `link-preview` was an open URL-fetcher for the internet, and
`notify-dispatch`'s webhook check failed OPEN on an unset secret.

## THE ANON-GRANT TRAP IS NOW FIXED STRUCTURALLY (migration 170)

**This is the important entry in this file.** Supabase's `ALTER DEFAULT
PRIVILEGES` grants EXECUTE on every new function to `anon` BY NAME, and Postgres
grants it to PUBLIC. **It takes both revokes**, and a hand-written revoke in the
creating migration has now been undone four times:

- 110 swept the schema; everything added after it arrived exposed
- 138 fixed two by hand after `payment_snapshot` shipped able to return IBANs
- 153 revoked `route_creators` from public AND anon, correctly - and **156
  dropped and recreated it**, which re-granted both
- 166 and 167 revoked from `public` only, which does nothing about `anon`

So there is now `public_rpc_allowlist` (the five landing-page functions),
`lock_down_definer_functions()` which applies the correct grants to every
definer function in `public`, and an **EVENT TRIGGER** `no_new_function_is_public`
that re-runs it after any CREATE or ALTER FUNCTION. Verified: a brand new
definer function is born with `anon` revoked and `authenticated` granted, with
nobody writing a line to do it. **Do not go back to hand-written revokes.**

Classification inside the sweep: a trigger/event-trigger function and anything
named `%_internal` is locked to the owner (authenticated loses it too); the
allowlisted five keep anon; everything else is signed-in only, granted to
`authenticated` EXPLICITLY rather than by inheritance, because revoking PUBLIC
would otherwise take a creator's access with it.

## `verify_jwt: true` DOES NOT MEAN "SIGNED-IN ONLY"

Both `link-preview` and `geocode` carried a source comment saying it did. The
gateway accepts the PUBLISHABLE key as a valid credential - it must, that is how
the browser reaches PostgREST before anybody signs in - and that key ships in
the JS bundle. Proven: a curl carrying only the publishable key got a full
unfurl of https://example.com back.

Both now verify the caller's JWT against the project JWKS themselves (the check
`upload`, `view-sync`, `send-invoice` and `impersonate` already made) plus a
per-creator hourly rate limit against `auth_attempts`. **The helper is inlined
in each function, not shared**: the edge bundler flattens a function to one
directory and a `../_shared` import does not survive the deploy. That was tried
and it fails at bundle time.

## The sandbox account (migrations 172 / 174)

`team@trypcreators.test` / `TrypTeam!2026`, global admin, manager of every
market, `is_test` + `is_sandbox`. `is_sandbox` used to mean only "cannot post in
chat"; it now also refuses writes to `rewards`, `invoices`, `notifications`,
`email_outbox` and `app_settings`, and deletes on the seven tables that hold
somebody's real work. Enforced by trigger, not in React, because React is not a
security boundary.

174 is the correction that matters: a blanket refusal on `notifications` meant
the account could not mark its own bell as read. The distinction is WHOSE ROW IT
IS, not the verb - an insert reaches somebody, an update of your own row reaches
nobody.

Note the QA accounts are `is_sandbox` too, so they are now read-only on those
five tables as well. That is correct but it will surprise you mid-test.

## A POINTS CHALLENGE HAD NO LEADERBOARD (migration 173)

`rebuild_challenge_results` opened with `if v_mode = 'points' then return 0`, so
a points challenge never got a `results` row - and that is the table
ChallengeDetail's leaderboard reads. Spain's live challenge printed "Every place
is still open" for a month while carrying real entries. Every other surface was
right, which is why nobody caught it.

It ranks on the `point_awards` ledger now (summed, not recomputed - one place
owns that arithmetic), still partitioned by `group_id`. `results.final_views`
carries the score and the UI already labelled it "points" from
`challenges.scoring`; it was reading a column nothing wrote.

**VERIFIED by rebuilding the archived UK board**: eleven rows, identical order,
matching the board its prizes were paid from (Lisa Burns, Mirsu, Denisa
Hadarau). Only `results_updated_at` moved.

STILL BROKEN, and it matters for the global challenge: `award_challenge_prizes`
refuses a points challenge, because `award_challenge_prizes_internal` walks
prize places against `results.rank` but bails on "No leaderboard has been
generated" logic that predates points scoring. Fix before launching a points
challenge with real prizes.

## The Spanish demo data

Eight creators (Madrid, Barcelona, Valencia, Sevilla, Malaga, Bilbao, Palma,
Granada), 24 entries, points board 18/12/7 at the top, prizes matched to the UK
challenge in euros, one claimable bonus rule with six claims.

**Every link is a REAL live video from the archived UK challenge**, so the
scraper reads genuine numbers: forced a sync, 24 of 24 read, 0 errors, top entry
moved 15,200 -> 15,400 while watching.

They are `is_test = false` ON PURPOSE. The leaderboard, roster and market map
all filter test accounts out, so flagging them would have made them invisible,
which defeats the point. Cost: the platform creator count reads 52 not 44. Every
one is on `@demo.trypcreators.test`, which cannot receive mail, so cleanup is
one line: `delete from auth.users where email like '%@demo.trypcreators.test';`

## Ethan's list

- **Milestones is silent.** `MilestonePath` no longer imports gameSounds at all.
  Removed rather than muted: a silent path that still schedules an interval is
  the propeller-left-running bug waiting to happen again.
- **NOTHING SCROLLS A DESKTOP.** `revealFocusedField` asked "is this field below
  the visible area", which on a desktop only means the page is long - so
  focusing the guess box scrolled the page down after every guess.
  `keyboardInset()` is the one test now (visual vs layout viewport, 120px
  floor), exported and shared with `useScrollCardIntoView`. Game.jsx scrolls to
  0 on a desktop and keeps the scroll-past-the-heading answer on a phone.
- **The phone's guess bar AND its button clear the keyboard.** Two causes: the
  reveal measured the input alone (it measures the closest `form` or
  `[data-kb-group]` now, when that fits), and a short puzzle page is already at
  the bottom of its own document so `scrollBy` had nothing to give.
  `--kb-room` on `<html>` puts a keyboard's worth of padding under the body
  while one is up. Measured at 390x844 with a 336px keyboard: form at 378-484,
  visible bottom 508.
- **Streak card**: freeze tiles gone (count moved into the popup, week strip
  still shows a snowflake for a covered day), labelled corner chip gone with the
  whole class of collisions it caused, two rows at every width.
- **Streaks popup**: both boards fetched on open, one fixed window
  (`min-h-[14rem] max-h-[min(24rem,48vh)]`) so the dialog does not resize, pill
  slides. It was never an animation problem - it was a fetch.
- **DM empty pane**: two even columns in one card, not eight wrapped chips.

## Not verified

- The mobile keyboard work was measured with a simulated `visualViewport`, not a
  real iOS keyboard.
- `notify-dispatch`'s happy path (an actual push) was not re-driven after the
  redeploy; only the 401 was.
- The demo account was driven through /admin and the challenge page, not through
  every screen.
