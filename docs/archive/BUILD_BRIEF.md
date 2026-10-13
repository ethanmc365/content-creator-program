# Build brief: the global network

Operational document. Part 1 is the standing brief you paste at the start of every
build session. Part 2 is the phase prompts, pasted one at a time. Part 3 is the
guardrails that keep a session from going off the rails.

Last updated 7 August 2026. Architecture decisions here are **locked** unless you
change them deliberately. A build session should not re-litigate them.

---

## Part 0: The environment, and how localhost works

### One database. Two front-ends. A flag decides which one you get.

That is the whole model, and it is worth reading twice because it removes a
problem people usually spend weeks on.

```
                        ┌──────────────────────────────┐
                        │  Supabase (production)       │
                        │  heuhqqoxyggawuckxocp        │
                        │                              │
                        │  old tables  +  new tables   │
                        │  (in use)       (invisible)  │
                        └───────┬──────────────┬───────┘
                                │              │
              ┌─────────────────┘              └──────────────────┐
              │                                                   │
   ┌──────────┴───────────┐                          ┌────────────┴──────────┐
   │ Vercel (main branch) │                          │ localhost:5173        │
   │ trypcreators.app     │                          │ feat/global-network   │
   │                      │                          │                       │
   │ 44 UK creators       │                          │ you only              │
   │ flag OFF → old UI    │                          │ flag ON → new UI      │
   └──────────────────────┘                          └───────────────────────┘
```

There is **no syncing problem**, because there is nothing to sync. Both front-ends
read the same database. The new tables exist in production from week one and the
live app simply never queries them. Your localhost queries them because it is
running the branch code and your account has the flag on.

### Why this is safe

Because every migration in phases 1 to 4 is **additive**. Creating a table nobody
selects from cannot break a page. Adding a nullable column nobody writes to cannot
break an insert. The live UK app carries on with no idea anything happened.

The moment it stops being safe is phase 7, when old policies and old columns get
dropped. That is weeks away, it happens after the new world is proven, and it is
the one I will ask you before running.

### Can you still change the live platform while building?

Yes, and this is the part git already solves.

- **`main`** is what Vercel deploys and what UK creators use. It stays deployable
  at all times.
- **`feat/global-network`** is where the build happens. It is what runs on
  localhost.
- A UK bug fix or tweak goes to `main`, pushes, auto-deploys, and reaches creators
  in about a minute. The feature branch is not involved.
- Then you run `git merge main` into the feature branch so it does not drift.

**The one rule that makes this painless: merge `main` into the branch every time
you ship a fix, or at least weekly.** The pain of a long-lived branch is entirely
proportional to how long you avoid merging. A week of drift is twenty minutes of
conflicts. Two months of drift is a rewrite.

If a live fix needs a schema change, it becomes a normal numbered migration on
`main`, applied to production, and merged into the branch like any other file.
Because migrations are ordered files and nobody hand-edits the database through the
dashboard, the two stay in step automatically.

### Where to run the schema work

Three options. You do not need Docker for any of them.

| | Isolation | Cost | Setup | Use it for |
| --- | --- | --- | --- | --- |
| **A. Second free Supabase project** | Total | Free | ~30 min | Trying migrations you might need to undo. A scratchpad. |
| **B. localhost against production** | None | Free | Already done | Everything else. Real data, real edge cases. |
| C. Local Supabase in Docker | Total | Free | Half a day, 4 GB RAM | Only if you want offline dev. Not recommended here. |

**Recommended: A for rehearsal, B for building.**

Your organisation is on the free plan with one project, and free allows two. Create
a second project called `tryp-staging`, apply each migration there first, confirm
it does what you expect, then apply the identical file to production. It costs
nothing and it means no migration ever touches production having never been run
before.

Then build the interface on localhost pointed at **production**, flag-gated. You
get real data shapes, real creator counts, the real 20-spellings-of-country mess,
and the real 35 chat messages. Fake seed data would hide every one of those.

Docker and the Supabase CLI are not currently installed and `supabase/config.toml`
does not exist, so option C is a half-day of setup for a benefit you do not need.
Skip it.

### On Supabase Pro: you were right, I overstated it

Pro is **not** needed to build. Here is precisely what needs it and when.

| Needs Pro | When it actually bites |
| --- | --- |
| Database branching | Only if you use branching for your test environment. You are not: you are using a second free project plus feature flags. **Not needed.** |
| Automated daily backups and PITR | Free tier has none. Mitigate with a manual `pg_dump` before phase 7. **Not needed until then, and even then it is optional.** |
| Storage above 1 GB | ~130 creators. **Needed at onboarding, not at build.** |
| Realtime above 200 concurrent | ~300 creators. **Needed at scale.** |

So: build free, upgrade when you start onboarding. That is exactly what you said.

**The one thing I would not skip:** take a manual `pg_dump` before phase 7. It is
free, it takes two minutes, and it is the only real safety gap on the free plan.
The nightly backup workflow is currently failing on a wrong `SUPABASE_DB_URL`
secret, so right now you have no backup at all, which is worth fixing regardless of
this project.

---

## Part 1: The standing brief

> Paste this at the top of every build session, then add one phase prompt from
> Part 2.

```
CONTEXT

You are working on the Tryp.com creator platform: a live React 18 + Vite +
Tailwind app on Vercel with a Supabase backend, at /Users/ethan/tryp-creator-platform.
It currently runs the UK creator programme with 44 active creators and one live
challenge. Node is not on the global PATH: use `export PATH="$HOME/.local/node/bin:$PATH"`
and run all npm/vitest commands from the repo root.

Supabase project ref: heuhqqoxyggawuckxocp (eu-central-2, free plan).
Live site: https://trypcreators.vercel.app, auto-deploys from `main`.

We are turning this from a single UK community into ONE WORLDWIDE NETWORK with
local market chapters nested inside it. The full plan is in
docs/booklet/build-plan.html. Read it before proposing anything structural.

LOCKED ARCHITECTURE (do not re-litigate these)

1. Nested, not parallel. There is exactly ONE network community ("Worldwide") that
   every creator belongs to automatically and permanently. Chapters (UK & Ireland,
   Iberia, DACH, Nordics, Benelux) sit INSIDE it. UK is a chapter, not the parent.

2. Three scopes:
   - NETWORK: directory, world map, collab board, connections, DMs, daily game,
     #worldwide chat, #introductions, #announcements, global challenges, resources,
     jobs, tiers, lifetime Miles, Nations board.
   - CHAPTER: briefs, submissions, results, payouts, rewards, invoices, roster,
     applications, local chat channels, local events, announcements, budget, CPM,
     season goal.
   - PERSONAL: DMs, notifications, payment details, phone/email, photos, settings.

3. Nothing social is chapter-scoped. Connections, DMs, the collab travel board,
   the creator map and the daily game stay network-wide. This is deliberate and it
   is the single most important product decision in the project.

4. RLS is the security boundary, the UI is convenience. Membership lives in a
   TABLE, never in JWT claims (jwt_exp is 604800 and refresh tokens never expire,
   so a claim can be a week stale). Use STABLE SECURITY DEFINER helpers
   my_scopes() and my_managed_scopes(), always called as `(select my_scopes())`
   inside policies so Postgres evaluates them once per query, not once per row.
   Every write policy needs WITH CHECK, not just USING.

5. Roles: `creator` and `manager` are MEMBERSHIP roles on community_members.
   `global_admin` is a PLATFORM role on profiles.platform_role. A country manager
   can never read DMs or another chapter's data. Global admin promotion is manual
   and audit-logged, never granted by a token or invite.

6. Expand / migrate / contract. Additive migrations go to PRODUCTION early and
   invisibly. The user-visible cutover is a FEATURE FLAG FLIP, not a migration.
   Destructive changes come weeks later and only with explicit approval.

HARD CONSTRAINTS

- Do NOT break the live UK experience. A UK creator's row counts must be identical
  before and after, on every table.
- Work on branch `feat/global-network`. Never commit to `main` unless the change is
  a UK fix that is meant to ship immediately.
- Never run a destructive migration (DROP, NOT NULL on existing data, policy
  removal) without asking me first and telling me what is irreversible.
- Never hand-edit the database through the Supabase dashboard. Every schema change
  is a numbered file in supabase/migrations/ so the branch and production stay in
  step.
- Test every migration on the `tryp-staging` project before production.
- When testing triggers against production, `alter table ... disable trigger` first
  or all 44 creators get notified.

HOUSE RULES (from CLAUDE.md and existing code)

- No em dashes anywhere in user-facing copy.
- White-dominant, spacious, Poppins, orange #d94407 / #f5853f accents only.
- Clean line icons via Icon.jsx, never emoji, in nav and admin chrome.
- Never use window.confirm/alert/prompt. Use confirm()/notice()/promptText() from
  src/lib/confirm.js.
- Buttons lift and magnify on hover, they do not change colour.
- Metric definitions live in src/lib/programme.js and nowhere else. Reuse
  cpmBand() and convert(); do not write a second definition of "over target".
- supabase-js builders are lazy: .rpc()/.from() without await or .then never sends.

HOW TO WORK

- Tell me your plan before writing migrations. I want to see the SQL.
- Small commits, one concern each.
- After each phase, run the verification listed in the phase prompt and show me the
  output. Do not tell me it worked without the numbers.
```

---

## Part 2: Phase prompts

Paste one at a time, under the standing brief. Do not run two at once.

### Phase 0: unblock

```
Phase 0. No feature work yet. Four things, in this order:

1. Fix the failing nightly backup: the GitHub Actions secret SUPABASE_DB_URL holds
   a wrong password. Tell me exactly what to do; I will set the secret.

2. Add `country_code char(2)` to profiles as migration 070. Backfill all 44 active
   creators from the free-text `country` column, which has 20 distinct spellings of
   about 13 countries including "Uk", "UK", "United Kingdom", "Uk " with a trailing
   space, "Ireland " and "Scotland". Write the mapping explicitly in the migration,
   do not guess with fuzzy matching. Keep the free-text column for display.
   VERIFY: select count(*) from profiles where status='active' and country_code is
   null  ->  must be 0. Show me the full mapping before you run it.

3. Create the `tryp-staging` Supabase project on the free plan and give me the steps
   to point a local .env.staging at it.

4. Tell me what is needed to verify mail.tryp.com with Resend. I will do the DNS.

Do not touch any other table.
```

### Phase 1: expand

```
Phase 1. Additive only. Nothing user-visible.

Migration 071: create `communities`, `community_members`, `channels` and
`community_invites` exactly as specified in docs/booklet/build-plan.html Part 03,
including the partial unique indexes (one network community, one home chapter per
profile). Add profiles.platform_role. Seed two rows: Worldwide (kind='network') and
UK & Ireland (kind='chapter', country_codes = {GB,IE}, GBP, Europe/London).

Migration 072: add nullable `community_id uuid references communities(id)` plus an
index to the 18 scoped tables listed in the booklet. Nullable, no defaults, no
policy changes, no triggers yet.

Run both on tryp-staging first. Then production.

VERIFY on production after: the live site still works, and
  select count(*) from challenges where community_id is null  ->  1 (unchanged)
  select count(*) from communities  ->  2
Confirm no existing policy was modified: compare pg_policies count before and
after, it must still be 119.
```

### Phase 2: migrate

```
Phase 2. Backfill. Still nothing user-visible.

Migration 073: snapshot the pre-state into migration_073_snapshot, then give every
active and pending profile a community_members row:
  - Worldwide for everyone, role='creator'
  - UK & Ireland as is_home=true for country_code in (GB, IE)
  - creators in any other country: Worldwide only, no home chapter (this is a legal
    state, not an error)
  - the two profiles with is_admin=true get platform_role='global_admin' and a
    manager membership in UK & Ireland

Migration 074: set community_id on all existing rows in the 18 tables. Everything
existing is UK & Ireland EXCEPT the three chat channels, which become Worldwide
(see the chat decision below). Create the channel rows and populate
messages.channel_id by trigger from messages.channel. Keep messages.channel.

CHAT DECISION, locked: the existing #general (32 messages) becomes the WORLDWIDE
room. Do not put it behind a chapter wall and do not duplicate it. Chapters get
purposeful channels only (#briefs, #wins, #meetups), created later.

VERIFY:
  - 30 members in UKI, 14 Worldwide-only, 44 total distinct profiles
  - select count(*) from messages where channel_id is null  ->  0
  - message counts per channel unchanged: general 32, announcements 2, tips 1
Show me these numbers before moving on.
```

### Phase 3: security

```
Phase 3. RLS v2, added ALONGSIDE the existing policies, never replacing them yet.

Create my_scopes() and my_managed_scopes() as STABLE SECURITY DEFINER, per the
booklet Part 04. Add the new read and staff-write policies to all 18 scoped tables
using the exact pattern in the booklet, always `(select my_scopes())` and always
with WITH CHECK on writes.

Then scope the ten admin_* RPCs so a country manager can only ever see their own
chapters. admin_list_emails is the sharp one: today it would hand a Spanish CM
every UK creator's email.

Then audit all 15 notify_all() call sites ONE AT A TIME and tell me, for each,
whether it should be network-wide or chapter-scoped, with your reasoning. Do not
change them in bulk. Add notify_community() alongside notify_all(), keep both.

VERIFY with the shadow diff script, as four personas:
  uk_creator      -> row counts IDENTICAL to before, every table
  no_chapter      -> network rows only, ZERO chapter-scoped rows
  iberia_manager  -> ZERO UKI rows
  global_admin    -> exact sum of all chapters
Show me the full diff table. Do not proceed if a single number is off.
```

### Phase 4: the new shell

```
Phase 4. Interface, entirely behind a feature flag. This is the biggest phase.

Add the flag mechanism first: profiles.feature_flags text[] plus an app_settings
row with stages off / admins / staff / pilot / all, and a useFlag() hook. Ship the
flag console at /global/flags before anything that depends on it.

Then, gated by useFlag('global_network'):
  - route restructure per booklet Part 06: network routes with no slug, chapter
    routes under /c/:slug, staff under /manage/:slug, global admin under /global
  - CommunityContext resolving the slug and validating membership on every change
  - the cmdk command-palette switcher, with the chapter accent colour shifting the
    app's CSS custom property
  - roles through AuthContext and ProtectedRoute
  - the chat channel refactor: new shell reads channel_id, old shell reads the text
    column, both write both
  - the 21 admin pages split into chapter-scoped and global versions

Legacy routes (/challenges, /chat, /events, /rewards) must redirect, never 404.

VERIFY: with the flag off, the app must be byte-identical in behaviour to main.
Run the existing vitest suite. Then set the flag on for your account only and walk
every route.
```

### Phase 5 onward

```
Phase 5: global dashboard and CM worklist, plus the historical CSV import.
Phase 6: rollout rungs 1 to 4 (admins, staff, 5 pilot creators, all of UKI), and
         the chapter creation wizard + invite system.
Phase 7: open Iberia. Then Miles, tiers, seasons, divisions, Nations.
Phase 8: contract. Drop old policies, messages.channel, is_admin. ASK FIRST, and
         take a pg_dump immediately before.
```

---

## Part 3: Guardrails

Things that go wrong on builds like this, and the rule that prevents each.

| Failure | Rule |
| --- | --- |
| The branch drifts and merging becomes a rewrite | Merge `main` into the branch every time you ship a UK fix, minimum weekly |
| A migration runs on production having never run anywhere | Every migration goes to `tryp-staging` first, no exceptions |
| Production and the branch disagree about the schema | Every schema change is a numbered file. Nobody touches the dashboard SQL editor. |
| 44 creators get a test notification | `alter table ... disable trigger` before testing anything that fires notify_all |
| A policy change silently hides UK content | Shadow diff, four personas, before dropping anything |
| A CM sees another market's emails | The scope check lives inside the SECURITY DEFINER function, never in the caller |
| The cutover goes wrong and there is no way back | The cutover is a flag flip. If it is ever a migration, you have designed it wrong. |
| Someone re-opens a settled decision mid-build | The locked list in Part 1. Changing it is a deliberate act, not a session's whim. |
| The rebrand collides with the migration | Rename after phase 6. Never during. |

---

## Part 4: The community model, confirmed

Your description, with the refinements I would make.

### What you said

Creator joins, lands in the global community, gets sorted into their market
community based on their application, keeps access to the global community, can
request to join others as separate tabs. Global has a general chat and a management
chat. Every market chapter has the same general skeleton. Connection and collab
features live globally; specific features live in the market pages.

**That is right, and it is what the plan builds.** Four refinements.

### 1. Suggest the chapter, do not silently assign it

Auto-assignment from country is the right instinct, but `profiles.country` is free
text with 20 spellings, and a British creator living in Lisbon should choose for
themselves. So: onboarding suggests a chapter from their country code, shows it as
a one-tap confirm, and always allows an override. This also stops the data quality
problem recurring, because from then on the chapter is a foreign key rather than a
typed string.

### 2. Secondary chapters need two guards

Letting creators request other chapters is good. Without limits it dissolves the
concept, because everyone joins everything and a chapter stops meaning anything.

- **Cap secondary memberships at two.** Home chapter plus two.
- **Only your home chapter pays you.** Secondary membership is read and chat, not
  earn. Without this rule a creator could enter five chapters' briefs and the payout
  model breaks, and five CMs each think they are funding the same person.
- Requests go to the CM of the target chapter to approve or decline.

### 3. "Management chat" is two different rooms, and you want both

- **`#announcements`** — the Tryp team posts, everyone reads, nobody replies.
  This already exists.
- **`#staff`** — country managers and global admins only, completely invisible to
  creators. Six people each running a market will teach each other faster than you
  can teach them one at a time. This is new and it is worth having from the day the
  second chapter opens.

### 4. Add `#introductions` to the global community

This is the cheapest fix for the empty-room problem you have. One room where the
only thing you do is post one line when you join. Zero social risk, because
everybody's post looks the same and there is no way to get it wrong. It is never
empty, because every new creator posts in it. And it gives existing members
something trivial and low-stakes to respond to, which is how a room learns to talk.

You have 35 chat messages and 22 creators who have never opened the app. An
introductions room is one table row and it will outperform every other chat feature
on this list.

### The global community, in full

| Surface | Notes |
| --- | --- |
| `#worldwide` general chat | Inherits the existing #general and its 32 messages |
| `#introductions` | New. One line when you join. |
| `#announcements` | Team posts, everyone reads |
| `#staff` | CMs and global admins only, invisible to creators |
| `#wins` | Auto-posted accepted submissions from every chapter |
| Creator directory | All creators, filterable by chapter |
| World map | Promoted to its own page; it is the best thing in the product and it is currently buried |
| Collab travel board | Global by nature. A UK creator going to Barcelona should meet the Barcelona creators. |
| Connections and DMs | Cross-chapter, always |
| Daily game | Already works, 216 plays |
| Global challenges | Occasional, everyone, on top of chapter briefs |
| Nations board | Chapter versus chapter, normalised per active member |
| Passport stamps | Meet a creator from another chapter, collect their stamp |
| Content wall | Best posts from every market, visible to creators too, not just admins |
| Tiers and lifetime Miles | Follow the creator, not the chapter |

### Every chapter, same skeleton

Created automatically by the wizard, which is what makes a market launchable in ten
minutes: home with the live brief and season bar, briefs list, members roster,
`#briefs` / `#wins` / `#meetups` channels, events, rewards, and a CM worklist behind
it.

---

## Part 5: What to do this week

1. **Phase 0.** Backup secret, country codes, staging project, Resend DNS. Half a
   day of work, and three of the four are things only you can do.
2. **Confirm the chapter map.** UKI together, Iberia together, Nordics together is
   my recommendation. Splitting later is a data move; merging back is an apology.
3. **Name the first country manager.** The entire CM toolkit is designed against a
   person. Naming them now makes phases 4 to 6 concrete instead of hypothetical,
   and they should be in the pilot at rung 2.
4. **Then phase 1**, which is two migrations and cannot break anything.

The answer to "should we start building" is yes, but phase 0 is not building and it
is genuinely blocking. Do it first.
