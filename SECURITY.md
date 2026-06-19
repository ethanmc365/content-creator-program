# Security overview — Tryp.com Content Creator Program

This document is for the development/security team reviewing the app. It
describes the architecture, the controls in place, and the known limitations.

## Architecture

- **Frontend:** React (Vite) single-page app, hosted on Vercel. It talks
  **directly** to Supabase — there is no custom application server.
- **Backend:** Supabase (managed) = PostgreSQL + Auth (GoTrue) + Storage +
  Realtime. **All data access is authorised by PostgreSQL Row-Level Security
  (RLS)** — the anon/publishable key in the browser is *not* a secret; RLS is
  what protects the data.
- **Serverless (Supabase Edge Functions, Deno):**
  - `auth-gate` — proxies login/signup/recover and enforces rate limiting.
  - `upload` — verifies the user and writes to Storage with the service role
    (so uploads don't depend on Storage's per-node JWT cache), own-folder only.
  - `notify-dispatch` — sends web push + email; locked behind a shared secret.
- **Secrets** (service-role key, Resend API key, VAPID private key, webhook
  secret) live as Supabase **function secrets** or in a private `private.config`
  table. They are **never** in the repo, git history, or the browser bundle.

## Controls in place

| Area | Control |
|---|---|
| Data access | RLS enabled on all 24 tables; every write policy scoped to `auth.uid()` / `is_admin()` / `can_post()`. Verified with a real creator token: cannot escalate `is_admin`, edit others' rows, read others' DMs, or read admin-only tables. |
| Account onboarding | New signups are `pending` and **cannot access the app until an admin approves**; declining deletes the account. |
| Auth abuse | `auth-gate` enforces **max 5 attempts / 15 min** (login: per email+IP; signup/recover: per IP). Password reset never reveals whether an email exists. |
| Storage abuse | Uploads go through `upload` (own-folder enforcement) and are rate-limited to 40 / 10 min per user. |
| Push/email | `notify-dispatch` only runs for requests carrying the DB webhook secret; emails/push respect per-user preferences. |
| Privilege escalation | `protect_admin_columns` trigger blocks non-admins changing `is_admin`/`status`; admin-only RPCs (`admin_delete_creator`, `admin_list_emails`) raise unless `is_admin()`. |
| XSS | No `dangerouslySetInnerHTML`/`innerHTML`/`eval` anywhere; React auto-escapes all rendered content. |
| Secrets | None hardcoded in source, bundle, or git history (scanned). Only the public anon key, project URL, and VAPID **public** key reach the browser. |
| Transport | All traffic is HTTPS (Supabase + Vercel). |

## Known limitations / recommendations (remaining risk)

1. **Direct GoTrue endpoint bypasses the app rate limit** *(Medium)* — the
   `auth-gate` limit applies to clients using our app, but Supabase's auth
   endpoint is itself publicly reachable, so a scripted attacker could hit it
   directly and is then subject only to Supabase's built-in limits. **Fix:**
   enable hCaptcha in Supabase Auth (and add the widget to the login/signup
   forms) to require a challenge on every auth request.
2. **Storage buckets are public-read** *(Low–Medium privacy)* — any file's URL
   is viewable without auth (profile photos, gallery, **chat images**,
   resources). Fine for public profiles; if chat images/resources should be
   private, move `chat-media`/`resources` to private buckets and serve via
   signed URLs.
3. **Email confirmation is OFF** *(Low)* — anyone can create a `pending` account
   with any email, but they cannot access the site until an admin approves and
   never receive anyone else's mail. Enabling confirmation adds friction but
   closes fake-email signups.
4. **Secrets are operational** *(Operational)* — the Supabase Management PAT and
   DB password are handled out-of-band; keep them in a password manager and
   rotate if ever exposed.
5. **No CI security automation yet** *(Process)* — add Dependabot + `npm audit`
   (and ideally `supabase db lint`) to CI.
6. **Single environment** *(Process)* — production only; a separate staging
   Supabase project is recommended for testing.

## Not vulnerabilities (by design)
- The anon/publishable key and VAPID public key in the browser bundle are
  public by design; security is enforced by RLS and the Edge Functions.
- The publishable key embedded in migration `010` (the notifications webhook
  trigger) is the public key, not a secret.
