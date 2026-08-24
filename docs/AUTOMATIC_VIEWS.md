# Automatic view counts

Reading a challenge entry's view count off the link the creator submitted,
instead of an admin opening forty videos and typing forty numbers.

Built 24 Aug 2026, four platforms. It runs on EVERY challenge, live and future,
with no per-challenge switch: reading views off the link is simply how a view
count arrives now. A number typed by hand still wins on that row.

## What each platform needs, in one table

| Platform | Exact? | Needs | Why |
| --- | --- | --- | --- |
| TikTok | yes | nothing | The embed endpoint states `playCount` to anyone |
| YouTube | yes | a free Data API key | YouTube bot-blocks datacenter IPs; the API does not |
| Facebook | **no, rounded** | nothing | Logged out, only the page title states a count, as "5.6K views" |
| Instagram | yes | a Tryp account session cookie | Every public route answers `require_login` |

Both credentials are pasted into the panel on a challenge's results page and
stored in `private.config`, never as Edge Function secrets, because a cookie
expires and a key can be rotated and neither should be a redeploy.

## What runs where

| Piece | Where | What it does |
| --- | --- | --- |
| `view-sync` | Supabase Edge Function (`verify_jwt=false`) | Resolves a link, reads the count, writes the row |
| `run_view_sync(force)` | Postgres, `security definer` | Decides whether the interval has elapsed, then POSTs the function |
| `view-sync` cron job | pg_cron, `7 * * * *` | Ticks hourly and calls the above |
| `view_snapshots` | table | Every reading ever taken, whether or not it reached the leaderboard |
| `ViewSyncPanel` | `/admin/challenges/:id/results` | Status, cadence, Sync now, both credentials |
| `ViewsLab` | `/admin/testing/views` | Paste a link, see what it reads. Writes nothing |

The cron ticks **hourly** but the cadence is a **setting**, not a schedule:
`app_settings.view_sync` holds `{ enabled, interval_hours }` (enabled is always
true and not offered as a choice) and
`run_view_sync()` returns without firing until `interval_hours` have passed
since the last run. Changing how often it runs is one dropdown in the panel, and
the cron entry itself never has to be rewritten.

## How each platform is read

### TikTok, exact, no sign-in needed

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

### YouTube, exact, needs a free key

An eleven-character id is all any YouTube surface reduces to (watch links,
`youtu.be`, Shorts, embeds). The watch page states the exact count and reading it
works perfectly from an ordinary connection, which is what made this look easy.

It does not work from a server. From Deno Deploy the watch page returns 200 with
1.2 MB of HTML, an EMPTY `<title>`, and no count anywhere; every innertube client
(`WEB`, `MWEB`, `ANDROID`, `IOS`, `TVHTML5`) answers `LOGIN_REQUIRED` with the
reason "Sign in to confirm you're not a bot". oEmbed still responds, which proves
the block is on the data rather than on reachability.

So the count comes from **YouTube Data API v3**:

    GET https://www.googleapis.com/youtube/v3/videos?part=statistics&id=<id>&key=<key>

Free, no review, no billing account. The quota is 10,000 units a day and this
call costs **1 unit**, so a programme with forty entries uses 0.4% of it. The
page read stays as a fallback for the day the block lifts.

### Facebook, rounded, no sign-in

`og:title` reads `"5.6K views · 152K reactions | ..."` and that is the only
statement of a count in the whole document. There is no exact figure anywhere,
`m.facebook.com` returns a stub and `mbasic.facebook.com` redirects to a login.

So a Facebook number is stored with `views_approx` set, shown with a `~`, and
never allowed to overwrite a number it disagrees with by less than its own
rounding - otherwise "5.6K" would replace an exact 5,573 and call it an update.

### Instagram, sign-in required

Every public route is now closed to anonymous callers:

- `/api/v1/media/<id>/info/` → `302` to login
- `/graphql/query/?...` → `401 {"require_login": true}`
- `/reel/<code>/embed/captioned/` → a JS shell with no data in it
- the logged-out reel page renders **likes and comments but no play count at
  all** (checked in a real browser, not just curl)

So the sync uses the `sessionid` cookie of a **Tryp-owned Instagram account**,
stored in `private.config` (RLS on, zero policies, service-role only, sitting
next to the webhook secret). Two functions bracket it, shared with the YouTube
key (migration 111):

- `set_view_sync_secret(name, value)` - admin only, write only, allowlisted names
- `get_view_sync_secrets()` - `service_role` only, so the Edge Function can read
  them and nothing else can

They live in the database rather than as Edge Function secrets because a cookie
**expires** and a key gets rotated, and replacing either should be a field in the
admin panel rather than a redeploy. `INSTAGRAM_SESSIONID` and `YOUTUBE_API_KEY`
still work as fallbacks.

The cookie is accepted either as a bare `sessionid` value or as a whole `Cookie:`
header pasted from dev tools; the full header is the better thing to give it,
since a session that keeps presenting the cookie set it was issued with lasts
longer. The user agent is fixed for the same reason.

The shortcode in `/reel/<code>/` **is** the media id, base64'd against
Instagram's own alphabet, so no lookup request is needed to convert one to the
other (`instagramMediaId` in `src/lib/videoLinks.js`, pinned in tests against
values checked on the live API).

Without a session, Instagram entries report `needs_session` and are left for an
admin. They never fail the run.

**Two dead ends worth not re-walking.** The logged-out REELS TAB on a profile
does display view counts, and they are the right numbers. But they arrive from an
internal `POST /api/graphql` call whose `doc_id` rotates, they only cover the most
recent page of reels, and matching an entry would mean paginating a private API -
brittle and partial where the media-id lookup is neither. Separately,
`api/v1/users/web_profile_info` needs no cookie at all and returns
`video_view_count`, which is a LEGACY metric: on a checked reel it read **1,123**
against a displayed **4,245**, and against **3,920** logged by hand. Using it
would have quietly cut every Instagram number to a third.

**Trial reels.** A trial reel is shown only to people who do not follow the
account and never appears on the author's own profile, so it has no readable
count and never will. When the media exists and states no plays, the sync reports
`trial_reel` - "No view count found (likely trial reel)" - rather than retrying
something that cannot succeed. The only fix is to ask the creator.

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
| `trial_reel` | Instagram trial reel. No count exists; ask the creator |
| `needs_youtube_key` | No YouTube Data API key stored |
| `youtube_key_rejected` | YouTube refused the key (invalid, restricted, or API not enabled) |
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
