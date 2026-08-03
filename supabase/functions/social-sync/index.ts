// Supabase Edge Function: social-sync
//
// Reads view counts for challenge entries straight from the platform the video
// was posted on, so leaderboards keep themselves current instead of an admin
// opening every entry and typing the number in.
//
// Today it syncs TikTok (Display API, `video.list` scope). The table and the
// submission columns are provider-agnostic so Instagram can slot in beside it
// once the Graph API app review is through - see docs/AUTOMATIC_VIEWS.md.
//
// Callers:
//   pg_cron (hourly)      x-webhook-secret header, no body  -> sync everyone
//   tiktok-oauth callback x-webhook-secret, { creator_id }   -> sync one creator
//   the app "Sync now"    creator JWT                        -> sync themselves
//
// Deploy: verify_jwt=false (it authenticates callers itself, three ways).
import { createClient } from 'npm:@supabase/supabase-js@2'
import { createRemoteJWKSet, jwtVerify } from 'npm:jose@5'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SECRET') ?? ''
const CLIENT_KEY = Deno.env.get('TIKTOK_CLIENT_KEY') ?? ''
const CLIENT_SECRET = Deno.env.get('TIKTOK_CLIENT_SECRET') ?? ''

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)

const JWKS = createRemoteJWKSet(new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`))
async function verifyUser(jwt: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(jwt, JWKS, {
      issuer: `${SUPABASE_URL}/auth/v1`, audience: 'authenticated',
    })
    return payload.sub ? String(payload.sub) : null
  } catch {
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { apikey: ANON, Authorization: `Bearer ${jwt}` },
      })
      if (!res.ok) return null
      return (await res.json())?.id ?? null
    } catch { return null }
  }
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

// ------------------------------------------------------------------ tiktok ids
//
// A TikTok URL only carries the numeric video id in its canonical form
// (tiktok.com/@handle/video/7412...). Most creators paste the share-sheet short
// link (vm.tiktok.com/ZGd9TP95c), which carries nothing, so we follow the
// redirect once and cache what it resolves to on the submission row.
function idFromUrl(url: string): string | null {
  const m = url.match(/\/video\/(\d+)/) || url.match(/[?&]item_id=(\d+)/)
  return m ? m[1] : null
}

async function resolveShortLink(url: string): Promise<string | null> {
  try {
    // manual redirect + Location header: cheaper and more predictable than
    // letting fetch follow a chain of them.
    let current = url
    for (let hop = 0; hop < 5; hop++) {
      const res = await fetch(current, {
        method: 'GET',
        redirect: 'manual',
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TrypCreators/1.0)' },
      })
      const direct = idFromUrl(res.url || current)
      if (direct) return direct
      const loc = res.headers.get('location')
      if (!loc) {
        // Last resort: the canonical id shows up in the HTML of the final page.
        if (res.ok) {
          const html = await res.text()
          const m = html.match(/"video\/(\d{10,})"/) || html.match(/\/video\/(\d{10,})/)
          if (m) return m[1]
        }
        return null
      }
      const next = new URL(loc, current).toString()
      const fromLoc = idFromUrl(next)
      if (fromLoc) return fromLoc
      current = next
    }
  } catch { /* fall through */ }
  return null
}

// ------------------------------------------------------------------- tiktok api
async function freshAccessToken(connectionId: string): Promise<string | null> {
  const { data: tok } = await supabase.schema('private').from('social_tokens')
    .select('*').eq('connection_id', connectionId).maybeSingle()
  if (!tok) return null

  // TikTok access tokens last 24h; refresh a little early so a sync that starts
  // just before expiry can't fail halfway through.
  const expiresSoon = !tok.access_expires_at ||
    new Date(tok.access_expires_at).getTime() - Date.now() < 10 * 60_000
  if (!expiresSoon) return tok.access_token
  if (!tok.refresh_token) return tok.access_token

  const res = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: CLIENT_KEY,
      client_secret: CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: tok.refresh_token,
    }),
  })
  const next = await res.json().catch(() => ({}))
  if (!res.ok || !next?.access_token) {
    console.error('tiktok refresh failed', res.status, next)
    return null
  }
  await supabase.schema('private').from('social_tokens').update({
    access_token: next.access_token,
    // TikTok may hand back a NEW refresh token; keep the old one if it doesn't.
    refresh_token: next.refresh_token ?? tok.refresh_token,
    access_expires_at: new Date(Date.now() + Number(next.expires_in ?? 86400) * 1000).toISOString(),
    refresh_expires_at: new Date(Date.now() + Number(next.refresh_expires_in ?? 31536000) * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('connection_id', connectionId)
  return next.access_token
}

const VIDEO_FIELDS = 'id,title,view_count,like_count,comment_count,share_count,create_time,share_url'

// Every video on the account, newest first, as {id -> view_count}.
// Capped at 10 pages (200 videos): enough for any challenge entry, and a hard
// stop so one account can never spin the function until it times out.
async function fetchVideoViews(accessToken: string): Promise<Map<string, number>> {
  const views = new Map<string, number>()
  let cursor: number | undefined
  for (let page = 0; page < 10; page++) {
    const res = await fetch(
      `https://open.tiktokapis.com/v2/video/list/?fields=${encodeURIComponent(VIDEO_FIELDS)}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ max_count: 20, ...(cursor ? { cursor } : {}) }),
      },
    )
    const body = await res.json().catch(() => ({}))
    if (!res.ok || body?.error?.code && body.error.code !== 'ok') {
      throw new Error(body?.error?.message || `video.list HTTP ${res.status}`)
    }
    for (const v of body?.data?.videos ?? []) {
      if (v?.id != null && v?.view_count != null) views.set(String(v.id), Number(v.view_count))
    }
    if (!body?.data?.has_more) break
    cursor = body.data.cursor
    if (!cursor) break
  }
  return views
}

// --------------------------------------------------------------- one creator
async function syncConnection(conn: { id: string; creator_id: string }) {
  const result = { creator_id: conn.creator_id, matched: 0, updated: 0, error: null as string | null }
  try {
    const token = await freshAccessToken(conn.id)
    if (!token) throw new Error('No usable access token, reconnect needed')

    const views = await fetchVideoViews(token)

    // Only entries this creator posted to TikTok, and only ones an admin has
    // not deliberately typed over (views_source stays 'manual' after an edit).
    const { data: subs } = await supabase
      .from('submissions')
      .select('id, video_url, platform_video_id, logged_views, views_source')
      .eq('creator_id', conn.creator_id)
      .eq('platform', 'TikTok')

    for (const s of subs ?? []) {
      let vid = s.platform_video_id ?? idFromUrl(s.video_url ?? '')
      if (!vid) {
        vid = await resolveShortLink(s.video_url ?? '')
        if (vid) await supabase.from('submissions').update({ platform_video_id: vid }).eq('id', s.id)
      } else if (!s.platform_video_id) {
        await supabase.from('submissions').update({ platform_video_id: vid }).eq('id', s.id)
      }
      if (!vid) continue

      const count = views.get(vid)
      if (count == null) continue
      result.matched++
      if (s.views_source === 'manual' && s.logged_views != null) continue // admin override wins
      if (s.logged_views === count && s.views_source === 'tiktok') continue // nothing changed
      await supabase.from('submissions').update({
        logged_views: count,
        views_source: 'tiktok',
        views_synced_at: new Date().toISOString(),
      }).eq('id', s.id)
      result.updated++
    }

    await supabase.from('social_connections').update({
      last_synced_at: new Date().toISOString(),
      last_sync_error: null,
      videos_matched: result.matched,
    }).eq('id', conn.id)
  } catch (e) {
    result.error = String((e as Error)?.message ?? e)
    await supabase.from('social_connections').update({
      last_synced_at: new Date().toISOString(),
      last_sync_error: result.error.slice(0, 300),
    }).eq('id', conn.id)
  }
  return result
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const body = await req.json().catch(() => ({}))
    const secretOk = !!WEBHOOK_SECRET && req.headers.get('x-webhook-secret') === WEBHOOK_SECRET

    // Who are we allowed to sync? A trusted caller (cron / the OAuth callback)
    // may sync everyone or a named creator; anyone else may only sync themselves.
    let onlyCreator: string | null = null
    if (secretOk) {
      onlyCreator = body?.creator_id ?? null
    } else {
      const uid = await verifyUser((req.headers.get('Authorization') ?? '').replace('Bearer ', ''))
      if (!uid) return json({ error: 'unauthorized' }, 401)
      onlyCreator = uid
    }

    if (!CLIENT_KEY || !CLIENT_SECRET) return json({ error: 'not_configured', synced: 0 }, 503)

    let q = supabase.from('social_connections').select('id, creator_id').eq('provider', 'tiktok')
    if (onlyCreator) q = q.eq('creator_id', onlyCreator)
    const { data: connections } = await q
    if (!connections?.length) return json({ synced: 0, results: [] })

    // Sequential on purpose: TikTok rate-limits per app, and a scheduled job has
    // no deadline worth racing.
    const results = []
    for (const c of connections) results.push(await syncConnection(c))

    return json({ synced: results.length, results })
  } catch (e) {
    // Answer 200 for the cron caller so a bad run can't wedge the retry queue;
    // the reason is in the logs and on social_connections.last_sync_error.
    console.error('social-sync failed', e)
    return json({ error: String((e as Error)?.message ?? e) }, 200)
  }
})
