# Email setup (free, unlimited-ish via Gmail SMTP)

Two separate email paths exist. Both are currently broken for the same underlying
reason: no real sender is configured.

| Email type | Sent by | Why it fails today | Fix |
|---|---|---|---|
| Password reset, login links (auth) | Supabase Auth (GoTrue) | No custom SMTP, so it uses Supabase's built-in test mailer which is heavily rate-limited and does not reliably deliver | Add custom SMTP in Supabase Auth |
| Notifications, broadcasts | `notify-dispatch` edge fn via Resend | Resend domain `mail.tryp.com` is `not_started` (DNS never added) so sandbox mail only reaches the account owner | Set SMTP secrets on the edge fn (code already supports it) |

The single cheapest fix for BOTH is one Gmail account with an **app password**
(e.g. `ethantryp.com@gmail.com`). Gmail free sending is ~500 recipients/day,
which is far above current needs (~34 creators). Google Workspace raises this to
2,000/day if ever needed.

## Step 1 - Create a Gmail app password (only you can do this)

1. The Gmail account must have **2-Step Verification ON** (Google account → Security).
2. Go to https://myaccount.google.com/apppasswords
3. Create an app password named "Tryp SMTP". Google shows a 16-character code.
   Copy it (spaces don't matter).

## Step 2 - Fix password reset (Supabase Auth custom SMTP)

Supabase Dashboard → project `heuhqqoxyggawuckxocp` → **Authentication → Emails →
SMTP Settings** → Enable custom SMTP:

- Sender email: `ethantryp.com@gmail.com`
- Sender name: `Tryp.com`
- Host: `smtp.gmail.com`
- Port: `465`
- Username: `ethantryp.com@gmail.com`
- Password: the 16-char app password from Step 1

Save. Password reset + all auth emails now deliver to everyone. Test with the
"Change password" button on the Settings page.

## Step 3 - Fix notification / broadcast emails (edge function secrets)

The `notify-dispatch` function already prefers SMTP when these secrets are set
(otherwise it falls back to Resend). Set them via the dashboard
(Edge Functions → Secrets) or the CLI:

```
supabase secrets set \
  SMTP_HOST=smtp.gmail.com \
  SMTP_PORT=465 \
  SMTP_USER=ethantryp.com@gmail.com \
  SMTP_PASS="<16-char app password>" \
  MAIL_FROM="Tryp.com <ethantryp.com@gmail.com>"
```

Then redeploy: `supabase functions deploy notify-dispatch --no-verify-jwt`
(or ask Claude to deploy it). Optionally do the same for `send-invoice`.

## Step 4 - Turn the email column back on

Once Steps 2-3 are done and a test email lands, flip `EMAIL_ENABLED` to `true`
in `src/components/NotificationPreferences.jsx` so creators can opt into email
notifications.

## Alternative - verify the Resend domain instead

If you prefer Resend (nicer dashboards, but 100/day free), add the 3 DNS records
Resend generated for `mail.tryp.com` (DKIM, MX, SPF) in whoever hosts tryp.com
DNS, click Verify, then set `MAIL_FROM="Tryp.com <hello@mail.tryp.com>"`. No SMTP
secrets needed in that case.
