# Automatic view counts

Challenge leaderboards used to depend on an admin opening every entry, reading the
view count off the platform and typing it into `/admin/results`. This document
covers the automatic path that now sits alongside that: a creator links the
account they post from, and the platform reads the numbers itself.

Everything below is built and deployed **except the TikTok app credentials**,
which only the account owner can create. Until they exist, `Connect TikTok` in
Settings tells the creator "TikTok syncing is not switched on yet" rather than
sending them into a broken screen, and the hourly job is a no-op.

---

## How it works today (TikTok)

```
Creator                    Tryp.com                        TikTok
   |                          |                               |
   |-- Connect TikTok ------->|                               |
   |                          |-- ?action=start ------------->|  (Login Kit consent)
   |<---------------------------- redirect to TikTok ---------|
   |-- approves ------------------------------------------->  |
   |                          |<-- /callback?code=... --------|
   |                          |-- exchange for tokens ------->|
   |                          |   store in private.social_tokens
   |                          |-- first sync immediately ---->|
   |                          |                               |
        hourly cron  ---->  social-sync  ---->  POST /v2/video/list/
                                 |
                                 v
                    submissions.logged_views updated
                                 |
                                 v
                    leaderboards move (realtime, no refresh)
```

### Pieces

| Piece | Where | Job |
| --- | --- | --- |
| `social_connections` | migration 068, `public` | Who has linked what. Status only, RLS to its owner + admins. |
| `private.social_tokens` | migration 068, `private` | OAuth tokens. RLS on, zero policies: service role only, never a browser. |
| `private.oauth_states` | migration 068 | Single-use CSRF state for the round trip. |
| `submissions.platform_video_id` | migration 068 | Cached numeric TikTok id for an entry. |
| `submissions.views_source` | migration 068 | `manual` or `tiktok`. Manual always wins. |
| `tiktok-oauth` | edge function | `start` / `callback` / `disconnect`. verify_jwt=false, verifies callers itself. |
| `social-sync` | edge function | Refreshes tokens, reads view counts, writes `logged_views`. |
| `run_social_sync()` + `social-view-sync` cron | migration 068 | Hourly at :17, skipped entirely while nothing is connected. |
| `ConnectedAccounts.jsx` | Settings | Connect / Sync now / Disconnect, plus last-synced status. |

### Design decisions worth keeping

- **Tokens are not in `public`.** RLS is row-level, not column-level, so a
  creator who could read their own connection row could read their own OAuth
  token with it. Splitting the secrets into `private` removes the question.
- **Short links are resolved once.** 15 of the 16 TikTok entries in the database
  are `vm.tiktok.com` share-sheet links, which carry no video id at all. The sync
  follows the redirect chain (max 5 hops, then a regex over the landing page as a
  fallback) and caches whatever it resolves on `platform_video_id`.
- **Manual entry outranks the API.** Typing a number in `/admin/results` sets
  `views_source='manual'` and the job never touches that row again. Without this,
  a correction would be silently undone an hour later.
- **The job is sequential.** TikTok rate-limits per app, and a scheduled task has
  no deadline worth racing.
- **`video.list` only returns the account's own videos.** There is no way to read
  a view count for someone else's post, which is exactly the boundary we want.

### Finishing the TikTok setup

1. At <https://developers.tiktok.com>, create an app for Tryp.com.
2. Add the **Login Kit** and **Display API** products.
3. Request the scopes `user.info.basic` and `video.list`. `video.list` needs app
   review: TikTok asks what the data is used for. The honest answer is short and
   is the kind they approve: *"Creators in our content programme enter videos into
   challenges. With their permission we read the view count of the videos they
   entered, to rank a leaderboard. We do not post, and we do not read anything
   else."*
4. Register the redirect URI **exactly**:
   ```
   https://heuhqqoxyggawuckxocp.supabase.co/functions/v1/tiktok-oauth/callback
   ```
   It has to be one fixed verified HTTPS URL, which is why the round trip lands on
   the edge function and bounces back to `/settings` rather than going straight to
   Vercel.
5. Set the secrets (project-level, so both functions pick them up):
   ```bash
   supabase secrets set TIKTOK_CLIENT_KEY=... TIKTOK_CLIENT_SECRET=... APP_ORIGIN=https://trypcreators.vercel.app
   ```
   No redeploy needed; edge secrets are read per invocation.
6. Connect your own account in Settings and press **Sync now**. Watch
   `social_connections.last_sync_error` if nothing moves.

### Token lifetimes

Access tokens last 24 hours, refresh tokens 365 days. `social-sync` refreshes an
access token when it is within 10 minutes of expiry and stores whatever new
refresh token comes back. A creator who does not sync for a year has to reconnect;
`last_sync_error` is what surfaces that in Settings.

---

## Instagram: the plan

Instagram is not a bigger version of the same job, it is a different shape, which
is why the UI says "coming soon" instead of showing a button that fails.

### Why it is harder

1. **Personal accounts are out.** View counts (`plays` / `views` insights) exist
   only for **Professional** accounts, meaning Business or Creator. A creator on a
   personal account has to convert first, and some will not want to.
2. **It goes through Meta, not Instagram.** The API is the Instagram Graph API
   behind a Meta app. Two routes:
   - **Instagram Login (Instagram API with Instagram Login)** — the newer path.
     The creator authorises with their Instagram account directly, no Facebook
     Page needed. This is the one to build.
   - **Facebook Login for Business** — requires the account to be linked to a
     Facebook Page, which many creators do not have.
3. **App Review is heavier.** `instagram_business_basic` and
   `instagram_business_manage_insights` both need review, and Meta asks for a
   screencast of the exact flow plus a test account. Expect iterations, not days.
4. **Business verification.** Meta may require verifying Tryp.com as a business
   before granting insight scopes on a live app.
5. **Reels metrics are inconsistent.** The metric name for "views" has changed
   more than once (`plays` → `video_views` → `views`), and it differs between
   media types. The sync has to ask for several and take the first that answers.

### What the build looks like

The schema is already provider-agnostic, so most of the work is one more branch:

- `social_connections.provider` already accepts `'instagram'`.
- `submissions.views_source` already accepts `'instagram'`.
- New edge function `instagram-oauth`, same three actions as `tiktok-oauth`,
  redirect URI `.../functions/v1/instagram-oauth/callback`.
- Extend `social-sync` with an Instagram branch:
  1. `GET /me/media?fields=id,permalink,media_type,timestamp` (paged) to list
     their posts.
  2. Match `permalink` against `submissions.video_url`. Instagram shortcodes are
     stable and appear in both, so matching is on the shortcode
     (`instagram.com/reel/<shortcode>`), stored in `platform_video_id` exactly as
     the TikTok id is. Strip the `?igsh=` tracking suffix that the share sheet
     adds, which is present on all 8 Instagram entries currently in the database.
  3. `GET /{media-id}/insights?metric=views,plays,video_views` and take the first
     value present.
  4. Write `logged_views`, `views_source='instagram'`, `views_synced_at`.
- Long-lived tokens last 60 days and are refreshed with
  `GET /refresh_access_token`. Add a weekly cron for that, separate from the
  hourly view sync, because a missed refresh costs a reconnection.
- Turn the "coming soon" row in `ConnectedAccounts.jsx` into a real Connect
  button, plus a line telling creators a Professional account is required.

### Rough sequencing

| Step | Depends on | Notes |
| --- | --- | --- |
| Create the Meta app, add Instagram Login | Meta account | An afternoon |
| Business verification | Company documents | Days to weeks, out of our hands |
| App Review for insights scopes | A working flow to screencast | Build first, submit second |
| `instagram-oauth` + sync branch | Nothing | Roughly the same size as the TikTok work |
| Weekly token refresh cron | The above | Small |

The honest summary: TikTok is done and waiting on one developer app. Instagram is
maybe a day of code sitting behind a review process measured in weeks, and it will
only ever cover creators who run a Professional account.

---

## YouTube, for completeness

Not requested, but worth noting it is the easiest of the three: the YouTube Data
API returns `statistics.viewCount` for any **public** video with nothing but an
API key, no OAuth and no creator consent, because the count is public. If YouTube
entries ever become common, that is a couple of hours of work with no review
process at all.
