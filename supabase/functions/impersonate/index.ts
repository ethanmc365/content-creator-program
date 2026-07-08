// Supabase Edge Function: impersonate
// Lets a REAL ADMIN step into a hidden sandbox "preview creator" account so they
// can experience the app exactly as a normal creator does (their profile, chat
// identity with no admin badge, their DMs / notifications / access). It returns a
// magic-link token_hash for the preview account; the client verifies it to swap
// its session, and restores the stashed admin session on exit.
//
// Safety:
//   - the caller must be authenticated (verify_jwt) AND is_admin (checked here);
//   - it will ONLY ever mint a session for the single designated preview creator,
//     which is is_test=true (invisible to the community) and NOT an admin. It can
//     never be used to impersonate a real member or another admin.
//
// Deploy:  supabase functions deploy impersonate
import { createClient } from 'npm:@supabase/supabase-js@2'
import { createRemoteJWKSet, jwtVerify } from 'npm:jose@5'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!

// Signature-level JWT verification against the project JWKS (see the upload
// function for the full rationale: auth.getUser() fails with "session not
// found" for tokens whose session was revoked on another device, even though
// the token is still valid for PostgREST/Storage).
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
      const user = await res.json()
      return user?.id ?? null
    } catch {
      return null
    }
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

  // 1) Verify the caller's JWT (signature-level), then confirm they are an admin.
  const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
  if (!jwt) return json(req, { error: 'missing token' }, 401)
  const callerId = await verifyUser(jwt)
  if (!callerId) return json(req, { error: 'invalid token' }, 401)

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })
  const { data: me } = await admin.from('profiles').select('is_admin').eq('id', callerId).maybeSingle()
  if (!me?.is_admin) return json(req, { error: 'admins only' }, 403)

  // 2) Confirm the fixed target is still a safe sandbox creator (test, non-admin).
  const { data: target } = await admin
    .from('profiles')
    .select('id, is_admin, is_test')
    .eq('id', PREVIEW_ID)
    .maybeSingle()
  if (!target || target.is_admin || !target.is_test) {
    return json(req, { error: 'preview account unavailable' }, 500)
  }

  // 3) Mint a magic-link token for the preview account (does NOT send an email).
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: PREVIEW_EMAIL,
  })
  const tokenHash = link?.properties?.hashed_token
  if (linkErr || !tokenHash) return json(req, { error: linkErr?.message ?? 'could not create preview session' }, 500)

  return json(req, { token_hash: tokenHash })
})
