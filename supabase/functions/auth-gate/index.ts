// Supabase Edge Function: auth-gate
// A thin proxy in front of GoTrue that enforces a hard rate limit on the
// authentication routes: max 5 attempts per 15 minutes, per email+IP for login
// and per IP for signup / password recovery. A successful login clears the
// counter so legitimate users are never locked out.
//
// Deploy: supabase functions deploy auth-gate --no-verify-jwt
import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!

const MAX_ATTEMPTS = 5
const WINDOW_MIN = 15

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

// CORS: reflect the request Origin only when it's one of ours (the two Vercel
// production domains, any *.vercel.app preview deploy, or localhost dev). An
// unknown origin gets the primary domain, so the browser blocks it.
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
function corsHeaders(req: Request) {
  return {
    'Access-Control-Allow-Origin': allowOrigin(req.headers.get('origin')),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}
const json = (req: Request, obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } })

// The trusted proxy (Supabase's edge) appends the real client IP as the LAST
// entry of x-forwarded-for. Using the FIRST entry lets a client spoof the value
// (and dodge the rate limit) by sending its own x-forwarded-for header.
function clientIp(req: Request) {
  const parts = (req.headers.get('x-forwarded-for') || '').split(',').map((s) => s.trim()).filter(Boolean)
  return parts.length ? parts[parts.length - 1] : 'unknown'
}

// Returns true if the identifier is over the limit (and prunes old rows).
async function isLimited(identifier: string) {
  const since = new Date(Date.now() - WINDOW_MIN * 60_000).toISOString()
  await admin.from('auth_attempts').delete().lt('created_at', new Date(Date.now() - 3_600_000).toISOString())
  const { count } = await admin
    .from('auth_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('identifier', identifier)
    .gte('created_at', since)
  return (count ?? 0) >= MAX_ATTEMPTS
}
const record = (identifier: string) => admin.from('auth_attempts').insert({ identifier })
const clear = (identifier: string) => admin.from('auth_attempts').delete().eq('identifier', identifier)

async function gotrue(path: string, body: unknown) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: res.status, data: await res.json().catch(() => ({})) }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return json(req, { error: 'method not allowed' }, 405)

  const ip = clientIp(req)
  const { action, email, password, name, ref, redirectTo, captchaToken } = await req.json().catch(() => ({}))
  const tooMany = { error: `Too many attempts. Please wait ${WINDOW_MIN} minutes and try again.` }
  // When CAPTCHA protection is enabled in Supabase Auth, GoTrue requires the
  // Turnstile token in gotrue_meta_security. Forwarding it when disabled is a
  // harmless no-op, so it's always passed through.
  const sec = captchaToken ? { gotrue_meta_security: { captcha_token: captchaToken } } : {}

  if (action === 'login') {
    if (!email || !password) return json(req, { error: 'Email and password are required.' }, 400)
    const id = `login:${String(email).toLowerCase()}|${ip}`
    if (await isLimited(id)) return json(req, tooMany, 429)
    await record(id)
    const { status, data } = await gotrue('token?grant_type=password', { email, password, ...sec })
    if (status === 200 && data.access_token) { await clear(id); return json(req, data, 200) }
    return json(req, { error: data.error_description || data.msg || data.error || 'Invalid login credentials' }, 400)
  }

  if (action === 'signup') {
    if (!email || !password) return json(req, { error: 'Email and password are required.' }, 400)
    const id = `signup:${ip}`
    if (await isLimited(id)) return json(req, tooMany, 429)
    await record(id)
    const { status, data } = await gotrue('signup', { email, password, data: { name: name || null, ref: ref || null }, ...sec })
    if (status >= 400) return json(req, { error: data.error_description || data.msg || data.error || 'Could not sign up' }, 400)
    return json(req, data, 200)
  }

  if (action === 'recover') {
    if (!email) return json(req, { error: 'Email is required.' }, 400)
    const id = `recover:${ip}`
    if (await isLimited(id)) return json(req, tooMany, 429)
    await record(id)
    const url = redirectTo ? `recover?redirect_to=${encodeURIComponent(redirectTo)}` : 'recover'
    await gotrue(url, { email, ...sec }) // always 200 to the client (don't reveal whether the email exists)
    return json(req, { ok: true }, 200)
  }

  return json(req, { error: 'unknown action' }, 400)
})
