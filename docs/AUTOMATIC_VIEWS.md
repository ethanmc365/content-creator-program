# Automatic view counts

Reading a challenge entry's view count off the link the creator submitted,
instead of an admin opening forty videos and typing forty numbers.

Built 24 Aug 2026. Replaces the manual step entirely for TikTok, and for
Instagram once a session is stored.

## What runs where

| Piece | Where | What it does |
| --- | --- | --- |
| `view-sync` | Supabase Edge Function (`verify_jwt=false`) | Resolves a link, reads the count, writes the row |
| `run_view_sync(force)` | Postgres, `security definer` | Decides whether the interval has elapsed, then POSTs the function |
| `view-sync` cron job | pg_cron, `7 * * * *` | Ticks hourly and calls the above |
| `view_snapshots` | table | Every reading ever taken, whether or not it reached the leaderboard |
| `ViewSyncPanel` | `/admin/challenges/:id/results` | Status, cadence, Sync now, Instagram session |
| `ViewsLab` | `/admin/testing/views` | Paste a link, see what it reads. Writes nothing |

The cron ticks **hourly** but the cadence is a **setting**, not a schedule:
`app_settings.view_sync` holds `{ enabled, interval_hours }` and
`run_view_sync()` returns without firing until `interval_hours` have passed
since the last run. Changing how often it runs is one dropdown in the panel, and
the cron entry itself never has to be rewritten.

## How each platform is read

### TikTok, no sign-in needed

1. If the URL has no `/video/<id>`, follow it once. Most creators paste the
   share-sheet link (`vm.tiktok.com/ZN8...`), which carries nothing.
2. Fetch `https://www.tiktok.com/embed/v2/<id>` and read `"playCount":<n>`.
   The embed carries the same stats as the video page in a third of the bytes
   and exists to be fetched by other sites. The video page is the fallback.
3. Cache the id on `submissions.platform_video_id`, so every later read is a
   single request.

**Verified working from Deno Deploy's egress IPs**, which was the open question
before any of this was built: TikTok serves a bot shell to non-browser user
agents, so the function sends a real Chrome UA. A datacenter IP was the risk and
it turned out not to be one.

### Instagram, sign-in required

Every public route is now closed to anonymous callers:

- `/api/v1/media/<id>/info/` → `302` to login
- `/graphql/query/?...` → `401 {"require_login": true}`
- `/reel/<code>/embed/captioned/` → a JS shell with no data in it
- the logged-out reel page renders **likes and comments but no play count at
  all** (checked in a real browser, not just curl)

So the sync uses the `sessionid` cookie of a **Tryp-owned Instagram account**,
stored in `private.config` (RLS on, zero policies, service-role only, sitting
next to the webhook secret). Two functions bracket it:

- `set_instagram_session(text)` - admin only, write only
- `get_instagram_session()` - `service_role` only, so the Edge Function can read
  it and nothing else can

It lives in the database rather than as an Edge Function secret because a cookie
**expires**, and replacing it should be a field in the admin panel rather than a
redeploy. `INSTAGRAM_SESSIONID` still works as a fallback.

The shortcode in `/reel/<code>/` **is** the media id, base64'd against
Instagram's own alphabet, so no lookup request is needed to convert one to the
other (`instagramMediaId` in `src/lib/videoLinks.js`, pinned in tests against
values checked on the live API).

Without a session, Instagram entries report `needs_session` and are left for an
admin. They never fail the run.

## The rules that keep it honest

**A number never falls.** A reading below what is already saved is recorded in
`view_snapshots` and flagged as `lower_than_recorded`, but is **not** written to
the leaderboard. Views do not go down, so a lower reading means either a bad
read or a number typed from a better source, and the saved one stands.

This caught two wrong numbers on its first run: entries recorded at 1579 and 825
whose live counts were 646 and 536. Both were typed by hand, both were wrong,
and neither was silently corrected.

**Typing a number makes the row manual again.** `saveViews` sets
`views_source: 'manual'` and clears the error, so a row never claims to be
automatic while showing something a person put there.

**A finished challenge is left alone.** The sweep only considers challenges with
`winners_published_at is null` that ended within the last 30 days. Re-reading a
decided challenge months later would quietly rewrite the numbers it was judged
on.

**Every reading is kept.** `view_snapshots` gets a row per successful read
regardless of whether it reached the leaderboard, because a wrong number is only
obvious next to the ones either side of it.

## Error vocabulary

`submissions.views_sync_error` holds one of these, and
`SYNC_ERRORS` in `src/lib/viewSync.js` turns each into a sentence for the panel:

| Code | Means |
| --- | --- |
| `needs_session` | No Instagram session stored |
| `session_expired` | Instagram rejected the stored cookie. Paste a fresh one |
| `no_video_id` | The link does not resolve to a video. Deleted, private, or truncated |
| `no_count_in_page` | Loaded, but carries no count. Photo posts and carousels have none |
| `blocked` | The platform served a check page. Usually clears itself next run |
| `fetch_failed` | Request failed or timed out. Retried next run |
| `lower_than_recorded` | Live count is below the saved one. Nothing was overwritten |

## Two things worth knowing before changing it

**pg_net gives up after 5 seconds.** A sweep of forty videos takes far longer,
so the scheduled caller gets a `202` immediately and the work continues under
`EdgeRuntime.waitUntil`. The run is recorded in `app_settings.view_sync_last_run`
either way, which is what the panel reads. An admin pressing Sync now **is**
waiting for the numbers, so that path stays synchronous.

**Host matching is anchored at both ends.** `platformOf` takes a hostname and
tests `/(^|\.)tiktok\.com$/`. A substring test accepts `tiktok.com.evil.test`,
and the TikTok branch falls back to fetching the submitted URL itself, so a
loose match there is a request sent wherever an attacker likes. A test in
`videoLinks.test.js` holds that line.

## Not this again

Migration 068 dropped the **first** attempt at automatic views (Aug 2026), which
went through the TikTok Display API and needed a reviewed developer app plus
per-creator OAuth. It never went live. Nothing here asks a creator to connect
anything or needs anyone's app review. `social-sync` and `tiktok-oauth` remain
deployed as 410 stubs from that era and can be deleted from the Supabase
dashboard whenever convenient.
