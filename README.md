# Tryp.com Content Creator Platform

The web app behind the Tryp.com Content Creator Programme: creators sign up, join
markets (UK & Ireland, Spain, Portugal, Germany, Romania, Nordics, plus a
Worldwide network), chat in rooms and DMs, enter challenges, track their views,
earn points, prizes and vouchers, and sign agreements. Paid creators (VIP and
Official programmes) are paid by views through monthly statements and invoices.
The Tryp team runs all of it from the admin pages.

Live: https://trypcreators.vercel.app (a PWA; most creators use it installed on a phone).

| Layer | What | Where |
| --- | --- | --- |
| Frontend | React 18 + Vite 8 (rolldown) + Tailwind 3, a single-page app | `src/` |
| Data access | One module per feature owns every table and database function name | `src/api/` |
| Hosting | Vercel, deploys `main` automatically; security headers + CSP in `vercel.json` | `vercel.json` |
| Database | Supabase Postgres 17: row level security, ~550 SQL functions, triggers, 30 pg_cron jobs | `supabase/schema/` (current), `supabase/migrations/` (history) |
| Server code | 12 Supabase Edge Functions (Deno) | `supabase/functions/` |
| Auth | Supabase Auth (email + password, Turnstile captcha via `auth-gate`) | |
| Files | Supabase Storage, 7 buckets (6 public, `dm-media` private) | |
| Realtime | Supabase Realtime (chat, DMs, notifications, live boards) | |
| Errors | Sentry (EU) plus the `client_errors` table shown on the admin desk | `src/lib/monitoring.js` |

There is no separate backend server: the browser talks to Supabase directly, and
**row level security is what protects the data**. Anything privileged is a
`SECURITY DEFINER` SQL function or an edge function using the service role.

Read next: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (how it fits together and the rules it relies on),
[docs/MOVING_TO_TRYP_INFRASTRUCTURE.md](docs/MOVING_TO_TRYP_INFRASTRUCTURE.md) (the move runbook),
[docs/AUTOMATIC_VIEWS.md](docs/AUTOMATIC_VIEWS.md) and [docs/SCRAPER_OPTIONS.md](docs/SCRAPER_OPTIONS.md) (view counts),
[docs/AUDIT_2026-10-13.html](docs/AUDIT_2026-10-13.html) (the audit, with every finding's status as of 14 Oct).

---

## First day for a new developer

1. **Get access** (ask the owner): GitHub repo, Vercel team, Supabase project (Developer role is enough to start),
   Sentry project. Never put a key in the repo or in chat.
2. **Run it** (Node 20+):
   ```bash
   npm install
   cp .env.example .env          # VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (Supabase > Project Settings > API)
   npm run dev                   # http://localhost:5173
   ```
   There is no local database: the dev server talks to the project in `.env`, which is PRODUCTION. Treat every
   click as real.
3. **Sign in without the captcha** with the QA accounts: put `SUPABASE_SERVICE_KEY=...` in a git-ignored `.env.qa`,
   then open `/__dev-login?as=creator`, `?as=vip` or `?as=admin` (add `&to=/some/path`). This door exists only on the
   dev server and only for the `@trypcreators.test` accounts. The QA accounts are sandboxed: they can look at
   everything but cannot move money, send mail or change settings.
4. **Read** `docs/ARCHITECTURE.md` sections 4 (who can see what) and 6 (rules the code relies on), then
   `supabase/migrations/README.md`.
5. **Make a change** on a branch, run the three checks below, open the pages you touched (`/__dev-login...`) and
   watch the console. A moved hook or a temporal-dead-zone error passes lint, tests and build but crashes the page.
6. **The Testing Centre** (`/admin/testing`) has sandboxed labs for sign-up, onboarding, invoices, view reading and
   more, and is the safest place to try flows end to end.

## Checks (CI runs the same on every push: `.github/workflows/ci.yml`)

```bash
npm run lint      # eslint; unused variables are errors
npm test          # vitest, ~1,350 tests, jsdom (also runs the edge-function tests)
npm run build     # production bundle into dist/
```

CI also type-checks every edge function and runs their tests under Deno (`edge-functions` job), and compares the
deployed edge functions with the repo (`edge-drift` job, needs the `SUPABASE_ACCESS_TOKEN` secret).

## Configuration

### Browser (Vite, baked in at build time, so set them in Vercel too)

| Name | What |
| --- | --- |
| `VITE_SUPABASE_URL` | Project URL, `https://<ref>.supabase.co`. Every API, edge-function and storage URL is built from it, and the build writes it into `dist/sw.js` (`vite-sw-env.js`). |
| `VITE_SUPABASE_ANON_KEY` | The public (publishable) key. Safe in the browser. |
| `VITE_TURNSTILE_SITE_KEY` | Optional; the Turnstile site key (a default is compiled in). |
| `VITE_SENTRY_DSN`, `VITE_SENTRY_ORG` | Optional; the project DSN is compiled in by default. |

### Edge function secrets (Supabase > Edge Functions > Secrets; names only, values live there)

| Name | Used by |
| --- | --- |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` | Every function (provided by Supabase) |
| `WEBHOOK_SECRET` | view-sync, notify-dispatch, media-cleanup; must equal `private.config.webhook_secret` |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | notify-dispatch (web push). Keep the same pair at a move or every phone must re-enable notifications. |
| `RESEND_API_KEY` | send-invoice (email) |
| `APP_URL` | links in emails and pushes |
| `YOUTUBE_API_KEY` | optional fallback; view-sync reads `private.config.youtube_api_key` first |
| `ANTHROPIC_API_KEY` | optional; translate-text uses free engines without it |
| `SB_REGION` | set by Supabase per region; view-sync's region failover |

Set on the project but read by nothing (safe to delete): `MAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`.

### Database settings

`private.config` (no API role can read it): `edge_functions_base`, `webhook_secret`, `youtube_api_key`,
`healthchecks_cron_url`. App-wide switches live in `public.app_settings` (`view_sync`, `fx_rates`, ...).

### GitHub (Settings > Secrets and variables > Actions)

| Name | Kind | Used by |
| --- | --- | --- |
| `VITE_SUPABASE_ANON_KEY` | secret | CI build |
| `SUPABASE_ACCESS_TOKEN` | secret | CI `edge-drift` (a Supabase personal access token with read access) |
| `SUPABASE_DB_URL` | secret | nightly database backup (`backup.yml`) |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_PROJECT_REF` | variables | CI and keepalive; default to the current project |

## Changing the database

1. Write a numbered file in `supabase/migrations/` (next free number).
2. If it changes an existing function, start from the LIVE body (`supabase/schema/functions/<name>.sql`) and patch
   it; never retype a function from memory or an old migration. See `supabase/migrations/README.md` for why.
3. Rehearse it: run the file followed by a `do $$ ... raise exception 'REHEARSAL %', ... $$` block that reads the
   result back; the exception rolls everything back. Prove access changes as a QA account
   (`set local role authenticated` + `request.jwt.claims`), never as a real creator.
4. Apply it, then refresh the schema snapshot and commit both:
   ```bash
   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/schema-snapshot.mjs
   ```

New `SECURITY DEFINER` functions are executable by signed-in users by default (event trigger
`no_new_function_is_public`). Internal ones go in `owner_only_rpcs`, then `select lock_down_definer_functions();`.
Never lock a function a policy, a view or the app calls.

## Deploying

- **App:** commit on a branch, `git fetch`, push to `staging` (a preview URL on the PRODUCTION database), check it,
  then fast-forward `main`. Vercel deploys `main`.
- **Edge functions:** deployed by hand. Check drift before and after:
  ```bash
  SUPABASE_ACCESS_TOKEN=sbp_... ./scripts/edge-drift.sh          # must end with "No drift"
  supabase functions deploy <name> --project-ref <ref> --no-verify-jwt --use-api
  ```
  Every function checks its own caller, so the gateway check stays off (`--no-verify-jwt`).
- **Database:** see above.

## Backups

- Database: nightly `pg_dump` by `.github/workflows/backup.yml` (30-day artifact; needs `SUPABASE_DB_URL`).
- Files: `node scripts/backup-storage.mjs --out <folder>` copies every bucket (read-only on the source, resumable,
  writes a manifest). The folder holds personal data; keep it on encrypted storage Tryp owns.
