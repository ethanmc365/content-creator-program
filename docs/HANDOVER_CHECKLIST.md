# Handover checklist

One page for Helio, Ines and Ethan. How to do each step: [MOVING_TO_TRYP_INFRASTRUCTURE.md](MOVING_TO_TRYP_INFRASTRUCTURE.md).
How the system fits together: [ARCHITECTURE.md](ARCHITECTURE.md). Checked on 21 Oct 2026.

## The plan

Self-hosted Supabase on Tryp's servers (option B in the guide), switched over **next week** while the Global
Challenge: Autumn Edition keeps running. Nobody has to sign in again, and all data and files come across.

## Ready today (21 Oct)

| Check | Result |
| --- | --- |
| Database structure in the repo vs live | identical |
| Deployed edge functions vs repo | identical (12 functions) |
| Automatic checks (lint, ~1,450 tests, build, edge function tests) | passing on every push |
| Nightly database backup | runs every night, kept 30 days |
| File backup | full copy taken 21 Oct: 3,532 files, 575 MB, none failed |
| Creators stay signed in through the switch | built and tested 21 Oct (`src/lib/sessionCarry.js`) |
| Upload of the files to the new server | `scripts/restore-storage.mjs` (refuses to write to the live project) |
| Rewrite of stored file addresses | `scripts/rewrite-storage-urls.sql`, checked on live data (3,076 rows) |
| Secrets in the code | none |

## Access

| Service | Today | Helio | To do |
| --- | --- | --- | --- |
| GitHub (code) | Ethan | Write | Make Admin, or move the repo to a Tryp organisation |
| Supabase (database, files, login) | Ethan, "Tryp.com" org | member | Owner, so he can read the database password and secrets |
| Vercel (website) | Ethan, only member | none | Add him, or move the project to a Tryp team |
| Sentry (errors) | Ethan | yes | nothing |
| Password-reset email | personal Gmail | none | a Tryp mailbox for the new server |
| Login captcha (Cloudflare Turnstile) | Ethan | none | secret into the vault, or a new key under Tryp |
| YouTube API key (Google Cloud) | Ethan | none | a key from a Tryp Google project |
| Uptime check (healthchecks.io) | Ethan | none | move or recreate |

Secrets go into a shared Tryp password vault, never chat or email: database password, notification keys (VAPID pair),
Gmail app password, Turnstile secret, YouTube key.

## Timeline

| When | What | Who |
| --- | --- | --- |
| Thu 22 Oct | Meeting. Access granted the same day, vault set up | all |
| Thu 22 to Sun 25 Oct | Server built: Supabase in Docker, HTTPS address, S3 for files, SMTP, signing keys (guide section 3) | Helio |
| Fri 23 Oct, 23:00 UTC | Autumn Edition opens on the current system. Nothing in the move touches it | |
| Mon 26 Oct | Practice run 1 from last night's backup: database, files, functions, a staging copy of the site pointed at it, smoke tests, view-reading test from the new server | Helio, Ethan |
| Tue 27 Oct | Fix what practice run 1 found; practice run 2, timed | Helio |
| **Wed 28 Oct, 22:00 UK** | **The switch** (about an hour; guide section 10) | Helio, Ethan |
| Thu 29 to Fri 30 Oct | Watch the admin desk and Sentry | both |
| Sat 31 Oct, Sun 1 Nov | Portugal and Spain October challenges end; VIP month close on 1 Nov, on the new server | |
| Until 28 Nov | Old project paused, kept for rollback | |

If practice run 2 is not clean, move the switch to Thu 29 Oct. Do not switch on 31 Oct to 3 Nov (challenge ends and
the VIP month close).

## During the Global Challenge

- Practice runs use the nightly backup, never the live database.
- The switch is about an hour at night. The old database is read-only during it, so the app can be read but not
  written to; creators who try to post see "That did not save" and can post again an hour later. The view reader
  catches up on its own afterwards.
- Product changes keep shipping as normal until the day before the switch. No database changes on the switch day.

## What carries over

Everything: creators and passwords, entries, view history, points, rewards, invoices, VIP statements, messages,
agreements with their signed evidence, every file, every function, rule and scheduled job.

Small actions only: push notifications need the same VAPID key pair (or creators turn them on again once), calendar
subscriptions need re-adding, and password-reset email must work on the new server before the switch.

## Keeping Ethan's Claude Code setup working

- **GitHub:** Ethan keeps Write or Maintain. If the repo moves, tell Claude the new address.
- **Database changes:** self-hosted has no Supabase Management API. Either a deploy pipeline applies new files in
  `supabase/migrations/` on merge (recommended), or Ethan gets a database address with migration rights, which he
  stores in the macOS keychain himself.
- **Edge functions:** the same pipeline copies `supabase/functions/` to the server on merge.
- **Website:** Ethan stays a member of whichever team hosts it; deploys still happen when code reaches `main`.
- **Reading data:** a read-only database address lets Claude check live data; the Supabase connector in Claude only
  works with Supabase Cloud.

## Decisions for Tryp

1. View counts: keep the current reader (decided 21 Oct), and start the "connect your account" route for Instagram and
   TikTok ([SCRAPER_OPTIONS.md](SCRAPER_OPTIONS.md)).
2. Who approves database changes and who watches alerts after the switch.
3. A Tryp address for the app (for example creators.tryp.com): one DNS record.
4. Keep the practice server afterwards as a real test database (today staging uses the live database).
