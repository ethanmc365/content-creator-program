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
| Hosting | Vercel, deploys `main` automatically; security headers + CSP in `vercel.json` | `vercel.json` |
| Database | Supabase Postgres 17: tables, row level security, ~540 SQL functions, triggers, pg_cron | `supabase/schema/` (current), `supabase/migrations/` (history) |
| Server code | Supabase Edge Functions (Deno): uploads, push/email, view sync, invoices... | `supabase/functions/` |
| Auth | Supabase Auth (email + password, Turnstile captcha via `auth-gate`) | |
| Files | Supabase Storage (avatars, gallery, chat media, DM media, video thumbnails) | |
| Realtime | Supabase Realtime (chat, DMs, notifications, live boards) | |
| Errors | Sentry (EU), plus `client_errors` table shown on the admin desk | `src/lib/monitoring.js` |

There is no separate backend server: the browser talks to Supabase directly, and
**row level security is what protects the data**. Anything privileged is a
`SECURITY DEFINER` SQL function or an edge function using the service role.

**New here? Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** for how the code
is organised and the rules it relies on. Moving the platform to other
infrastructure: [docs/MOVING_TO_TRYP_INFRASTRUCTURE.md](docs/MOVING_TO_TRYP_INFRASTRUCTURE.md).

---

## Run it locally

Needs Node 20+.

```bash
npm install
cp .env.example .env      # fill VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run dev               # http://localhost:5173
```

The local app talks to whichever Supabase project `.env` points at. There is no
local database: the project has never been run against `supabase start`.

Signing in locally without the captcha: create a gitignored `.env.qa` holding
`SUPABASE_SERVICE_KEY=...`, then open `/__dev-login?as=admin` or
`/__dev-login?as=creator&to=/home`. That door (`vite-dev-auth.js`) exists only on
the dev server, only for the `@trypcreators.test` QA accounts, and is never built.

## Checks (CI runs the same on every push: `.github/workflows/ci.yml`)

```bash
npm run lint      # eslint; unused variables are errors
npm test          # vitest, ~1,400 tests, jsdom
npm run build     # production bundle into dist/
```

## Environment variables

Browser (Vite, baked in at build time, so set them in Vercel too):

| Name | What |
| --- | --- |
| `VITE_SUPABASE_URL` | Project URL, e.g. `https://<ref>.supabase.co`. Every API, edge-function and storage URL in the app is built from it. |
| `VITE_SUPABASE_ANON_KEY` | The public (publishable) key. Safe in the browser. |
| `VITE_SENTRY_DSN` | Optional; the project DSN is compiled in by default. |

Edge functions (Supabase dashboard > Edge Functions > Secrets): `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` (provided by Supabase), plus
`WEBHOOK_SECRET`, `APP_URL`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
`RESEND_API_KEY`, `MAIL_FROM`, `REPLY_TO`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`,
`SMTP_PASS`, `YOUTUBE_API_KEY`, `ANTHROPIC_API_KEY`, `SB_REGION`.

Database-side settings live in the `private.config` table (no API role can read
it): `edge_functions_base`, `webhook_secret`, `youtube_api_key`,
`healthchecks_cron_url`, `instagram_reels_doc_id`.

## Changing the database

1. Write a numbered file in `supabase/migrations/` (next free number).
2. If it changes an existing function, start from the LIVE body
   (`select pg_get_functiondef('public.fn'::regproc)` or `supabase/schema/functions/fn.sql`),
   never from memory or an old migration. See `supabase/migrations/README.md` for why.
3. Rehearse it: run the file followed by a `do $$ ... raise exception 'REHEARSAL %', ... $$`
   block that checks the result; the exception rolls everything back.
4. Apply it, then refresh the schema snapshot and commit both:

```bash
SUPABASE_ACCESS_TOKEN=sbp_... node scripts/schema-snapshot.mjs
```

New `SECURITY DEFINER` functions are re-granted by an event trigger
(`no_new_function_is_public` -> `lock_down_definer_functions()`): signed-in users
can call them unless the name is listed in `owner_only_rpcs`. Decide which.

## Deploying

- **App:** push to `main`; Vercel builds and deploys. `staging` deploys to a
  preview URL that uses the PRODUCTION database.
- **Edge functions:** `supabase functions deploy <name> --project-ref <ref> --no-verify-jwt`
  (every function here checks its own caller, so the gateway check stays off).
- **Database:** see above.
