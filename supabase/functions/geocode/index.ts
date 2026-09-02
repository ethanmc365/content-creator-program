// Supabase Edge Function: geocode
// Turns a creator's free-text town ("London", "Dublin/ Sligo", "Florida") into
// coordinates for the creator map, using OpenStreetMap's Nominatim geocoder.
//
// Why server-side: the browser CSP only allows connect-src to our own hosts, and
// Nominatim's usage policy wants a descriptive User-Agent (which a browser can't
// set). Doing it here keeps the CSP unchanged and stays policy-compliant. Results
// are cached client-side and persisted on the profile, so this is called rarely
// (once per new/changed town), well within Nominatim's 1 req/sec guidance.
//
// THE CALLER IS VERIFIED HERE, NOT BY `verify_jwt` (2 Sep 2026).
//
// This file used to say "verify_jwt stays ON: only signed-in creators geocode
// their own town". That is not what verify_jwt does. The gateway accepts the
// PUBLISHABLE key as a valid credential - it has to, that is how the browser
// reaches PostgREST before anybody signs in - and that key is in the JavaScript
// bundle, so it belongs to everybody. See the block below the imports.
//
// What is at stake here is not our data, it is our STANDING WITH NOMINATIM:
// their usage policy is one request a second and they block by application, so
// an open proxy in front of them is a way for a stranger to get the creator map
// switched off for everybody. Hence a real token check and a per-creator ceiling.
//
// Deploy:  supabase functions deploy geocode

import { createRemoteJWKSet, jwtVerify } from 'https://deno.land/x/jose@v5.9.6/index.ts'

// ---------------------------------------------------------------------------
// WHO IS CALLING, AND HOW OFTEN.
//
// `verify_jwt: true` DOES NOT MEAN "SIGNED-IN CREATORS ONLY". The gateway
// accepts the PUBLISHABLE key as a perfectly good credential - it has to, that
// is how the browser talks to PostgREST before anybody logs in - and that key
// ships inside the JavaScript bundle. So in practice it means "anybody who has
// opened the site once". Proven against production on 2 Sep 2026.
//
// The token is therefore verified HERE, against the project's public JWKS
// (signature, expiry, audience), exactly as PostgREST and Storage do it. This
// is the same check `upload`, `view-sync`, `send-invoice` and `impersonate`
// already make; it is repeated in each function rather than shared because the
// edge bundler flattens a function to one directory and a `../_shared` import
// does not survive that.
//
// NOT `auth.getUser`: that also looks the session up in `auth.sessions`, and a
// global sign-out on another device deletes the session row while this device's
// token stays valid for the rest of its week. The whole app keeps working and
// getUser alone starts 401ing. That has happened here for real.
//
// The RATE LIMIT is the other half, because this function makes an OUTBOUND
// request on somebody else's behalf, and one that can be made without limit is
// a way to turn the platform's servers into a stranger's traffic.
// `auth_attempts` is the same generic (identifier, created_at) log that
// auth-gate and upload already count against.
//
// It FAILS OPEN on purpose: a lookup failing because a logging table was
// briefly unavailable is a worse outcome than a caller getting a few extra
// requests. These are abuse ceilings, not billing.
// ---------------------------------------------------------------------------
const SB_URL = Deno.env.get('SUPABASE_URL')!
const SB_ANON = Deno.env.get('SUPABASE_ANON_KEY')!
const SB_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const JWKS = createRemoteJWKSet(new URL(`${SB_URL}/auth/v1/.well-known/jwks.json`))

async function verifyUser(jwt: string): Promise<string | null> {
  if (!jwt) return null
  try {
    const { payload } = await jwtVerify(jwt, JWKS, {
      issuer: `${SB_URL}/auth/v1`,
      audience: 'authenticated',
    })
    return payload.sub ? String(payload.sub) : null
  } catch {
    try {
      const res = await fetch(`${SB_URL}/auth/v1/user`, {
        headers: { apikey: SB_ANON, Authorization: `Bearer ${jwt}` },
      })
      if (!res.ok) return null
      return (await res.json())?.id ?? null
    } catch {
      return null
    }
  }
}

function bearer(req: Request): string {
  return (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
}

async function rateLimited(key: string, max: number, windowMs: number): Promise<boolean> {
  const since = new Date(Date.now() - windowMs).toISOString()
  const headers = {
    apikey: SB_SERVICE,
    Authorization: `Bearer ${SB_SERVICE}`,
    'Content-Type': 'application/json',
  }
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/auth_attempts?identifier=eq.${encodeURIComponent(key)}&created_at=gte.${since}&select=id`,
      { headers: { ...headers, Prefer: 'count=exact', Range: '0-0' } },
    )
    // PostgREST reports the total in Content-Range as "0-0/N".
    const total = Number((res.headers.get('content-range') ?? '').split('/')[1] ?? '0')
    if (total >= max) return true
    await fetch(`${SB_URL}/rest/v1/auth_attempts`, {
      method: 'POST', headers, body: JSON.stringify({ identifier: key }),
    })
    return false
  } catch {
    return false
  }
}

// 30 lookups an hour per creator. A town is geocoded once and then stored on
// the profile, so a creator who is behaving hits this maybe twice in a year.
const MAX_PER_HOUR = 30

const PRIMARY_ORIGIN = 'https://trypcreators.vercel.app'
function allowOrigin(origin: string | null): string {
  if (!origin) return PRIMARY_ORIGIN
  try {
    const { hostname, protocol } = new URL(origin)
    const ok =
      (protocol === 'https:' && (hostname === 'trypcreators.vercel.app' || hostname === 'content-creator-program.vercel.app' || hostname.endsWith('.vercel.app'))) ||
      ((protocol === 'http:' || protocol === 'https:') && (hostname === 'localhost' || hostname === '127.0.0.1'))
    return ok ? origin : PRIMARY_ORIGIN
  } catch {
    return PRIMARY_ORIGIN
  }
}
function cors(req: Request) {
  return {
    'Access-Control-Allow-Origin': allowOrigin(req.headers.get('origin')),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}
const json = (req: Request, obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    // Cache a resolved town for a day at the edge; the same town resolves the same.
    headers: { ...cors(req), 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=86400' },
  })

// Normalise common shorthands so Nominatim resolves them reliably.
function normaliseCountry(c: string): string {
  const k = c.trim().toLowerCase().replace(/\.$/, '')
  const map: Record<string, string> = {
    uk: 'United Kingdom',
    'u.k': 'United Kingdom',
    'great britain': 'United Kingdom',
    england: 'United Kingdom',
    scotland: 'United Kingdom',
    wales: 'United Kingdom',
    'northern ireland': 'United Kingdom',
    us: 'United States',
    usa: 'United States',
    'u.s': 'United States',
    'u.s.a': 'United States',
    america: 'United States',
  }
  return map[k] || c.trim()
}

// A town field can be messy: "Dublin/ Sligo", "London (UK)". Take the first
// meaningful token so we geocode a single place.
function cleanCity(city: string): string {
  return city.split(/[/,(]/)[0].trim()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) })
  if (req.method !== 'POST') return json(req, { error: 'method not allowed' }, 405)

  const uid = await verifyUser(bearer(req))
  if (!uid) return json(req, { error: 'sign in first' }, 401)
  if (await rateLimited(`geocode:${uid}`, MAX_PER_HOUR, 3_600_000)) {
    return json(req, { error: 'Too many lookups. Try again shortly.' }, 429)
  }

  let body: { city?: string; country?: string }
  try {
    body = await req.json()
  } catch {
    return json(req, { error: 'invalid body' }, 400)
  }

  const city = cleanCity((body.city || '').toString())
  const country = normaliseCountry((body.country || '').toString())
  if (!city && !country) return json(req, { error: 'city or country required' }, 400)

  const q = [city, country].filter(Boolean).join(', ')
  const url =
    'https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=0&limit=1&q=' +
    encodeURIComponent(q)

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        // Nominatim requires an identifying UA with contact info.
        'User-Agent': 'TrypCreatorProgram/1.0 (https://trypcreators.vercel.app; info@tryp.com)',
        'Accept': 'application/json',
      },
    })
    clearTimeout(timer)
    if (!res.ok) return json(req, { error: 'geocoder unavailable', found: false }, 200)
    const arr = await res.json()
    const hit = Array.isArray(arr) && arr[0]
    if (!hit) return json(req, { found: false }, 200)
    const lat = parseFloat(hit.lat)
    const lng = parseFloat(hit.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return json(req, { found: false }, 200)
    return json(req, { found: true, lat, lng, display_name: hit.display_name || q })
  } catch {
    return json(req, { error: 'geocode failed', found: false }, 200)
  }
})
