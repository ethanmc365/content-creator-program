// Supabase Edge Function: auth-gate
//
// A thin proxy in front of GoTrue that rate-limits the authentication routes.
//
// Deploy: supabase functions deploy auth-gate --no-verify-jwt
//
// ─────────────────────────────────────────────────────────────────────────────
// THE LIMITER WAS KEYED ON AN ADDRESS THAT IS NOT THE CALLER'S.
//
// Ethan, handing the platform to the Tryp.com team: "there doesn't seem to be
// any rate limiting on the login page". He is right, and it is not because the
// code below was missing - it has been here for months. It is because every
// bucket was keyed, wholly or partly, on this:
//
//     const parts = (req.headers.get('x-forwarded-for') || '').split(',')
//     return parts[parts.length - 1]          // "the trusted proxy appends last"
//
// That comment is FALSE FOR THIS DEPLOYMENT. The last entry is one of Supabase's
// own edge servers and IT ROTATES PER REQUEST. Measured during the September
// audit: nine login attempts by one person were recorded under SEVEN different
// addresses (3.2.59.180/.200/.201/.202/.203, 13.248.121.54, 13.248.121.77) while
// GoTrue wrote the real caller, 86.27.64.132, into `auth.sessions.ip` at the
// same moment.
//
// So `login:{email}|{ip}` had a fresh count of one on every attempt, and so did
// `login-ip:{ip}`. Login, signup and password reset were all completely
// unprotected while appearing to be limited, which is the worst of both.
//
// WHAT CHANGED
//
//  1. The primary login bucket is keyed on the EMAIL ALONE. It is the only
//     part of a login attempt the caller cannot vary while still attacking one
//     account, so it is the one control that cannot be evaded.
//  2. The address bucket reads `x-real-ip`, falling back to the FIRST
//     x-forwarded-for entry - the value GoTrue itself uses. It is
//     caller-supplied and therefore spoofable, so it is a secondary control and
//     is sized generously: an office or a university shares one address.
//  3. A GLOBAL backstop, because the address bucket rests on an assumption that
//     has already been wrong once in this file.
//  4. ONLY FAILURES COUNT. The previous version recorded every attempt and
//     deleted the rows again on success; now a correct password simply never
//     writes one, so nobody is ever locked out by their own successful logins.
//
// THIS FUNCTION IS NOT ALLOWED TO BE A SINGLE POINT OF FAILURE, and it no
// longer is: `signIn` in AuthContext falls back to calling GoTrue directly when
// the gate is UNREACHABLE. That is what makes it safe to change this file at
// all - the previous attempt was reverted, unproven, because it shipped minutes
// before a login outage it almost certainly did not cause and nobody could sign
// in to find out. Read that story in the security memory before touching this.
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!

const WINDOW_MIN = 15

// Ten wrong passwords for ONE account in fifteen minutes. It is the bucket that
// actually protects a person, and only FAILURES land in it - somebody who knows
// their password never touches this number at all.
//
// It was five. Ethan asked for "rate limiting still there but higher" while he
// was locked in a fight with a captcha bug, and he was right to: ten is still
// far below any real guessing attempt (a password worth having survives ten
// guesses trivially), and the cost of being too tight is locking out the person
// who owns the account on the day something else is already broken.
const MAX_PER_EMAIL = 10
// Thirty failures from one address. Generous on purpose: shared offices, phone
// networks behind CGNAT, and a household all look like one address, and this
// value rests on a header the caller can set.
const MAX_PER_IP = 30
// The backstop. If the address bucket is being evaded (again), this is what is
// left. Four hundred failed authentication attempts across the WHOLE platform
// in fifteen minutes is far beyond anything ~45 creators produce.
const MAX_GLOBAL = 400

// Every key this function writes is prefixed `auth:` so the global counter can
// count its own rows and nothing else. `auth_attempts` is shared with the
// upload, geocode and link-preview limiters, and a global bucket that swept
// those up would take the login page down whenever the map was busy.
const NS = 'auth:'

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

const json = (req: Request, obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } })

// The caller's address, as well as it can be known here. `x-real-ip` is set by
// the platform; the FIRST x-forwarded-for entry is the original client where a
// chain exists. Both are ultimately caller-supplied, which is why nothing
// important rests on this alone - see MAX_PER_EMAIL.
function clientIp(req: Request) {
  const real = (req.headers.get('x-real-ip') || '').trim()
  if (real) return real
  const parts = (req.headers.get('x-forwarded-for') || '').split(',').map((s) => s.trim()).filter(Boolean)
  return parts.length ? parts[0] : 'unknown'
}

// Is this identifier over its limit? Prunes rows older than an hour as it goes.
async function isLimited(identifier: string, max: number) {
  const since = new Date(Date.now() - WINDOW_MIN * 60_000).toISOString()
  await admin.from('auth_attempts').delete().lt('created_at', new Date(Date.now() - 3_600_000).toISOString())
  const { count } = await admin
    .from('auth_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('identifier', identifier)
    .gte('created_at', since)
  return (count ?? 0) >= max
}

// The global bucket counts every `auth:`-prefixed row in the window.
async function isGloballyLimited() {
  const since = new Date(Date.now() - WINDOW_MIN * 60_000).toISOString()
  const { count } = await admin
    .from('auth_attempts')
    .select('id', { count: 'exact', head: true })
    .like('identifier', `${NS}%`)
    .gte('created_at', since)
  return (count ?? 0) >= MAX_GLOBAL
}

// A FAILURE, recorded against every bucket it belongs to at once.
const recordFailure = (...ids: string[]) =>
  admin.from('auth_attempts').insert(ids.map((identifier) => ({ identifier })))

// Record a password reset request in the admin email log.
//
// The account may not exist at all (we never reveal that to the caller), so the
// email string is stored as-is and recipient_id is filled in only when it maps
// to a real account. GoTrue answers 200 whether or not it sent anything, so a
// non-2xx is the only signal we have that the send itself failed.
//
// ONE LOOKUP, NOT A SCAN OF EVERY ACCOUNT. This used to pull the first 1000
// users out of the auth API on every password reset request and filter in
// memory - O(all users) work per unauthenticated request, and it quietly
// stopped matching anybody past the thousandth account.
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
  const addr = `${NS}ip:${ip}`

  if (action === 'login') {
    if (!email || !password) return json(req, { error: 'Email and password are required.' }, 400)
    const who = `${NS}login:${String(email).trim().toLowerCase()}`
    // Checked in order of how well they identify the attacker, so a genuine
    // person who has forgotten their own password gets the message about their
    // own account rather than one about the whole platform.
    if (await isLimited(who, MAX_PER_EMAIL)) return json(req, tooMany, 429)
    if (await isLimited(addr, MAX_PER_IP)) return json(req, tooMany, 429)
    if (await isGloballyLimited()) return json(req, tooMany, 429)

    const { status, data } = await gotrue('token?grant_type=password', { email, password, ...sec })
    if (status === 200 && data.access_token) return json(req, data, 200)

    // A CAPTCHA REFUSAL IS NOT A PASSWORD GUESS, SO IT MUST NOT COUNT.
    //
    // A Turnstile token that is stale or already spent comes back as
    // `captcha_failed` ("request disallowed (timeout-or-duplicate)") BEFORE the
    // password is ever examined. Counting those was a trap of its own making:
    // the person retries, every retry fails the same way, and after a few of
    // them the limiter locks the account they were typing correctly all along -
    // turning a five-minute captcha annoyance into a fifteen-minute lockout.
    // Ethan hit exactly this on 3 Sep 2026. The client keeps the token fresh now
    // (see components/Turnstile), and this makes sure the failure mode cannot
    // compound even if it comes back.
    const captchaProblem = data.error_code === 'captcha_failed'
      || /captcha/i.test(String(data.error_description || data.msg || data.error || ''))
    if (!captchaProblem) await recordFailure(who, addr).catch(() => {})
    return json(req, { error: data.error_description || data.msg || data.error || 'Invalid login credentials' }, 400)
  }

  if (action === 'signup') {
    if (!email || !password) return json(req, { error: 'Email and password are required.' }, 400)
    if (await isLimited(addr, MAX_PER_IP)) return json(req, tooMany, 429)
    if (await isGloballyLimited()) return json(req, tooMany, 429)
    const { status, data } = await gotrue('signup', { email, password, data: { name: name || null, ref: ref || null }, ...sec })
    if (status >= 400) {
      await recordFailure(addr).catch(() => {})
      return json(req, { error: data.error_description || data.msg || data.error || 'Could not sign up' }, 400)
    }
    return json(req, data, 200)
  }

  if (action === 'recover') {
    if (!email) return json(req, { error: 'Email is required.' }, 400)
    // KEYED PER EMAIL AS WELL AS PER ADDRESS. Without the email bucket, one
    // caller can make the platform send a hundred password-reset mails to
    // somebody else's inbox - the rate limit is protecting the RECIPIENT here,
    // not the sender, so it has to be keyed on the recipient.
    const who = `${NS}recover:${String(email).trim().toLowerCase()}`
    if (await isLimited(who, MAX_PER_EMAIL)) return json(req, { ok: true }, 200)
    if (await isLimited(addr, MAX_PER_IP)) return json(req, { ok: true }, 200)
    if (await isGloballyLimited()) return json(req, { ok: true }, 200)
    // A reset request always counts, success or not: unlike a login there is no
    // "correct" version of it to tell apart, and the cost being limited is the
    // mail itself.
    await recordFailure(who, addr).catch(() => {})

    const url = redirectTo ? `recover?redirect_to=${encodeURIComponent(redirectTo)}` : 'recover'
    const { status } = await gotrue(url, { email, ...sec })
    // Log the request for the admin email log. Password reset mail is sent by
    // Supabase Auth, not by us, so this is the only point where the platform
    // ever sees one - and it records the REQUEST, not a delivery receipt.
    // Deliberately fire-and-forget: a logging failure must never break a reset.
    await logRecovery(String(email), status).catch(() => {})
    // Always 200, and always the same 200 - including when rate-limited above.
    // A different answer for a limited address would reveal which addresses
    // have accounts, which is the thing this endpoint is careful not to say.
    return json(req, { ok: true }, 200)
  }

  return json(req, { error: 'unknown action' }, 400)
})
