# Storage audit, 3 August 2026

Measured directly against production (`storage.objects` and `pg_database_size`),
not estimated.

## Where you stand

| Bucket | Objects | Size | What it is |
| --- | ---: | ---: | --- |
| `gallery` | 273 | **108.4 MB** | Creator travel photos |
| `resources` | 1 | 21.8 MB | One `.mov` in the library |
| `chat-media` | 12 | 6.2 MB | Images and video in channels |
| `avatars` | 85 | 5.3 MB | Profile pictures |
| `dm-media` | 4 | 0.5 MB | Private DM attachments |
| **Total** | **375** | **142.2 MB** | of a 1 GB free-tier cap = **14%** |

Postgres itself is **21 MB of a 500 MB cap (4%)**. Not a concern at any point on
the current trajectory.

## Growth

| Month | Objects added | Size added |
| --- | ---: | ---: |
| June 2026 | 143 | 47 MB |
| July 2026 | 220 | 91 MB |
| August 2026 (3 days) | 12 | 4.6 MB |

July was the heavy month because that is when most creators onboarded and
uploaded travel galleries. At roughly **45-90 MB/month** the 1 GB cap is
**9 to 19 months away**, and the true figure is at the slower end because gallery
uploads are a one-off per creator, not a recurring habit. 273 photos across ~43
creators is about six each, mostly loaded during onboarding.

## The honest read

You are fine. Storage is not a problem you need to think about this year.

Two things worth knowing anyway:

1. **Gallery is 76% of everything**, at ~0.4 MB per photo. If you ever want to
   halve total storage in an afternoon, downscale gallery uploads client-side to
   1600px before upload. Nobody would see the difference on a phone.
2. **Challenge videos are external links**, never stored, so the thing that
   would normally blow up a creator platform's storage costs you nothing. The
   only real video risk is `chat-media`, currently 6 MB.

**At the cap, uploads start failing but the site keeps serving** — reads, the
database and everything else are unaffected. And Supabase Pro is $25/month for
100 GB, so the worst case is a small bill roughly a year out, not an outage.

No action needed. Revisit when `gallery` passes ~400 MB.
