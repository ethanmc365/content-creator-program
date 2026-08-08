# Tryp.com creator platform: handoff

Paste this whole file to start a session. **Current as of 8 August 2026.**
Keep it lean: it is read every time, so stale detail costs tokens on every turn.

---

## 1. What this is, and the one hard rule

A live creator community running Tryp.com's content creator programme.
**43 active creators, a live UK challenge, real money moving through it.**

It is becoming **one worldwide network with local market chapters nested inside
it**. UK is the first chapter, not the parent. Spain is open as the reference
market. Portugal, Germany, Romania and the Nordics exist but are closed.

> **The rule that overrides everything: do not break the live UK experience.**
> A UK creator's row counts must be identical before and after any change, on
> every table. Verify it, do not assume it.

---

## 2. Access and environment

| | |
| --- | --- |
| Repo | `/Users/ethan/tryp-creator-platform` |
| Stack | React 18, Vite (rolldown), Tailwind, Supabase, Vercel |
| GitHub | `ethanmc365/content-creator-program` |
| Live | https://trypcreators.vercel.app, auto-deploys from `main` |
| Supabase | ref `heuhqqoxyggawuckxocp`, eu-central-2, **free plan**, Postgres 17 |

**Environment gotchas that will otherwise waste an hour:**

- Node is not on the global PATH: `export PATH="$HOME/.local/node/bin:$PATH"`.
- Run npm/vitest from the repo root or vitest loses jsdom.
- **The shell's cwd silently resets to `/Users/ethan`.** Use absolute paths, or
  you will `npm install` into the home directory. This has happened.
- **No Docker, no Supabase CLI, no local Supabase.** `supabase start` does not
  work. Migrations go through the Supabase MCP `apply_migration`.
- `supabase-js` builders are lazy: `.rpc()` / `.from()` without `await` or
  `.then` never sends the request.
- CSP lives in `vercel.json` and is **production only**. Any "works locally,
  broken when deployed" media bug: check CSP first.
- **Verify a deploy by SHA, not by HTTP 200.** This is an SPA, so Vercel returns
  `index.html` with status 200 for *any* unknown path, including asset paths
  that do not exist. Check `get_deployment` on the production alias, or check
  `content-type` is `application/javascript`. A push has silently failed to
  trigger a Vercel build before; an empty commit re-fires it.

---

## 3. Current state

**Migrations 070 to 081 applied.** Numbers as of 8 Aug 2026: 51 profiles
(43 active creators, 5 pending, 2 admins + 1 test), 28 submissions,
128 messages, 2 challenges, 7 communities, 23 channels, 102 memberships.

| Migration | What it did |
| --- | --- |
| `070` | `profiles.country_code` (20 spellings of 13 countries, mapped explicitly) |
| `071` | `communities`, `community_members`, `channels`, `community_invites`, `platform_role` |
| `072` | nullable `community_id` on 17 tables + `messages.channel_id` |
| `073` | Backfill: everyone into Worldwide + UK home, channel rows, scoping |
| `074` | `my_scopes()`, `my_managed_scopes()`, `is_global_admin()` + RLS on the four new tables |
| `075` | Spain opened |
| `076` | **Points engine** + scope-aware notifications + per-market rooms |
| `077` | Spain's rules and live challenge (the market template) |
| `078` | **Scoped `challenges` visibility** (closed a real leak, see §5) |
| `079` | `create_market()` RPC + `communities.settings` |
| `080` | Copies a market's rule template onto a points challenge |
| `081` | Widened `messages_channel_check` to allow namespaced room keys |

**Front end:** `/global` (network hub), `/c/:slug` (a market), `/manage/:slug`
(country manager), `/global/settings` (market wizard), `/global/chat/:key` and
`/c/:slug/chat/:key` (rooms). All behind `NetworkRoute`.

---

## 4. Locked decisions. Do not re-litigate these.

- **Nested, not parallel.** Exactly one `kind='network'` community that everyone
  belongs to permanently, enforced by a partial unique index.
- **Nothing social is chapter-scoped.** Connections, DMs, the collab board, the
  map and the daily game stay network-wide. The only mechanics that work today
  are the private and one-to-one ones; splitting them six ways makes each six
  times weaker. This is the most important product decision in the project.
- **`#general` is Worldwide's**, not UK's. It holds 110 of 128 messages and is
  the only room with any density.
- **Everyone's home is UK regardless of country.** Ireland holds 3 of the 11
  creators who submitted to the live challenge; splitting by country would eject
  them mid-challenge.
- **Membership lives in a TABLE, never a JWT claim.** `jwt_exp` is 604800 and
  refresh tokens never expire, so a claim can be a week stale and a removed
  creator would keep reading for a week.
- **Rooms are kept apart by a namespace, not by care.** Chapter rooms write
  `channel = '<slug>:<key>'`. The live `Chat.jsx` runs `.eq('channel','general')`,
  which can never match `spain:general`. Worldwide keeps the bare key because its
  `#general` *is* the real thread.
- **Points are a ledger, not a total.** `point_awards` rows carry provenance;
  auto awards rebuild on recalculation, manual ones survive.
- **Challenge rules are COPIED from the market template, never referenced**, so
  editing a template cannot rescore a running challenge.

### Security model

- RLS is the boundary; the UI is convenience.
- Helpers are `STABLE SECURITY DEFINER` (required: `community_members` is itself
  RLS-protected, and an invoker-rights function inside its own policy gives
  "infinite recursion detected in policy").
- Always call them as `(select my_scopes())` so Postgres evaluates once per
  query, not once per row.
- **Every write policy needs `WITH CHECK`, not just `USING`.** Omitting it lets a
  manager insert into a chapter they do not manage. Most common multi-tenant hole.
- `creator` / `manager` are membership roles; `global_admin` is
  `profiles.platform_role`. A country manager can never read DMs or another
  market's data.

### The preview gate

`src/lib/featureFlags.js` (NOT `flags.js`, which is country emoji) holds a
device-local flag. `NetworkRoute` requires **flag AND `isAdmin`**;
`CommunityContext` issues zero queries unless both hold. Verified end to end: a
real creator with the flag hand-set to `1` is redirected off `/global` and
`/c/:slug` and sees no pill.

---

## 5. Known gaps, in priority order

1. **`is_member()` scoping is only fixed on `challenges`.** The same flaw —
   `is_member()` means "is an approved creator", not "is a creator *here*" —
   still affects **submissions, results, rewards and events**. Nothing leaks
   today because Spain has no rows in them. It will the moment it does. Each
   needs the four-persona check first.
2. **`notify_all()` is still an unconditional broadcast** called by 15 triggers.
   Only `on_challenge_live` was switched to `notify_community()`. A Spanish
   announcement would still notify every UK creator.
3. **`Chat.jsx` (1330 lines) still uses a hardcoded channel array** and reads
   `messages.channel` as text. The new rooms are a separate component. The
   cutover to `channel_id`, per-community `channel_reads`, pinning and mentions
   is unbuilt.
4. Challenge creation exposes points vs prizes, but not a per-challenge rule
   editor (rules are edited per market in `/manage/:slug`).
5. `is_admin` boolean still read across 23 files; `platform_role` is written
   alongside it and nothing has been retired yet.

---

## 6. House rules

- **No em dashes anywhere** in user-facing copy.
- White-dominant, spacious, Poppins, orange `#d94407` / `#f5853f` only.
- Line icons via `Icon.jsx`, never emoji, in nav and admin chrome. Country flags
  on market cards are the one exception.
- Never `window.confirm/alert/prompt`. Use `confirm()` / `notice()` /
  `promptText()` from `src/lib/confirm.js`. Chrome's "don't show again" makes
  natives return false forever; this broke admin accept/promote for weeks.
  `promptText` returns null for BOTH cancel and empty.
- Buttons lift and magnify on hover; they never change colour.
- Metric definitions live in `src/lib/programme.js` and nowhere else.
- Motion language lives in `src/lib/motion.js`. **Import `motion` only from
  lazily-loaded files** — importing it in `main.jsx` pulls its 120kB chunk into
  the bundle every UK creator downloads.
- Never run a destructive migration (DROP, NOT NULL on existing data, policy
  removal) without asking and naming what is irreversible.
- Dark mode overrides `.bg-white` but **not** `lg:bg-white`. Breakpoint-prefixed
  colour utilities silently stay light.

### Testing

- QA logins: `qa-admin@trypcreators.test` / `qa-creator@trypcreators.test`,
  password `QaTryp!2026`. **Log in on localhost** — Turnstile's site key is
  domain-bound, so login fails on preview/branch URLs.
- Controlled React inputs need the native setter + an `input` event, then
  `form.requestSubmit()`.
- **The preview pane runs with `document.hidden = true` and fires zero
  animation frames**, so entrance animations freeze at opacity 0. This is not a
  bug and affects the app's existing CSS animations identically. Inject
  `*{opacity:1!important;animation:none!important}` before screenshotting, or
  assert on the DOM instead.

---

## 7. Blocked on Ethan, not on code

1. **Nightly backup is broken.** The `SUPABASE_DB_URL` GitHub secret has a wrong
   password. There is currently **no backup at all** and the free tier has none.
2. **`mail.tryp.com` DNS unverified**, so Resend is sandboxed. With 6 push
   subscriptions across 43 creators, email is the only channel that reaches
   anyone. Every invite and announcement in the plan assumes it works.
3. **Invoicing entity per market.** Does Tryp.com LDA (Lisbon) invoice everyone,
   or do markets have their own entities? Blocks payouts in every new chapter.
   Finance question, not engineering.
4. **Name the first country manager.** The whole CM toolkit is built against a
   real person.
5. **Threshold stacking:** a video past 50k currently scores 10 (`highest`), not
   17 (`cumulative`). Confirm which you meant.

---

## 8. Deeper reference

- `docs/booklet/build-plan.html` — full architecture, RLS drafts, route map,
  scale limits, risk register. **Read before proposing anything structural.**
- `docs/ENGAGEMENT_DIAGNOSIS_AND_REBRAND.md` — why engagement is low, measured.
  Half the community has never opened the app; that dwarfs any feature.
- `docs/FIFTY_IDEAS_2026-08.md`, `docs/STORAGE_AUDIT_2026-08.md`.
