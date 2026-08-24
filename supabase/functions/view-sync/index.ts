// Supabase Edge Function: view-sync
//
// Reads the view count of a challenge entry straight off the link the creator
// submitted, so leaderboards keep themselves current instead of an admin
// opening every entry and typing the number in. Four platforms.
//
//   TikTok     Exact, nothing needed. Follow the share-sheet short link once,
//              then read "playCount" off the embed endpoint.
//   YouTube    Exact, needs a free Data API v3 key. The watch page states the
//              count but ONLY to a normal connection: YouTube bot-blocks
//              datacenter ranges, so from Deno Deploy the page comes back as a
//              1.2 MB shell with an empty <title> and every innertube client
//              answers "Sign in to confirm you're not a bot". The API costs
//              1 unit of a 10,000/day quota per lookup.
//   Facebook   Exact below a thousand, ROUNDED above it. og:title is the only
//              statement of a count logged out ("847 views", "5.7K views") and
//              nothing in the document carries an exact one; m./mbasic. are
//              login-walled.
//   Instagram  Exact, needs a session cookie AND THE COOKIES THAT GO WITH IT.
//              `sessionid` alone gets a 302 that redirects to itself forever;
//              adding ds_user_id, csrftoken, ig_did and mid returns the media.
//              ds_user_id is not a second thing to paste - it IS the first
//              segment of the sessionid ("<uid>%3A<token>%3A..."), so it is
//              derived. See igCookie().
//
// Callers, all authenticated:
//   pg_cron / run_view_sync()   x-webhook-secret, {}              -> sweep
//   itself                      x-webhook-secret, { continuation } -> next chunk
//   admin "Sync now"            admin JWT, { challenge_id }        -> one challenge
//   Testing Centre              admin JWT, { probe: url }          -> READ ONLY
//
// SCALE. A UK challenge has 39 entries; a Spanish one has 400 to 500 and a
// worldwide brief could have thousands, all wanting a daily read. So staleness
// belongs to the ENTRY, not to the run: each invocation takes the oldest-read
// chunk it can finish comfortably, then hands the rest to a fresh invocation.
// The hourly cron tops up whatever is still stale. Nothing races a timeout.
//
// Deploy with verify_jwt=false: it authenticates callers itself, and the cron
// sweep arrives with a webhook secret rather than a user token.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { createRemoteJWKSet, jwtVerify } from 'npm:jose@5'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SECRET') ?? ''
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)

// Both admin-supplied credentials live in private.config, read through a definer
// RPC only service_role may execute, so either can be replaced from the admin
// panel without a redeploy. The env vars stay as fallbacks.
type Secrets = { instagram_sessionid: string; youtube_api_key: string }
let secretsCache: Secrets | null = null
async function secrets(): Promise<Secrets> {
  if (secretsCache) return secretsCache
  const { data } = await supabase.rpc('get_view_sync_secrets')
  const row = (data ?? {}) as Record<string, string>
  secretsCache = {
    instagram_sessionid: (row.instagram_sessionid ?? Deno.env.get('INSTAGRAM_SESSIONID') ?? '').trim(),
    youtube_api_key: (row.youtube_api_key ?? Deno.env.get('YOUTUBE_API_KEY') ?? '').trim(),
  }
  return secretsCache
}

// One browser identity for every request. TikTok serves a bot shell to anything
// that looks automated, and Instagram is quicker to invalidate a session that
// keeps changing user agent, so this stays fixed.
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'

const FETCH_TIMEOUT_MS = 10_000

// A chunk is what one invocation can finish comfortably. Bigger programmes are
// not read in one heroic run: the chain continues itself, and the hourly cron
// tops up whatever is still stale. 120 entries take roughly fifteen seconds.
const CHUNK = 120
const MAX_CHUNKS_PER_CHAIN = 40 // 4,800 entries before a chain stops itself

// Concurrency is per platform, not global. TikTok, YouTube and Facebook are
// public endpoints and take the wide lane; Instagram is one signed-in session
// and gets a narrow one, because the thing that would break it is not volume
// per day, it is volume per second.
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

async function followRedirects(url: string): Promise<string | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': UA }, signal: ctrl.signal })
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

async function facebookViews(url: string, knownId: string | null): Promise<Resolved> {
  const base = { platform: 'Facebook' as const }
  let canonical: string | null = url
  let id = knownId ?? facebookIdFrom(url)

  if (!id) {
    canonical = await followRedirects(url)
    if (canonical) id = facebookIdFrom(canonical)
  }

  try {
    const html = await getText(canonical ?? url)
    const title = decodeEntities(html.match(/property="og:title"\s+content="([^"]*)"/)?.[1] ?? '')

    // ROUNDED FIRST, then exact. Facebook states a plain number below a
    // thousand ("847 views") and only rounds above it ("5.7K views"), so a
    // small video IS exact - and the old order, which demanded four or more
    // characters before it would accept an exact figure, silently failed every
    // video under 1,000 views rather than reading it.
    const rounded = title.match(/([\d.]+[KMB])\s+views?/i)?.[1]
    if (rounded) {
      const n = parseCompactCount(rounded)
      if (n != null) return { ...base, videoId: id, canonicalUrl: canonical, views: n, approx: true, error: null }
    }
    const exact = title.match(/(\d[\d,]*)\s+views?/i)?.[1]
    if (exact) {
      const n = parseCompactCount(exact)
      if (n != null) return { ...base, videoId: id, canonicalUrl: canonical, views: n, approx: false, error: null }
    }
    if (/log in/i.test(title)) {
      return fail({ ...base, videoId: id, canonicalUrl: canonical }, 'blocked',
        'Facebook asked for a login instead of showing the video. Private and restricted posts do this.')
    }
    return fail({ ...base, videoId: id, canonicalUrl: canonical }, 'no_count_in_page',
      'Facebook served the post but stated no view count. Photo and text posts have none.')
  } catch {
    return fail({ ...base, videoId: id, canonicalUrl: canonical }, 'fetch_failed', 'Could not reach that Facebook post.')
  }
}

// ---------------------------------------------------------------- instagram
const IG_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

export function igShortcodeFrom(url: string): string | null {
  return url.match(/instagram\.com\/(?:[^/]+\/)?(?:reels?|p|tv)\/([A-Za-z0-9_-]{5,})/)?.[1] ?? null
}

// The shortcode IS the media id, base64'd against Instagram's own alphabet, so
// no lookup request is needed - and asking by id is what guarantees the count
// belongs to the entry we were handed rather than to something near it on a page.
export function igMediaId(shortcode: string): string | null {
  let n = 0n
  for (const ch of shortcode) {
    const i = IG_ALPHABET.indexOf(ch)
    if (i < 0) return null
    n = n * 64n + BigInt(i)
  }
  return n.toString()
}

// THE FIX THAT MADE INSTAGRAM WORK.
//
// A request carrying only `sessionid` gets a 302 whose Location is the URL it
// just asked for, forever - which looks like a dead endpoint and, once the
// redirect chain gave up, was being reported as "trial reel" on every single
// entry. Instagram wants the cookie set a browser would have. `ds_user_id` is
// not a second thing to paste: a sessionid is "<uid>%3A<token>%3A<...>", so the
// user id is its first segment. csrftoken/ig_did/mid only have to be PRESENT.
export function igCookie(stored: string): string {
  const s = stored.trim().replace(/^Cookie:\s*/i, '')
  // A whole Cookie header pasted from dev tools already has everything.
  if (/(^|;)\s*sessionid=/.test(s) && /ds_user_id=/.test(s)) return s

  const sessionid = s.replace(/^sessionid=/, '').split(';')[0].trim()
  const dsUserId = decodeURIComponent(sessionid).split(':')[0]
  return [
    `sessionid=${sessionid}`,
    /^\d+$/.test(dsUserId) ? `ds_user_id=${dsUserId}` : '',
    'csrftoken=missing',
    'ig_did=00000000-0000-0000-0000-000000000000',
    'mid=aaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  ].filter(Boolean).join('; ')
}

// Instagram calls the number "views" on a reel; the field behind it is the play
// count. `video_view_count` is deliberately NOT read: it is a legacy metric
// worth about a third of the displayed figure (1123 against a displayed 4245 on
// a checked reel) and would quietly wreck a leaderboard.
//
// Note this reads counts the PUBLIC page hides: a creator with
// `like_and_view_counts_disabled` shows nobody their numbers, and the signed-in
// API still returns them. That is why the sync can fill in entries an admin
// looking at the post cannot read for themselves.
function igPlayCount(item: Record<string, unknown> | null | undefined): number | null {
  if (!item) return null
  for (const key of ['play_count', 'ig_play_count']) {
    const v = item[key]
    if (typeof v === 'number' && v >= 0) return v
  }
  return null
}

async function instagramViews(url: string): Promise<Resolved> {
  const base = { platform: 'Instagram' as const, approx: false }
  const code = igShortcodeFrom(url)
  const canonicalUrl = code ? `https://www.instagram.com/reel/${code}/` : null
  if (!code) return fail(base, 'no_video_id', 'No Instagram post code in that link.')

  const { instagram_sessionid: stored } = await secrets()
  if (!stored) {
    return fail({ ...base, videoId: code, canonicalUrl }, 'needs_session',
      'Instagram only shows view counts to a signed-in account.')
  }
  const mediaId = igMediaId(code)
  if (!mediaId) return fail({ ...base, videoId: code, canonicalUrl }, 'no_video_id', 'That is not a readable Instagram code.')

  const headers = {
    'x-ig-app-id': '936619743392459',
    'X-IG-WWW-Claim': '0',
    Cookie: igCookie(stored),
    Accept: '*/*',
    Referer: 'https://www.instagram.com/',
  }

  let body: string
  try {
    // `redirect: manual` on purpose: an unauthenticated request self-redirects,
    // and following that chain wastes ten seconds before failing anyway.
    body = await getText(`https://www.instagram.com/api/v1/media/${mediaId}/info/`, headers, 'manual')
  } catch (e) {
    if (e instanceof HttpError && (e.status === 302 || e.status === 401 || e.status === 403)) {
      return fail({ ...base, videoId: code, canonicalUrl }, 'session_expired',
        'Instagram would not accept the stored session. Paste a fresh one.')
    }
    return fail({ ...base, videoId: code, canonicalUrl }, 'fetch_failed', 'Could not reach Instagram.')
  }

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(body)
  } catch {
    return fail({ ...base, videoId: code, canonicalUrl }, 'session_expired',
      'Instagram answered with a page instead of data, which means the session was not accepted.')
  }

  if (parsed?.require_login || parsed?.message === 'login_required') {
    return fail({ ...base, videoId: code, canonicalUrl }, 'session_expired', 'Instagram rejected the stored session.')
  }

  const item = (parsed as { items?: Record<string, unknown>[] })?.items?.[0]
  const views = igPlayCount(item)
  if (views != null) return { ...base, videoId: code, canonicalUrl, views, error: null }

  if (item) {
    // A photo (media_type 1) or a carousel (8) has no plays because it is not a
    // video, which is a different thing from a video whose plays are hidden.
    const mediaType = item.media_type
    if (mediaType === 1 || mediaType === 8) {
      return fail({ ...base, videoId: code, canonicalUrl }, 'not_a_video',
        'That Instagram post is a photo or a carousel, so it has no view count.')
    }
    // Only NOW is "trial reel" the honest answer: we are signed in, Instagram
    // returned a VIDEO, and it states no plays. Every transport failure above
    // returns its own reason instead - reporting those as trial reels is exactly
    // the bug that made all seventeen entries claim to be one.
    return fail({ ...base, videoId: code, canonicalUrl }, 'trial_reel',
      'No view count found (likely trial reel).')
  }
  return fail({ ...base, videoId: code, canonicalUrl }, 'no_video_id',
    'Instagram has no post with that code. Usually deleted or set to private.')
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

async function resolveOne(url: string, knownId: string | null = null): Promise<Resolved> {
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
    case 'Instagram': return instagramViews(target.toString())
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

type Progress = {
  started_at: string
  trigger: 'scheduled' | 'admin'
  total: number
  done: number
  updated: number
  failed: number
  chunk: number
}

async function syncChunk(rows: Row[], progress: Progress): Promise<Progress> {
  const p = { ...progress }
  let sincePublish = 0

  const one = async (row: Row) => {
    const r = await resolveOne(row.video_url, row.platform_video_id)
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

const ROW_COLS = 'id, video_url, platform, logged_views, platform_video_id'

// STALENESS BELONGS TO THE ENTRY, not to the run. Oldest reading first, so a
// programme too big to read in one go drains evenly instead of the same first
// hundred being refreshed over and over.
async function staleRows(challengeId: string | undefined, intervalHours: number): Promise<Row[]> {
  const staleBefore = new Date(Date.now() - intervalHours * 3600_000).toISOString()
  let q = supabase.from('submissions').select(ROW_COLS)

  if (challengeId) {
    q = q.eq('challenge_id', challengeId)
  } else {
    const ids = await eligibleChallengeIds()
    if (!ids.length) return []
    q = q.in('challenge_id', ids)
  }

  const { data } = await q
    .or(`views_synced_at.is.null,views_synced_at.lt.${staleBefore}`)
    .order('views_synced_at', { ascending: true, nullsFirst: true })
    .limit(CHUNK)
  return (data ?? []) as Row[]
}

async function countStale(challengeId: string | undefined, intervalHours: number): Promise<number> {
  const staleBefore = new Date(Date.now() - intervalHours * 3600_000).toISOString()
  let q = supabase.from('submissions').select('id', { count: 'exact', head: true })

  if (challengeId) {
    q = q.eq('challenge_id', challengeId)
  } else {
    const ids = await eligibleChallengeIds()
    if (!ids.length) return 0
    q = q.in('challenge_id', ids)
  }
  const { count } = await q.or(`views_synced_at.is.null,views_synced_at.lt.${staleBefore}`)
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
async function continueChain(scope: { challenge_id?: string }, progress: Progress) {
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
      instagram_session: have.instagram_sessionid ? 'set' : 'missing',
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
  const rows = await staleRows(body.challenge_id, interval)

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
    total: await countStale(body.challenge_id, interval),
    done: 0, updated: 0, failed: 0, chunk: 0,
  }
  progress.chunk += 1
  await publishRun({ running: true, ...progress })

  const work = (async () => {
    const after = await syncChunk(rows, progress)
    const remaining = await countStale(body.challenge_id, interval)
    if (remaining > 0 && after.chunk < MAX_CHUNKS_PER_CHAIN) {
      await continueChain({ challenge_id: body.challenge_id }, after)
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
