# Security overview — Tryp.com Content Creator Program

This document is for the development/security team reviewing the app. It
describes the architecture, the controls in place, and the known limitations.

Last full audit: **23 August 2026**. What that audit found and fixed is in
[Audit — August 2026](#audit--august-2026) below; the residual risk it did
**not** close is in [Known limitations](#known-limitations--recommendations-remaining-risk).

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
  - `notify-dispatch` — sends web push; locked behind a shared secret.
  - `link-preview` — fetches a user-supplied URL server-side for chat unfurls.
    Treated as an SSRF endpoint; see `supabase/functions/_shared/net.ts`.
  - `impersonate` — lets an admin preview the app as a fixed sandbox creator.
  - `send-invoice` — admin-only; enforces the two-person invoice approval gate.
  - `geocode`, `calendar-feed`, `send-welcome`, `media-cleanup` — supporting.
  - `broadcast-email`, `tiktok-oauth`, `social-sync` — retired, deployed as
    410 stubs over their old implementations so the old code is unreachable.
- **Secrets** (service-role key, Resend API key, VAPID private key, webhook
  secret) live as Supabase **function secrets** or in a private `private.config`
  table. They are **never** in the repo, git history, or the browser bundle.

## Controls in place

| Area | Control |
|---|---|
| Data access | RLS enabled on **all 69 public tables**; every write policy scoped to `auth.uid()` / `is_admin()` / `can_post()`. Verified with a live impersonated creator token: cannot escalate `is_admin`, edit others' rows, read others' DMs, read other creators' `creator_private`, read `invoices`, or read any admin-only table. |
| Account onboarding | New signups are `pending` and **cannot access the app until an admin approves**; declining deletes the account. Route guards default-deny on unknown status. |
| Auth abuse | `auth-gate` enforces **5 attempts / 15 min per email+IP**, **plus 30 / 15 min per IP** for login (the credential-spray bucket). Turnstile CAPTCHA is enabled in Supabase Auth. Password reset never reveals whether an email exists. |
| Storage abuse | Uploads go through `upload`: own-folder enforcement, a **server-side MIME allow-list** (no SVG, no HTML), a 60MB cap checked before and after decode, path-traversal rejection, and 40 uploads / 10 min per user. |
| Private media | `dm-media` is a private bucket read through short-lived signed URLs; both the storage read policy and the upload check use `in_conversation()`, so group DMs and direct DMs are treated identically. |
| Push | `notify-dispatch` **fails closed**: a missing or wrong `x-webhook-secret` is 401, compared in constant time. |
| Privilege escalation | `protect_admin_columns` blocks non-admins changing `is_admin` / `status` / `role` / `is_test`; `protect_conversation_shape` and `protect_logged_views` guard the other mutable-shape tables. All 13 `admin_*` RPCs raise unless `is_admin()`. EXECUTE is revoked from `authenticated` on every trigger function. |
| Money | `send-invoice` re-checks server-side that the invoice row exists and is `approved`; the approval queue cannot be skipped with a raw `fetch`. `next_invoice_number()` checks `is_admin()`. |
| XSS | No `dangerouslySetInnerHTML` / `innerHTML` / `eval` anywhere; React auto-escapes rendered content. Every creator-supplied URL rendered into an `href` goes through `src/lib/safeUrl.js`, which rejects any scheme but `http(s)` after stripping the control characters used to smuggle `java\tscript:`. |
| SSRF | `link-preview` resolves every hostname, refuses any private/loopback/link-local/CGNAT/multicast answer in **any** IPv4 or IPv6 encoding, restricts the port to 80/443, and re-runs all of it on every redirect hop (`redirect: 'manual'`). Rate-limited to 60 previews / 10 min per user. |
| CORS | An exact allow-list of the two production hostnames plus this project's own Vercel preview pattern. (It previously matched any `*.vercel.app`.) |
| Browser | CSP with `script-src 'self'` — no `unsafe-inline`, no nonce, so nothing inline runs. `connect-src` is pinned to our own hosts. |
| Secrets | None hardcoded in source, bundle, or git history (scanned). Only the public anon key, project URL, and VAPID **public** key reach the browser. |
| Dependencies | `npm audit` clean (0 advisories at the last audit). |
| Transport | All traffic is HTTPS (Supabase + Vercel). |

## Audit — August 2026

A full pass over the platform, with each finding verified against production
after the fix. Migrations `108`–`110`.

**Fixed — high severity**

1. **`javascript:` URLs in creator-controlled links.** Profile socials and
   `other_links`, submission `video_url`, job `apply_url` and event
   `meetingUrl` are free text rendered into `href`. React 18 renders a
   `javascript:` href with only a console warning, so a creator could put one
   on their profile and an admin reviewing their application would hand over
   their session by clicking it. Fixed at all 17 render sites via
   `src/lib/safeUrl.js` (26 tests).
2. **SSRF in `link-preview`.** It followed redirects blind, so a page returning
   `302 → http://169.254.169.254/` reached the cloud metadata service; it
   matched private ranges as *text*, so `http://2130706433/` did not match; and
   it never resolved the hostname. All three closed. A live probe of the fixed
   function then found a **fourth**: `new URL()` normalises
   `[::ffff:127.0.0.1]` to `[::ffff:7f00:1]`, which the dotted-form regex
   missed — IPv6 is now parsed into eight groups rather than pattern-matched
   (82 tests in `_shared/net.test.js`).
3. **`notify-dispatch` failed open.** `if (SECRET && header !== SECRET)` meant
   an unset env var skipped the check entirely, leaving a public endpoint that
   sends a push notification with any title and body to any user id. Now
   fails closed, timing-safe.
4. **CORS allowed any `*.vercel.app`** — five minutes and no money to register.
   Now an exact allow-list.

**Fixed — medium**

5. **Dates of birth were readable by every member.** `profiles` is readable by
   any signed-in member (that is what the directory and chat are built on) and
   `profiles.dob` sat in it, with `/profile/:id` fetching `select('*')`. The
   product only ever wanted to show an *age* — `profiles.age` already existed
   and was documented as "shown publicly as an age only", but was populated for
   1 row out of 53. Migration `110` moves the date to `creator_private`
   (`id = auth.uid() OR is_admin()`), backfills the ages, and keeps the two in
   step with triggers. See the migration for why RLS and a column `REVOKE`
   could not fix this.
6. **Group DMs could not carry media at all** — the storage read policy and the
   `upload` participant check both understood only `participant_a`/
   `participant_b`, which a group conversation leaves null.
7. **Uploads had no server-side type or size limit** — the bucket settings were
   holding, but the function uploads with the service role, so SVG (a document
   with scripts in it) could have been written to a public bucket.
8. **Credential spray was unlimited.** The per-(email + IP) login limit does
   nothing about one leaked password tried against every address, because every
   attempt is a new bucket. Added a per-IP bucket.
9. **Feature flags were unreadable, so two features could never start.**
   `readFlag` selected from `app_settings`, whose only policy is `is_admin()`,
   so every creator's read returned nothing and failed closed — the walkthrough
   and the install gate were switched off in a way no row update could switch
   on. Now a `public_flag()` reader with a two-key allow-list.
10. **Password reset did O(all users) work per request** on an unauthenticated
    endpoint, and silently stopped matching anybody past the thousandth
    account. Replaced with an indexed, service-role-only lookup.

**Verified as already correct** — 0 ERROR-level Supabase advisors; RLS on all
69 tables; all 13 `admin_*` RPCs check `is_admin()`; all 27 `/admin/*` routes
behind `<AdminRoute>`; the invoice approval gate enforced server-side; the
impersonation endpoint mints sessions only for one fixed non-admin sandbox
account; `media-cleanup` already failed closed.

**Abuse testing** — 88 hostile values (script/img/svg payloads, `javascript:`,
SQL fragments, template-injection, RTL overrides, 9000-character strings,
control characters) into every text field on five pages: nothing executed,
nothing crashed. Every button on eight pages triple-clicked as fast as the
browser would dispatch: no double-submits, no blank screens. 48 rapid
back/forward transitions: no leaked effects. 160 route × viewport combinations
from 320px to 1920px: no blank pages, no horizontal overflow, no console
errors. Offline (service worker active): the app keeps working, survives a
hard reload, and says so.

## Known limitations / recommendations (remaining risk)

1. **DNS rebinding against `link-preview`** *(Low, not closed)* — the guard
   resolves the hostname and rejects private answers, but a name can resolve to
   a public address for our check and a private one microseconds later for the
   fetch. Closing it properly means connecting to the resolved IP with the
   `Host` header pinned, which Deno's `fetch` does not expose. The blast radius
   is bounded by the port restriction (80/443), the 6s timeout, the
   `text/html`-only parse and the per-user rate limit.
2. **`profiles.dob` still exists as a column** *(Low)* — it is `NULL` for every
   row and a trigger blanks any further write, but the column is kept so a
   browser running an older bundle does not error on `select('*')`. Drop it
   once that is no longer possible.
3. **Direct GoTrue endpoint bypasses the app rate limit** *(Low, mitigated)* —
   `auth-gate`'s limit applies to clients using our app; Supabase's auth
   endpoint is publicly reachable. Turnstile CAPTCHA is now enabled in Supabase
   Auth, which is the control that actually covers this.
4. **Some storage buckets are public-read** *(Low–Medium privacy)* — any file's
   URL is viewable without auth (profile photos, gallery, chat images,
   resources). DM media is already private. If chat images should be private
   too, move `chat-media` to a private bucket and serve signed URLs.
5. **Email confirmation is OFF** *(Low)* — anyone can create a `pending`
   account with any email, but they cannot access the site until an admin
   approves and never receive anyone else's mail.
6. **No CI security automation yet** *(Process)* — add Dependabot + `npm audit`
   (and ideally `supabase db lint`) to CI so the next advisory is caught
   without a manual pass.
7. **Single environment** *(Process)* — production only. A staging Supabase
   project is the single biggest thing missing: several fixes in this audit had
   to be sequenced carefully specifically because there was nowhere to try them
   first.
8. **Secrets are operational** *(Operational)* — the Supabase Management PAT and
   DB password are handled out-of-band; keep them in a password manager and
   rotate if ever exposed.

## Not vulnerabilities (by design)
- The anon/publishable key and VAPID public key in the browser bundle are
  public by design; security is enforced by RLS and the Edge Functions.
- The publishable key embedded in migration `010` (the notifications webhook
  trigger) is the public key, not a secret.
- `calendar-feed` authenticates on a 48-character token in the URL and nothing
  else. That is deliberate: the fetcher is Apple's or Google's server, not the
  creator's browser, so there is no session to check. The token maps to one
  creator and can be rotated from Settings.
