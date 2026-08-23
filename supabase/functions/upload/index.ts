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
import { corsHeaders as sharedCors } from '../_shared/cors.ts'

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

// CORS lives in _shared/cors.ts now: every function had its own copy and every
// copy allowed ANY *.vercel.app origin, which anybody can register.
const corsHeaders = (req: Request) =>
  sharedCors(req, 'x-upload-bucket, x-upload-path, x-upload-content-type')

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

  // WHAT MAY BE UPLOADED, DECIDED HERE AS WELL AS BY THE BUCKET.
  //
  // The buckets carry `allowed_mime_types` and `file_size_limit`, and those are
  // the controls that actually held when the audit went looking. But this
  // function uploads with the SERVICE ROLE, one refactor away from being the
  // only thing in the path, and it was passing a caller-supplied content type
  // through untouched with no size check at all. Two rules that a bucket
  // setting should never be the sole owner of:
  //
  //   NO SVG, ANYWHERE. An SVG is a document with scripts in it. Served from a
  //   public bucket and opened directly it executes on the storage origin, and
  //   "a different origin from the app" is a mitigation, not a defence.
  //   (`resources`, which does allow SVG, is admin-only and does not come
  //   through this function.)
  //
  //   NO HTML, NO ANYTHING-ELSE. An allow-list, so the next media type somebody
  //   adds is a decision rather than an oversight.
  const ALLOWED_TYPES = new Set([
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'video/mp4', 'video/webm', 'video/quicktime', 'video/ogg',
    'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/aac', 'audio/wav', 'audio/x-m4a',
  ])
  // A FILE WITH NO TYPE IS NOT A REJECTION, IT IS A LOOKUP.
  //
  // The client falls back to `application/octet-stream` whenever the browser
  // gives it a File with an empty `type`, which really happens - some Android
  // pickers, some HEIC conversions. Rejecting those would have broken photo
  // upload for a slice of the community in the name of security, which is how
  // security controls get turned off again. The extension decides instead, and
  // an extension we do not recognise is still a no.
  const BY_EXTENSION: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
    mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', ogv: 'video/ogg',
    m4a: 'audio/mp4', mp3: 'audio/mpeg', ogg: 'audio/ogg', aac: 'audio/aac', wav: 'audio/wav',
  }
  let baseType = contentType.split(';')[0].trim().toLowerCase()
  if (!baseType || baseType === 'application/octet-stream') {
    baseType = BY_EXTENSION[(path.split('.').pop() || '').toLowerCase()] ?? ''
  }
  if (!ALLOWED_TYPES.has(baseType)) return json(req, { error: 'that file type is not allowed' }, 415)
  contentType = baseType

  // A cap of our own, checked BEFORE the body is read into memory where we can.
  // 60MB matches the most generous bucket; the point is that the number exists
  // in this file rather than only in a dashboard setting somebody can widen.
  const MAX_BYTES = 62_914_560
  const declared = Number(req.headers.get('content-length') || 0)
  if (declared > MAX_BYTES * 1.4) return json(req, { error: 'that file is too large' }, 413)

  // Path hygiene: no traversal, no odd characters, bounded length. Storage keys
  // are S3-style (no real filesystem) but this blocks abuse and keeps keys sane.
  if (path.length > 256 || path.includes('..') || !/^[A-Za-z0-9][\w./-]*$/.test(path)) {
    return json(req, { error: 'bad path' }, 400)
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

  if (isPrivate) {
    // dm-media/<conversationId>/... — the writer must be in the conversation.
    //
    // THIS USED TO CHECK ONLY participant_a / participant_b, which are the two
    // columns a DIRECT conversation uses. A GROUP conversation leaves both null
    // and keeps its people in `conversation_members`, so nobody could put a
    // photo in a group DM at all - the same blind spot the storage read policy
    // had (migration 108). Both halves now ask the same question.
    const convId = path.split('/')[0]
    const [{ data: conv }, { data: member }] = await Promise.all([
      admin.from('conversations').select('participant_a, participant_b').eq('id', convId).maybeSingle(),
      admin.from('conversation_members').select('profile_id')
        .eq('conversation_id', convId).eq('profile_id', uid).maybeSingle(),
    ])
    const isParticipant = !!member
      || (!!conv && (conv.participant_a === uid || conv.participant_b === uid))
    if (!isParticipant) {
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
  if (bytes.length > MAX_BYTES) return json(req, { error: 'that file is too large' }, 413)
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
