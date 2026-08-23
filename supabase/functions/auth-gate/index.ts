// Supabase Edge Function: auth-gate
// A thin proxy in front of GoTrue that enforces a hard rate limit on the
// authentication routes: max 5 attempts per 15 minutes, per email+IP for login
// and per IP for signup / password recovery. A successful login clears the
// counter so legitimate users are never locked out.
//
// Deploy: supabase functions deploy auth-gate --no-verify-jwt
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!

const MAX_ATTEMPTS = 5
const WINDOW_MIN = 15

// A SECOND BUCKET, ON THE IP ALONE, FOR LOGIN.
//
// The per-(email + IP) limit stops somebody guessing ONE person's password. It
// does nothing at all about the attack that actually happens to a community
// platform: take one leaked password and try it against every address you can
// think of. Every attempt is a different email, so every attempt is a fresh
// bucket with a fresh count of one, and a single machine could run tens of
// thousands of them.
//
// 30 in 15 minutes is far more than a person with a forgotten password and far
// less than a spray. It is deliberately generous because an office or a
// university shares one address, and the per-email bucket is still the tight
// one.
const MAX_PER_IP = 30

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

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
async function isLimited(identifier: string, max = MAX_ATTEMPTS) {
  const since = new Date(Date.now() - WINDOW_MIN * 60_000).toISOString()
  await admin.from('auth_attempts').delete().lt('created_at', new Date(Date.now() - 3_600_000).toISOString())
  const { count } = await admin
    .from('auth_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('identifier', identifier)
    .gte('created_at', since)
  return (count ?? 0) >= max
}
const record = (identifier: string) => admin.from('auth_attempts').insert({ identifier })
const clear = (identifier: string) => admin.from('auth_attempts').delete().eq('identifier', identifier)

// Record a password reset request in the admin email log.
//
// The account may not exist at all (we never reveal that to the caller), so the
// email string is stored as-is and recipient_id is filled in only when it maps
// to a real account. GoTrue answers 200 whether or not it sent anything, so a
// non-2xx is the only signal we have that the send itself failed.
// ONE LOOKUP, NOT A SCAN OF EVERY ACCOUNT.
//
// This used to pull the first 1000 users out of the auth API on every password
// reset request, from an endpoint that needs no authentication, and then filter
// in memory - so it did O(all users) work per request and quietly stopped
// matching anybody past the thousandth account. `profiles` is indexed and
// already has what we need.
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
  // When CAPTCHA protection is enabled in Supabase Auth, GoTrue requires the
  // Turnstile token in gotrue_meta_security. Forwarding it when disabled is a
  // harmless no-op, so it's always passed through.
  const sec = captchaToken ? { gotrue_meta_security: { captcha_token: captchaToken } } : {}

  if (action === 'login') {
    if (!email || !password) return json(req, { error: 'Email and password are required.' }, 400)
    const id = `login:${String(email).toLowerCase()}|${ip}`
    const ipId = `login-ip:${ip}`
    if (await isLimited(id)) return json(req, tooMany, 429)
    // The spray bucket. Checked second so a genuine user hitting their own
    // per-email limit still gets the per-email message.
    if (await isLimited(ipId, MAX_PER_IP)) return json(req, tooMany, 429)
    await record(id)
    await record(ipId)
    const { status, data } = await gotrue('token?grant_type=password', { email, password, ...sec })
    // A successful login clears BOTH buckets: the person at this address has
    // proved they are not the thing the limit is for.
    if (status === 200 && data.access_token) {
      await clear(id)
      await clear(ipId)
      return json(req, data, 200)
    }
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
    const { status } = await gotrue(url, { email, ...sec })
    // Log the request for the admin email log. Password reset mail is sent by
    // Supabase Auth, not by us, so this is the only point where the platform
    // ever sees one - and it records the REQUEST, not a delivery receipt.
    // Deliberately fire-and-forget: a logging failure must never break a reset.
    await logRecovery(String(email), status).catch(() => {})
    return json(req, { ok: true }, 200) // always 200 (don't reveal whether the email exists)
  }

  return json(req, { error: 'unknown action' }, 400)
})
