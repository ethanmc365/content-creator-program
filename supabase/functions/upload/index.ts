// Supabase Edge Function: upload
// A reliable upload proxy. The browser sends the file (base64) + target bucket
// and path with the user's JWT. We verify the user via the auth server (not the
// storage node's flaky JWKS cache), enforce that they can only write their own
// folder, then upload with the service role so it never trips Storage RLS.
//
// Buckets:
//   avatars / gallery / chat-media  → public, path must start with <uid>/
//   dm-media                        → PRIVATE, path is <conversationId>/...,
//                                     writer must be a participant. The client
//                                     reads it back through a short-lived signed
//                                     URL, so DM images are never public.
//
// Deploy:  supabase functions deploy upload --no-verify-jwt
import { createClient } from 'npm:@supabase/supabase-js@2'
import { createRemoteJWKSet, jwtVerify } from 'npm:jose@5'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!

// Verify the caller's JWT CRYPTOGRAPHICALLY against the project's public JWKS
// (signature + expiry + audience), exactly like PostgREST and Storage do. We
// deliberately do NOT use auth.getUser(): that also looks the session up in
// auth.sessions, and a global sign-out on another device deletes the session
// row while this device's token stays valid for up to a week (jwt_exp) - the
// rest of the app keeps working but getUser starts failing with "session not
// found" (real incident). Signature-level trust keeps us consistent with every
// other API the app talks to. Falls back to GoTrue /user for non-ES256 tokens.
const JWKS = createRemoteJWKSet(new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`))
async function verifyUser(jwt: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(jwt, JWKS, {
      issuer: `${SUPABASE_URL}/auth/v1`,
      audience: 'authenticated',
    })
    return payload.sub ? String(payload.sub) : null
  } catch {
    // Legacy/edge cases (e.g. an HS256 token with no public JWK): ask GoTrue.
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

const PUBLIC_BUCKETS = new Set(['avatars', 'chat-media', 'gallery'])
const PRIVATE_BUCKETS = new Set(['dm-media'])

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
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-upload-bucket, x-upload-path, x-upload-content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}
const json = (req: Request, obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return json(req, { error: 'method not allowed' }, 405)

  // 1) Verify the caller's JWT (signature-level, see verifyUser above).
  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.replace('Bearer ', '')
  if (!jwt) return json(req, { error: 'missing token' }, 401)
  const uid = await verifyUser(jwt)
  if (!uid) return json(req, { error: 'invalid token' }, 401)

  // 2) Validate the request. Two body shapes are accepted:
  //   - JSON  { bucket, path, contentType, dataBase64 }  — small files (images).
  //   - RAW binary body + metadata in x-upload-* headers  — large files (video):
  //     base64-in-JSON inflates a 25MB clip to ~33MB AND the atob/decode loop
  //     blows the function's CPU budget (that was the "won't send"); a raw body
  //     streams straight through with none of that overhead.
  const contentTypeHeader = req.headers.get('content-type') ?? ''
  const isRaw = !contentTypeHeader.includes('application/json')

  let bucket: string
  let path: string
  let contentType: string
  let getBytes: () => Promise<Uint8Array>

  if (isRaw) {
    bucket = String(req.headers.get('x-upload-bucket') ?? '')
    path = String(req.headers.get('x-upload-path') ?? '')
    contentType = req.headers.get('x-upload-content-type') || contentTypeHeader || 'application/octet-stream'
    if (!bucket || !path) return json(req, { error: 'bad request' }, 400)
    getBytes = async () => new Uint8Array(await req.arrayBuffer())
  } else {
    const body = await req.json().catch(() => null)
    if (!body?.bucket || !body?.path || !body?.dataBase64) return json(req, { error: 'bad request' }, 400)
    bucket = String(body.bucket)
    path = String(body.path)
    contentType = body.contentType || 'application/octet-stream'
    getBytes = async () => Uint8Array.from(atob(body.dataBase64), (c) => c.charCodeAt(0))
  }

  const isPrivate = PRIVATE_BUCKETS.has(bucket)
  if (!PUBLIC_BUCKETS.has(bucket) && !isPrivate) return json(req, { error: 'bucket not allowed' }, 403)

  // Path hygiene: no traversal, no odd characters, bounded length. Storage keys
  // are S3-style (no real filesystem) but this blocks abuse and keeps keys sane.
  if (path.length > 256 || path.includes('..') || !/^[A-Za-z0-9][\w./-]*$/.test(path)) {
    return json(req, { error: 'bad path' }, 400)
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

  if (isPrivate) {
    // dm-media/<conversationId>/... — the writer must be a participant.
    const convId = path.split('/')[0]
    const { data: conv } = await admin
      .from('conversations').select('participant_a, participant_b').eq('id', convId).maybeSingle()
    if (!conv || (conv.participant_a !== uid && conv.participant_b !== uid)) {
      return json(req, { error: 'not a participant of this conversation' }, 403)
    }
  } else {
    // Public buckets: users may only write inside their own <uid>/ folder.
    if (!path.startsWith(`${uid}/`)) return json(req, { error: 'path not allowed' }, 403)
  }

  // 2b) Rate limit: max 40 uploads / 10 min per user (generous for a 20-photo
  // gallery batch, but blocks abuse of the free storage tier).
  const since = new Date(Date.now() - 600_000).toISOString()
  await admin.from('auth_attempts').delete().lt('created_at', new Date(Date.now() - 3_600_000).toISOString())
  const { count } = await admin.from('auth_attempts').select('id', { count: 'exact', head: true })
    .eq('identifier', `upload:${uid}`).gte('created_at', since)
  if ((count ?? 0) >= 40) return json(req, { error: 'Too many uploads in a short time. Please wait a few minutes.' }, 429)
  await admin.from('auth_attempts').insert({ identifier: `upload:${uid}` })

  // 3) Read the bytes (decode base64, or take the raw body) and upload with the
  // service role (bypasses Storage RLS safely).
  const bytes = await getBytes()
  const { error: upErr } = await admin.storage.from(bucket).upload(path, bytes, {
    contentType,
    upsert: true,
  })
  if (upErr) return json(req, { error: upErr.message }, 500)

  // Private bucket: return the storage path (the client signs it on demand).
  // Public bucket: return the permanent public URL.
  if (isPrivate) return json(req, { path })
  const { data: pub } = admin.storage.from(bucket).getPublicUrl(path)
  return json(req, { path, publicUrl: pub.publicUrl })
})
