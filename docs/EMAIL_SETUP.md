# Email

Current as of 21 Oct 2026. The full history (Gmail limits, the Resend attempt) is in
[archive/EMAIL_SETUP_HISTORY.md](archive/EMAIL_SETUP_HISTORY.md).

## What the platform sends

Only **password-reset emails**, sent by Supabase Auth over SMTP. `auth-gate` logs each request in `email_send_log`.

Everything else is push notifications and the in-app bell. Welcome emails and invoices are written by the team from
their own mailboxes: `/admin/email` and the invoice screen open a pre-filled Gmail draft (`src/lib/compose.js`).

## Today's SMTP settings (Supabase > Authentication > SMTP)

| Setting | Value |
| --- | --- |
| Host / port | `smtp.gmail.com` / 465 |
| Username | the FULL sender address (a bare name fails) |
| Password | a Google **App Password** (needs 2-step verification on that account), not the account password |
| Sender | a personal Gmail account |

Gmail allows about 500 messages a day, which is plenty for password resets.

## At the move

The sender is a personal account. Before the switch, set the new server's SMTP to a Tryp mailbox or Tryp's email
service, and send one password reset to a test account to prove it works. Nothing else in the app changes.

If Tryp later wants the platform to send other email (welcomes, reminders), use a sending domain Tryp controls
(SPF/DKIM on tryp.com) rather than a personal mailbox: Gmail blocks bulk sends from personal accounts.
