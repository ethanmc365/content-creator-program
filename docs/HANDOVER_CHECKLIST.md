# Handover checklist: moving the Creator Platform to Tryp.com

One page for the people doing the move (Helio, Ez) and the current owner (Ethan). The how-to for every step is in
[MOVING_TO_TRYP_INFRASTRUCTURE.md](MOVING_TO_TRYP_INFRASTRUCTURE.md); how the system fits together is in
[ARCHITECTURE.md](ARCHITECTURE.md). State checked on 21 Oct 2026.

## State on 21 Oct 2026 (verified, not assumed)

| Check | Result |
| --- | --- |
| Repo schema snapshot (`supabase/schema/`) vs live database | identical (regenerated, no diff) |
| Deployed edge functions vs repo (`scripts/edge-drift.sh`) | no drift, all 12 match |
| CI (lint, ~1,450 tests, build, Deno type-check + tests) | green on every push |
| Nightly database backup (`backup.yml`) | succeeds every night, artifact kept 30 days |
| File storage backup | **none**: 575 MB, 3,530 files exist only in Supabase Storage |
| Secrets in the repo | none (the `sb_publishable_` key in old migrations is public by design) |
| Hard-coded project address | only `vercel.json` CSP; everything else reads `VITE_SUPABASE_URL` / `private.config` |
| Stored file URLs to rewrite at a move | 3,076 rows in 12 columns, handled by `scripts/rewrite-storage-urls.sql` |

## Who has access today

| Service | Owner today | Helio | Needed for the move |
| --- | --- | --- | --- |
| GitHub `ethanmc365/content-creator-program` | Ethan (personal account) | **Write** | Admin (secrets, settings), or transfer the repo to a Tryp organisation |
| Supabase org "Tryp.com" (Pro), project `heuhqqoxyggawuckxocp` | Ethan | member (confirm the role is Owner) | Owner: billing, transfer, DB password, secrets |
| Vercel team `contentcreatorprogram` | Ethan, **only member** | **none** | Transfer the project to a Tryp team, or invite Helio |
| Sentry org `trypcom-z4` (EU) | Ethan | yes | nothing more |
| Password-reset email (Supabase Auth SMTP) | a personal Gmail with an app password | none | a Tryp mailbox or SMTP service |
| Turnstile captcha (Cloudflare) | Ethan's Cloudflare account | none | the secret key, or a new site key under Tryp's Cloudflare |
| YouTube Data API key (Google Cloud) | Ethan's Google account | none | a key from a Tryp Google Cloud project |
| healthchecks.io heartbeat | Ethan | none | move or recreate |
| tryp.com DNS (for `creators.tryp.com`, optional) | Tryp IT | n/a | one CNAME if a Tryp address is wanted |

Every service above is on a personal account. Moving each one to a tryp.com owner is part of the handover, not an
extra.

## Decisions for the meeting

1. **Target.** (a) Transfer the existing accounts to Tryp (no code change, no downtime), (b) a new Supabase Cloud
   project in a Tryp organisation, or (c) self-hosted Supabase on Tryp AWS. (b) keeps every tool and workflow; (c)
   adds 1-2 weeks and changes how migrations and functions are deployed. A rewrite onto another backend is a
   rebuild of ~590 database functions and is not recommended.
2. **Cut-over date.** Recommended: the evening of Tue 24 Nov 2026 (see timeline).
3. **Who owns what afterwards**: who approves database changes, who deploys, and whether Ethan keeps shipping
   product changes (recommended: yes, through pull requests that CI checks and Helio reviews).
4. **The view reader.** TikTok, Instagram and Facebook counts are read from public pages, which those platforms'
   terms do not permit; Facebook reads present themselves as a search-engine crawler. Tryp should decide: accept,
   switch that part off, or fund the official APIs (about 3 weeks of work plus 2-4 weeks of app review).
   [SCRAPER_OPTIONS.md](SCRAPER_OPTIONS.md).
5. **Database size.** The live project is a Micro instance and its connection warning fired 12 times this month.
   Start the new project one size up (Small).
6. **A real test database.** Today the staging site and the dev server both talk to the PRODUCTION database. The
   rehearsal project can stay on afterwards as staging, refreshed from the nightly backup.

## Timeline (route b, the recommended one)

| When | What | Who |
| --- | --- | --- |
| Thu 22 Oct | Meeting: decide target, date, owners | all |
| 22-30 Oct | Access as in the table above; secrets handed over in a password manager (never chat or email); Helio runs the app locally; new project created; first restore from a nightly backup | Ethan, Helio |
| 24 Oct - 22 Nov | **Global Challenge: Autumn Edition runs on the current system, untouched** | |
| 2-13 Nov | Rehearsal 1 and 2 on the new project: schema + data from the nightly backup, files copied, URLs rewritten, functions deployed, crons on, `schema-snapshot` diff empty, smoke tests with the QA accounts on a staging URL; time the full run (target under an hour) | Helio |
| 16-22 Nov | Final week of the challenge. Schema changes frozen (UI changes fine); creators told about a one-time re-login | Ethan |
| Mon 23 Nov | Winners checked and published on the current system | Ethan |
| **Tue 24 Nov, evening** | **Cut-over**: crons paused, final dump + file sync, URL rewrite, functions, Vercel env + CSP, smoke test, crons on | Helio, Ethan on call |
| 25 Nov - 1 Dec | Watch the admin desk and Sentry; VIP month close on 1 Dec runs on the new system | both |
| until ~24 Dec | Old project paused, not deleted: the rollback | |

Fast track, only if Tryp has a hard deadline: cut over on a quiet night around Tue 10 Nov, after two clean rehearsals.
The cost is that every creator signs in again in the middle of the challenge.

Engineering time: route (a) about two hours of clicks; route (b) about 5-8 working days spread over the weeks above;
route (c) add 1-2 weeks.

## During the Global Challenge

- Nothing in the move touches the live system until cut-over: rehearsals restore the nightly backup, not a live dump.
- `scripts/backup-storage.mjs` (read-only) can run any time; run it at night.
- Product changes keep shipping as normal. A migration added after a rehearsal is a numbered file and is replayed
  on the next rehearsal and at the cut-over.
- Avoid the 1st-3rd of a month for the cut-over: the VIP month close writes statements and invoices then.

## What carries over, and what does not

Carries over: every table and row (creators, entries, views history, points, rewards, invoices, VIP statements,
messages, agreements and their signed evidence), login passwords (hashes), every file, every function, trigger,
policy and scheduled job.

Does not, and what to do:
- **Sessions**: everyone signs in once. Password resets must work on the new project first (SMTP).
- **Push notifications** keep working only if the same VAPID key pair is set on the new project. If the private key
  cannot be found, every creator re-enables notifications once (the app already asks).
- **Calendar subscriptions** hold the old feed address: creators re-subscribe from Calendar.
- Logs and cron history (not needed).

## Keeping Ethan's Claude Code setup working after the move

Claude Code ships changes with three things: the GitHub repo (push), Supabase (migrations through the Management API,
edge functions with `supabase functions deploy`, reads through the Supabase connector) and Vercel (deploys on push to
`main`). After the move:

- **GitHub**: Ethan keeps Write or Maintain on the repo. If it moves to a Tryp organisation, run
  `git remote set-url origin https://github.com/<tryp-org>/content-creator-program.git`, and authorise his token for the
  organisation if it uses SSO.
- **Supabase (Cloud)**: Ethan is a member of the new organisation (Developer at least; Administrator to apply
  migrations). He creates a new personal access token from his own account and stores it in the macOS keychain
  himself (`security add-generic-password -U -a "$USER" -s supabase-access-token -w`), and re-connects the Supabase
  connector in Claude so it sees the new organisation. Then tell Claude the new project ref.
- **Supabase (self-hosted)**: the Management API, the dashboard SQL and the connector do not exist there. Agree a CI
  pipeline that applies `supabase/migrations/` and deploys `supabase/functions/` on merge, so a change is "commit and
  push" for everyone, and give Ethan a scoped database URL for read-only checks.
- **Vercel**: Ethan is a member of the team that owns the project and re-connects the Vercel connector.
- **The QA accounts** (`qa-admin`, `qa-creator`, `qa-vip`) move with the data; `.env.qa` needs the new project's
  service key for `/__dev-login`.
