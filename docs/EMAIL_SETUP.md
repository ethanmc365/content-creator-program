# Email setup (Gmail SMTP)

## Current status (25 Jul 2026): sending WORKS, but bulk broadcasts get BLOCKED

The credential problem below is **fixed**. Auth emails, password resets and 1:1
notification emails all send correctly.

The new, separate problem is **volume**. A broadcast to the whole programme
produced bounces like:

```
Message blocked. Your message to <creator> has been blocked.
Gmail has detected this message as unsolicited mail. To reduce the amount of
spam sent to Gmail, this message has been blocked.
```

This is **Gmail's own outbound filter**, not the recipients rejecting anything.
A personal Gmail account is not a bulk sender: send 30-40 near-identical
messages in a burst and Google throttles or blocks a share of them. It will get
worse as the programme grows, and no amount of tuning inside the app fixes it.

### What has been done in code to soften it

- Every message now carries a real **plain-text part** as well as HTML.
  (The old code passed `content: 'text/html'`, which denomailer treats as the
  plain-text body, so every message shipped a text part reading `text/html`.
  HTML-only or nonsense-text mail is itself a spam signal.)
- **`List-Unsubscribe`** header (RFC 2369) on every message, pointing at a real
  mailto and at /settings.
- **`Reply-To`** set, so replies reach a human.
- Sends are **spaced out** (`SEND_GAP_MS`, default 800ms) instead of firing as
  a burst, and the send log is flushed as the run progresses so a timeout no
  longer loses the record of what already went.
- Blocked-as-bulk failures are reported separately from broken addresses.

These help. They do not solve it.

### The actual fix: send from a domain we control

Ranked by effort:

1. **`mail.tryp.com` via Resend** (already integrated, domain already created,
   status `not_started`). Someone with DNS access to `tryp.com` adds the DKIM,
   SPF and MX records Resend shows, clicks Verify, then set
   `MAIL_FROM="Tryp.com <hello@mail.tryp.com>"` and drop the SMTP secrets.
   Free tier 100/day, 3,000/month. **Best option if DNS access is available.**
2. **A domain we own outright** (e.g. `trypcreators.com`, ~£10/yr) verified in
   Resend the same way. No dependency on anyone else's DNS. Slightly off-brand
   in the From line, but it sends.
3. **Google Workspace on tryp.com** fixes the "personal account" part but is
   still not a bulk sender and still gets throttled. Not a real answer.

Until one of those is done: **push and in-app notifications are the broadcast
channel**, and email is for small or 1:1 sends only.

## History: the credential failure (fixed 25 Jul 2026)

Verified live on 24 Jul 2026 by triggering a real password reset. Google replied:

```
535 5.7.8 Username and Password not accepted.
https://support.google.com/mail/?p=BadCredentials  - gsmtp
500: Error sending recovery email
```

So Supabase was correctly wired to Gmail, but Gmail refused the login. Two
separate reasons, both since corrected:

### 1. Username must be the FULL email address

| Field | Current (wrong) | Correct |
|---|---|---|
| Username | `emails` | `ethantryp.com@gmail.com` |

Gmail SMTP authenticates with the whole address, never a local nickname.

### 2. Password must be a Google APP PASSWORD, not the account password

Google stopped accepting normal account passwords for SMTP on 30 May 2022.
A regular password will always return `535 BadCredentials`.

To create one:
1. The Gmail account needs **2-Step Verification ON**
   (Google Account -> Security -> 2-Step Verification).
2. Go to https://myaccount.google.com/apppasswords
3. Create one named "Tryp Supabase". Google shows a **16-character** code
   like `abcd efgh ijkl mnop`. Paste it as the SMTP password (spaces optional).

App passwords are scoped to mail sending only and can be revoked individually,
which is why they're safe to use here.

### Everything else in the current config is already correct

- Sender email `ethantryp.com@gmail.com`, Host `smtp.gmail.com`, Port `465`.
- Consider changing Sender name from `Ethan` to `Tryp.com` so creators
  recognise it in their inbox.

Once saved, test with the "Change password" button on the Settings page. The
auth logs (Supabase -> Logs -> Auth) will show a 200 instead of the 535.

## What works once the credentials are fixed

| Capability | Status after fix |
|---|---|
| Password reset / recovery links | Works immediately, no code change |
| Magic links, email change confirmations | Works immediately |
| Notification + broadcast emails to creators | Needs step 3 below |

### 3. Notification emails (the `notify-dispatch` edge function)

Supabase's custom SMTP only covers **auth** emails. The app's own notification
and broadcast emails go through the `notify-dispatch` edge function, which
already supports SMTP - it just needs the same credentials as secrets:

Set these five secrets (values live only in the Supabase dashboard, never in
this repo) using `supabase secrets set`:

| Secret | Value |
|---|---|
| `SMTP_HOST` | the provider host, same as the Auth SMTP setting |
| `SMTP_PORT` | `465` |
| `SMTP_USER` | the same full address you authenticate with |
| `SMTP_PASS` | the app password (never commit it) |
| `MAIL_FROM` | `Tryp.com <same address as SMTP_USER>` |

Then redeploy: `supabase functions deploy notify-dispatch --no-verify-jwt`.
Do the same for `send-invoice` if you want invoices emailed too.

### 4. Turn the email column back on

Once a test email lands, flip `EMAIL_ENABLED` to `true` in
`src/components/NotificationPreferences.jsx` so creators can opt into email.

## Sending limits

- **Gmail free: ~500 recipients per day.** A broadcast to 40 creators = 40
  recipients, so roughly 12 full broadcasts a day. Comfortably above current
  needs; Google Workspace raises this to 2,000/day.
- **Supabase auth rate limit** is now 30 emails/hour (it auto-raised from 2/hour
  when custom SMTP was enabled). Raise it under Auth -> Rate Limits if a big
  intake ever needs more.
- **Minimum interval per user: 60s** - a creator can't trigger two auth emails
  within a minute. Sensible; leave it.

## Deliverability (staying out of spam)

Supabase shows a warning that Gmail is a personal-mail provider rather than a
transactional one. That's fair, and it matters at scale. What protects you:

**Working in your favour**
- Gmail signs outbound mail with DKIM for `gmail.com` and has strong sender
  reputation, so mail from a real Gmail account generally lands in the inbox.
- Low volume to a small, engaged list of creators who know the sender.

**What to do**
1. **Send from the same address you authenticate as.** Any mismatch between
   `MAIL_FROM` and the SMTP user makes Gmail rewrite or reject the message and
   tanks deliverability. Keep both `ethantryp.com@gmail.com`.
2. **Ask creators to add the address to their contacts** on their first email.
   The single most effective anti-spam step for a small list.
3. **Avoid spammy patterns**: no ALL CAPS subjects, no "FREE $$$", not a single
   giant image, and always include real text.
4. **Include an unsubscribe path.** Creators already have per-type email
   toggles at /settings; link to that in the footer of every broadcast.
5. **Don't blast all 40 at once repeatedly.** The dispatcher already sends one
   message per recipient, which is the right shape (no giant BCC).

**The proper long-term fix**: send from your own domain via a transactional
provider. Resend is already integrated as a fallback in `notify-dispatch` - add
the 3 DNS records for `mail.tryp.com` (DKIM, SPF, MX), verify, then set
`MAIL_FROM="Tryp.com <hello@mail.tryp.com>"` and drop the SMTP secrets. That
gives you SPF+DKIM+DMARC alignment on your own domain, proper bounce handling
and open/click tracking. Resend free tier is 100 emails/day / 3,000 a month.

Recommendation: use Gmail now to unblock password resets today, and move to the
verified domain before the community grows much past ~100 creators.
