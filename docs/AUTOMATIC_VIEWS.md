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
| Facebook | **exact under 1,000, ~1% above** | nothing | The page title is the only statement of a count logged out |
| Instagram | yes | a Tryp account session cookie | Every public route answers `require_login` |

Both credentials are pasted into the panel on a challenge's results page and
stored in `private.config`, never as Edge Function secrets, because a cookie
expires and a key can be rotated and neither should be a redeploy. They stay
folded away unless one of them is actually the problem.

## How much can it do

| Platform | Ceiling | What sets it |
| --- | --- | --- |
| TikTok | no published quota | Page reads. Politeness, not policy: 6 at a time, ~40 requests for a full sweep. Thousands a day is fine; hammering it earns a captcha page, which the sync reports as `blocked` and retries next run |
| YouTube | **10,000 videos/day** | Data API quota: 10,000 units a day, `videos.list` costs 1 unit per call. If that ever binds, one call accepts up to 50 ids, which would take it to 500,000/day - not worth building at 39 entries |
| Instagram | a few hundred a day, comfortably | No published quota on the private endpoint. One session, one user agent, one request per entry. The programme uses about 17 a day |
| Facebook | no published quota | Page reads, same shape as TikTok |

`MAX_PER_RUN` caps a single run at 300 entries. The real constraint for this
programme is nothing: 39 entries take about 7 seconds.

## How often the credentials need touching

- **YouTube key: never.** It does not expire. Rotate it only if it leaks.
- **Instagram session: months, not days.** A sessionid is good for up to about a
  year, and using it daily from one fixed user agent is what keeps it alive.
  What kills it early is a password change, a "log out of all sessions", or
  Instagram deciding the account looks odd. There is no schedule to keep: when it
  goes, every Instagram entry reports `session_expired`, the panel says so, and
  pasting a fresh one takes a minute.

## What runs where

| Piece | Where | What it does |
| --- | --- | --- |
| `view-sync` | Supabase Edge Function (`verify_jwt=false`) | Resolves a link, reads the count, writes the row |
| `run_view_sync(force)` | Postgres, `security definer` | Decides whether the interval has elapsed, then POSTs the function |
| `view-sync` cron job | pg_cron, `7 * * * *` | Ticks hourly and calls the above |
| `view_snapshots` | table | Every reading ever taken, whether or not it reached the leaderboard |
| `ViewSyncPanel` | `/admin/challenges/:id/results` | Status, cadence, Sync now |
| `AdminConnections` | `/admin/connections` | The two credentials, and what each platform needs |
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

`og:title` reads `"5.7K views · 152K reactions | ..."` and that is the only
statement of a count in the whole document. **Facebook serves the same link as one of three different pages, at random.**
That is the whole explanation for "it fails three times then works on the
fourth". Measured over ten attempts on one share link: a 65 kB page and a 400 kB
page, both carrying the video, and a 48 kB COOKIE CONSENT interstitial carrying
nothing at all, which came back once or twice in ten.

It is not a rate limit and there is nothing to back off from - asking again
simply gets a different page - so resolution retries up to four times. Measured
after the fix: 12/12, with the share link 6/6.

A `/share/` link also does not redirect. It answers a desktop agent with a 400
and a phone with an 836-byte shell whose only content is a JavaScript bounce back
to ITSELF carrying `?hpir=1`; fetching that second URL returns the real page. And
the id is not in the URL - it is in the page's own markup, so `canonical` and
`og:url` are read first (they describe THIS page) before falling back to the
bootstrap JSON. The 17-digit number that appears six times is a LOGGING id and
resolves to Facebook's generic video page, so candidates are TRIED against
`watch/?v=` and the first that states a count wins.

Facebook is fussy about WHICH URL and WHICH agent:

| Shape | Desktop agent | Phone agent |
| --- | --- | --- |
| `/reel/<id>` | **400** | 200, but an empty shell |
| `/share/r/<code>` | **400** | follows the redirect properly |
| `watch/?v=<id>` | **200 with og:title** | - |

So a link is RESOLVED as a phone (the only way a share link gives up its
destination) and READ as `watch/?v=<id>` on the desktop agent (the only response
that carries the count). The pasted form is never used to read. If the id still
cannot be found, the landing page is scraped for `video_id` / `og:url`. There is no exact figure anywhere,
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

### The cookie that made it work

A request carrying **only** `sessionid` is answered with a `302` whose `Location`
is the URL it just asked for. Following that chain wastes the timeout and fails,
and the first version then fell through to a page read that also found no count,
so **every Instagram entry was reported as a trial reel**. It was not a trial
reel problem; it was an authentication problem wearing its clothes.

Instagram wants the cookie set a browser would carry:

    sessionid=<value>; ds_user_id=<uid>; csrftoken=<any>; ig_did=<any>; mid=<any>

`ds_user_id` is **not** a second thing to paste. A sessionid is
`<uid>%3A<token>%3A<...>`, so the account id is its first segment and is derived
(`igCookie()` in the function, `instagramUserIdFromSession()` in
`src/lib/videoLinks.js`, which exists so a test pins the rule). The other three
only have to be present. With that set the endpoint returns `play_count`
immediately, matching the number Instagram displays.

The request is also made with `redirect: 'manual'`: if the session ever stops
being accepted, the 302 is the answer, and following it just burns ten seconds
before failing anyway.

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

**It reads counts the public page hides.** A creator with
`like_and_view_counts_disabled` shows nobody their numbers - and the signed-in
API returns them anyway. That is why the sync can fill in entries an admin
looking at the post cannot read for themselves, which is not a bug and was
checked against the post's own owner, code and caption before being believed.

**Trial reels, and what is NOT one.** A trial reel is shown only to people who do
not follow the account and never appears on the author's own profile, so it has
no readable count and never will. `trial_reel` is only reported when all three
are true: we are signed in, Instagram returned the media, and the media is a
video that states no plays. A photo or carousel (`media_type` 1 or 8) is
`not_a_video` instead, and every transport failure returns its own reason. That
distinction matters: the first version reported ALL of them as trial reels, which
made a broken login look like seventeen unlucky posts.

## Scale

A UK challenge has 39 entries. A Spanish one has 400 to 500, and a worldwide
brief could have thousands, all wanting a daily read. So **staleness belongs to
the entry, not to the run**:

- The cron fires hourly and simply asks.
- Each invocation takes the `CHUNK` (120) entries whose own reading is oldest,
  reads them, then hands the rest to a fresh invocation. Up to 40 chunks chain
  before one stops itself; whatever is left is still stale, so the next hourly
  tick picks it up. Nothing races a timeout.
- Concurrency is **per platform**. TikTok, YouTube and Facebook are public and
  take the wide lane (8). Instagram is one signed-in session and takes a narrow
  one (3, with a small gap), because what would break it is not requests per day,
  it is requests per second.

**Measured 24 Aug 2026**: 250 entries read in **3 self-continuing chunks in 4.5
seconds**, 250 of 250 updated, 0 failed. The programme's real 39 entries take
about 4 seconds.

## The rules that keep it honest

**The platform is the source of truth.** Whatever it states is what gets saved,
every time.

An earlier version refused to write a reading LOWER than the saved number, on the
theory that views only rise. They do - but the SAVED number was sometimes simply
wrong, typed from the wrong video, and the guard then preserved that error
permanently while flagging the truth as the problem. Two entries sat at 1,579 and
825 whose real counts were 648 and 537, and the guard was the reason they stayed
wrong. Typing a number by hand is for the entries the platform cannot answer, not
for outranking the ones it can.

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
| `trial_reel` | Instagram VIDEO stating no plays. No count exists; ask the creator |
| `not_a_video` | Instagram photo or carousel. Never has a view count |
| `needs_youtube_key` | No YouTube Data API key stored |
| `youtube_key_rejected` | YouTube refused the key (invalid, restricted, or API not enabled) |
| `blocked` | The platform served a check page. Usually clears itself next run |
| `fetch_failed` | Request failed or timed out. Retried next run |

## Running a sync

**"Sync now" forces.** The scheduled sweep reads what has gone STALE, which is
what lets a big programme drain steadily. A person pressing the button means
"read these now", so it sends `force: true` and the staleness rule is skipped
entirely. Without that the button did nothing whenever everything had been read
inside the interval, which looks exactly like a broken button.

A forced chain knows it is finished differently from a scheduled one: a scheduled
sweep counts down what is still stale, but a forced run makes every row it reads
fresh, so it counts `done` against the `total` it started with. Using
"remaining stale" for a forced run would never reach zero.

Every run is a BACKGROUND run. The caller gets `202` immediately and polls
`view_sync_status().run`, which carries `{ running, total, done, updated,
failed }` republished after each batch - so the button reads "Reading 24 of 39"
instead of sitting there looking dead.

That is not a nicety. The first version awaited the whole sweep inside the
request: the browser eventually abandoned it, the button never changed, and
pressing it again started a SECOND overlapping run writing the same rows.
`view_sync_running()` now refuses a second run while one is going (409), with a
fifteen-minute staleness guard so a run killed mid-flight cannot lock the button
out forever.

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
