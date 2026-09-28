// Facebook: the pure half of the reader. No network and no imports, so the
// parsing that decides WHICH number is a video's view count is tested in
// vitest (facebook.test.ts) rather than discovered in production.
//
// WHAT IS TRUE, measured 28 Sep 2026 from Supabase's own edge regions:
//
//   * Signed out, a BROWSER never sees a reel's count. A search-crawler agent
//     does: `/reel/<id>/` comes back with the full page data, and in it the
//     video carries `"associated_video":{..."id":"<id>"}` followed by
//     `play_count` (the plays figure the creator sees on their own reels tab)
//     and `video_view_count`. Exact, not rounded.
//   * The page carries SEVERAL blocks naming the same id - one is the comment
//     list, and on some reels it comes FIRST. Reading only the first match is
//     the bug that made a readable reel look countless. Every block is scanned.
//   * Facebook walls crawler traffic PER SERVER IP. Hammer one region and it
//     answers `/login/` for a while; the other regions carry on answering. The
//     reader therefore fails over across regions (see index.ts), and a login
//     page is reported as `walled`, never as "no count".
//   * `story.php?story_fbid=pfbid...` is login-walled for every agent from a
//     datacenter, but Facebook's own EMBED PLUGIN resolves it:
//     `plugins/video.php?href=<link>` links to `/reel/<id>/?ref=embed_video`.

// Agents, in the order they are tried. Google-InspectionTool is the one that
// Facebook answered with the count on every region that was not walled.
export const FB_CRAWLER_UAS = [
  'Mozilla/5.0 (compatible; Google-InspectionTool/1.0)',
  'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
]

// Supabase edge regions a Facebook read can be sent to. Measured: any one of
// them can be walled at a given moment, and the rest are not.
export const FB_REGIONS = [
  'eu-west-2', 'eu-central-1', 'eu-west-3', 'us-east-1', 'us-west-1',
  'ca-central-1', 'sa-east-1', 'ap-southeast-1', 'eu-west-1', 'eu-north-1',
  'ap-northeast-1', 'ap-northeast-2', 'ap-south-1', 'ap-southeast-2', 'us-west-2', 'eu-central-2',
]

export function facebookIdFrom(url: string): string | null {
  return url.match(/\/(?:videos|reel|reels|video)\/(\d{6,})/)?.[1] ?? url.match(/[?&]v=(\d{6,})/)?.[1] ?? null
}

// "5.7K" -> 5700, "8.9M" -> 8900000, "1,234" -> 1234.
export function parseCompactCount(raw: string): number | null {
  const m = raw.replace(/,/g, '').match(/^([\d.]+)\s*([KMB]?)$/i)
  if (!m) return null
  const n = parseFloat(m[1])
  if (!isFinite(n)) return null
  return Math.round(n * { '': 1, k: 1e3, m: 1e6, b: 1e9 }[m[2].toLowerCase() as '' | 'k' | 'm' | 'b'])
}

export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
}

// The count bound to THIS video. The page also holds a dozen recommended reels
// with counts of their own, so a number is only ever taken from a block whose
// `associated_video.id` is ours - and from every such block, not the first.
export function facebookCountFor(html: string, id: string): number | null {
  const esc = id.replace(/\D/g, '')
  if (!esc) return null
  const re = new RegExp(`"associated_video":\\{[^{}]*"id":"${esc}"\\}([^{}]{0,1200})`, 'g')
  let best: number | null = null
  for (const m of html.matchAll(re)) {
    const block = m[1]
    for (const key of ['play_count', 'video_view_count']) {
      const v = block.match(new RegExp(`"${key}":(\\d+)`))?.[1]
      if (v != null) best = Math.max(best ?? 0, Number(v))
    }
  }
  return best
}

// The watch page's og:title states a count for a classic (non-reel) video:
// "847 views", or rounded above a thousand ("5.7K views"). Rounded FIRST, then
// exact - the exact pattern would otherwise read "5.7K" as 5.
export function facebookTitleCount(html: string): { views: number; approx: boolean } | null {
  const title = decodeEntities(html.match(/property="og:title"\s+content="([^"]*)"/)?.[1] ?? '')
  const rounded = title.match(/([\d.]+[KMB])\s+views?/i)?.[1]
  if (rounded) {
    const n = parseCompactCount(rounded)
    if (n != null) return { views: n, approx: true }
  }
  const exact = title.match(/(\d[\d,]*)\s+views?/i)?.[1]
  if (exact) {
    const n = parseCompactCount(exact)
    if (n != null) return { views: n, approx: false }
  }
  return null
}

// Facebook's answer to "you may not see this signed out": a redirect to
// /login/ (or the cookie-consent interstitial in front of it), or a page whose
// title asks you to log in.
export function isFacebookWall(finalUrl: string, html: string): boolean {
  if (/facebook\.com\/(?:login|cookie\/consent_prompt|checkpoint)/.test(finalUrl)) return true
  const title = html.match(/property="og:title"\s+content="([^"]*)"/)?.[1] ?? html.match(/<title>([^<]*)</)?.[1] ?? ''
  return /log in or sign up|log in to facebook/i.test(decodeEntities(title))
}

// The embed plugin links the post's video as `/reel/<id>/?ref=embed_video` or
// `/<page>/videos/<id>/?ref=embed_video`.
export function pluginVideoId(html: string): string | null {
  return html.match(/\/(?:reel|videos)\/(\d{6,})\/?\?ref=embed_video/)?.[1] ?? null
}

// Candidate ids inside a resolved page. Authoritative first: canonical and
// og:url describe THIS page; a bare path match anywhere in 400 kB could belong
// to a recommended video. The seventeen-digit number that appears six times is
// a LOGGING id, so candidates are tried rather than trusted.
export function facebookIdCandidates(html: string): string[] {
  const found: string[] = []
  const push = (v?: string | null) => {
    if (v && !found.includes(v)) found.push(v)
  }
  push(html.match(/rel="canonical"\s+href="[^"]*\/(?:videos|reel|video)\/(\d{6,})/)?.[1])
  push(html.match(/property="og:url"\s+content="[^"]*\/(?:videos|reel|video)\/(\d{6,})/)?.[1])
  push(html.match(/params:\{video_id:"(\d{6,})"\}/)?.[1])
  push(html.match(/"pageID"\s*:\s*"?(\d{6,})"?/)?.[1])
  push(html.match(/"video_id"\s*:\s*"(\d{6,})"/)?.[1])
  push(html.match(/"videoID"\s*:\s*"(\d{6,})"/)?.[1])
  push(html.match(/\/(?:videos|reel)\/(\d{6,})/)?.[1])
  return found
}

// Regions to try, best first: the ones that answered most recently lead, then
// the rest in a shuffled order so a sweep does not always lean on one region.
export function regionOrder(good: string[], all: string[] = FB_REGIONS, rand: () => number = Math.random): string[] {
  const rest = all.filter((r) => !good.includes(r))
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[rest[i], rest[j]] = [rest[j], rest[i]]
  }
  return [...good.filter((r) => all.includes(r)), ...rest]
}

// A COVER FRAME, FROM THE PAGE WE ALREADY FETCHED (28 Sep 2026).
//
// Ethan: "whenever it pulls up the thumbnail for the entry screenshots or
// thumbnail for the entries, it also shows the circle play button."
//
// It did, and the play button was Facebook's rather than ours. A Facebook entry
// had no cover to store - the note above says Facebook shows every server its
// login page - so the card fell back to drawing Facebook's own embeddable
// PLAYER where the picture goes, and a player draws a play button in the
// middle of itself. There was no way to reach into it and take that off: it is
// a cross-origin iframe.
//
// The premise turned out to be wrong, and measured rather than assumed: the
// reel page THIS FILE ALREADY READS FOR THE VIEW COUNT carries the cover in its
// `og:image`, and it is the clean frame - 1000x1200, no overlay, no chrome.
// Checked on two live entries on 28 Sep 2026. So the cover costs no extra
// request at all; it was in the response the whole time and nobody read it.
//
// TWO SOURCES, BEST FIRST. `preferred_thumbnail` is the video's own cover and
// comes at the reel's aspect (mx720x1280), which is what a 4:5 card wants;
// `og:image` is the share card's picture, letterboxed to 1000x1200 but always
// present. Both land on `fbcdn.net`, which `thumb-cache` already trusts as an
// image host - so whatever comes back here goes straight into our own bucket
// and every later viewer gets one URL from our own origin.
//
// THE HOST IS CHECKED HERE and not only at the far end. This function reads
// attacker-shaped input - a page fetched from the internet - and hands back a
// URL something else will fetch, which is the exact shape of an SSRF. A cover
// that is not on Facebook's CDN is not Facebook's cover.
function onFbCdn(u: string): boolean {
  try {
    const { hostname, protocol } = new URL(u)
    return protocol === 'https:' && (hostname === 'fbcdn.net' || hostname.endsWith('.fbcdn.net'))
  } catch {
    return false
  }
}

export function facebookCoverFrom(html: string): string | null {
  // The video's own cover, inside a JSON blob, so `\/` for every slash.
  const preferred = html.match(/"preferred_thumbnail":\{"image":\{"uri":"([^"]+)"/)?.[1]
  if (preferred) {
    const url = decodeEntities(preferred.replace(/\\\//g, '/'))
    if (onFbCdn(url)) return url
  }
  // The share card's picture. Always there, HTML-entity encoded.
  const og = html.match(/property="og:image"\s+content="([^"]*)"/)?.[1]
  if (og) {
    const url = decodeEntities(og)
    if (onFbCdn(url)) return url
  }
  return null
}
