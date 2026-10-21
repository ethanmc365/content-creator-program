# Reading view counts: today, and creators connecting their accounts

Current as of 21 Oct 2026. How the reader works in detail: [AUTOMATIC_VIEWS.md](AUTOMATIC_VIEWS.md).

**Decision (21 Oct 2026): keep the current reader for now.** The next step, when Tryp is ready, is to let creators
connect their TikTok and Instagram accounts, the way other creator (UGC) platforms do.

## How it works today

The edge function `view-sync` reads the public numbers off the link a creator submitted, every hour, for challenge
entries and VIP videos. Code: `supabase/functions/view-sync/` (`index.ts` runs the sweep; `tiktok.ts`, `youtube.ts`,
`instagram.ts`, `facebookRead.ts` read one platform each).

| Platform | How | Account needed | Platform terms |
| --- | --- | --- | --- |
| YouTube | Official YouTube Data API (API key) | None | Allowed |
| TikTok | Public embed page | None | Automated reading not allowed |
| Instagram | Creator's public reels tab | None | Automated reading not allowed |
| Facebook | Public reel page, read as a search crawler; other regions tried when one is blocked | None | Not allowed |

Any platform can block this on any day. The results page explains every failure code and the team can type views in.

**On Tryp's own servers:** the reader retries blocked Instagram, Facebook and TikTok reads from other Supabase Cloud
regions. That only exists on Supabase Cloud. On a self-hosted server every read comes from one address, so test
Instagram and Facebook from that server during the practice run. If they are refused, keep `view-sync` running on a
small Supabase Cloud project that writes to the Tryp database, or turn those two platforms over to typed views.

## Creators connect their accounts (recommended next step)

Each creator taps "Connect TikTok" / "Connect Instagram" once (in onboarding or Settings) and approves. From then on
the numbers come from the platform with the creator's permission: exact, never blocked, and allowed by the terms.

### What we read today, and what connecting gives

| Data | Today (public pages) | TikTok, connected | Instagram, connected |
| --- | --- | --- | --- |
| Views | Yes (Facebook rounded) | Yes, exact | Yes, exact (organic; can lag up to 48 h) |
| Thumbnail / cover | Yes | Yes | Yes |
| Posted date | Yes | Yes | Yes |
| Caption | Yes | Yes | Yes |
| Likes, comments, shares | No | Yes | Yes (plus saves) |
| Reach (unique accounts) | No | No | Yes |
| Followers | No | Yes | Yes |
| Audience by country, age, gender | No | No | Yes, for accounts with 100+ followers |
| Words written on the video (TikTok text stickers) | Yes, from the embed page | No | No |
| Works for any public account | Yes | Yes | **Professional (Creator/Business) accounts only**; switching is free |

So connecting gives everything we have today plus engagement, reach, followers and audience data, which would also
feed the creator's portfolio and media kit. The one thing it does not give is the text written on a TikTok video:
keep reading the embed page for that (one light read when the entry is added).

Facebook can be connected too, but only for videos posted from a **Page**; personal-profile videos cannot be read
by any official route, so those stay on typed views. YouTube needs nothing: it already uses the official API.

### What it takes

| | Instagram | TikTok |
| --- | --- | --- |
| Developer app | Meta app, "Instagram API with Instagram Login" | TikTok for Developers app, Login Kit + Display API |
| Permissions | `instagram_business_basic`, `instagram_business_manage_insights` | `user.info.basic`, `user.info.stats`, `video.list` |
| Review | Meta App Review + business verification of Tryp.com ApS (screencast, privacy policy URL) | TikTok app review |
| Waiting time | 2 to 4 weeks | 1 to 3 weeks |
| Build | About a week: connect button, token storage, token refresh, a connected-account reader in `view-sync`, disconnect | About a week, same parts |

Both reviews can run at the same time as the build. Until a creator connects, the current reader stays as the
fallback; a setting in `app_settings.view_sync` can switch the public reader off per platform once most creators
have connected.

To start, Tryp needs to: create the Meta and TikTok developer apps under a Tryp business account, complete Meta
business verification, and publish a privacy policy page that covers the data read.
