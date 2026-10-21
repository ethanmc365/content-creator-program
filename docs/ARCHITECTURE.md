# Architecture

A map for a developer joining the project. Current as of 21 Oct 2026. The
README covers setup and deploys; this covers how the pieces fit and the rules
the code depends on.

## 1. Shape of the system

```
 Browser (React SPA / installed PWA)
   |  supabase-js: REST (PostgREST), RPC, Realtime websocket, Storage, Auth
   v
 Supabase project
   Postgres 17 ── row level security on every public table
     ├─ ~150 tables in `public`
     ├─ ~590 SQL / PL/pgSQL functions (most SECURITY DEFINER) = the business logic
     ├─ ~215 triggers (scoring, notifications, invoices, audit, fences)
     ├─ pg_cron jobs (reminders, view sync, VIP month close, health)
     └─ pg_net: database -> edge functions over HTTP
   Edge Functions (Deno, supabase/functions/*)
     auth-gate, calendar-feed, geocode, impersonate, media-cleanup,
     notify-dispatch (web push), push-track, send-invoice, thumb-cache,
     translate-text, upload, view-sync (reads TikTok / Instagram / YouTube /
     Facebook view counts)
 Vercel: static hosting of dist/ + headers/CSP (vercel.json)
```

Most product rules live **in the database**, not in React. A screen calls an RPC
(`supabase.rpc('vip_submit_video', ...)`) and the function enforces who may do
what. A rule enforced only in React is enforced nowhere: when a UI door closes,
close the RPC too.

## 2. Source tree

```
src/
  main.jsx            boot: providers, service worker, locale, Sentry
  App.jsx             every route (~110), each page lazy-loaded via lib/lazyRoute
  context/            AuthContext (session, profile, roles, impersonation)
                      CommunityContext (markets, current market, rooms)
                      UnreadContext (room unread counts)
  pages/              one file per route; pages/admin/* = team pages
  components/         grouped by feature: network/ (rooms, markets, people),
                      vip/, admin/, challenge/, calendar/, games/, agreements/,
                      portfolio/, certificate/, wrapped/ (year in review), tour/,
                      layout/ (AppLayout = header, tab bar, route scroll)
  api/                one module per feature that owns its Supabase tables and
                      functions (challenges, submissions, vip, money, profiles,
                      chat, notifications, markets, events, games, flights,
                      agreements, certificates, content, team, settings)
  lib/                plain modules: feature logic (vip.js, markets.js,
                      scoring.js, viewSync.js, invoice.js...), UI utilities
                      (confirm.js, toast.js, chatScroll.js...), i18n.js
  locales/            es/pt/de/ro dictionaries (English text is the key)
supabase/
  schema/             GENERATED snapshot of the live database (read this first)
  migrations/         numbered history; NOT a complete rebuild script (see its README)
  functions/          edge functions; _shared/ holds common Deno code
  tests/*.sql         self-rolling-back rehearsals for scoring and money paths
scripts/              schema snapshot, i18n tools, one-off backfills
docs/                 this file, the move runbook, feature notes (STAGING,
                      AUTOMATIC_VIEWS, EMAIL_SETUP, GOOGLE_SIGN_IN)
docs/archive/         dated briefs and handovers from the build; history only
```

Pages own their data loading, but they do not name tables: every query goes
through `src/api/<feature>.js` (`vipApi.members().select(...)`,
`moneyApi.decideInvoice({...})`). An accessor returns the same supabase-js
builder or `{ data, error }`, so the page code reads as before; a schema rename
or a backend move is a change in one folder. Each module has a test asserting
which table or function every accessor names (`src/api/*.test.js`). The only
generic table access left is Settings' data export and the offline outbox
(`lib/outbox.js`), which by design write to whatever table an item names.

The biggest pages are split into components next to them (`Messages` +
`MessagesInbox`/`MessagesThread`/`MessagesComposer`, `ChallengeDetail` +
`ChallengeDetailSubmitModal`/..., `CreatorMap` + `CreatorMapCanvas`/...). A
part receives what it shows as props from the page; state and effects stay in
the page.

## 3. Talking to Supabase

- One client: `src/lib/supabase.js`. Its fetch is wrapped twice:
  `lib/netQuality` (timeouts + one retry on weak connections) and
  `lib/sharedReads` (identical GETs in flight at the same moment go out once).
- **supabase-js does not throw on a failed write.** Always destructure `error`,
  or wrap a write a person acts on in `saved()` from `lib/confirm` (shows "That
  did not save" and returns false).
- **A failed read shows one retry bar** (`lib/loadTrouble` wraps the client's
  fetch; `components/LoadTrouble` remounts the page). Pages do not need their
  own error state for "it did not load".
- **Builders are lazy**: `.rpc()` / `.from()` without `await` never sends.
- **PostgREST returns at most 1,000 rows silently.** Use `lib/fetchAll` for
  whole tables (needs a unique order key).
- Edge function URLs are built from `VITE_SUPABASE_URL`
  (`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/<name>`). Database code
  gets them from `public.edge_function_url(name)`, which reads
  `private.config.edge_functions_base`.

## 4. Who can see what (security model)

| Helper (SQL) | Meaning |
| --- | --- |
| `is_admin()` / `is_global_admin()` / `is_owner()` | Tryp team; global = every market |
| `my_scopes()` | community ids the caller is an active member of |
| `my_managed_scopes()` | communities the caller manages (market managers) |
| `is_member()` | an active profile (NOT community membership, despite the name) |
| `vip_has_access()`, `vip_my_kind()` | VIP/Official programme staff, and which programme a creator is in |

- Every public table has RLS on. Reads are scoped by market membership; writes
  go through policies or definer RPCs.
- Policies call helpers as `(select f())` so Postgres runs them once per query,
  not once per row (migration 363, and 398 for rooms).
- **VIP and Official creators are fenced** from community challenges, other
  markets' boards and each other's rooms (restrictive policies + triggers).
- **Sandbox accounts** (`profiles.is_sandbox`, the QA logins) are read-only on
  money, mail and settings; `is_test` hides an account from every list.
- New `SECURITY DEFINER` functions: an event trigger grants them to
  `authenticated` and strips `anon`. Internal ones are named `*_internal` or
  listed in `owner_only_rpcs` so no API role can call them. On 14 Oct every one
  of them was reviewed (migration 405); 253 are callable and each checks its
  caller or only reads public data.
- **Own-row updates are column-guarded.** "Update your own row" policies are not
  column-aware, so `api_update_only()` (migration 406) limits what the API roles
  may change on direct_messages (read), conversation_members (last_read_at),
  conversation_invites (status), certificate_awards (seen_at) and connections
  (status, accepted_at).
- **Links from data go through `lib/safeUrl`** before they become an href (and
  the database refuses non-http(s) video, job and meeting links, migration 409).
- `auth.uid()` is null under cron: client-facing functions check the caller;
  their `_internal` twins do the work unguarded and are owner-only.

## 5. Feature map

| Feature | Main tables | Logic lives in |
| --- | --- | --- |
| Markets | `communities` (kind chapter / network), `community_members`, `market_join_requests` | `admin_approve_application`, `admin_set_creator_markets`, `lib/markets.js` |
| Rooms (chat) | `channels`, `messages`, `reactions`, `channel_reads`, `polls` | `pages/NetworkChat.jsx`, `components/network/*`, `lib/chatScroll.js` |
| DMs | `conversations`, `conversation_members`, `direct_messages`, `dm_reactions` | `pages/Messages.jsx`, `lib/dm.js` |
| Challenges | `challenges`, `submissions`, `results` (a cache), `point_rules`, `point_awards`, `challenge_groups` | scoring triggers + `recalc_*` functions, `points_recalc_queue` (cron each minute) |
| View counts | `submissions.logged_views`, `view_snapshots`, `vip_view_readings` | edge `view-sync` (cron `view-sync`, `vip-sync`; trigger `read_new_entry`) |
| VIP / Official | `vip_programmes` (kind vip/official), `vip_members`, `vip_videos`, `vip_months`, `vip_statements`, `vip_bonus_rules`, `vip_ledger` | `vip_*` functions; month close by cron `vip-close` |
| Money | `rewards`, `invoices`, `creator_private` (bank details, DOB) | `raise_invoice_for_reward`, `payment_snapshot`, edge `send-invoice` |
| Notifications | `notifications`, `push_subscriptions`, `email_outbox` | `notify_user` -> trigger -> `dispatch_notifications_batch` -> edge `notify-dispatch` |
| Agreements | `agreements` (versioned), `agreement_acceptances`, `agreement_translations` | `agreement_for`, `accept_agreement`, `lib/agreementPdf.js` |
| Milestones / certificates | `milestones`, `creator_milestones`, `certificate_awards`, `certificate_designs` | `milestone_progress_internal` (cron `reconcile-milestones`) |
| Games, flights, events | `game_scores`, `flights`, `events`, `event_rsvps` | pages of the same name |
| Translations | `translations` (overrides), `content_translations` | `lib/i18n.js`: `tr('English sentence')`, dictionaries in `src/locales` |
| Ops | `client_errors`, `ops_stat_snapshots`, `admin_audit_log` | crons `ops-health-check`, `ops-snapshot-stats`, `cron-health` |

The scheduled jobs (all UTC) are listed with their exact commands in
`supabase/schema/platform.sql`.

## 6. Rules the code relies on

- **Never retype a live function body.** Start from `pg_get_functiondef` and
  change only what you mean to (`supabase/migrations/README.md` has the story).
- **A side effect must not abort the thing it records** (e.g. an invoice
  trigger failing must not block awarding a prize). Wrap it, report it.
- `results` is a cache; views live in `submissions.logged_views`. Nothing
  computes its own leaderboard.
- `notifications_type_check` lists every notification type; add new ones there.
- `pg_safeupdate` is on for the API role: an `UPDATE`/`DELETE` without `WHERE`
  inside a function reached through PostgREST fails. Use `where true`.
- i18n: the key IS the English sentence. Changing English text untranslates it;
  add translations with `node scripts/i18n-merge.mjs <locale> batch.json`.
- Copy has no em dashes. Brand colours `#d94407` / `#f5853f`, Poppins.
- Never `window.confirm/alert/prompt`: use `lib/confirm`.
- CSP is production-only (`vercel.json`): "works locally, broken live" for
  media or network calls means check the CSP first.

## 7. One name per concept

| Concept | Database | `src/api` | What people see |
| --- | --- | --- | --- |
| Market | `communities` with `kind = 'chapter'` (Worldwide is `kind = 'network'`) | `marketsApi.communities()` | "market" (team), the country name (creators) |
| Membership of a market | `community_members` | `marketsApi.communityMembers()` | "member", "home market" |
| Room | `channels` (`key` like `general`, scoped `spain:general`) | `chatApi.channels()` | "room" |
| Paid programme | `vip_programmes` (`kind = 'vip'` or `'official'`) | `vipApi.programmes()` | "VIP programme" / "Official creators" |
| VIP vs official | `vip_programmes.kind`, mirrored on `profiles.vip_kind` | | "VIP" for kind vip, "official creator" for kind official |
| Entry | `submissions` | `submissionsApi.submissions()` | "entry" / "video" |
| Score | `results.final_views` (a cache) | `challengesApi.results()` | points or views |
| Programme | British spelling everywhere, including invoices ("Content Creator Programme") | | |

Names that look like synonyms and are not: `is_member()` means "an active
profile", not "a member of this market"; `community` in a table name always
means a market.

## 8. Monitoring

- **Admin desk** (`/admin`) shows open alerts from `client_errors`: app crashes
  (`report_client_error`) and system faults (`report_system_error`).
- **cron-health** (every 5 minutes) checks every scheduled job's last run,
  raises an alert on failure and pings the external heartbeat in
  `private.config.healthchecks_cron_url`, so a dead scheduler is noticed too.
- **ops-health-check** (every 5 minutes): database health and the scraper watch
  (`ops:views`: no reads for the interval + 2 h during a live challenge, or half
  the last sweep failed). **ops-snapshot-stats** (hourly) stores the heaviest
  queries for Admin > Analytics.
- **Sentry** (EU) receives front-end errors with the release commit.
- Edge function drift: `scripts/edge-drift.sh` and the CI `edge-drift` job.

## 9. Known debt (worth paying down, none of it urgent)

- **Big pages still hold a lot of logic.** The views were lifted out on 14 Oct,
  but `Messages`, `CreatorMap` and `ChallengeDetail` still keep 1,700-2,200
  lines of state and effects each. The next step is custom hooks per concern
  (thread loading, composer, map fitting), one at a time, with the page opened
  after each.
- **Realtime is the biggest database cost** (~20 minutes of database time a day
  in the change-polling query). Every published table is used; reducing it means
  moving the busiest feeds (messages, submissions) to Realtime Broadcast.
  Five subscriptions (`vip_perks`, `vip_guides`, `vip_briefs`, `results`,
  `board_answers`) listen to tables that are not in the publication, so they
  never fire; the pages re-read on focus instead.
- **About 180 indexes show no use** since the 7 Oct restart; most were added on
  13 Oct. Re-check after 30 days of statistics before dropping any (some serve
  monthly jobs).
- **The view reader scrapes TikTok, Instagram and Facebook pages**; see
  docs/SCRAPER_OPTIONS.md for the official routes and the decision Tryp needs to
  make.
- **reconcile-milestones** takes ~1.5 s every 30 minutes. Skipping unchanged
  creators would cut it, but it creates voucher rewards, so it was left as is.
