# Reading view counts: today, and the official routes

Written 14 Oct 2026 for the move to Tryp.com infrastructure (audit finding H8). **Nothing here has been changed in
how Facebook or Instagram are read: that needs a decision from Tryp.** This document lays out the options.

## How it works today

The edge function `view-sync` reads the public view count off the link a creator submitted, for challenge entries
and VIP videos. Details: [AUTOMATIC_VIEWS.md](AUTOMATIC_VIEWS.md).

| Platform | How it is read today | Account or cookie used | Terms of service |
| --- | --- | --- | --- |
| YouTube | Official YouTube Data API v3 (`videos.list`, API key) | None | Allowed |
| TikTok | Logged-out embed / video page, play count in the page data | None | Automated collection not permitted |
| Instagram | Logged-out reels tab and public GraphQL query | None | Automated collection not permitted |
| Facebook | Logged-out reel/watch pages fetched with Google/Bing crawler user agents; blocked reads retried from other Supabase regions | None | Not permitted, and presents itself as a search engine |

What protects us today: it only reads links creators submitted for a paid programme, only the public count, date and
thumbnail, at a polite rate, with no login. Since 14 Oct every redirect hop is checked against the platform's own hosts.

What it cannot promise: any platform can block it on any day (Facebook already walls some server addresses; that is
why reads hop regions). The "Platform refused" code on the results page is that happening.

## The official routes

All three need the **creator to connect their own account once** (OAuth). After that the count is exact, comes with
the creator's permission, and no page is scraped.

### Instagram: Instagram API with Instagram Login (recommended for Instagram)

- **What the creator does:** taps "Connect Instagram" in Settings and approves. Their account must be a
  **Professional account (Creator or Business)**; switching is free and takes a minute in the Instagram app. No
  Facebook Page needed with this login type.
- **What we read:** `GET /{media-id}/insights?metric=views` for each of their reels and posts. `views` is the total
  times the media was played (organic only). Data can lag up to 48 hours. The old `plays` metric is deprecated.
- **Permissions / review:** `instagram_business_basic` and `instagram_business_manage_insights`, which need Meta App
  Review (a screencast of the flow, a privacy policy URL, business verification of Tryp.com ApS).
- **Limits:** about 200 calls per user per hour; plenty for a few videos a day per creator.
- **Effort:** Meta app + review 2-4 weeks elapsed; build about 4-6 days (connect flow, token storage in
  `creator_private`-style table, refresh, a reader branch in `view-sync`, disconnect).
- **Gap:** a creator who will not switch to a Professional account, or does not connect, falls back to typed views.

### Facebook: Graph API, Page videos only

- **What the creator does:** connects Facebook and picks the Page they post from.
- **What we read:** `GET /{video-id}/video_insights` metric `total_video_views` (plays of 3 seconds or more).
- **Permissions / review:** `pages_read_engagement` and `read_insights` with a Page access token from someone who can
  analyse the Page; Meta App Review and business verification as above (one Meta app covers both).
- **Hard limit:** **videos posted on a personal profile cannot be read at all** through the API (insights exist only
  for Pages). Many creators post reels from personal profiles today; those would need typed views.
- **Effort:** about 3-4 days on top of the Instagram work (same app, same token storage).

### TikTok: Display API

- **What the creator does:** taps "Connect TikTok" and approves.
- **What we read:** `POST /v2/video/list/` (or `video/query` with the video ids) with `fields=view_count,...`.
- **Permissions / review:** Login Kit plus the `user.info.basic` and `video.list` scopes; the TikTok app must pass
  TikTok's app review before production use. Access tokens last 24 hours and refresh tokens a year, so the reader
  refreshes on use.
- **Effort:** app review 1-3 weeks elapsed; build about 3-4 days.

### YouTube: already official

Nothing to change. Quota is 10,000 units a day; `videos.list` costs one unit per call for up to 50 videos, so the
current volume uses well under 1%.

## Recommendation

1. **Decide now:** stop presenting the reader as a Google or Bing crawler for Facebook (the `FB_CRAWLER_UAS` list in `view-sync/facebook.ts`).
   Facebook reads will fail more often; the results page already tells the team to type those in.
2. **Then:** build the connect flows, Instagram first (most entries), TikTok second, Facebook Pages third. Keep the
   current public reader only as a fallback for creators who have not connected, or turn it off per platform once
   most creators are connected (a setting in `app_settings.view_sync`).
3. **Budget:** roughly 3 weeks of engineering plus 2-4 weeks waiting on Meta and TikTok reviews, run in parallel.

## Error codes the team sees

Every code the reader stores is explained on the results page with what happened and what to do
(`src/lib/viewSync.js`, `SYNC_ERRORS`). A test fails if the edge function ever emits a code without an explanation.

Sources: [Instagram media insights](https://developers.facebook.com/docs/instagram-platform/reference/instagram-media/insights/),
[Instagram API with Instagram Login insights](https://developers.facebook.com/blog/post/2025/03/24/user-and-media-insights-on-instagram-api-with-instagram-login/),
[Instagram changelog](https://developers.facebook.com/docs/instagram-platform/changelog),
[Facebook video insights](https://developers.facebook.com/docs/graph-api/reference/video/video_insights/),
[Facebook insights permissions](https://developers.facebook.com/docs/graph-api/reference/page/insights/),
[TikTok Display API get started](https://developers.tiktok.com/docs/en/display-api-get-started),
[TikTok video list](https://developers.tiktok.com/docs/en/tiktok-api-v1-video-list).
