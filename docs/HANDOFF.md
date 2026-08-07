# Handoff: Tryp creator platform, global network build

Self-contained context for a new session or a new person. Paste the whole thing.

Current as of **7 August 2026**. Phase 1 is complete and on production.

---

## 1. What this is

A live creator community platform running Tryp.com's UK content creator programme.
44 active creators, one live challenge, real money moving through it. It replaced a
WhatsApp workflow.

**We are turning it from a single UK community into ONE WORLDWIDE NETWORK with
local market chapters nested inside it.** UK becomes the first chapter, not the
parent. Markets planned: UK & Ireland, Spain, Portugal, Germany, Romania, Nordics,
with an admin flow to add more (e.g. Poland) without code changes.

**The overriding constraint: do not break the live UK experience.** 44 real people
are using this today and a challenge is running.

---

## 2. Stack and access

| | |
| --- | --- |
| Repo | `/Users/ethan/tryp-creator-platform` |
| Stack | React 18, Vite (rolldown), Tailwind, Supabase, deployed on Vercel |
| GitHub | `ethanmc365/content-creator-program` |
| Live | https://trypcreators.vercel.app, auto-deploys from `main` |
| Supabase | ref `heuhqqoxyggawuckxocp`, eu-central-2, **free plan**, Postgres 17 |
| Working branch | `feat/global-network` (phase 1 committed at `7729ca5`) |
| Size | 49 tables → 53, 119 RLS policies, 72 functions, 27.4k LOC, 151 files, 55 routes, 21 admin pages |

**Environment gotchas that will waste your time otherwise:**

- Node is not on the global PATH: `export PATH="$HOME/.local/node/bin:$PATH"`.
- Run all npm/vitest commands from the repo root or vitest picks up the wrong
  config and loses jsdom.
- `./dev.sh` runs the dev server on port 5173.
- **Docker, the Supabase CLI and `supabase/config.toml` do not exist.** There is no
  local Supabase stack. Do not assume `supabase start` works.
- Migrations are numbered files in `supabase/migrations/`, applied via the Supabase
  MCP `apply_migration` or the Management API. **Never hand-edit through the
  dashboard** or the branch and production drift apart.
- `supabase-js` builders are lazy: `.rpc()` / `.from()` without `await` or `.then`
  never sends the request.
- CSP lives in `vercel.json` and is **production only**. Any "works locally, broken
  when deployed" media or network bug: check CSP first.

---

## 3. How the build works without breaking the live app

**One database. Two front-ends. A feature flag decides which one you get.**

```
                    Supabase production (one database)
                    old tables (in use)  +  new tables (invisible)
                              │                      │
              Vercel / main ──┘                      └── localhost / feat branch
              44 UK creators                             you only
              flag OFF, old UI                           flag ON, new UI
```

There is no syncing problem because there is nothing to sync. Both front-ends read
the same database. New tables exist in production from day one and the live app
simply never queries them.

This works because **every migration in phases 1 to 4 is additive**. Creating a
table nobody selects from cannot break a page. Adding a nullable column nobody
writes to cannot break an insert.

**Code branching:** `main` stays deployable and is what creators use. UK fixes go to
`main` and deploy in a minute. `feat/global-network` is the build. Merge `main` into
the branch every time you ship a fix, minimum weekly. A week of drift is twenty
minutes of conflicts; two months is a rewrite.

**Supabase Pro is NOT needed to build.** It is needed for storage above 1 GB
(~130 creators), realtime above 200 concurrent (~300 creators), and automated
backups. Branching also needs Pro, but we are not using branching: we use feature
flags plus a second free project as a migration rehearsal space. Upgrade at
onboarding, not now.

---

## 4. Locked architecture

These are settled. A session should not re-litigate them.

### Nested, not parallel

Exactly **one** community of `kind='network'` ("Worldwide") that every creator
belongs to automatically and permanently. Chapters sit **inside** it. Enforced by a
partial unique index so `my_scopes()` can include it unconditionally.

### Three scopes

- **NETWORK** — creator directory, world map, collab travel board, connections,
  DMs, daily game, `#worldwide` chat, `#introductions`, `#announcements`, `#staff`,
  global challenges, resources, jobs, tiers, lifetime Miles, Nations board.
- **CHAPTER** — briefs, submissions, results, payouts, rewards, invoices, roster,
  applications, local chat channels, local events, announcements, budget, CPM,
  season goal.
- **PERSONAL** — DMs, notifications, payment details, phone/email, photos, settings.

### Nothing social is chapter-scoped

Connections, DMs, the collab travel board, the creator map and the daily game stay
network-wide. **This is the single most important product decision in the project.**
The rationale is in the data: the only things working today are private, one-to-one
or single-player (50 connections, 216 game plays, 272 photos, 24 trips) while the
public square is dead (38 chat messages, two thirds from the organiser). Cutting the
working mechanics into six chapters would make them six times weaker.

### Security

- RLS is the boundary, the UI is convenience.
- **Membership lives in a TABLE, never in JWT claims.** `jwt_exp` is 604800 (a week)
  and refresh tokens never expire by design, so a claim can be a week stale: a
  removed creator would keep reading for a week. This contradicts the standard
  multi-tenant advice and the contradiction is deliberate.
- Helpers `my_scopes()` and `my_managed_scopes()` are `STABLE SECURITY DEFINER`.
  `SECURITY DEFINER` is required, not optional: `community_members` is itself
  RLS-protected and querying it from an invoker-rights function inside a policy
  gives "infinite recursion detected in policy".
- Always call them as `(select my_scopes())` inside a policy so Postgres evaluates
  once per query (InitPlan) instead of once per row.
- Every write policy needs `WITH CHECK`, not just `USING`. Omitting it lets a
  manager insert into a chapter they do not manage. It is the most common
  multi-tenant RLS hole.

### Roles

- `creator` and `manager` are **membership** roles on `community_members`.
- `global_admin` is a **platform** role on `profiles.platform_role`.
- A country manager can never read DMs, nor any other chapter's data.
- Global admin promotion is manual and audit-logged, never granted by a token.

### Expand / migrate / contract

Additive migrations go to production early and invisibly. **The user-visible
cutover is a feature flag flip, not a migration**, so rollback takes two seconds and
needs no database work. Destructive changes come weeks later, with explicit
approval.

---

## 5. What is already built (phase 1, live on production)

Branch `feat/global-network`, commit `7729ca5`. Three migrations applied.

**`070_country_codes`** — `profiles.country_code char(2)`, ISO 3166-1 alpha-2. The
free-text `country` column had **20 spellings of 13 countries** (`Uk`, `UK`, `Uk `
with a trailing space, `United Kingdom`, `Scotland`, `Ireland`, `Ireland `). Mapping
is explicit, not fuzzy. Free text kept for display.
*Verified: all 44 active creators mapped, 0 unmapped.*

**`071_communities_core`** — creates `communities`, `community_members`, `channels`,
`community_invites`, plus `profiles.platform_role`. RLS enabled with **zero
policies** (deny-all to API roles, service-role only) until phase 3. Seeds seven
communities.

**`072_scope_columns`** — nullable `community_id` plus index on 17 tables, plus
`messages.channel_id` and `channel_reads.channel_id`.

### Seeded communities

| slug | name | kind | country codes | currency | active |
| --- | --- | --- | --- | --- | --- |
| `worldwide` | Worldwide | network | — | EUR | yes |
| `uk` | UK & Ireland | chapter | GB, IE | GBP | yes |
| `spain` | Spain | chapter | ES | EUR | no |
| `portugal` | Portugal | chapter | PT | EUR | no |
| `germany` | Germany | chapter | DE | EUR | no |
| `romania` | Romania | chapter | RO | RON | no |
| `nordics` | Nordics | chapter | SE, DK, NO, FI, IS | EUR | no |

Inactive chapters are invisible and unjoinable until they have a lead. Adding
Poland later is one row in the same table.

### Verified after phase 1

- `pg_policies` still **119** (nothing existing was touched)
- All row counts intact, `is_admin` still 2, `platform_role` set on nobody
- `community_members` empty (correct, that is phase 2)
- Live site renders: 43 creators, 1 challenge, £500 prizes, live-challenge strip,
  creator map. No console errors. All four anonymous landing RPCs still work.

### Tables that deliberately did NOT get a scope

`connections`, `conversations`, `direct_messages`, `dm_reactions`, `collab_posts`,
`collab_interests`, `creator_photos`, `game_scores`, `game_events`, `notifications`,
`creator_private`, `push_subscriptions`, `resource_bookmarks`, `channel_reads`,
`job_applications`, `poll_votes`, `reactions`, `event_rsvps`, the event_poll family.
Their existing policies survive the project untouched.

---

## 6. What is next

### Phase 2: backfill (next up, first phase where a mistake is visible)

- Snapshot pre-state into a `migration_073_snapshot` table so reversal is exact.
- Every active and pending profile gets a Worldwide membership.
- **Every current creator gets UK & Ireland as `is_home`, regardless of country.**
  See the reasoning in section 8. This is not a country-based split.
- The two `is_admin=true` profiles get `platform_role='global_admin'` plus a manager
  membership in UK.
- Scope all existing rows in the 17 tables to UK.
- Create channel rows and populate `messages.channel_id` by trigger from
  `messages.channel`. Keep `messages.channel`.
- **Chat decision, locked:** the existing `#general` (38 messages) becomes the
  **Worldwide** room, not UK's. Do not put it behind a chapter wall and do not
  duplicate it. Chapters get purposeful channels only (`#briefs`, `#wins`,
  `#meetups`), which do not need conversational density to feel alive.

*Verify: 44 memberships in UK, 44 in Worldwide, `messages.channel_id` null count 0,
per-channel message counts unchanged.*

### Phase 3: RLS v2

Helpers, then new policies added **alongside** the old ones (Postgres ORs permissive
policies, so a UK creator satisfies both and sees exactly what they saw). Scope the
ten `admin_*` RPCs. Audit all 15 `notify_all()` call sites **one at a time**.

*Gate: shadow diff as four personas, and do not proceed if a single number is off:*

| persona | expected |
| --- | --- |
| UK creator | row counts **identical** to before, every table |
| creator with no chapter | network rows only, **zero** chapter rows |
| Spain manager | **zero** UK rows |
| global admin | exact **sum** of all chapters |

### Phase 4: the new shell, behind a feature flag

Flag mechanism first (`profiles.feature_flags` + an `app_settings` stage of
off/admins/staff/pilot/all + a `useFlag()` hook), then routes
(`/c/:slug`, `/manage/:slug`, `/global`), `CommunityContext`, the `cmdk` switcher,
the chat channel refactor, and the 21 admin pages split into chapter and global
versions. Legacy routes redirect, never 404.

### Phase 5 onward

Global dashboard and CM worklist plus the historical CSV import → rollout rungs
(admins, staff, 5 pilot creators, all UK) plus the chapter wizard and invites →
open Spain → Miles, tiers, seasons, divisions, Nations → contract (drop old
policies, `messages.channel`, `is_admin`).

---

## 7. Hard constraints and house rules

**Constraints**

- Do not break the live UK experience. A UK creator's row counts must be identical
  before and after, on every table.
- Work on `feat/global-network`. Only touch `main` for UK fixes meant to ship now.
- **Never run a destructive migration** (DROP, NOT NULL on existing data, policy
  removal) without asking first and naming what is irreversible.
- Every schema change is a numbered migration file. No dashboard edits.
- When testing triggers against production, `alter table ... disable trigger` first
  or all 44 creators get notified.
- Take a manual `pg_dump` before the contract phase. Free tier has no automated
  backups and the nightly workflow is currently broken (see section 9).

**House rules from CLAUDE.md and the existing code**

- **No em dashes anywhere** in user-facing copy.
- White-dominant, spacious, Poppins, orange `#d94407` / `#f5853f` accents only.
- Clean line icons via `Icon.jsx`, never emoji, in nav and admin chrome.
- Never `window.confirm/alert/prompt`. Use `confirm()` / `notice()` / `promptText()`
  from `src/lib/confirm.js`. Chrome's "don't show again" makes natives silently
  return false forever; this broke admin accept/promote for weeks.
- Buttons lift and magnify on hover, they do not change colour.
- Metric definitions live in `src/lib/programme.js` and nowhere else. Reuse
  `cpmBand()` and `convert()`. Do not write a second definition of "over target".

---

## 8. Key numbers and why decisions were made

### The community, measured 5 August 2026

| | |
| --- | --- |
| Active creators | 44 (+5 pending, 2 admins) |
| **Never opened the app** | **22 (50%)** |
| Opened in last 7 / 30 days | 16 / 24 |
| **Push subscriptions** | **6** |
| Submissions | 27 → 28, from 11 unique creators (25%) |
| Total logged views | 37,383. Median post 759, best 12,700 |
| Chat messages, all time | 35 → 38, two thirds from the organiser |
| Connections / game plays / photos / trips | 50 / 216 / 272 / 24 |

### The economics nobody had written down

Live challenge: £190 pot, 3 winners, 37,383 views, 27 posts.

- **CPM £5.08** against a stated £0.50 target, so 10x over.
- **Cost per accepted asset £7.04**, which is excellent (UGC market rate is
  $150–300 per video).
- 33 of 44 creators got nothing.

**Reading:** the £0.50 target came from comparing against paid social impressions,
which are a different unit of value. Keep CPM on the dashboard because a paid media
team will ask, but lead with cost per accepted asset, and set the target per
chapter.

### Country distribution (drives future signups, NOT the backfill)

GB 19, IE 11, then NL 2, ES 2, US 2, and one each of AU, BE, DE, IS, MY, PT, PL, LV.

**Why every current creator goes into UK regardless of country:** Ireland holds
**3 of the 11 creators who submitted** to the live challenge, and Latvia and Poland
have one each. Splitting by country now would eject 5 of 11 participants from a
running challenge, which breaks the hard constraint. Reassignment becomes a
deliberate admin action later, once the target chapters are live.

**Why UK is seeded as "UK & Ireland" with `{GB,IE}`:** Ireland is 11 of 44 creators.
Renaming it to plain "UK" and splitting Ireland out later is one `UPDATE`; ejecting
Irish creators from a live challenge is not recoverable.

---

## 9. Open items

**Blockers that are not code and only Ethan can do**

1. **Nightly backup is broken.** The GitHub Actions secret `SUPABASE_DB_URL` holds a
   wrong password. There is currently no backup at all, and free tier has no
   automated ones.
2. **Resend sending domain unverified.** `mail.tryp.com` DNS is not set, so email is
   sandboxed. With 6 push subscriptions across 44 creators, email is the only
   channel that reaches anyone, and every invite, announcement and payout
   notification in the plan assumes it works.

**Decisions outstanding**

3. Set up the `tryp-staging` free Supabase project before phase 3? (Org allows two
   projects; phase 1 went straight to production because it was additive and
   reversible, but phase 3 changes visibility and deserves a rehearsal.)
4. Confirm `#general` becomes Worldwide rather than UK's.
5. Per-chapter accent colours for the switcher tint conflict with the orange-only
   house rule. `communities.brand` is empty jsonb pending a call.
6. **Invoicing entity per market.** Does Tryp.com LDA (Lisbon) invoice everyone, or
   do markets have their own entities? Different VAT situations per country. This
   blocks payouts in every new chapter and is a finance question, not engineering.
7. Name the first country manager. The whole CM toolkit is designed against a real
   person.

---

## 10. Deeper reference

- `docs/booklet/build-plan.html` — the full plan: architecture, RLS drafts, route
  map for all 55 existing plus ~24 new pages, CM toolkit, analytics definitions,
  Miles and tiers, scale limits, risk register. **Read this before proposing
  anything structural.**
- `docs/BUILD_BRIEF.md` — phase-by-phase prompts and guardrails.
- `docs/ENGAGEMENT_DIAGNOSIS_AND_REBRAND.md` — why engagement is low, measured.
- `docs/FIFTY_IDEAS_2026-08.md` — 50 ranked improvement ideas.
- `docs/STORAGE_AUDIT_2026-08.md` — storage runway.

**Sixteen places where single-tenant assumptions are baked in** are catalogued in
the booklet, Part 02. The four expensive ones: chat channels are strings not rows;
`notify_all()` is an unconditional broadcast called by 15 triggers; `is_admin` is a
boolean across 23 files; and ten `admin_*` RPCs return whole-platform data
(`admin_list_emails` would hand a Spanish CM every UK creator's email).
