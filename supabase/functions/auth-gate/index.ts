// Supabase Edge Function: auth-gate
// A thin proxy in front of GoTrue that enforces a hard rate limit on the
// authentication routes. A successful login clears the counters so legitimate
// users are never locked out.
//
// Deploy: supabase functions deploy auth-gate --no-verify-jwt
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!

const WINDOW_MIN = 15

// FIVE FAILED ATTEMPTS ON ONE ACCOUNT. This is the bucket that actually
// protects a person, and the only one an attacker cannot walk around.
const MAX_PER_EMAIL = 5
// One address trying many different accounts. Deliberately generous because an
// office, a school or a phone network shares an address.
const MAX_PER_IP = 30
// The backstop, across everybody. Nothing legitimate on a platform of ~45
// creators comes near this in a quarter of an hour; a credential-stuffing run
// passes it in seconds. It exists because the per-IP bucket depends on reading
// the client address correctly, and that is exactly what was wrong before.
const MAX_GLOBAL = 400

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

const json = (req: Request, obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } })

// THE ADDRESS THIS USED TO READ WAS NOT THE CALLER'S (fixed 2 Sep 2026).
//
// It took the LAST entry of `x-forwarded-for`, with a comment explaining that
// the trusted proxy appends the real client there and that using the first
// entry would let a caller spoof it. The reasoning is sound and the premise was
// false for this deployment: the last entry is one of Supabase's own edge
// servers, and it is a DIFFERENT ONE ALMOST EVERY REQUEST.
//
// Measured on production: nine login attempts on one account from one person
// were recorded under seven distinct addresses (3.2.59.180, 3.2.59.200,
// 3.2.59.201, 3.2.59.202, 3.2.59.203, 13.248.121.54, 13.248.121.77), while
// GoTrue recorded the real caller as 86.27.64.132 on the session row it
// created. Every bucket keyed on that address therefore had a fresh count of
// one on every attempt, and NONE OF THE AUTH RATE LIMITING WORKED AT ALL.
//
// `x-real-ip` is what the platform sets to the actual caller; the first
// `x-forwarded-for` entry is the conventional fallback. That first entry IS
// caller-supplied and so IS spoofable, which is why the per-email bucket below
// is the primary control and this one is secondary: an attacker who rotates the
// header still runs into five-per-account and into the global backstop.
function clientIp(req: Request) {
  const real = (req.headers.get('x-real-ip') || '').trim()
  if (real) return real
  const parts = (req.headers.get('x-forwarded-for') || '').split(',').map((s) => s.trim()).filter(Boolean)
  return parts.length ? parts[0] : 'unknown'
}

// Returns true if the identifier is over the limit.
async function isLimited(identifier: string, max: number) {
  const since = new Date(Date.now() - WINDOW_MIN * 60_000).toISOString()
  const { count } = await admin
    .from('auth_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('identifier', identifier)
    .gte('created_at', since)
  return (count ?? 0) >= max
}

// The global bucket counts every auth attempt in the window regardless of who
// made it, so it is a prefix match rather than an equality one.
async function globalLimited() {
  const since = new Date(Date.now() - WINDOW_MIN * 60_000).toISOString()
  const { count } = await admin
    .from('auth_attempts')
    .select('id', { count: 'exact', head: true })
    .like('identifier', 'auth:%')
    .gte('created_at', since)
  return (count ?? 0) >= MAX_GLOBAL
}

const record = (identifier: string) => admin.from('auth_attempts').insert({ identifier })
const clear = (identifier: string) => admin.from('auth_attempts').delete().eq('identifier', identifier)

// Housekeeping, kept away from the hot path. Rows older than the longest window
// any limiter uses (geocode and link-preview count over an hour) are dead.
const prune = () =>
  admin.from('auth_attempts').delete().lt('created_at', new Date(Date.now() - 3_600_000).toISOString())

// Record a password reset request in the admin email log.
//
// The account may not exist at all (we never reveal that to the caller), so the
// email string is stored as-is and recipient_id is filled in only when it maps
// to a real account. GoTrue answers 200 whether or not it sent anything, so a
// non-2xx is the only signal we have that the send itself failed.
//
// ONE LOOKUP, NOT A SCAN OF EVERY ACCOUNT.
//
// This used to pull the first 1000 users out of the auth API on every password
// reset request, from an endpoint that needs no authentication, and then filter
// in memory - so it did O(all users) work per request and quietly stopped
// matching anybody past the thousandth account.
async function logRecovery(email: string, status: number) {
  const wanted = email.trim().toLowerCase()
  const { data: match } = await admin.rpc('admin_find_user_id_by_email', { p_email: wanted })
    .then((r) => ({ data: r.data ? { id: r.data as string } : null }))
    .catch(() => ({ data: null }))
  await admin.from('email_send_log').insert({
    kind: 'password_reset',
    recipient_id: match?.id ?? null,
    recipient_email: wanted,
    subject: 'Password reset link',
    status: status < 400 ? 'sent' : 'failed',
    error: status < 400 ? null : `Auth responded ${status}`,
  })
}

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
  const busy = { error: 'Sign-in is temporarily busy. Please try again in a few minutes.' }
  // When CAPTCHA protection is enabled in Supabase Auth, GoTrue requires the
  // Turnstile token in gotrue_meta_security. Forwarding it when disabled is a
  // harmless no-op, so it's always passed through.
  const sec = captchaToken ? { gotrue_meta_security: { captcha_token: captchaToken } } : {}

  // Every key is prefixed `auth:` so the global backstop can count them without
  // sweeping up the upload, geocode and link-preview limiters that share this
  // table.
  const mail = String(email ?? '').trim().toLowerCase()

  if (action === 'login') {
    if (!email || !password) return json(req, { error: 'Email and password are required.' }, 400)
    const byEmail = `auth:login:${mail}`
    const byIp = `auth:login-ip:${ip}`
    // The per-account bucket first, so somebody with a forgotten password gets
    // the message that is actually about them.
    if (await isLimited(byEmail, MAX_PER_EMAIL)) return json(req, tooMany, 429)
    if (await isLimited(byIp, MAX_PER_IP)) return json(req, tooMany, 429)
    if (await globalLimited()) return json(req, busy, 429)
    await record(byEmail)
    await record(byIp)
    const { status, data } = await gotrue('token?grant_type=password', { email, password, ...sec })
    // A CORRECT PASSWORD CLEARS BOTH BUCKETS. Only failures accumulate, so a
    // person who types it right on the sixth go is never locked out, and a
    // shared address never locks out the people behind it.
    if (status === 200 && data.access_token) {
      await clear(byEmail)
      await clear(byIp)
      prune().catch(() => {})
      return json(req, data, 200)
    }
    return json(req, { error: data.error_description || data.msg || data.error || 'Invalid login credentials' }, 400)
  }

  if (action === 'signup') {
    if (!email || !password) return json(req, { error: 'Email and password are required.' }, 400)
    const byIp = `auth:signup-ip:${ip}`
    const byEmail = `auth:signup:${mail}`
    if (await isLimited(byIp, MAX_PER_EMAIL)) return json(req, tooMany, 429)
    if (await isLimited(byEmail, MAX_PER_EMAIL)) return json(req, tooMany, 429)
    if (await globalLimited()) return json(req, busy, 429)
    await record(byIp)
    await record(byEmail)
    const { status, data } = await gotrue('signup', { email, password, data: { name: name || null, ref: ref || null }, ...sec })
    if (status >= 400) return json(req, { error: data.error_description || data.msg || data.error || 'Could not sign up' }, 400)
    return json(req, data, 200)
  }

  if (action === 'recover') {
    if (!email) return json(req, { error: 'Email is required.' }, 400)
    // KEYED ON THE EMAIL AS WELL AS THE ADDRESS. A reset link is an email sent
    // to somebody else's inbox: without a per-account bucket, one caller can
    // have us mail the same person a hundred times, which is a way to use the
    // platform to harass a creator and a fast way to be marked as a spammer.
    const byEmail = `auth:recover:${mail}`
    const byIp = `auth:recover-ip:${ip}`
    if (await isLimited(byEmail, MAX_PER_EMAIL)) return json(req, { ok: true }, 200)
    if (await isLimited(byIp, MAX_PER_EMAIL)) return json(req, { ok: true }, 200)
    if (await globalLimited()) return json(req, busy, 429)
    await record(byEmail)
    await record(byIp)
    const url = redirectTo ? `recover?redirect_to=${encodeURIComponent(redirectTo)}` : 'recover'
    const { status } = await gotrue(url, { email, ...sec })
    // Log the request for the admin email log. Password reset mail is sent by
    // Supabase Auth, not by us, so this is the only point where the platform
    // ever sees one - and it records the REQUEST, not a delivery receipt.
    // Deliberately fire-and-forget: a logging failure must never break a reset.
    await logRecovery(String(email), status).catch(() => {})
    // Always 200, and the rate-limited path above answers 200 too: telling a
    // caller "too many attempts for that address" would confirm the address
    // exists, which is the one thing this endpoint must never do.
    return json(req, { ok: true }, 200)
  }

  return json(req, { error: 'unknown action' }, 400)
})
