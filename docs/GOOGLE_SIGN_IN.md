# Continue with Google

The app side is built and deployed. The button **does not appear** until Google
is switched on in Supabase, and it appears **by itself** the moment it is — no
second deploy, no flag. `src/lib/oauth.js` reads GoTrue's own
`/auth/v1/settings` endpoint on every app open and only draws the button when
that says `external.google: true`.

So this file is the two dashboard steps, which need passwords and therefore have
to be done by hand.

---

## 1. Google Cloud — create the OAuth client

<https://console.cloud.google.com/apis/credentials>

1. Pick or create a project (name it `Tryp Creator Community`).
2. **OAuth consent screen** → External → fill in:
   - App name: **Tryp.com Creator Community**
   - User support email: `ethan@tryp.com`
   - App logo: `public/brand/tryp-logo.png` from this repo
   - Authorised domains: `supabase.co` and `vercel.app`
   - Developer contact: `ethan@tryp.com`
3. Scopes: leave the three defaults (`email`, `profile`, `openid`). Nothing else
   is requested and nothing else is needed — the name comes from `profile`.
4. **Credentials → Create credentials → OAuth client ID → Web application.**
   - Name: `Supabase`
   - **Authorised JavaScript origins:**
     ```
     https://trypcreators.vercel.app
     https://content-creator-program.vercel.app
     ```
   - **Authorised redirect URI** — one, and it is Supabase's, not ours:
     ```
     https://heuhqqoxyggawuckxocp.supabase.co/auth/v1/callback
     ```
5. Copy the **Client ID** and **Client secret**.

**Publishing status.** While the consent screen is in *Testing* only the accounts
listed on it can sign in, capped at 100. Press **Publish app** when you are done
testing. An app requesting only email/profile/openid does **not** need Google's
security review, so publishing is immediate.

---

## 2. Supabase — switch the provider on

<https://supabase.com/dashboard/project/heuhqqoxyggawuckxocp/auth/providers>

1. **Authentication → Providers → Google → Enable.** Paste the client ID and
   secret. Save.
2. **Authentication → URL Configuration → Redirect URLs.** Add both, exactly:
   ```
   https://trypcreators.vercel.app/auth/callback
   https://content-creator-program.vercel.app/auth/callback
   http://localhost:5173/auth/callback
   ```
   Both live origins are needed because the app answers on two hosts and
   supabase-js uses PKCE — the code verifier is written to `localStorage`, which
   is per origin, so a round trip that starts on one host and returns to the
   other cannot complete. See `src/lib/oauth.js`.

That is the whole of it. Reload `/signup` and the button is there.

---

## What happens after somebody presses it

Nothing special, and that is the design.

| | password signup | Google signup |
|---|---|---|
| `auth.users` row | created | created |
| `handle_new_user` trigger | fires | fires |
| `profiles` row | `status = 'pending'` | `status = 'pending'` |
| name on the profile | from the form | from Google's `full_name` |
| email registered | yes | yes |
| onboarding (nine screens) | yes | yes |
| approved by an admin | yes | yes |

The email is **never asked for twice**: onboarding has never asked for one. It
asks for a name, a country, a phone number, socials and the rest, and the address
has always come from the account.

The profile photo is **not** imported from Google. The production CSP is
`img-src 'self'` plus our own storage, so a `googleusercontent.com` URL would be
blocked and draw a broken image — and onboarding asks for a photo anyway.

**A referral link still counts.** Nothing attached to an OAuth request survives
the trip to Google, so `?ref=CODE` is stashed in `localStorage` before the
redirect and attached on the way back by `attach_referral` (migration 196). It
only ever fills a blank, only on an account that has not finished onboarding,
only within a day of that account being created, and never with yourself.

## One address, one account

Somebody who joins with Google **cannot** later create a second account with the
same address using the email form — GoTrue refuses it, correctly. Both screens
now say what to do about it:

- **Signup**, on "already registered": log in with your password, or use Continue
  with Google if that is how you joined, or reset your password.
- **Login**, on a failed password: if you joined with Google, use the button — or
  reset your password to set one.

The login hint is shown on **every** failed password attempt, deliberately. A
message that appeared only for Google accounts would tell an attacker which
addresses are registered and how; this one tells them nothing they did not
already have.

**A Google account can be given a password.** "Forgot password" works on it:
Supabase sends a recovery link and `updateUser({ password })` sets one. From then
on both doors work for that person. That is the honest answer to "can they still
use that email to sign up normally" — not a second account, the same one with a
second way in.
