// Supabase Edge Function: tiktok-oauth
//
// The connect / disconnect half of automatic view syncing. A creator links their
// TikTok account once here; `social-sync` then reads their video view counts on
// a schedule so challenge leaderboards keep themselves up to date.
//
// Three actions, all on this one function so TikTok only ever needs ONE
// registered redirect URI:
//
//   POST  ?action=start       (creator JWT)  -> { url } to send the browser to
//   GET   /callback           (TikTok)       -> 302 back to /settings
//   POST  ?action=disconnect  (creator JWT)  -> revokes the token, drops the row
//
// The redirect URI registered in the TikTok developer portal must be exactly:
//   https://<project-ref>.supabase.co/functions/v1/tiktok-oauth/callback
// TikTok requires it to be HTTPS and verified, which a *.vercel.app preview URL
// can't be, so the round trip lands here and we bounce back to the app.
//
// Secrets (supabase secrets set ...):
//   TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET   from developers.tiktok.com
//   APP_ORIGIN                                 e.g. https://trypcreators.vercel.app
//
// Deploy: verify_jwt=false. The callback is TikTok's own redirect and carries no
// Supabase JWT; start/disconnect verify the caller themselves (JWKS, below).
import { createClient } from 'npm:@supabase/supabase-js@2'
import { createRemoteJWKSet, jwtVerify } from 'npm:jose@5'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
const CLIENT_KEY = Deno.env.get('TIKTOK_CLIENT_KEY') ?? ''
const CLIENT_SECRET = Deno.env.get('TIKTOK_CLIENT_SECRET') ?? ''
const APP_ORIGIN = Deno.env.get('APP_ORIGIN') ?? 'https://trypcreators.vercel.app'

const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/tiktok-oauth/callback`

// What we ask the creator to approve. `video.list` is what actually carries the
// view counts; `user.info.basic` is what lets us show "connected as @handle".
const SCOPES = 'user.info.basic,video.list'

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)

// Signature-level JWT verification, same reasoning as the `upload` function: a
// global sign-out elsewhere deletes the session row while the token stays valid,
// so auth.getUser() 401s on a session the rest of the app still honours.
const JWKS = createRemoteJWKSet(new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`))
async function verifyUser(jwt: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(jwt, JWKS, {
      issuer: `${SUPABASE_URL}/auth/v1`,
      audience: 'authenticated',
    })
    return payload.sub ? String(payload.sub) : null
  } catch {
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { apikey: ANON, Authorization: `Bearer ${jwt}` },
      })
      if (!res.ok) return null
      return (await res.json())?.id ?? null
    } catch {
      return null
    }
  }
}

function allowOrigin(origin: string | null): string {
  if (!origin) return APP_ORIGIN
  try {
    const { hostname, protocol } = new URL(origin)
    const ok =
      (protocol === 'https:' && hostname.endsWith('.vercel.app')) ||
      ((protocol === 'http:' || protocol === 'https:') && (hostname === 'localhost' || hostname === '127.0.0.1'))
    return ok ? origin : APP_ORIGIN
  } catch {
    return APP_ORIGIN
  }
}
function corsHeaders(req: Request) {
  return {
    'Access-Control-Allow-Origin': allowOrigin(req.headers.get('origin')),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    Vary: 'Origin',
  }
}
// EVERY path returns JSON + CORS. An unhandled throw returns a bare 500 with no
// CORS headers, which the browser reports as an opaque "network error" that
// hides the real cause (learned the hard way on the email functions).
const json = (req: Request, obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } })

// Bounce back into the app with a result the Settings page can render.
function backToApp(params: Record<string, string>) {
  const url = new URL('/settings', APP_ORIGIN)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return new Response(null, { status: 302, headers: { Location: url.toString() } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })

  try {
    const url = new URL(req.url)
    const isCallback = url.pathname.endsWith('/callback')
    const action = isCallback ? 'callback' : (url.searchParams.get('action') ?? '')

    if (!CLIENT_KEY || !CLIENT_SECRET) {
      // Nothing is configured yet: say so plainly rather than bouncing the
      // creator through a broken TikTok screen.
      if (isCallback) return backToApp({ tiktok: 'error', reason: 'not_configured' })
      return json(req, { error: 'TikTok is not configured yet', code: 'not_configured' }, 503)
    }

    // ------------------------------------------------------------------ start
    if (action === 'start') {
      const uid = await verifyUser((req.headers.get('Authorization') ?? '').replace('Bearer ', ''))
      if (!uid) return json(req, { error: 'invalid token' }, 401)

      // Single-use CSRF state, so a callback can only ever be credited to the
      // creator who actually began the flow.
      const state = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')
      await supabase.schema('private').from('oauth_states').insert({
        state, creator_id: uid, provider: 'tiktok',
        redirect_to: allowOrigin(req.headers.get('origin')),
      })
      // Best effort tidy-up of anything abandoned more than an hour ago.
      await supabase.schema('private').from('oauth_states')
        .delete().lt('created_at', new Date(Date.now() - 3600_000).toISOString())

      const authUrl = new URL('https://www.tiktok.com/v2/auth/authorize/')
      authUrl.searchParams.set('client_key', CLIENT_KEY)
      authUrl.searchParams.set('scope', SCOPES)
      authUrl.searchParams.set('response_type', 'code')
      authUrl.searchParams.set('redirect_uri', REDIRECT_URI)
      authUrl.searchParams.set('state', state)
      return json(req, { url: authUrl.toString() })
    }

    // --------------------------------------------------------------- callback
    if (action === 'callback') {
      const code = url.searchParams.get('code')
      const state = url.searchParams.get('state') ?? ''
      const denied = url.searchParams.get('error')
      if (denied) return backToApp({ tiktok: 'error', reason: denied })
      if (!code || !state) return backToApp({ tiktok: 'error', reason: 'missing_code' })

      // Consume the state (single use).
      const { data: st } = await supabase.schema('private').from('oauth_states')
        .select('*').eq('state', state).maybeSingle()
      if (!st) return backToApp({ tiktok: 'error', reason: 'bad_state' })
      await supabase.schema('private').from('oauth_states').delete().eq('state', state)
      if (Date.now() - new Date(st.created_at).getTime() > 15 * 60_000) {
        return backToApp({ tiktok: 'error', reason: 'expired' })
      }

      const tokenRes = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_key: CLIENT_KEY,
          client_secret: CLIENT_SECRET,
          code: decodeURIComponent(code),
          grant_type: 'authorization_code',
          redirect_uri: REDIRECT_URI,
        }),
      })
      const tok = await tokenRes.json().catch(() => ({}))
      if (!tokenRes.ok || !tok?.access_token) {
        console.error('tiktok token exchange failed', tokenRes.status, tok)
        return backToApp({ tiktok: 'error', reason: 'token_exchange' })
      }

      // Who did we just connect? Purely so the UI can say "@handle".
      let username: string | null = null
      let displayName: string | null = null
      let avatar: string | null = null
      try {
        const infoRes = await fetch(
          'https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,username,avatar_url',
          { headers: { Authorization: `Bearer ${tok.access_token}` } },
        )
        const info = await infoRes.json()
        username = info?.data?.user?.username ?? null
        displayName = info?.data?.user?.display_name ?? null
        avatar = info?.data?.user?.avatar_url ?? null
      } catch { /* the connection still works without a pretty name */ }

      const { data: conn, error: connErr } = await supabase
        .from('social_connections')
        .upsert({
          creator_id: st.creator_id,
          provider: 'tiktok',
          provider_user_id: String(tok.open_id ?? ''),
          username, display_name: displayName, avatar_url: avatar,
          scopes: String(tok.scope ?? SCOPES).split(','),
          connected_at: new Date().toISOString(),
          last_sync_error: null,
        }, { onConflict: 'creator_id,provider' })
        .select('id')
        .single()
      if (connErr || !conn) {
        console.error('tiktok connection upsert failed', connErr)
        return backToApp({ tiktok: 'error', reason: 'save_failed' })
      }

      await supabase.schema('private').from('social_tokens').upsert({
        connection_id: conn.id,
        access_token: tok.access_token,
        refresh_token: tok.refresh_token ?? null,
        access_expires_at: new Date(Date.now() + Number(tok.expires_in ?? 86400) * 1000).toISOString(),
        refresh_expires_at: new Date(Date.now() + Number(tok.refresh_expires_in ?? 31536000) * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      })

      // Pull their numbers straight away so the connection visibly does
      // something, rather than looking inert until the next scheduled run.
      fetch(`${SUPABASE_URL}/functions/v1/social-sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SERVICE_ROLE}`,
          'x-webhook-secret': Deno.env.get('WEBHOOK_SECRET') ?? '',
        },
        body: JSON.stringify({ creator_id: st.creator_id }),
      }).catch(() => {})

      return backToApp({ tiktok: 'connected' })
    }

    // ------------------------------------------------------------- disconnect
    if (action === 'disconnect') {
      const uid = await verifyUser((req.headers.get('Authorization') ?? '').replace('Bearer ', ''))
      if (!uid) return json(req, { error: 'invalid token' }, 401)

      const { data: conn } = await supabase
        .from('social_connections')
        .select('id').eq('creator_id', uid).eq('provider', 'tiktok').maybeSingle()
      if (!conn) return json(req, { ok: true, alreadyGone: true })

      const { data: tokRow } = await supabase.schema('private').from('social_tokens')
        .select('access_token').eq('connection_id', conn.id).maybeSingle()
      if (tokRow?.access_token) {
        // Tell TikTok too, so the grant disappears from the creator's TikTok
        // settings rather than lingering after they disconnected here.
        await fetch('https://open.tiktokapis.com/v2/oauth/revoke/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_key: CLIENT_KEY, client_secret: CLIENT_SECRET, token: tokRow.access_token,
          }),
        }).catch(() => {})
      }
      // Cascades to private.social_tokens.
      await supabase.from('social_connections').delete().eq('id', conn.id)
      // Hand the affected entries back to manual entry.
      await supabase.from('submissions')
        .update({ views_source: 'manual' })
        .eq('creator_id', uid).eq('views_source', 'tiktok')
      return json(req, { ok: true })
    }

    return json(req, { error: 'unknown action' }, 400)
  } catch (e) {
    console.error('tiktok-oauth failed', e)
    return json(req, { error: 'unexpected error' }, 500)
  }
})
