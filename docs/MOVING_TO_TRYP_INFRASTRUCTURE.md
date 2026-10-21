# Moving the platform to Tryp.com's servers

The step-by-step guide for moving the Creator Platform from the current Supabase Cloud project
(`heuhqqoxyggawuckxocp`, EU) onto Tryp.com's own servers. Sizes checked on 21 Oct 2026. Who does what and when:
[HANDOVER_CHECKLIST.md](HANDOVER_CHECKLIST.md).

## 1. The options

| | What it means | Work | Downtime |
| --- | --- | --- | --- |
| **A. Supabase Cloud, Tryp's account** | A new project in a Tryp-owned Supabase organisation. Same tools as today. | 2 to 3 days | About 1 hour |
| **B. Self-hosted Supabase on Tryp's servers (chosen)** | The same open-source software (Postgres, Auth, API, Realtime, Storage, Edge Functions) run in Docker on Tryp's servers. Tryp runs backups and updates. | 3 to 5 days, can finish next week | About 1 hour, at night |
| **C. Rebuild on a different backend** | Replace Supabase with Tryp's own API. | 6 to 10 weeks | n/a |

**Why C takes so long.** The business rules (scoring, prizes, invoices, VIP pay, who can see what) are 592 database
functions, 391 access rules and 215 triggers, and the app talks to Supabase from 16 data modules covering hundreds of
queries, live chat, file uploads and login. Moving to plain Postgres keeps all of that; replacing Supabase means
rewriting the API layer and re-testing every money flow. Option B already puts everything on Tryp's servers and
delivers what Helio described ("parse the schemas, copy the data, change the backend"): the database is copied and
the app points at Tryp's backend. If parts should move to another backend later, they can be done one at a time.

## 2. What moves

| Thing | Size (21 Oct) | How |
| --- | --- | --- |
| Database `public` + `private` | 149 tables, 592 functions, 215 triggers, 391 policies, 142 MB | `pg_dump` / `psql` (section 4) |
| Accounts (`auth`) | 282 users, with password hashes and sessions | same dump; passwords keep working, nobody signs in again (section 4) |
| Files | 575 MB, 3,532 files, 7 buckets | `scripts/backup-storage.mjs` then `scripts/restore-storage.mjs` (section 5) |
| Edge functions | 12, in `supabase/functions/` | copied into the server's functions folder (section 6) |
| Scheduled jobs | 31 pg_cron jobs | come with the schema; check them (section 7) |
| Website | Vercel today | new environment values + one header edit (section 9) |

## 3. What Tryp's server needs

- Self-hosted Supabase from the official Docker setup (`supabase/supabase`, folder `docker/`), recent versions.
  The database image includes `pg_cron`, `pg_net`, `pgcrypto`, `uuid-ossp`, `supabase_vault`, `pg_stat_statements`,
  `supautils` and `safeupdate`, which the schema uses.
- A machine with at least 4 CPUs and 8 GB RAM (today's Micro instance was too small at busy moments).
- An HTTPS address for the backend, for example `api.creators.tryp.com`.
- File storage: the Storage container with an S3 bucket behind it (or local disk with backups).
- SMTP for password resets (a Tryp mailbox or email service).
- Nightly database backups and file backups to S3, and monitoring.

**Logins must be signed with an asymmetric key (ES256 or RS256) and the public key published** at
`/auth/v1/.well-known/jwks.json`, with the API (PostgREST) accepting the same keys. Seven edge functions (upload,
view-sync, impersonate, send-invoice, thumb-cache, translate-text, geocode) check logins against that published key.
A default self-hosted setup signs with a shared secret and publishes nothing, and then those seven refuse every
signed-in request. Test it in the practice run: upload a photo, and use "View as creator".

## 4. Database and accounts

Practice runs restore the **nightly backup** (GitHub Actions, `backup.yml`, artifact kept 30 days) so the live
database is not touched. Dump live only once, on the night of the switch.

```bash
# schema
pg_dump "$OLD_DB_URL" --schema-only --no-owner --no-privileges --schema=public --schema=private > schema.sql
psql "$NEW_DB_URL" -f schema.sql
# data, with triggers off so nothing fires twice (no notifications, invoices or rescoring)
pg_dump "$OLD_DB_URL" --data-only --no-owner --disable-triggers --schema=public --schema=private --schema=auth \
  --exclude-table=public.ops_stat_snapshots > data.sql
psql "$NEW_DB_URL" -f data.sql
psql "$NEW_DB_URL" -c "analyze"
```

- Start Auth (GoTrue) on the new server first, so it creates its own tables, then load the `auth` data. Use a GoTrue
  version at least as new as Supabase Cloud's.
- **Nobody has to sign in again.** Sessions and refresh tokens are copied with the accounts. The app keeps its saved
  login under a fixed name and, when the new server refuses the old login, swaps it for a new one once
  (`src/lib/sessionCarry.js`, tested 21 Oct by breaking a login on purpose).
- After loading, re-apply what a dump does not carry:
  ```sql
  select public.lock_down_definer_functions();   -- function permissions, by the rules in the database
  alter role authenticator set statement_timeout = '8s';
  alter role authenticated set statement_timeout = '8s';
  alter role anon set statement_timeout = '3s';
  alter role authenticator set session_preload_libraries = 'supautils, safeupdate';
  ```
  and recreate the event trigger `no_new_function_is_public` (bottom of `supabase/schema/triggers.sql`).
- Realtime: add the 16 tables to the publication (`supabase/schema/platform.sql` lists them).

## 5. Files

```bash
node scripts/backup-storage.mjs --out ~/TrypBackups/storage-<date>            # from the live project, read-only
TARGET_URL=https://<new-host> TARGET_SERVICE_KEY=... \
  node scripts/restore-storage.mjs --from ~/TrypBackups/storage-<date> --dry  # checks buckets, counts files
TARGET_URL=https://<new-host> TARGET_SERVICE_KEY=... \
  node scripts/restore-storage.mjs --from ~/TrypBackups/storage-<date>        # uploads; safe to re-run
psql "$NEW_DB_URL" -v old='https://heuhqqoxyggawuckxocp.supabase.co' -v new='https://<new-host>' \
  -v apply=0 -f scripts/rewrite-storage-urls.sql                              # dry run, then apply=1
```

Create the 7 buckets on the new server first with the same settings (`platform.sql`): `avatars`, `gallery`,
`chat-media`, `creator-kit`, `resources`, `video-thumbs` public, `dm-media` private, and copy the storage policies
(`supabase/schema/policies.sql`, schema `storage`). A full backup was taken on 21 Oct (3,532 files, none failed);
the backup script skips files it already has, so the copy on the night only fetches what is new.

## 6. Edge functions

Copy `supabase/functions/*` into the server's functions folder (`docker/volumes/functions`) and restart the
functions container. Set these in the server's environment (names only; values go in the password vault):

| Name | Note |
| --- | --- |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` | the new server's |
| `WEBHOOK_SECRET` | any new value; must equal `private.config.webhook_secret` |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | **the same pair as today**, or every phone must turn notifications on again |
| `APP_URL` | the app's address, used in links |
| `YOUTUBE_API_KEY` | optional fallback; the database setting is read first |

The view reader's region retries only exist on Supabase Cloud: see [SCRAPER_OPTIONS.md](SCRAPER_OPTIONS.md) and test
Instagram and Facebook reads from the new server in the practice run (admin > Testing Centre > view reading).

Set up a small pipeline (GitHub Actions) that copies the functions to the server and applies new files in
`supabase/migrations/` when `main` changes, so a change is "commit and push" for everyone.

## 7. Settings inside the database

```sql
update private.config set value = 'https://<new-host>/functions/v1' where key = 'edge_functions_base';
-- and set: webhook_secret, youtube_api_key, healthchecks_cron_url
select jobname, schedule, active from cron.job order by 1;   -- 31 jobs, all active
```

No database function contains the old address (checked: `select proname from pg_proc where prosrc like '%heuhqq%'`
returns nothing).

## 8. Login settings (Auth)

Site URL and redirect URLs (both app addresses), Turnstile captcha secret (the site key is in
`src/lib/turnstile.js`), login lifetime 604800 s, email confirmation off (the team approves accounts), SMTP
([EMAIL_SETUP.md](EMAIL_SETUP.md)), and the signing keys from section 3.

## 9. The website

- Vercel environment: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (the new server's), then redeploy.
- `vercel.json`: the Content-Security-Policy names the old address in `connect-src`, `img-src` and `media-src`.
  Replace it.
- GitHub repository variables `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_PROJECT_REF` and secret
  `SUPABASE_DB_URL` (nightly backup) for the new server.
- Calendar subscriptions point at the old `calendar-feed` address: creators re-add them from the Calendar page.
- If the site moves off Vercel too, any static host works: serve `dist/` with the headers from `vercel.json` and
  send every unknown path to `index.html`.

## 10. The switch, in order (about an hour, at night)

1. Stop writes on the old project, so nothing is saved there after the final copy: pause the jobs and make the
   app's database roles read-only. Anything a creator tries to save for that hour shows the app's normal
   "That did not save" message instead of being lost.
   ```sql
   update cron.job set active = false;
   alter role authenticated set default_transaction_read_only = on;
   alter role anon set default_transaction_read_only = on;
   notify pgrst, 'reload config';
   ```
   (On a rollback, set both back to `off` and reactivate the jobs.)
2. Final database dump and load (section 4), files catch-up and address rewrite (section 5), settings (section 7).
3. Functions deployed and secrets set (section 6); jobs active on the new server; admin desk shows no warnings.
4. Website environment + CSP changed and redeployed (section 9).
5. Smoke test with the QA accounts: log in as creator and admin, open a room and send a message, send a DM with a
   photo, open a challenge and the leaderboard, open VIP, receive a push, run a view-reading probe on each platform.
6. Keep the old project **paused, not deleted**, for 30 days.

**Rollback:** point the website back at the old project and redeploy (minutes). Anything written to the new server in
between has to be copied back by hand, which is why the switch is done at night and kept short.

## 11. Tools that change on self-hosted

`scripts/schema-snapshot.mjs`, `scripts/edge-drift.sh` and the CI drift check use Supabase's Management API, which
self-hosted servers do not have. Compare schemas with `pg_dump --schema-only` instead, and let the deploy pipeline
(section 6) keep the functions in step with the repo.
