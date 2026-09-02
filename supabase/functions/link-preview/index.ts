// Supabase Edge Function: link-preview
// Fetches a URL server-side and returns its Open Graph / meta card
// (title, description, image, site name) so the chat can render a link preview.
// Cross-origin OG scraping can't be done from the browser, hence this proxy.
//
// Safety: only public http(s) URLs, blocks localhost / private-range hosts
// (basic SSRF guard), short timeout, capped read.
//
// THE CALLER IS VERIFIED HERE, NOT BY `verify_jwt` (2 Sep 2026).
//
// This file used to say "verify_jwt stays ON so only signed-in users can call
// it", and that was simply not true. The gateway treats the PUBLISHABLE key as
// a valid credential - it must, because that is how the browser reaches
// PostgREST before anybody has signed in - and that key ships inside the
// JavaScript bundle. Proven against production: a curl carrying nothing but the
// publishable key got a full unfurl of https://example.com back.
//
// An unauthenticated URL-fetcher is a way to make the platform's servers fetch
// anything, from anyone, for free. So the token is verified properly - the same
// check upload and view-sync already made, in the block below the imports - and
// there is a rate limit per creator on top, because a signed-in creator with an
// unlimited outbound fetch is the same problem with a name attached.
//
// Deploy:  supabase functions deploy link-preview

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

// 60 unfurls an hour per creator. A busy chat pastes a handful of links a day;
// this is an abuse ceiling, not a budget.
const MAX_PER_HOUR = 60

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
    headers: { ...cors(req), 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=86400' },
  })

// Block obviously-private / loopback / link-local hosts.
function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase()
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return true
  if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h)) return true
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true
  if (h === '::1' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80')) return true
  if (h === '169.254.169.254') return true // cloud metadata
  return false
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&#x2F;/gi, '/').replace(/&nbsp;/g, ' ')
}

// Pull a meta tag's content by property/name, tolerant of attribute order.
function metaContent(html: string, keys: string[]): string | null {
  for (const key of keys) {
    const re = new RegExp(
      `<meta[^>]+(?:property|name)=["']${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*>`,
      'i',
    )
    const tag = html.match(re)?.[0]
    if (tag) {
      const c = tag.match(/content=["']([^"']*)["']/i)?.[1]
      if (c) return decodeEntities(c.trim())
    }
  }
  return null
}

// NOTE: YouTube / TikTok serve a consent/bot page (no OG tags) to non-browser
// user-agents, so scraping them here fails. Those two are unfurled CLIENT-SIDE
// via their CORS-open oEmbed endpoints (see src/lib/linkPreview.js); this
// function handles general OG scraping for every other site.

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) })
  if (req.method !== 'POST') return json(req, { error: 'method not allowed' }, 405)

  const uid = await verifyUser(bearer(req))
  if (!uid) return json(req, { error: 'sign in first' }, 401)
  if (await rateLimited(`link-preview:${uid}`, MAX_PER_HOUR, 3_600_000)) {
    return json(req, { error: 'Too many link previews. Try again shortly.' }, 429)
  }

  const body = await req.json().catch(() => null)
  let target: URL
  try {
    target = new URL(String(body?.url ?? ''))
  } catch {
    return json(req, { error: 'bad url' }, 400)
  }
  if (!/^https?:$/.test(target.protocol) || isBlockedHost(target.hostname)) {
    return json(req, { error: 'url not allowed' }, 400)
  }

  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), 6000)
  try {
    const res = await fetch(target.toString(), {
      signal: ac.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TrypLinkPreview/1.0)', Accept: 'text/html,*/*' },
    })
    const ctype = res.headers.get('content-type') || ''
    if (!res.ok || !ctype.includes('text/html')) {
      // Not an HTML page (image/pdf/etc.) — nothing to unfurl.
      return json(req, { url: target.toString(), title: null, description: null, image: null, siteName: target.hostname })
    }
    // Read at most ~256KB — the <head> is all we need.
    const reader = res.body?.getReader()
    let html = ''
    if (reader) {
      const dec = new TextDecoder()
      let total = 0
      while (total < 262144) {
        const { done, value } = await reader.read()
        if (done) break
        total += value.length
        html += dec.decode(value, { stream: true })
        if (/<\/head>/i.test(html)) break
      }
      reader.cancel().catch(() => {})
    }

    let image = metaContent(html, ['og:image:secure_url', 'og:image', 'twitter:image', 'twitter:image:src'])
    if (image) { try { image = new URL(image, target).toString() } catch { image = null } }
    const preview = {
      url: target.toString(),
      title: metaContent(html, ['og:title', 'twitter:title']) || html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() || null,
      description: metaContent(html, ['og:description', 'twitter:description', 'description']),
      image,
      siteName: metaContent(html, ['og:site_name']) || target.hostname.replace(/^www\./, ''),
    }
    if (preview.title) preview.title = decodeEntities(preview.title)
    return json(req, preview)
  } catch (_e) {
    return json(req, { url: target.toString(), title: null, description: null, image: null, siteName: target.hostname }, 200)
  } finally {
    clearTimeout(timer)
  }
})
