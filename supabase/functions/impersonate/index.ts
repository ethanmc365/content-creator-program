// Supabase Edge Function: impersonate
// Lets a REAL ADMIN step into a hidden sandbox "preview creator" account so they
// can experience the app exactly as a normal creator does (their profile, chat
// identity with no admin badge, their DMs / notifications / access), then step
// BACK to their own admin account.
//
// Two actions:
//   • enter (default): verify the caller is an admin, mint a magic-link
//     token_hash for the fixed sandbox creator, AND return a short-lived signed
//     "exit ticket" that encodes the admin's own user id.
//   • exit: verify that signed exit ticket, re-confirm the encoded user is still
//     an admin, then mint a FRESH magic-link token_hash for THAT admin. The
//     client verifies it to swap straight back to a brand-new admin session.
//
// Why the exit ticket (this is the bug fix):
//   The old flow stashed the admin's session tokens in the browser and tried to
//   RESTORE them on exit. If the admin's server session row had been revoked in
//   the meantime (a sign-out on another device deletes the row while the token
//   still looks valid for a week), the restore failed — stranding or logging out
//   the admin. Minting a fresh session server-side ALWAYS works, regardless of
//   the state of the original session. The exit ticket is signed with the
//   service-role key (unforgeable), expires in 2h, and only ever mints a session
//   for the exact admin who entered — so it is strictly safer than persisting a
//   long-lived refresh token in localStorage, which is what it replaces.
//
// Safety:
//   - entering requires an authenticated caller who is is_admin (checked here);
//   - it will ONLY ever mint a preview session for the single designated sandbox
//     creator (is_test=true, invisible to the community, NOT an admin);
//   - exiting only ever mints a session for the admin named in a valid, unexpired
//     ticket that WE signed, and only if they are still an admin.
//
// Deploy:  supabase functions deploy impersonate
import { createClient } from 'npm:@supabase/supabase-js@2'
import { createRemoteJWKSet, jwtVerify, SignJWT } from 'npm:jose@5'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!

// Signature-level JWT verification against the project JWKS (see the upload
// function for the full rationale: auth.getUser() fails with "session not
// found" for tokens whose session was revoked on another device, even though
// the token is still valid for PostgREST/Storage).
const JWKS = createRemoteJWKSet(new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`))
type Caller = { id: string; email: string | null }
async function verifyUser(jwt: string): Promise<Caller | null> {
  try {
    const { payload } = await jwtVerify(jwt, JWKS, {
      issuer: `${SUPABASE_URL}/auth/v1`,
      audience: 'authenticated',
    })
    return payload.sub ? { id: String(payload.sub), email: payload.email ? String(payload.email) : null } : null
  } catch {
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { apikey: ANON, Authorization: `Bearer ${jwt}` },
      })
      if (!res.ok) return null
      const user = await res.json()
      return user?.id ? { id: user.id, email: user.email ?? null } : null
    } catch {
      return null
    }
  }
}

// The exit ticket is a short-lived JWT signed with the service-role key (a
// secret only this function holds). It proves "the bearer entered creator
// preview as admin <sub>" without persisting the admin's real session tokens in
// the browser. HS256 over the service-role secret is unforgeable to clients.
const TICKET_SECRET = new TextEncoder().encode(SERVICE_ROLE)
const TICKET_PURPOSE = 'impersonate-exit'
async function signExitTicket(adminId: string, adminEmail: string | null): Promise<string> {
  return await new SignJWT({ purpose: TICKET_PURPOSE, email: adminEmail ?? undefined })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(adminId)
    .setIssuedAt()
    .setExpirationTime('2h')
    .sign(TICKET_SECRET)
}
async function verifyExitTicket(ticket: string): Promise<Caller | null> {
  try {
    const { payload } = await jwtVerify(ticket, TICKET_SECRET)
    if (payload.purpose !== TICKET_PURPOSE || !payload.sub) return null
    return { id: String(payload.sub), email: payload.email ? String(payload.email) : null }
  } catch {
    return null
  }
}

// The one and only account this endpoint may impersonate: a hidden sandbox
// creator (is_test=true, not an admin, never shown in the community).
const PREVIEW_EMAIL = 'qa-creator@trypcreators.test'
const PREVIEW_ID = 'c655f93c-9999-4f1d-8678-9fca0bf6dcd3'

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return json(req, { error: 'method not allowed' }, 405)

  const body = await req.json().catch(() => ({}))
  const action = body?.action === 'exit' ? 'exit' : 'enter'

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

  // ---- EXIT: step back to the admin's own account via a fresh session. ----
  if (action === 'exit') {
    const ticket = await verifyExitTicket(String(body?.exit_ticket ?? ''))
    if (!ticket) return json(req, { error: 'invalid or expired exit ticket' }, 401)

    // Re-confirm the ticket holder is STILL an admin (defends against a demoted
    // admin reusing an old ticket).
    const { data: me } = await admin.from('profiles').select('is_admin').eq('id', ticket.id).maybeSingle()
    if (!me?.is_admin) return json(req, { error: 'admins only' }, 403)

    // Prefer the email carried in the signed ticket (captured at enter time from
    // the admin's verified JWT). Fall back to an admin lookup if it's absent.
    let adminEmail = ticket.email
    if (!adminEmail) {
      const { data: userRes } = await admin.auth.admin.getUserById(ticket.id)
      adminEmail = userRes?.user?.email ?? null
    }
    if (!adminEmail) return json(req, { error: 'could not resolve admin account' }, 500)

    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: adminEmail,
    })
    const tokenHash = link?.properties?.hashed_token
    if (linkErr || !tokenHash) return json(req, { error: linkErr?.message ?? 'could not restore admin session' }, 500)

    return json(req, { token_hash: tokenHash })
  }

  // ---- ENTER: verify caller is an admin, then mint the preview session. ----
  const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
  if (!jwt) return json(req, { error: 'missing token' }, 401)
  const caller = await verifyUser(jwt)
  if (!caller) return json(req, { error: 'invalid token' }, 401)

  const { data: me } = await admin.from('profiles').select('is_admin').eq('id', caller.id).maybeSingle()
  if (!me?.is_admin) return json(req, { error: 'admins only' }, 403)

  // Confirm the fixed target is still a safe sandbox creator (test, non-admin).
  const { data: target } = await admin
    .from('profiles')
    .select('id, is_admin, is_test')
    .eq('id', PREVIEW_ID)
    .maybeSingle()
  if (!target || target.is_admin || !target.is_test) {
    return json(req, { error: 'preview account unavailable' }, 500)
  }

  // Mint a magic-link token for the preview account (does NOT send an email).
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: PREVIEW_EMAIL,
  })
  const tokenHash = link?.properties?.hashed_token
  if (linkErr || !tokenHash) return json(req, { error: linkErr?.message ?? 'could not create preview session' }, 500)

  // The exit ticket lets the client return to THIS admin's account later without
  // needing to have stashed their real session tokens. We carry the admin's
  // email (from their verified JWT) so exit can mint the link without an extra
  // admin-API lookup.
  const exitTicket = await signExitTicket(caller.id, caller.email)

  return json(req, { token_hash: tokenHash, exit_ticket: exitTicket, creator_id: PREVIEW_ID, admin_id: caller.id })
})
