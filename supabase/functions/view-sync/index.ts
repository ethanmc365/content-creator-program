// Supabase Edge Function: view-sync
//
// Reads the view count of a challenge entry straight off the link the creator
// submitted, so leaderboards keep themselves current instead of an admin
// opening every entry and typing the number in.
//
// This is the SECOND attempt at automatic views. The first (Aug 2026, migration
// 068) went through the TikTok Display API and needed a reviewed developer app
// plus a creator-by-creator OAuth link, which is why it was withdrawn before it
// ever went live. This one reads the PUBLIC page the link already points at, so
// there is nothing for a creator to connect and nothing to get approved.
//
//   TikTok    fully public. The share-sheet short link (vm.tiktok.com/ZN8...)
//             is followed to its canonical form, and the numeric id is read off
//             the embed endpoint, which carries the same stats as the video page
//             in a third of the bytes and is meant to be fetched by third
//             parties. Verified working from Deno Deploy's egress IPs.
//   Instagram needs a signed-in session. Every public endpoint (graphql,
//             /api/v1/media/.../info, the embed iframe) now answers
//             `require_login: true` to an anonymous caller, and a logged-out
//             reel page renders likes and comments but no play count at all.
//             So a Tryp-owned account's sessionid is kept in private.config
//             (admin-replaceable from the panel; INSTAGRAM_SESSIONID is a
//             fallback). Without one, Instagram entries report `needs_session`
//             and are left for an admin rather than failing the whole run.
//
// Callers, all authenticated, three different ways:
//   pg_cron / run_view_sync()   x-webhook-secret, {}              -> sweep
//   admin "Sync now"            admin JWT, { challenge_id }        -> one challenge
//   admin "Sync now"            admin JWT, { submission_ids: [] }  -> named rows
//   Testing Centre              admin JWT, { probe: url }          -> READ ONLY
//
// Deploy with verify_jwt=false: it authenticates callers itself, and the cron
// sweep arrives with a webhook secret rather than a user token.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { createRemoteJWKSet, jwtVerify } from 'npm:jose@5'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SECRET') ?? ''
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)

// The sessionid is read from private.config through a definer RPC only
// service_role may execute, so an admin can replace an expired cookie from the
// panel without a redeploy. INSTAGRAM_SESSIONID stays as a fallback.
const IG_SESSION_ENV = (Deno.env.get('INSTAGRAM_SESSIONID') ?? '').trim()
let igSessionCache: string | null = null
async function igSession(): Promise<string> {
  if (igSessionCache !== null) return igSessionCache
  const { data } = await supabase.rpc('get_instagram_session')
  igSessionCache = (typeof data === 'string' ? data.trim() : '') || IG_SESSION_ENV
  return igSessionCache
}

// A real browser UA. TikTok serves a consent/bot shell to anything that looks
// automated - the same reason link-preview cannot unfurl it.
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'

const FETCH_TIMEOUT_MS = 15_000
const BATCH_SIZE = 4 // concurrent fetches
const MAX_PER_RUN = 200

// ---------------------------------------------------------------- transport
const PRIMARY_ORIGIN = 'https://trypcreators.vercel.app'
function allowOrigin(origin: string | null): string {
  if (!origin) return PRIMARY_ORIGIN
  try {
    const { hostname, protocol } = new URL(origin)
    const ok =
      (protocol === 'https:' && hostname.endsWith('.vercel.app')) ||
      ((protocol === 'http:' || protocol === 'https:') &&
        (hostname === 'localhost' || hostname === '127.0.0.1'))
    return ok ? origin : PRIMARY_ORIGIN
  } catch {
    return PRIMARY_ORIGIN
  }
}
function cors(req: Request) {
  return {
    'Access-Control-Allow-Origin': allowOrigin(req.headers.get('origin')),
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, x-webhook-secret',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}
const json = (req: Request, obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors(req), 'Content-Type': 'application/json' },
  })

const JWKS = createRemoteJWKSet(new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`))

// Verified via JWKS, never auth.getUser: a global sign-out elsewhere deletes the
// session row while the token stays valid for its a week, and getUser then 401s
// (`session_not_found`) while the rest of the app carries on working.
async function callerId(req: Request): Promise<string | null> {
  const raw = req.headers.get('authorization')?.replace(/^Bearer /i, '') ?? ''
  if (!raw) return null
  try {
    const { payload } = await jwtVerify(raw, JWKS, {
      issuer: `${SUPABASE_URL}/auth/v1`,
      audience: 'authenticated',
    })
    return payload.sub ? String(payload.sub) : null
  } catch {
    return null
  }
}

async function isAdmin(userId: string): Promise<boolean> {
  const { data } = await supabase.from('profiles').select('is_admin').eq('id', userId).maybeSingle()
  return data?.is_admin === true
}

async function getText(url: string, headers: Record<string, string> = {}): Promise<string> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'en-GB,en;q=0.9', ...headers },
      signal: ctrl.signal,
    })
    if (!res.ok) {
      await res.body?.cancel()
      throw new Error(`http ${res.status}`)
    }
    return await res.text()
  } finally {
    clearTimeout(timer)
  }
}

// ------------------------------------------------------------------- tiktok
//
// A TikTok URL only carries the numeric video id in its canonical form
// (tiktok.com/@handle/video/7412...). Most creators paste the share-sheet short
// link (vm.tiktok.com/ZN8LAJggS), which carries nothing, so it is followed once
// and the id cached on the submission row - after which a sync is one request.
export function tiktokIdFrom(url: string): string | null {
  return url.match(/\/(?:video|photo)\/(\d{6,})/)?.[1] ?? url.match(/[?&]item_id=(\d{6,})/)?.[1] ?? null
}

async function resolveTiktokShortLink(url: string): Promise<string | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': UA },
      signal: ctrl.signal,
    })
    await res.body?.cancel()
    return res.url || null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

// The stats blob appears as "playCount":1951 in the rehydration JSON and again
// as a formatted string; take the numeric one and prefer the one scoped to this
// video, because a page carries the stats of RECOMMENDED videos too and the
// subject's own entry is not reliably first.
function playCountFrom(html: string, videoId: string): number | null {
  const idx = html.indexOf(`"id":"${videoId}"`)
  if (idx >= 0) {
    const near = html.slice(idx, idx + 4000)
    const scoped = near.match(/"playCount":\s*(\d+)/)?.[1]
    if (scoped) return Number(scoped)
  }
  const first = html.match(/"playCount":\s*(\d+)/)?.[1]
  return first ? Number(first) : null
}

type Resolved = {
  platform: 'TikTok' | 'Instagram' | null
  videoId: string | null
  canonicalUrl: string | null
  views: number | null
  error: string | null
  detail?: string
}

async function tiktokViews(url: string, knownId: string | null): Promise<Resolved> {
  const base: Resolved = { platform: 'TikTok', videoId: knownId, canonicalUrl: null, views: null, error: null }
  let canonical: string | null = url
  let id = knownId ?? tiktokIdFrom(url)

  if (!id) {
    canonical = await resolveTiktokShortLink(url)
    if (canonical) id = tiktokIdFrom(canonical)
  }
  if (!id) {
    return { ...base, canonicalUrl: canonical, error: 'no_video_id', detail: 'No TikTok video id in that link. A private or deleted video redirects to the app store.' }
  }

  // Embed first: same stats, a third of the bytes, and an endpoint that exists
  // to be fetched by other sites. The video page is the fallback.
  const targets = [`https://www.tiktok.com/embed/v2/${id}`, canonical ?? `https://www.tiktok.com/@_/video/${id}`]
  let lastErr = ''
  for (const target of targets) {
    try {
      const html = await getText(target)
      const views = playCountFrom(html, id)
      if (views != null) {
        return { ...base, videoId: id, canonicalUrl: canonical, views, error: null }
      }
      lastErr = /captcha|verify_bar|Access Denied/i.test(html.slice(0, 5000))
        ? 'blocked'
        : 'no_count_in_page'
    } catch (e) {
      lastErr = String((e as Error).message ?? e)
    }
  }
  return { ...base, videoId: id, canonicalUrl: canonical, error: lastErr || 'no_count', detail: 'TikTok returned the page but no view count. Usually a removed or private video.' }
}

// ---------------------------------------------------------------- instagram
//
// The shortcode in /reel/<code>/ IS the media id, base64'd against Instagram's
// own alphabet, so no lookup request is needed to turn one into the other.
const IG_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

export function igShortcodeFrom(url: string): string | null {
  return url.match(/instagram\.com\/(?:[^/]+\/)?(?:reels?|p|tv)\/([A-Za-z0-9_-]{5,})/)?.[1] ?? null
}

export function igMediaId(shortcode: string): string | null {
  let n = 0n
  for (const ch of shortcode) {
    const i = IG_ALPHABET.indexOf(ch)
    if (i < 0) return null
    n = n * 64n + BigInt(i)
  }
  return n.toString()
}

function igHeaders(session: string) {
  return {
    'x-ig-app-id': '936619743392459',
    Cookie: `sessionid=${session}`,
    Accept: '*/*',
    Referer: 'https://www.instagram.com/',
  }
}

// Instagram calls the number "views" on a reel; the field behind it is the play
// count. Which key carries it has changed more than once, so read them in order.
function igPlayCount(item: Record<string, unknown> | null | undefined): number | null {
  if (!item) return null
  for (const key of ['play_count', 'ig_play_count', 'view_count', 'video_view_count', 'video_play_count']) {
    const v = item[key]
    if (typeof v === 'number' && v >= 0) return v
  }
  return null
}

async function instagramViews(url: string): Promise<Resolved> {
  const code = igShortcodeFrom(url)
  const base: Resolved = { platform: 'Instagram', videoId: code, canonicalUrl: code ? `https://www.instagram.com/reel/${code}/` : null, views: null, error: null }
  if (!code) return { ...base, error: 'no_video_id', detail: 'No Instagram post code in that link.' }
  const session = await igSession()
  if (!session) {
    return { ...base, error: 'needs_session', detail: 'Instagram view counts need a signed-in session. Set INSTAGRAM_SESSIONID for the Tryp account.' }
  }

  const mediaId = igMediaId(code)

  // 1. the media info endpoint - one small JSON response, the cheapest answer.
  if (mediaId) {
    try {
      const body = await getText(`https://www.instagram.com/api/v1/media/${mediaId}/info/`, igHeaders(session))
      const parsed = JSON.parse(body)
      const views = igPlayCount(parsed?.items?.[0])
      if (views != null) return { ...base, views }
      if (parsed?.require_login || parsed?.message === 'login_required') {
        return { ...base, error: 'session_expired', detail: 'Instagram rejected the stored session. Paste a fresh sessionid.' }
      }
    } catch {
      // fall through to the page read
    }
  }

  // 2. the reel page itself, read with the same session.
  try {
    const html = await getText(`https://www.instagram.com/reel/${code}/`, igHeaders(session))
    if (/"require_login":\s*true/.test(html) || /accounts\/login/.test(html.slice(0, 2000))) {
      return { ...base, error: 'session_expired', detail: 'Instagram rejected the stored session. Paste a fresh sessionid.' }
    }
    for (const key of ['play_count', 'ig_play_count', 'video_view_count', 'view_count']) {
      const m = html.match(new RegExp(`"${key}":\\s*(\\d+)`))
      if (m) return { ...base, views: Number(m[1]) }
    }
    return { ...base, error: 'no_count_in_page', detail: 'Instagram served the reel but no play count. Photo posts have none.' }
  } catch (e) {
    return { ...base, error: 'fetch_failed', detail: String((e as Error).message ?? e) }
  }
}

// --------------------------------------------------------------- dispatcher
// Takes a HOSTNAME, anchored at both ends. A substring test would accept
// `tiktok.com.evil.test`, and the TikTok branch falls back to fetching the
// submitted URL itself - so a loose match here is a request sent wherever an
// attacker likes.
export function platformOf(host: string): 'TikTok' | 'Instagram' | null {
  if (/(^|\.)tiktok\.com$/i.test(host)) return 'TikTok'
  if (/(^|\.)instagram\.com$/i.test(host)) return 'Instagram'
  return null
}

async function resolveOne(url: string, knownId: string | null = null): Promise<Resolved> {
  let target: URL
  try {
    target = new URL(url.trim())
  } catch {
    return { platform: null, videoId: null, canonicalUrl: null, views: null, error: 'bad_url', detail: 'That is not a URL.' }
  }
  if (target.protocol !== 'https:' && target.protocol !== 'http:') {
    return { platform: null, videoId: null, canonicalUrl: null, views: null, error: 'bad_url', detail: 'Only http(s) links.' }
  }
  const platform = platformOf(target.hostname)
  if (platform === 'TikTok') return tiktokViews(target.toString(), knownId)
  if (platform === 'Instagram') return instagramViews(target.toString())
  return { platform: null, videoId: null, canonicalUrl: null, views: null, error: 'unsupported', detail: 'Only TikTok and Instagram links carry a view count we can read.' }
}

// ------------------------------------------------------------------- syncing
type Row = {
  id: string
  video_url: string
  platform: string
  logged_views: number | null
  platform_video_id: string | null
}

type Outcome = {
  submission_id: string
  platform: string
  views: number | null
  previous: number | null
  written: boolean
  error: string | null
}

async function syncRows(rows: Row[]): Promise<Outcome[]> {
  const out: Outcome[] = []

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const slice = rows.slice(i, i + BATCH_SIZE)
    const results = await Promise.all(
      slice.map(async (row): Promise<Outcome> => {
        const r = await resolveOne(row.video_url, row.platform_video_id)
        const previous = row.logged_views ?? null

        if (r.views == null) {
          await supabase
            .from('submissions')
            .update({
              views_sync_error: r.error,
              views_synced_at: new Date().toISOString(),
              ...(r.videoId ? { platform_video_id: r.videoId } : {}),
            })
            .eq('id', row.id)
          return { submission_id: row.id, platform: row.platform, views: null, previous, written: false, error: r.error }
        }

        // Every reading is kept, whether or not it is the one that lands on the
        // leaderboard: the history is what makes a wrong number obvious later.
        await supabase.from('view_snapshots').insert({
          submission_id: row.id,
          views: r.views,
          source: r.platform === 'TikTok' ? 'tiktok' : 'instagram',
        })

        // Views only ever go up. A reading BELOW what is already recorded means
        // either a half-read page or a number an admin typed from somewhere
        // better, so the recorded one stands and the discrepancy is flagged
        // rather than silently overwritten.
        const goesBackwards = previous != null && r.views < previous
        const patch: Record<string, unknown> = {
          views_source: r.platform === 'TikTok' ? 'tiktok' : 'instagram',
          views_synced_at: new Date().toISOString(),
          views_sync_error: goesBackwards ? 'lower_than_recorded' : null,
          ...(r.videoId ? { platform_video_id: r.videoId } : {}),
        }
        if (!goesBackwards) patch.logged_views = r.views

        const { error } = await supabase.from('submissions').update(patch).eq('id', row.id)
        return {
          submission_id: row.id,
          platform: row.platform,
          views: r.views,
          previous,
          written: !goesBackwards && !error,
          error: error ? error.message : goesBackwards ? 'lower_than_recorded' : null,
        }
      }),
    )
    out.push(...results)
    // A short breather between batches. Nothing here is hammering anyone: a
    // full sweep of the programme is a few dozen requests once a day.
    if (i + BATCH_SIZE < rows.length) await new Promise((r) => setTimeout(r, 400))
  }
  return out
}

// Which entries are worth reading. A challenge that has been decided and had its
// winners published is finished, and its numbers are the ones it was judged on -
// re-reading them months later would quietly rewrite history.
async function eligibleRows(challengeId?: string, submissionIds?: string[]): Promise<Row[]> {
  const cols = 'id, video_url, platform, logged_views, platform_video_id'

  if (submissionIds?.length) {
    const { data } = await supabase.from('submissions').select(cols).in('id', submissionIds).limit(MAX_PER_RUN)
    return (data ?? []) as Row[]
  }
  if (challengeId) {
    const { data } = await supabase.from('submissions').select(cols).eq('challenge_id', challengeId).limit(MAX_PER_RUN)
    return (data ?? []) as Row[]
  }

  const cutoff = new Date(Date.now() - 30 * 864e5).toISOString()
  const { data: challenges } = await supabase
    .from('challenges')
    .select('id, status, end_date, winners_published_at')
    .is('winners_published_at', null)
    .gte('end_date', cutoff)
  const ids = (challenges ?? []).map((c: { id: string }) => c.id)
  if (!ids.length) return []

  const { data } = await supabase.from('submissions').select(cols).in('challenge_id', ids).limit(MAX_PER_RUN)
  return (data ?? []) as Row[]
}

async function recordRun(results: Outcome[], trigger: 'scheduled' | 'admin') {
  await supabase.from('app_settings').upsert({
    key: 'view_sync_last_run',
    value: {
      at: new Date().toISOString(),
      ran: results.length,
      updated: results.filter((r) => r.written).length,
      failed: results.filter((r) => r.error).length,
      trigger,
    },
    updated_at: new Date().toISOString(),
  })
}

// ---------------------------------------------------------------------- http
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) })
  if (req.method !== 'POST') return json(req, { error: 'method not allowed' }, 405)

  const body = (await req.json().catch(() => ({}))) as {
    probe?: string
    challenge_id?: string
    submission_ids?: string[]
  }

  const secret = req.headers.get('x-webhook-secret') ?? ''
  const fromCron = WEBHOOK_SECRET !== '' && secret === WEBHOOK_SECRET

  let admin = false
  if (!fromCron) {
    const uid = await callerId(req)
    if (!uid) return json(req, { error: 'unauthorised' }, 401)
    admin = await isAdmin(uid)
    if (!admin) return json(req, { error: 'forbidden' }, 403)
  }

  // Testing Centre: resolve a pasted link and return what we saw. Writes nothing
  // anywhere, which is what lets it sit in a harness whose rule is that no lab
  // may touch real data.
  if (body.probe) {
    const started = Date.now()
    const r = await resolveOne(String(body.probe))
    return json(req, { ...r, ms: Date.now() - started, instagram_session: (await igSession()) ? 'set' : 'missing' })
  }

  const rows = await eligibleRows(body.challenge_id, body.submission_ids)
  if (!rows.length) return json(req, { ran: 0, updated: 0, failed: 0, results: [] })

  // pg_net gives up after five seconds and logs a timeout; a sweep of forty
  // videos takes minutes. So the scheduled caller is answered immediately and
  // the work continues in the background - the run is recorded in
  // app_settings.view_sync_last_run either way, which is what the panel reads.
  // An admin pressing "Sync now" is waiting for the numbers, so they get them.
  if (fromCron) {
    const work = (async () => {
      const results = await syncRows(rows)
      await recordRun(results, 'scheduled')
    })()
    // deno-lint-ignore no-explicit-any
    ;(globalThis as any).EdgeRuntime?.waitUntil?.(work)
    return json(req, { accepted: rows.length }, 202)
  }

  const results = await syncRows(rows)
  await recordRun(results, 'admin')
  return json(req, {
    ran: results.length,
    updated: results.filter((r) => r.written).length,
    failed: results.filter((r) => r.error).length,
    results,
  })
})
