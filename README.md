# Tryp.com Creator Program Platform 🧡

The official platform for the **Tryp.com UK & Ireland Content Creator Program** — the
WhatsApp-replacement hub where creators sign up, build profiles, chat in real time,
DM each other, enter challenges, and where the Tryp team runs everything.

**Stack (100% free tier):**
- **Frontend** — React (Vite) + Tailwind CSS, hosted on Vercel
- **Backend** — Supabase (Postgres + Auth + Realtime + Storage), no separate server
- **Maps** — react-simple-maps + open-source world atlas (no API keys)
- **Charts** — Recharts

---

## 1. Quick start (local)

### Prerequisites
- Node.js 18+ (`node --version`)
- A free [Supabase](https://supabase.com) account

### Steps

```bash
# 1. Install dependencies
npm install

# 2. Create your environment file
cp .env.example .env
#    → fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see §2)

# 3. Run the dev server
npm run dev
```

Open http://localhost:5173 — you'll see the landing page. After the database is
set up (next section) you can log in with the demo accounts.

---

## 2. Supabase setup (one-time, ~10 minutes)

### 2.1 Create the project
1. Go to [supabase.com](https://supabase.com) → **New project** (free tier).
2. Pick a strong database password (you won't need it day-to-day).
3. When it finishes provisioning, open **Project Settings → API** and copy:
   - **Project URL** → `VITE_SUPABASE_URL` in your `.env`
   - **anon / public key** → `VITE_SUPABASE_ANON_KEY` in your `.env`

### 2.2 Create the schema + load demo data (one paste)
1. In the Supabase dashboard open **SQL Editor → New query**.
2. Paste the entire contents of [`supabase/setup-all.sql`](supabase/setup-all.sql) and click **Run**.
   This single file bundles all three migrations + both seed files, so it
   creates every table, all row-level-security policies, the notification
   triggers, the storage buckets (`avatars`, `resources`, `chat-media`,
   `gallery`) **and** loads the demo data in one go.

> Prefer to run them separately? Apply the migrations in order
> (`001_initial_schema.sql` → `002_chat_images.sql` → `003_v2_features.sql`),
> then `seed.sql`, then `seed_v2.sql`.

### 2.3 What the demo data gives you
The app is fully alive on first run: 10 demo accounts, a live challenge with a
real countdown, archived challenges with results and a published Wall of Fame,
chat history with an active **poll**, DM threads, rewards, events (one with a
Google Meet link), open **jobs**, **referrals**, a creator **travel-photo
gallery**, and resources.

**Demo logins** (password for all: `TrypDemo123!`):

| Role    | Email                  |
|---------|------------------------|
| Admin   | `ethan@tryp-demo.com`  |
| Creator | `amelia@tryp-demo.com` |
| Creator | `jack@tryp-demo.com`   |

> Skipping the seed? The app works fine empty — sign up through the UI and
> promote yourself to admin (§3).

### 2.4 Auth settings
In **Authentication → URL Configuration**:
- **Site URL**: your production URL (e.g. `https://your-app.vercel.app`),
  or `http://localhost:5173` while developing.
- **Redirect URLs**: add BOTH
  - `http://localhost:5173/reset-password`
  - `https://your-app.vercel.app/reset-password`

  (These make the password-reset emails land on the right page.)

In **Authentication → Providers → Email** you can optionally turn OFF
"Confirm email" for a friction-free demo (leave it ON for production).

### 2.5 Realtime
The migration adds the chat/DM/notification tables to the realtime publication
automatically. If messages ever stop appearing instantly, check
**Database → Replication → supabase_realtime** includes: `messages`,
`direct_messages`, `reactions`, `notifications`, `conversations`.

### 2.6 Optional: automatic 48h/24h deadline reminders
Enable the **pg_cron** extension (Database → Extensions), then run the
`cron.schedule(...)` snippet at the bottom of the migration file. Without it,
everything still works — creators just don't get the automatic countdown nudges.

---

## 3. Making an account an admin

Admins are flagged by `profiles.is_admin`. Two ways to set it:

**A. First admin (SQL — needed once):**
```sql
update public.profiles
set is_admin = true
where id = (select id from auth.users where email = 'you@tryp.com');
```
Run that in the Supabase SQL Editor after the account has signed up.

**B. Every admin after that (in the app):**
Admin panel → **Creators** → open the person → **⭐ Promote to admin**.

All admins have equal, full power. The same screen lets you demote, mute,
suspend, DM, or send a password-reset email to any creator.

---

## 4. Deployment (free)

### 4.1 Frontend → Vercel
1. Push this folder to a GitHub repo.
2. [vercel.com](https://vercel.com) → **Add New → Project** → import the repo.
3. Vercel auto-detects Vite. Add two **Environment Variables**:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. **Deploy.** The included `vercel.json` makes client-side routes
   (e.g. `/challenges/abc`) work on refresh.
5. Go back to Supabase **Authentication → URL Configuration** and set the
   Site URL + redirect URL to your new Vercel domain (§2.4).

### 4.2 Backend → already done
Supabase **is** the backend — there's nothing else to deploy. The anon key is
safe in the browser because every table is protected by row-level security.

---

## 4b. Bulk email (free, no paid service)

**Admin → Email creators** lets you write one message and send it to every
creator. Because the spec rules out paid email services, "Open in email app"
launches *your own* mail client (Gmail, Outlook, Apple Mail…) with the subject,
body and every creator's address pre-filled in **BCC** — you review and hit
send from there. Each send is logged for your records. There's also a
"Copy all emails" button if you'd rather paste the list yourself.

**Optional upgrade to true one-click sending (still free):** sign up for
[Resend](https://resend.com) (free tier: 3,000 emails/month), verify a domain,
and add a Supabase Edge Function that POSTs to Resend's API with your creator
list. The compose UI is already built — you'd just swap the `mailto:` handler
for a call to your function. This is left as a TODO so the app needs zero paid
services out of the box.

---

## 5. Project structure

```
supabase/
  migrations/001_initial_schema.sql   # schema + RLS + triggers + storage
  seed.sql                            # demo data (relative dates — always fresh)
src/
  main.jsx, App.jsx                   # entry + all routes
  index.css                           # Tailwind + design-system recipes (.btn, .card …)
  lib/
    supabase.js                       # the shared Supabase client
    utils.js                          # dates, money, views, CSV export helpers
  context/AuthContext.jsx             # session + profile + auth helpers
  components/
    ui/index.jsx                      # Avatar, Badge, Modal, Skeleton, EmptyState …
    layout/                           # navbar, mobile tabs, notification bell
    WorldMap.jsx                      # interactive countries-visited map
    CreatorCard.jsx, ProfileFields.jsx, CountdownTimer.jsx, PlatformBadges.jsx
  pages/
    Landing.jsx                       # public marketing page
    auth/                             # login, signup, forgot/reset password
    Onboarding.jsx                    # first-login profile builder
    Home.jsx, Profile.jsx, EditProfile.jsx, Directory.jsx
    Chat.jsx                          # realtime channels + reactions + moderation
    Messages.jsx                      # realtime 1:1 DMs
    Challenges.jsx, ChallengeDetail.jsx
    WallOfFame.jsx, Rewards.jsx, Dashboard.jsx
    Resources.jsx, Events.jsx, Notifications.jsx
    admin/                            # the full admin suite (hub, creators,
                                      # challenges, results, wall of fame,
                                      # rewards, analytics, events, resources)
```

---

## 6. How the program workflows map to the app

| Old WhatsApp habit | Where it lives now |
|---|---|
| Announcements broadcast | Chat → **#announcements** (admin-only posting, everyone notified) |
| Challenge brief PDF/message | **Challenges** page (brief, rules, prizes, countdown) |
| Creators DM-ing video links | **Challenge page → Submit your video** (clean gallery for review) |
| You checking views manually | **Admin → challenge → Results**: open each link, type the views, generate the leaderboard |
| Winner announcements | **Admin → Wall of Fame**: curate spots + notes, hit Publish (confetti included) |
| Paying prizes | **Admin → Rewards**: add rewards, mark distributed, export CSV for accounting |
| Pinned tips | **Resource library** (permanent, categorised, searchable) |
| "When's the Q&A?" | **Events calendar** (challenge dates appear automatically) |

A few intentional behaviours:
- **No social scraping** — view counts are *your* manually logged numbers, by design.
- A creator with multiple entries is ranked by their **best** video.
- **Muted** creators can read everything but not post; **suspended** creators are locked out.
- Notifications are in-app only (free) — Supabase's built-in emails cover auth flows.

---

## 7. Troubleshooting

| Symptom | Fix |
|---|---|
| "Missing Supabase environment variables" in console | Copy `.env.example` → `.env`, fill both values, restart `npm run dev`. |
| Login works but every page is empty | The schema SQL hasn't been run — see §2.2. |
| Chat needs a refresh to show messages | Check the realtime publication (§2.5). |
| Password-reset email links to the wrong place | Set Site URL + Redirect URLs (§2.4). |
| Demo logins rejected | Seed not loaded (§2.3), or the project has email-confirmation ON and you created the users another way. |
| `npm audit` mentions d3-color | Known upstream advisory via react-simple-maps; it only affects parsing untrusted CSS colour strings, which this app never does. |

---

## 8. Roadmap / TODO scaffolds

Deliberately left for a future pass:

- **TODO:** confirm the production Tryp.com URL in `src/pages/Landing.jsx` (`TRYP_URL`).
- **TODO:** link previews (thumbnails) for shared video links in chat — needs an
  oEmbed Edge Function; plain clickable links are in place today.
- **TODO:** image moderation / size constraints on avatar uploads beyond the 5MB cap.
- **TODO:** pagination for chat history beyond the latest 200 messages per channel.

Everything else in the spec is implemented and wired end-to-end.
