// Supabase Edge Function: view-sync
//
// Reads the view count of a challenge entry straight off the link the creator
// submitted. Four platforms.
//
//   TikTok     Exact, nothing needed.
//   YouTube    Exact, needs a free Data API v3 key: YouTube bot-blocks servers.
//   Facebook   Exact below a thousand, rounded to two figures above it. A
//              /share/ link does not redirect - it JS-bounces to itself with
//              ?hpir=1 - and Facebook randomly serves a cookie-consent page
//              instead of the video, so resolution RETRIES.
//   Instagram  Exact, NOTHING needed. Read off the creator's public reels tab,
//              which states a view count to anybody signed out. The session
//              cookie this used to carry got the Tryp.com UK account warned for
//              automated behaviour and was deleted on 25 Aug 2026.
//
// Callers, all authenticated:
//   pg_cron / run_view_sync()   x-webhook-secret, {}              -> stale sweep
//   itself                      x-webhook-secret, { continuation } -> next chunk
//   admin "Sync now"            admin JWT, { challenge_id, force } -> read now
//   Testing Centre              admin JWT, { probe: url }          -> READ ONLY
//
// SCALE. Staleness belongs to the ENTRY, not the run: each invocation takes the
// oldest-read chunk it can finish, then hands the rest to a fresh one.
//
// Deploy with verify_jwt=false: it authenticates callers itself.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { createRemoteJWKSet, jwtVerify } from 'npm:jose@5'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SECRET') ?? ''
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)

// Settings live in private.config, read through a definer RPC only service_role
// may execute, so each can be replaced from the admin panel without a redeploy.
// The env vars stay as fallbacks.
//
// There is NO Instagram credential here any more, and there must not be one
// again: a session cookie is what got the Tryp.com UK account warned for
// automated behaviour. The two doc_id fields are not secrets, they are Meta's
// persisted-query ids, kept here so a rotation is a paste rather than a deploy.
type Secrets = {
  youtube_api_key: string
  instagram_reels_doc_id: string
  instagram_post_doc_id: string
}
let secretsCache: Secrets | null = null
async function secrets(): Promise<Secrets> {
  if (secretsCache) return secretsCache
  const { data } = await supabase.rpc('get_view_sync_secrets')
  const row = (data ?? {}) as Record<string, string>
  secretsCache = {
    youtube_api_key: (row.youtube_api_key ?? Deno.env.get('YOUTUBE_API_KEY') ?? '').trim(),
    instagram_reels_doc_id: (row.instagram_reels_doc_id ?? '').trim(),
    instagram_post_doc_id: (row.instagram_post_doc_id ?? '').trim(),
  }
  return secretsCache
}

// One browser identity for every request. TikTok serves a bot shell to anything
// that looks automated, so this stays fixed and looks like a real browser.
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'

// Facebook answers a /share/ link with a 400 to the desktop agent and follows it
// properly for a phone, so link RESOLUTION is done as a phone. Reading the count
// is still done as the desktop agent, because that is the response that carries
// og:title.
const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const FETCH_TIMEOUT_MS = 10_000

// A chunk is what one invocation can finish comfortably. Bigger programmes are
// not read in one heroic run: the chain continues itself, and the hourly cron
// tops up whatever is still stale. 120 entries take roughly fifteen seconds.
const CHUNK = 120
const MAX_CHUNKS_PER_CHAIN = 40 // 4,800 entries before a chain stops itself

// Concurrency is per platform, not global. TikTok, YouTube and Facebook are
// public endpoints and take the wide lane. Instagram keeps the narrow one even
// though it is now public too: reads are batched per creator rather than per
// video, so the lane is rarely the limit, and a polite rate is what keeps a
// public route public.
const LANE_PUBLIC = 8
const LANE_INSTAGRAM = 3
const IG_GAP_MS = 120

export type Platform = 'TikTok' | 'Instagram' | 'YouTube' | 'Facebook'
const SOURCE: Record<Platform, string> = {
  TikTok: 'tiktok', Instagram: 'instagram', YouTube: 'youtube', Facebook: 'facebook',
}

// ---------------------------------------------------------------- transport
const PRIMARY_ORIGIN = 'https://trypcreators.vercel.app'
function allowOrigin(origin: string | null): string {
  if (!origin) return PRIMARY_ORIGIN
  try {
    const { hostname, protocol } = new URL(origin)
    const ok =
      (protocol === 'https:' && hostname.endsWith('.vercel.app')) ||
      ((protocol === 'http:' || protocol === 'https:') && (hostname === 'localhost' || hostname === '127.0.0.1'))
    return ok ? origin : PRIMARY_ORIGIN
  } catch {
    return PRIMARY_ORIGIN
  }
}
function cors(req: Request) {
  return {
    'Access-Control-Allow-Origin': allowOrigin(req.headers.get('origin')),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}
const json = (req: Request, obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...cors(req), 'Content-Type': 'application/json' } })

const JWKS = createRemoteJWKSet(new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`))

// Verified via JWKS, never auth.getUser: a global sign-out elsewhere deletes the
// session row while the token stays valid for its week, and getUser then 401s
// while the rest of the app carries on working.
async function callerId(req: Request): Promise<string | null> {
  const raw = req.headers.get('authorization')?.replace(/^Bearer /i, '') ?? ''
  if (!raw) return null
  try {
    const { payload } = await jwtVerify(raw, JWKS, { issuer: `${SUPABASE_URL}/auth/v1`, audience: 'authenticated' })
    return payload.sub ? String(payload.sub) : null
  } catch {
    return null
  }
}

async function isAdmin(userId: string): Promise<boolean> {
  const { data } = await supabase.from('profiles').select('is_admin').eq('id', userId).maybeSingle()
  return data?.is_admin === true
}

class HttpError extends Error {
  constructor(public status: number) { super(`http ${status}`) }
}

async function getText(url: string, headers: Record<string, string> = {}, redirect: RequestRedirect = 'follow'): Promise<string> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'en-GB,en;q=0.9', ...headers },
      redirect,
      signal: ctrl.signal,
    })
    if (!res.ok) {
      await res.body?.cancel()
      throw new HttpError(res.status)
    }
    return await res.text()
  } finally {
    clearTimeout(timer)
  }
}

type Resolved = {
  platform: Platform | null
  videoId: string | null
  canonicalUrl: string | null
  views: number | null
  approx: boolean
  error: string | null
  detail?: string
}

const fail = (base: Partial<Resolved>, error: string, detail: string): Resolved => ({
  platform: null, videoId: null, canonicalUrl: null, views: null, approx: false, ...base, error, detail,
})

async function followRedirects(url: string, ua: string = UA): Promise<string | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': ua }, signal: ctrl.signal })
    await res.body?.cancel()
    return res.url || null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

// ------------------------------------------------------------------- tiktok
export function tiktokIdFrom(url: string): string | null {
  return url.match(/\/(?:video|photo)\/(\d{6,})/)?.[1] ?? url.match(/[?&]item_id=(\d{6,})/)?.[1] ?? null
}

// An embed page carries exactly one video, but the full video page also carries
// the stats of RECOMMENDED videos, so prefer the object that names THIS id.
// Reading the wrong video's number is the one failure that would not look like a
// failure.
function playCountFrom(html: string, videoId: string): number | null {
  const idx = html.indexOf(`"id":"${videoId}"`)
  if (idx >= 0) {
    const scoped = html.slice(idx, idx + 4000).match(/"playCount":\s*(\d+)/)?.[1]
    if (scoped) return Number(scoped)
  }
  const first = html.match(/"playCount":\s*(\d+)/)?.[1]
  return first ? Number(first) : null
}

async function tiktokViews(url: string, knownId: string | null): Promise<Resolved> {
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

  const targets = [`https://www.tiktok.com/embed/v2/${id}`, canonical ?? `https://www.tiktok.com/@_/video/${id}`]
  let lastErr = ''
  for (const target of targets) {
    try {
      const html = await getText(target)
      const views = playCountFrom(html, id)
      if (views != null) return { ...base, videoId: id, canonicalUrl: canonical, views, error: null }
      lastErr = /captcha|verify_bar|Access Denied/i.test(html.slice(0, 5000)) ? 'blocked' : 'no_count_in_page'
    } catch (e) {
      lastErr = e instanceof HttpError ? 'fetch_failed' : 'fetch_failed'
    }
  }
  return fail({ ...base, videoId: id, canonicalUrl: canonical }, lastErr || 'no_count_in_page',
    'TikTok served the page but no view count. Usually a removed or private video.')
}

// ------------------------------------------------------------------ youtube
export function youtubeIdFrom(url: string): string | null {
  return (
    url.match(/[?&]v=([A-Za-z0-9_-]{11})/)?.[1] ??
    url.match(/youtu\.be\/([A-Za-z0-9_-]{11})/)?.[1] ??
    url.match(/\/(?:shorts|embed|live|v)\/([A-Za-z0-9_-]{11})/)?.[1] ??
    null
  )
}

async function youtubeViews(url: string): Promise<Resolved> {
  const base = { platform: 'YouTube' as const, approx: false }
  const id = youtubeIdFrom(url)
  if (!id) return fail(base, 'no_video_id', 'No YouTube video id in that link.')

  const canonicalUrl = `https://www.youtube.com/watch?v=${id}`
  const { youtube_api_key: key } = await secrets()
  if (!key) {
    return fail({ ...base, videoId: id, canonicalUrl }, 'needs_youtube_key',
      'YouTube blocks servers from reading its pages. Add a free YouTube Data API key.')
  }

  try {
    const body = await getText(
      `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${id}&key=${encodeURIComponent(key)}`,
    )
    const parsed = JSON.parse(body)
    const views = parsed?.items?.[0]?.statistics?.viewCount
    if (views != null) return { ...base, videoId: id, canonicalUrl, views: Number(views), error: null }
    return fail({ ...base, videoId: id, canonicalUrl }, 'no_video_id',
      'YouTube has no video with that id, or its owner has hidden its statistics.')
  } catch (e) {
    if (e instanceof HttpError && (e.status === 400 || e.status === 403)) {
      return fail({ ...base, videoId: id, canonicalUrl }, 'youtube_key_rejected',
        'YouTube rejected the API key. Check it is unrestricted, that the Data API v3 is enabled, and that the daily quota is not spent.')
    }
    return fail({ ...base, videoId: id, canonicalUrl }, 'fetch_failed', 'Could not reach the YouTube API.')
  }
}

// ----------------------------------------------------------------- facebook
export function facebookIdFrom(url: string): string | null {
  return url.match(/\/(?:videos|reel|video)\/(\d{6,})/)?.[1] ?? url.match(/[?&]v=(\d{6,})/)?.[1] ?? null
}

// "5.7K" -> 5700, "8.9M" -> 8900000, "1,234" -> 1234.
export function parseCompactCount(raw: string): number | null {
  const m = raw.replace(/,/g, '').match(/^([\d.]+)\s*([KMB]?)$/i)
  if (!m) return null
  const n = parseFloat(m[1])
  if (!isFinite(n)) return null
  return Math.round(n * { '': 1, k: 1e3, m: 1e6, b: 1e9 }[m[2].toLowerCase() as '' | 'k' | 'm' | 'b'])
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
}

// A /share/ link does not redirect. It answers a desktop agent with a 400, and a
// phone with an 836-byte shell whose only content is a JavaScript bounce back to
// ITSELF carrying `?hpir=1`. Fetching that second URL finally returns the real
// page. Nothing in the chain is an HTTP redirect, so `redirect: follow` never
// helped and the link looked like it pointed at nothing.
async function resolveFacebookShareOnce(url: string): Promise<{ html: string; url: string } | null> {
  let current = url
  for (let hop = 0; hop < 3; hop++) {
    let html: string
    try {
      html = await getText(current, { 'User-Agent': MOBILE_UA }, 'follow')
    } catch {
      return null
    }
    // A bounce page is tiny and does nothing but set location. A real page is
    // tens of kilobytes, so size is the honest way to tell them apart.
    const jump = html.match(/location\.replace\("([^"]+)"\)/)?.[1]
    if (jump && html.length < 4000) {
      current = jump.replace(/\\\//g, '/')
      continue
    }
    return { html, url: current }
  }
  return null
}

// The id is not in the URL and not in an og tag; it is in the page's own
// bootstrap JSON. `pageID` is the one that holds it for a share link. The
// seventeen-digit number that appears six times is a LOGGING id (WebLiteLid) and
// resolves to Facebook's generic video page, so candidates are TRIED rather than
// trusted.
export function facebookIdCandidates(html: string): string[] {
  const found: string[] = []
  const push = (v?: string | null) => {
    if (v && !found.includes(v)) found.push(v)
  }
  // Authoritative first: canonical and og:url describe THIS page. A bare path
  // match anywhere in 400 kB could belong to a recommended video.
  push(html.match(/rel="canonical"\s+href="[^"]*\/(?:videos|reel|video)\/(\d{6,})/)?.[1])
  push(html.match(/property="og:url"\s+content="[^"]*\/(?:videos|reel|video)\/(\d{6,})/)?.[1])
  push(html.match(/"pageID"\s*:\s*"?(\d{6,})"?/)?.[1])
  push(html.match(/"video_id"\s*:\s*"(\d{6,})"/)?.[1])
  push(html.match(/"videoID"\s*:\s*"(\d{6,})"/)?.[1])
  push(html.match(/\/(?:videos|reel)\/(\d{6,})/)?.[1])
  return found
}

// WHY THIS RETRIES, measured 24 Aug 2026.
//
// Facebook serves the same share link as one of THREE pages at random: a 65 kB
// one and a 400 kB one, both of which carry the video, and a 48 kB COOKIE
// CONSENT interstitial that carries nothing at all. Over ten attempts the
// consent page came back once or twice - which is exactly the "fails three
// times then works on the fourth" that made this look broken.
//
// It is not a rate limit and there is nothing to back off from: asking again
// simply gets a different page. Four attempts took a measured 9/10 to 15/15.
async function facebookCandidatesFor(url: string): Promise<string[]> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const page = await resolveFacebookShareOnce(url)
    if (page) {
      const found = facebookIdCandidates(page.html)
      if (found.length) return found
    }
    await sleep(250 * (attempt + 1))
  }
  return []
}

type FbRead = { views: number; approx: boolean } | { blocked: true } | null

// Reads one candidate id. `null` means "that was not the video" - the generic
// "Discover popular videos" page, which is what a wrong id lands on.
async function readFacebookCount(id: string): Promise<FbRead> {
  for (const target of [`https://www.facebook.com/watch/?v=${id}`, `https://www.facebook.com/video.php?v=${id}`]) {
    let title: string
    try {
      const html = await getText(target)
      title = decodeEntities(html.match(/property="og:title"\s+content="([^"]*)"/)?.[1] ?? '')
    } catch {
      continue
    }

    // ROUNDED FIRST, then exact: Facebook states a plain number below a thousand
    // ("847 views") and only rounds above it ("5.7K views").
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
    if (/log in/i.test(title)) return { blocked: true }
  }
  return null
}

async function facebookViews(url: string, knownId: string | null): Promise<Resolved> {
  const base = { platform: 'Facebook' as const }
  let canonical: string | null = url
  let candidates: string[] = []

  const direct = knownId ?? facebookIdFrom(url)
  if (direct) {
    candidates = [direct]
  } else {
    // fb.watch and friends DO redirect over HTTP; /share/ links do not.
    const followed = await followRedirects(url, MOBILE_UA)
    if (followed && followed !== url) {
      canonical = followed
      const fromUrl = facebookIdFrom(followed)
      if (fromUrl) candidates = [fromUrl]
    }
    if (!candidates.length) {
      candidates = await facebookCandidatesFor(canonical ?? url)
    }
  }

  if (!candidates.length) {
    return fail({ ...base, canonicalUrl: canonical }, 'no_video_id',
      'That Facebook link does not resolve to a video. A post that is not public cannot be read.')
  }

  let sawBlocked = false
  for (const id of candidates.slice(0, 4)) {
    const read = await readFacebookCount(id)
    if (read && 'views' in read) {
      return { ...base, videoId: id, canonicalUrl: canonical, views: read.views, approx: read.approx, error: null }
    }
    if (read && 'blocked' in read) sawBlocked = true
  }

  if (sawBlocked) {
    return fail({ ...base, videoId: candidates[0], canonicalUrl: canonical }, 'blocked',
      'Facebook asked for a login instead of showing the video, which it does for posts that are not public.')
  }
  return fail({ ...base, videoId: candidates[0], canonicalUrl: canonical }, 'no_count_in_page',
    'Facebook served the post but stated no view count. Photo and text posts have none.')
}

// ---------------------------------------------------------------- instagram
//
// NO CREDENTIAL. Instagram warned the Tryp.com UK account for "automated
// behaviour" and threatened to disable it, so the session cookie was removed
// on 25 Aug 2026 and nothing replaced it. What replaced the ROUTE is the same
// data a signed-out visitor sees: the public reels tab of a public profile
// states a view count under every reel, and Meta's own logged-out desktop query
// is what puts it there.
//
// Two things make this work and neither is obvious:
//
//   1. The endpoint is `/api/graphql`, NOT `/graphql/query`. The same doc_id
//      posted to `/graphql/query` answers `xig_user_by_username: null` for the
//      reels tab, and 403s the post lookup unless a csrftoken cookie is sent.
//   2. The one header that matters is `Sec-Fetch-Site: same-origin`. Without
//      it Instagram hands the POST to the page router and returns the 617 kB
//      app shell instead of JSON. No cookie, no csrftoken, no lsd, no app id is
//      required - that was bisected, not guessed. A 600 kB HTML body is the
//      signature of this header having gone missing.
//
// Cost is per CREATOR, not per video: one page carries twelve reels, so a
// creator's whole set of entries is usually one request. That keeps the
// programme's footprint on Instagram in single digits per sweep.
const IG_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

// Meta rotates persisted-query ids. Both are stored as comma-separated lists so
// a rotation is a paste into the connections panel rather than a redeploy, and
// each is tried in order until one answers.
const IG_REELS_DOC_IDS_DEFAULT = '27838951732404191'
const IG_POST_DOC_IDS_DEFAULT = '27128499623469141'

const IG_PAGE_SIZE = 12
const IG_MAX_PAGES = 8 // 96 reels back; older than that is not a live entry

export function igShortcodeFrom(url: string): string | null {
  return url.match(/instagram\.com\/(?:[^/]+\/)?(?:reels?|p|tv)\/([A-Za-z0-9_-]{5,})/)?.[1] ?? null
}

// A profile URL, or a post URL of the `/{username}/reel/{code}/` form, names its
// owner - which saves a lookup. Anything in the reserved set is a route, not a
// person, so it must not be mistaken for a handle.
const IG_RESERVED = new Set(['p', 'reel', 'reels', 'tv', 'explore', 'stories', 'accounts', 'direct', 'api', 'graphql', 's'])
export function igHandleFrom(url: string | null | undefined): string | null {
  if (!url) return null
  let path: string
  try {
    const u = new URL(url.trim())
    if (!/(^|\.)instagram\.com$/i.test(u.hostname)) return null
    path = u.pathname
  } catch {
    // A bare handle, with or without the @.
    const bare = String(url).trim().replace(/^@/, '')
    return /^[A-Za-z0-9._]{1,30}$/.test(bare) ? bare.toLowerCase() : null
  }
  const first = path.split('/').filter(Boolean)[0]
  if (!first || IG_RESERVED.has(first.toLowerCase())) return null
  return /^[A-Za-z0-9._]{1,30}$/.test(first) ? first.toLowerCase() : null
}

// The shortcode IS the media id, base64'd against Instagram's own alphabet.
// Kept because the id is what `platform_video_id` stores and what pins an entry
// to one post rather than to something near it on a page.
export function igMediaId(shortcode: string): string | null {
  let n = 0n
  for (const ch of shortcode) {
    const i = IG_ALPHABET.indexOf(ch)
    if (i < 0) return null
    n = n * 64n + BigInt(i)
  }
  return n.toString()
}

// Instagram calls the number "views" on a reel; the field behind it is the play
// count. `video_view_count` is deliberately NOT read anywhere: it is a legacy
// metric worth about a third of the displayed figure (1123 against a displayed
// 4245 on a checked reel) and would quietly wreck a leaderboard.
function igPlayCount(item: Record<string, unknown> | null | undefined): number | null {
  if (!item) return null
  for (const key of ['play_count', 'ig_play_count']) {
    const v = item[key]
    if (typeof v === 'number' && v >= 0) return v
  }
  return null
}

class IgShellError extends Error {}

// One POST, browser-shaped. Returns parsed JSON, or throws IgShellError when
// Instagram answered with the app shell (see the Sec-Fetch-Site note above).
//
// BOTH queries go to `/api/graphql`. `/graphql/query` serves the same doc_ids
// but demands a csrftoken cookie - it answered 403 to every cookieless call and
// is what made the first deploy report a carousel as a dead link.
async function igGraphql(
  docId: string,
  variables: Record<string, unknown>,
  referer: string,
): Promise<Record<string, unknown>> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch('https://www.instagram.com/api/graphql', {
      method: 'POST',
      headers: {
        'User-Agent': UA,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': '*/*',
        'Accept-Language': 'en-GB,en;q=0.9',
        // The line that makes Instagram treat this as an API call.
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Dest': 'empty',
        'Origin': 'https://www.instagram.com',
        'Referer': referer,
        'x-ig-app-id': '936619743392459',
      },
      body: new URLSearchParams({ doc_id: docId, variables: JSON.stringify(variables) }),
      signal: ctrl.signal,
    })
    if (!res.ok) {
      await res.body?.cancel()
      throw new HttpError(res.status)
    }
    const text = await res.text()
    try {
      return JSON.parse(text) as Record<string, unknown>
    } catch {
      throw new IgShellError(`instagram returned ${text.length} bytes of html`)
    }
  } finally {
    clearTimeout(timer)
  }
}

// Per-RUN state. It must not outlive the request: an isolate is reused between
// invocations and a cached page would serve yesterday's counts as today's.
export type IgCache = {
  reels: Map<string, Promise<Map<string, number>>>
  owners: Map<string, Promise<IgOwner | null>>
}
export const newIgCache = (): IgCache => ({ reels: new Map(), owners: new Map() })

type IgOwner = { username: string | null; mediaType: number | null; productType: string | null }

async function igDocIds(which: 'reels' | 'post'): Promise<string[]> {
  const s = await secrets()
  const raw = which === 'reels'
    ? (s.instagram_reels_doc_id || IG_REELS_DOC_IDS_DEFAULT)
    : (s.instagram_post_doc_id || IG_POST_DOC_IDS_DEFAULT)
  const ids = raw.split(',').map((x) => x.trim()).filter((x) => /^\d{6,}$/.test(x))
  return ids.length ? ids : [which === 'reels' ? IG_REELS_DOC_IDS_DEFAULT : IG_POST_DOC_IDS_DEFAULT]
}

// Every reel on a profile's public tab, code -> play count, paging until the
// tab runs out or IG_MAX_PAGES. Pinned reels come first, so the order is not
// chronological and there is no early exit on "we have gone far enough back".
async function igFetchReels(username: string): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  const docIds = await igDocIds('reels')
  const referer = `https://www.instagram.com/${username}/reels/`

  let after: string | null = null
  for (let page = 0; page < IG_MAX_PAGES; page++) {
    let user: Record<string, unknown> | null = null
    for (const docId of docIds) {
      const json = await igGraphql(docId, { after, first: IG_PAGE_SIZE, username }, referer)
      const data = json.data as Record<string, unknown> | undefined
      const u = (data?.xig_user_by_username ?? null) as Record<string, unknown> | null
      if (u) { user = u; break }
      // A null user on the FIRST page with a working doc_id means the profile is
      // gone or private; a null user on every doc_id means the ids have rotated.
      // Both look the same here, so try the next id before giving up.
    }
    if (!user) {
      if (page === 0) throw new IgShellError('instagram returned no profile for that handle')
      break
    }
    const conn = (user.polaris_clips_connection ?? {}) as Record<string, unknown>
    const edges = (conn.edges ?? []) as { node?: Record<string, unknown> }[]
    for (const e of edges) {
      const node = e?.node
      const code = typeof node?.code === 'string' ? node.code : null
      const views = igPlayCount(node)
      if (code && views != null) out.set(code, views)
    }
    const info = (conn.page_info ?? {}) as { end_cursor?: string; has_next_page?: boolean }
    if (!info.has_next_page || !info.end_cursor || edges.length === 0) break
    after = info.end_cursor
    await sleep(IG_GAP_MS)
  }
  return out
}

function igReels(cache: IgCache, username: string): Promise<Map<string, number>> {
  const key = username.toLowerCase()
  const hit = cache.reels.get(key)
  if (hit) return hit
  // The PROMISE is cached, not the result, so eight entries by one creator
  // arriving at once make one request rather than eight.
  const p = igFetchReels(key).catch((e) => { cache.reels.delete(key); throw e })
  cache.reels.set(key, p)
  return p
}

// Who owns this shortcode, and is it even a video. Works logged out, and is the
// authority when the creator's saved handle is wrong or they entered somebody
// else's post. It does NOT state a view count - Meta stripped counts from
// single-post lookups in 2026 - which is exactly why the reels tab is the route.
async function igFetchOwner(shortcode: string): Promise<IgOwner | null> {
  for (const docId of await igDocIds('post')) {
    const json = await igGraphql(docId, {
      shortcode,
      fetch_tagged_user_count: null,
      hoisted_comment_id: null,
      hoisted_reply_id: null,
      __relay_internal__pv__PolarisAIGMMediaWebLabelEnabledrelayprovider: false,
    }, `https://www.instagram.com/reel/${shortcode}/`)
    const data = json.data as Record<string, unknown> | undefined
    const info = data?.xdt_api__v1__media__shortcode__web_info as { items?: Record<string, unknown>[] } | undefined
    const item = info?.items?.[0]
    if (!item) continue
    const user = (item.user ?? {}) as Record<string, unknown>
    return {
      username: typeof user.username === 'string' ? user.username : null,
      mediaType: typeof item.media_type === 'number' ? item.media_type : null,
      productType: typeof item.product_type === 'string' ? item.product_type : null,
    }
  }
  return null
}

function igOwner(cache: IgCache, shortcode: string): Promise<IgOwner | null> {
  const hit = cache.owners.get(shortcode)
  if (hit) return hit
  const p = igFetchOwner(shortcode).catch(() => null)
  cache.owners.set(shortcode, p)
  return p
}

async function instagramViews(url: string, cache: IgCache, handleHint: string | null = null): Promise<Resolved> {
  const code = igShortcodeFrom(url)
  const canonicalUrl = code ? `https://www.instagram.com/reel/${code}/` : null
  const base = { platform: 'Instagram' as const, approx: false, videoId: code, canonicalUrl }
  if (!code) return fail({ platform: 'Instagram', approx: false }, 'no_video_id', 'No Instagram post code in that link.')

  // Cheapest handle first: the link itself, then the creator's saved profile.
  // Either avoids a lookup for the common case, and neither is trusted - if the
  // code is not on that profile's tab we go and ask who really owns it.
  const guess = igHandleFrom(url) ?? igHandleFrom(handleHint)

  const lookIn = async (username: string): Promise<number | null> => {
    try {
      return (await igReels(cache, username)).get(code) ?? null
    } catch {
      return null
    }
  }

  if (guess) {
    const views = await lookIn(guess)
    if (views != null) return { ...base, views, error: null }
  }

  const owner = await igOwner(cache, code)
  if (!owner) {
    return fail(base, 'no_video_id',
      'Instagram has no post with that code. Usually deleted, or the account is private.')
  }
  // A photo (1) or a carousel (8) has no plays because it is not a video, which
  // is a different thing from a video whose plays we could not read.
  if (owner.mediaType === 1 || owner.mediaType === 8) {
    return fail(base, 'not_a_video', 'That Instagram post is a photo or a carousel, so it has no view count.')
  }
  if (!owner.username) {
    return fail(base, 'no_video_id', 'Instagram would not say who posted that.')
  }
  if (!guess || owner.username.toLowerCase() !== guess) {
    const views = await lookIn(owner.username)
    if (views != null) return { ...base, views, error: null }
  }

  // We know who posted it and we read their tab. If it is not there, it is
  // either not a reel (a feed video does not appear on the reels tab) or the
  // account is private. Both need a person, and neither is a "trial reel".
  if (owner.productType && owner.productType !== 'clips') {
    return fail(base, 'not_on_reels_tab',
      'That is a feed video, not a reel, so Instagram does not show its views publicly. Enter the number by hand.')
  }
  return fail(base, 'not_on_reels_tab',
    `That reel is not on @${owner.username}'s public reels tab. A private account, or a reel too far back to reach.`)
}


// --------------------------------------------------------------- dispatcher
// Takes a HOSTNAME, anchored at both ends. A substring test would accept
// `tiktok.com.evil.test`, and the platform branches fall back to fetching the
// submitted URL itself - so a loose match is a request sent wherever an
// attacker likes.
export function platformOf(host: string): Platform | null {
  if (/(^|\.)tiktok\.com$/i.test(host)) return 'TikTok'
  if (/(^|\.)instagram\.com$/i.test(host)) return 'Instagram'
  if (/(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)$/i.test(host)) return 'YouTube'
  if (/(^|\.)(facebook\.com|fb\.com|fb\.watch|fb\.me)$/i.test(host)) return 'Facebook'
  return null
}

async function resolveOne(
  url: string,
  knownId: string | null = null,
  opts: { igCache?: IgCache; igHandle?: string | null } = {},
): Promise<Resolved> {
  let target: URL
  try {
    target = new URL(url.trim())
  } catch {
    return fail({}, 'bad_url', 'That is not a URL.')
  }
  if (target.protocol !== 'https:' && target.protocol !== 'http:') {
    return fail({}, 'bad_url', 'Only http(s) links.')
  }
  switch (platformOf(target.hostname)) {
    case 'TikTok': return tiktokViews(target.toString(), knownId)
    case 'Instagram':
      return instagramViews(target.toString(), opts.igCache ?? newIgCache(), opts.igHandle ?? null)
    case 'YouTube': return youtubeViews(target.toString())
    case 'Facebook': return facebookViews(target.toString(), knownId)
    default:
      return fail({}, 'unsupported',
        'Only TikTok, Instagram, YouTube and Facebook state a view count we can read.')
  }
}

// ------------------------------------------------------------------- syncing
type Row = {
  id: string
  video_url: string
  platform: string
  logged_views: number | null
  platform_video_id: string | null
  creator_id: string | null
}

async function publishRun(value: Record<string, unknown>) {
  await supabase.from('app_settings').upsert({
    key: 'view_sync_run', value, updated_at: new Date().toISOString(),
  })
}

// Run `items` through `worker` with at most `limit` in flight.
async function pool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  let next = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await worker(items[next++])
  })
  await Promise.all(runners)
}

type Progress = {
  started_at: string
  trigger: 'scheduled' | 'admin'
  total: number
  done: number
  updated: number
  failed: number
  chunk: number
}

// The creators behind this chunk's Instagram entries, so their saved handle can
// point straight at the right reels tab. It is a hint and not a fact: if the
// code is not on that tab the resolver goes and asks who really posted it.
async function igHandles(rows: Row[]): Promise<Map<string, string>> {
  const ids = [...new Set(rows.filter((r) => r.platform === 'Instagram' && r.creator_id).map((r) => r.creator_id!))]
  if (!ids.length) return new Map()
  const { data } = await supabase.from('profiles').select('id, instagram_url').in('id', ids)
  const out = new Map<string, string>()
  for (const row of (data ?? []) as { id: string; instagram_url: string | null }[]) {
    const handle = igHandleFrom(row.instagram_url)
    if (handle) out.set(row.id, handle)
  }
  return out
}

async function syncChunk(rows: Row[], progress: Progress): Promise<Progress> {
  const p = { ...progress }
  let sincePublish = 0

  // One cache for this chunk and no longer. An isolate is reused between
  // invocations, so a cache that outlived the run would serve yesterday's
  // counts as today's.
  const igCache = newIgCache()
  const handles = await igHandles(rows)

  const one = async (row: Row) => {
    const r = await resolveOne(row.video_url, row.platform_video_id, {
      igCache,
      igHandle: row.creator_id ? handles.get(row.creator_id) ?? null : null,
    })
    const now = new Date().toISOString()

    if (r.views == null) {
      await supabase.from('submissions').update({
        views_sync_error: r.error,
        views_synced_at: now,
        ...(r.videoId ? { platform_video_id: r.videoId } : {}),
      }).eq('id', row.id)
      p.failed += 1
    } else {
      const source = r.platform ? SOURCE[r.platform] : 'manual'
      await supabase.from('view_snapshots').insert({ submission_id: row.id, views: r.views, source })

      // The platform is the source of truth, full stop. An earlier version
      // refused to write a reading that was LOWER than the saved number, on the
      // theory that views only rise. They do - but the saved number was
      // sometimes simply wrong, typed from the wrong video, and the guard then
      // preserved that error forever while flagging the truth as the problem.
      // A number typed by hand is for what the platform cannot answer, not for
      // outranking what it can.
      const { error } = await supabase.from('submissions').update({
        logged_views: r.views,
        views_approx: r.approx,
        views_source: source,
        views_synced_at: now,
        views_sync_error: null,
        ...(r.videoId ? { platform_video_id: r.videoId } : {}),
      }).eq('id', row.id)

      if (error) p.failed += 1
      else p.updated += 1
    }

    p.done += 1
    sincePublish += 1
    // Published often enough that the button counts up smoothly, rarely enough
    // that it is not one write per entry.
    if (sincePublish >= 10) {
      sincePublish = 0
      await publishRun({ running: true, ...p })
    }
  }

  const instagram = rows.filter((r) => r.platform === 'Instagram')
  const publicRows = rows.filter((r) => r.platform !== 'Instagram')

  await Promise.all([
    pool(publicRows, LANE_PUBLIC, one),
    pool(instagram, LANE_INSTAGRAM, async (row) => { await one(row); await sleep(IG_GAP_MS) }),
  ])

  await publishRun({ running: true, ...p })
  return p
}

// Which entries are worth reading: every challenge whose winners have not been
// published and which has not been finished for a month. That is every live one,
// every future one, and everything still being judged - no per-challenge opt in,
// now or ever. A challenge whose winners ARE published is done, and its numbers
// are the ones it was judged on, so re-reading them would rewrite history.
async function eligibleChallengeIds(): Promise<string[]> {
  const cutoff = new Date(Date.now() - 30 * 864e5).toISOString()
  const { data } = await supabase
    .from('challenges').select('id').is('winners_published_at', null).gte('end_date', cutoff)
  return (data ?? []).map((c: { id: string }) => c.id)
}

const ROW_COLS = 'id, video_url, platform, logged_views, platform_video_id, creator_id'

// STALENESS BELONGS TO THE ENTRY, not to the run. Oldest reading first, so a
// programme too big to read in one go drains evenly instead of the same first
// hundred being refreshed over and over.
async function staleRows(challengeId: string | undefined, intervalHours: number, force = false): Promise<Row[]> {
  let q = supabase.from('submissions').select(ROW_COLS)

  if (challengeId) {
    q = q.eq('challenge_id', challengeId)
  } else {
    const ids = await eligibleChallengeIds()
    if (!ids.length) return []
    q = q.in('challenge_id', ids)
  }

  // FORCE skips the staleness rule entirely. Pressing "Sync now" has to sync:
  // the scheduled sweep reads what has gone stale, but an admin asking for it
  // means "read these now", and a button that quietly does nothing because
  // everything was read four hours ago is a button that looks broken.
  if (!force) {
    const staleBefore = new Date(Date.now() - intervalHours * 3600_000).toISOString()
    q = q.or(`views_synced_at.is.null,views_synced_at.lt.${staleBefore}`)
  }

  const { data } = await q
    .order('views_synced_at', { ascending: true, nullsFirst: true })
    .limit(CHUNK)
  return (data ?? []) as Row[]
}

async function countStale(challengeId: string | undefined, intervalHours: number, force = false): Promise<number> {
  let q = supabase.from('submissions').select('id', { count: 'exact', head: true })

  if (challengeId) {
    q = q.eq('challenge_id', challengeId)
  } else {
    const ids = await eligibleChallengeIds()
    if (!ids.length) return 0
    q = q.in('challenge_id', ids)
  }
  if (!force) {
    const staleBefore = new Date(Date.now() - intervalHours * 3600_000).toISOString()
    q = q.or(`views_synced_at.is.null,views_synced_at.lt.${staleBefore}`)
  }
  const { count } = await q
  return count ?? 0
}

async function namedRows(submissionIds: string[]): Promise<Row[]> {
  const { data } = await supabase.from('submissions').select(ROW_COLS).in('id', submissionIds).limit(CHUNK)
  return (data ?? []) as Row[]
}

async function syncInterval(): Promise<number> {
  const { data } = await supabase.from('app_settings').select('value').eq('key', 'view_sync').maybeSingle()
  const hours = Number((data?.value as { interval_hours?: number })?.interval_hours)
  return Number.isFinite(hours) && hours > 0 ? hours : 24
}

// Hand the rest of the work to a fresh invocation rather than trying to finish
// it here. Each chunk gets its own clock, so a programme of any size drains at a
// steady rate instead of one run racing a timeout.
async function continueChain(scope: { challenge_id?: string; force?: boolean }, progress: Progress) {
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/view-sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-webhook-secret': WEBHOOK_SECRET },
      body: JSON.stringify({ ...scope, continuation: progress }),
    })
  } catch {
    // If the hand-off fails the entries simply stay stale and the hourly cron
    // picks them up, which is the whole point of staleness being per entry.
  }
}

async function finishRun(p: Progress) {
  const at = new Date().toISOString()
  await supabase.from('app_settings').upsert({
    key: 'view_sync_last_run',
    value: { at, ran: p.done, updated: p.updated, failed: p.failed, trigger: p.trigger },
    updated_at: at,
  })
  await publishRun({ running: false, finished_at: at, ...p })
}

// ---------------------------------------------------------------------- http
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) })
  if (req.method !== 'POST') return json(req, { error: 'method not allowed' }, 405)

  const body = (await req.json().catch(() => ({}))) as {
    probe?: string
    challenge_id?: string
    submission_ids?: string[]
    continuation?: Progress
    force?: boolean
  }

  const secret = req.headers.get('x-webhook-secret') ?? ''
  const fromCron = WEBHOOK_SECRET !== '' && secret === WEBHOOK_SECRET

  if (!fromCron) {
    const uid = await callerId(req)
    if (!uid) return json(req, { error: 'unauthorised' }, 401)
    if (!(await isAdmin(uid))) return json(req, { error: 'forbidden' }, 403)
  }

  // Testing Centre: resolve a pasted link and return what we saw. Writes nothing
  // anywhere, which is what lets it sit in a harness whose rule is that no lab
  // may touch real data.
  if (body.probe) {
    const started = Date.now()
    const r = await resolveOne(String(body.probe))
    const have = await secrets()
    return json(req, {
      ...r,
      ms: Date.now() - started,
      // Instagram needs nothing, on purpose. It is reported so the panel can say
      // so out loud rather than leaving a blank where a credential used to be.
      instagram_auth: 'none_required',
      youtube_key: have.youtube_api_key ? 'set' : 'missing',
    })
  }

  const continuation = body.continuation

  // One chain at a time. Pressing the button twice used to start two overlapping
  // sweeps writing the same rows. A CONTINUATION is already inside a run, so it
  // must not be turned away by its own guard.
  if (!continuation) {
    const { data: busy } = await supabase.rpc('view_sync_running')
    if (busy === true) return json(req, { busy: true }, 409)
  }

  // Named entries are a one-shot: a caller asking for these exact rows wants
  // them read now, not queued behind a staleness rule.
  if (body.submission_ids?.length) {
    const rows = await namedRows(body.submission_ids)
    if (!rows.length) return json(req, { accepted: 0 })
    const progress: Progress = {
      started_at: new Date().toISOString(), trigger: fromCron ? 'scheduled' : 'admin',
      total: rows.length, done: 0, updated: 0, failed: 0, chunk: 1,
    }
    await publishRun({ running: true, ...progress })
    // deno-lint-ignore no-explicit-any
    ;(globalThis as any).EdgeRuntime?.waitUntil?.(syncChunk(rows, progress).then(finishRun))
    return json(req, { accepted: rows.length }, 202)
  }

  const interval = await syncInterval()
  const force = body.force === true
  const rows = await staleRows(body.challenge_id, interval, force)

  if (!rows.length) {
    // Nothing stale. If this is the tail of a chain, close the run properly so
    // the button stops spinning; otherwise there was simply nothing to do.
    if (continuation) {
      // deno-lint-ignore no-explicit-any
      ;(globalThis as any).EdgeRuntime?.waitUntil?.(finishRun(continuation))
    }
    return json(req, { accepted: 0 })
  }

  const progress: Progress = continuation ?? {
    started_at: new Date().toISOString(),
    trigger: fromCron ? 'scheduled' : 'admin',
    total: await countStale(body.challenge_id, interval, force),
    done: 0, updated: 0, failed: 0, chunk: 0,
  }
  progress.chunk += 1
  await publishRun({ running: true, ...progress })

  const work = (async () => {
    const after = await syncChunk(rows, progress)

    // How a chain knows it is finished depends on why it started. A SCHEDULED
    // sweep asks what is still stale, and each chunk it reads stops being
    // stale. A FORCED run has no staleness to count down - every row it reads
    // is fresh the moment it reads it - so it counts against the total it set
    // out with. Using "remaining stale" for a forced run would never reach zero
    // and would loop until the chunk cap.
    const more = force
      ? after.done < after.total
      : (await countStale(body.challenge_id, interval)) > 0

    if (more && after.chunk < MAX_CHUNKS_PER_CHAIN) {
      await continueChain({ challenge_id: body.challenge_id, force }, after)
    } else {
      await finishRun(after)
    }
  })()

  // Always background: pg_net gives up after five seconds, and a browser gives
  // up long before a big sweep finishes. Progress goes to app_settings and the
  // caller polls view_sync_status().
  // deno-lint-ignore no-explicit-any
  ;(globalThis as any).EdgeRuntime?.waitUntil?.(work)

  return json(req, { accepted: rows.length, total: progress.total }, 202)
})
