// TikTok: exact play count from the public embed page, read again from another region when a page comes back empty.
import { type Platform } from './hosts.ts'
import { regionOrder } from './facebook.ts'
import { SUPABASE_URL, WEBHOOK_SECRET, HttpError, getText, type Resolved, fail, followRedirects } from './shared.ts'

// ------------------------------------------------------------------- tiktok
export function tiktokIdFrom(url: string): string | null {
  return url.match(/\/(?:video|photo)\/(\d{6,})/)?.[1] ?? url.match(/[?&]item_id=(\d{6,})/)?.[1] ?? null
}

// An embed page carries exactly one video, but the full video page also carries
// the stats of RECOMMENDED videos, so prefer the object that names THIS id.
// Reading the wrong video's number is the one failure that would not look like a
// failure.
export function playCountFrom(html: string, videoId: string): number | null {
  const idx = html.indexOf(`"id":"${videoId}"`)
  if (idx >= 0) {
    const scoped = html.slice(idx, idx + 4000).match(/"playCount":\s*(\d+)/)?.[1]
    if (scoped) return Number(scoped)
  }
  const first = html.match(/"playCount":\s*(\d+)/)?.[1]
  return first ? Number(first) : null
}

// WHAT THE EMBED ALREADY TOLD US. Free: this is the same HTML the play count
// came out of, so there is no second request and nothing to go wrong that has
// not already gone right. Every field is best-effort and any of them may be
// null - see the note on `Resolved`.
//
// `uniqueId` is the @handle and `nickName` is the display name, so the handle
// is the one worth keeping (it is what a link is built from).
//
// TWO SCHEMAS, BECAUSE THE KEYS MOVED (18 Sep 2026). This was written against
// an embed that carried `"desc"` and `"cover"`. The embed now nests the post
// under `"itemInfos"`, with the caption at `"text"` and the poster frame in a
// `"covers"` ARRAY - so both of those regexes had stopped matching and this
// function was returning a null caption and a null thumbnail on every TikTok,
// silently, because every field here is best-effort by design. Measured on a
// real entry: `"desc"` and `"cover"` appear ZERO times in the embed now.
//
// Both shapes are tried, new name first, so this keeps working whichever
// TikTok serves. THE VIEW COUNT WAS NEVER AFFECTED - `playCount` is unchanged
// and `meta` is off in the sweep - so this only ever degraded the tracker's
// "read it from the platform".
//
// SCOPED TO THE ITEM BLOB, for the same reason `playCountFrom` is scoped: the
// page also carries a hashtag's own description under a `"text"` key, and an
// unscoped match takes whichever comes first in 290 kB.
export function tiktokMeta(html: string): Partial<Resolved> {
  const start = html.indexOf('"itemInfos"')
  const seg = start >= 0 ? html.slice(start, start + 12000) : html
  const pick = (...res: RegExp[]) => {
    for (const re of res) {
      const raw = seg.match(re)?.[1] ?? html.match(re)?.[1]
      if (!raw) continue
      try {
        // The blobs are JSON inside HTML, so the values arrive JSON-escaped -
        // \n, \u00e9 and the rest. Parsing them as a JSON string is the only
        // correct way to get the characters back; a hand-rolled unescape is how
        // captions end up full of stray backslashes.
        return JSON.parse(`"${raw}"`) as string
      } catch {
        return raw
      }
    }
    return null
  }
  const caption = pick(/"text":"((?:[^"\\]|\\.)*)"/, /"desc":"((?:[^"\\]|\\.)*)"/)
  const author = pick(/"uniqueId":"((?:[^"\\]|\\.)*)"/)
  const thumbnail = pick(/"covers":\["((?:[^"\\]|\\.)*)"/, /"cover":"((?:[^"\\]|\\.)*)"/)
  const created = html.match(/"createTime":"?(\d{9,10})"?/)?.[1]
  return {
    caption: caption || null,
    author: author || null,
    thumbnail: thumbnail || null,
    postedAt: created ? new Date(Number(created) * 1000).toISOString() : null,
  }
}

/** The text stickers a creator put on a TikTok, in order, one per line. Null when there are none. */
export function tiktokScreenText(html: string): string | null {
  const out: string[] = []
  const re = /"stickerText":\[((?:"(?:[^"\\]|\\.)*"\s*,?\s*)+)\]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    try {
      for (const t of JSON.parse(`[${m[1]}]`) as string[]) {
        const clean = String(t).replace(/\s+/g, ' ').trim()
        if (clean && !out.includes(clean)) out.push(clean)
      }
    } catch { /* a malformed blob is no text, never a failed read */ }
  }
  return out.length ? out.join('\n').slice(0, 600) : null
}

export async function tiktokViews(url: string, knownId: string | null, meta = false): Promise<Resolved> {
  const base = { platform: 'TikTok' as const, approx: false }
  let canonical: string | null = url
  let id = knownId ?? tiktokIdFrom(url)

  if (!id) {
    canonical = await followRedirects(url)
    if (canonical) id = tiktokIdFrom(canonical)
  }
  if (!id) {
    return fail({ ...base, canonicalUrl: canonical }, 'no_video_id',
      'No TikTok video id in that link. A deleted or private video redirects to the app store.')
  }

  // THREE PAGES, CHEAPEST FIRST (24 Sep 2026). The embed is small and usually
  // enough - but it carries NOTHING for a PHOTO post (a slideshow), and a short
  // vm.tiktok.com link followed from a server lands on an app shell with no
  // count either. `/@_/video/<id>` serves the full item for both kinds: a
  // measured 2,367 on the photo post that was reporting "Platform refused".
  const targets = [...new Set([
    `https://www.tiktok.com/embed/v2/${id}`,
    `https://www.tiktok.com/@_/video/${id}`,
    canonical ?? `https://www.tiktok.com/@_/video/${id}`,
  ])]
  let lastErr = ''
  for (const target of targets) {
    try {
      const html = await getText(target)
      // DELETED OR PRIVATE IS AN ANSWER, NOT A BLOCK. TikTok says so in the
      // page's own state (statusCode / errorCode 10204,
      // "item_privacy_authorization&status_deleted"). This used to fall through
      // to the captcha test below, which matched the word "captcha" in the
      // page's SCRIPT URLS - so a removed video read "Platform refused, it
      // usually clears by itself" for ever, however many times sync was pressed.
      if (/"(?:statusCode|errorCode)":\s*10204\b|status_deleted|item_privacy_authorization/.test(html)) {
        return fail({ ...base, videoId: id, canonicalUrl: canonical }, 'removed',
          'TikTok says this video was deleted or made private.')
      }
      const views = playCountFrom(html, id)
      if (views != null) {
        // GATED, EVEN THOUGH IT IS FREE. There is no second request here - the
        // HTML is in hand - but this is four regexes over ~100kB and the sweep
        // runs it hundreds of times an hour for a result nothing reads. The
        // rule is the same one the other two platforms follow: the sweep does
        // exactly the work a view count needs and not one pass more.
        return { ...base, videoId: id, canonicalUrl: canonical, views, error: null, screenText: tiktokScreenText(html), ...(meta ? tiktokMeta(html) : {}) }
      }
      // A REAL CHECK PAGE IS SMALL. Every full TikTok page mentions
      // "captcha" in its script bundle names, so the word alone proves nothing.
      lastErr = (html.length < 60000 && /captcha|verify_bar|verify-bar/i.test(html)) || /Access Denied/i.test(html.slice(0, 3000))
        ? 'blocked'
        : (lastErr === 'blocked' ? 'blocked' : 'no_count_in_page')
    } catch (e) {
      lastErr = e instanceof HttpError ? 'fetch_failed' : 'fetch_failed'
    }
  }
  return fail({ ...base, videoId: id, canonicalUrl: canonical }, lastErr || 'no_count_in_page',
    'TikTok served the page but no view count. Usually a removed or private video.')
}


// TIKTOK FROM ANOTHER REGION WHEN THIS ONE COMES BACK EMPTY (12 Oct 2026). Noemi's photo post read 866 from a Mac and
// from every page variant, yet the sweep stamped it "no view count on the post": TikTok now and then serves one server a
// page with the item stripped out. The same hop Instagram and Facebook use, capped low because a real removal answers
// the same everywhere and TikTok rarely walls a region for long.
export const TT_RETRY = new Set(['no_count_in_page', 'blocked', 'fetch_failed'])
export const ttGoodRegions: string[] = ['eu-central-1', 'eu-west-2', 'us-east-1']
export const TT_MAX_HOPS = 4

export async function tiktokViewsAnywhere(url: string, knownId: string | null, meta = false): Promise<Resolved> {
  const here = await tiktokViews(url, knownId, meta)
  if (here.views != null || !TT_RETRY.has(here.error ?? '') || !WEBHOOK_SECRET) return here
  for (const region of regionOrder(ttGoodRegions).slice(0, TT_MAX_HOPS)) {
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 30_000)
      const res = await fetch(`${SUPABASE_URL}/functions/v1/view-sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-webhook-secret': WEBHOOK_SECRET, 'x-region': region },
        body: JSON.stringify({ tiktok_read: { url, knownId: here.videoId ?? knownId, meta } }),
        signal: ctrl.signal,
      }).finally(() => clearTimeout(timer))
      if (!res.ok) { await res.body?.cancel(); continue }
      const r = (await res.json()) as Resolved
      if (r.views != null) {
        const at = ttGoodRegions.indexOf(region)
        if (at >= 0) ttGoodRegions.splice(at, 1)
        ttGoodRegions.unshift(region)
        return r
      }
      if (r.error === 'removed') return r
    } catch { /* next region */ }
  }
  return here
}
