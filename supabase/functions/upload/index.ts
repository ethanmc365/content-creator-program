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

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!

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

  // 1) Verify the caller via the auth server (reliable, unlike storage's cache).
  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.replace('Bearer ', '')
  if (!jwt) return json(req, { error: 'missing token' }, 401)
  const authClient = createClient(SUPABASE_URL, ANON)
  const { data: userData, error: userErr } = await authClient.auth.getUser(jwt)
  if (userErr || !userData?.user) return json(req, { error: 'invalid token' }, 401)
  const uid = userData.user.id

  // 2) Validate the request.
  const body = await req.json().catch(() => null)
  if (!body?.bucket || !body?.path || !body?.dataBase64) return json(req, { error: 'bad request' }, 400)
  const bucket = String(body.bucket)
  const isPrivate = PRIVATE_BUCKETS.has(bucket)
  if (!PUBLIC_BUCKETS.has(bucket) && !isPrivate) return json(req, { error: 'bucket not allowed' }, 403)

  // Path hygiene: no traversal, no odd characters, bounded length. Storage keys
  // are S3-style (no real filesystem) but this blocks abuse and keeps keys sane.
  const path = String(body.path)
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

  // 3) Decode and upload with the service role (bypasses Storage RLS safely).
  const bytes = Uint8Array.from(atob(body.dataBase64), (c) => c.charCodeAt(0))
  const { error: upErr } = await admin.storage.from(bucket).upload(path, bytes, {
    contentType: body.contentType || 'application/octet-stream',
    upsert: true,
  })
  if (upErr) return json(req, { error: upErr.message }, 500)

  // Private bucket: return the storage path (the client signs it on demand).
  // Public bucket: return the permanent public URL.
  if (isPrivate) return json(req, { path })
  const { data: pub } = admin.storage.from(bucket).getPublicUrl(path)
  return json(req, { path, publicUrl: pub.publicUrl })
})
