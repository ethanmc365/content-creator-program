// Supabase Edge Function: upload
// A reliable upload proxy. The browser sends the file (base64) + target bucket
// and path with the user's JWT. We verify the user via the auth server (not the
// storage node's flaky JWKS cache), enforce that they can only write their own
// folder, then upload with the service role so it never trips Storage RLS.
//
// Deploy:  supabase functions deploy upload --no-verify-jwt
import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!

const ALLOWED_BUCKETS = new Set(['avatars', 'chat-media', 'gallery'])

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  // 1) Verify the caller via the auth server (reliable, unlike storage's cache).
  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.replace('Bearer ', '')
  if (!jwt) return json({ error: 'missing token' }, 401)
  const authClient = createClient(SUPABASE_URL, ANON)
  const { data: userData, error: userErr } = await authClient.auth.getUser(jwt)
  if (userErr || !userData?.user) return json({ error: 'invalid token' }, 401)
  const uid = userData.user.id

  // 2) Validate the request.
  const body = await req.json().catch(() => null)
  if (!body?.bucket || !body?.path || !body?.dataBase64) return json({ error: 'bad request' }, 400)
  if (!ALLOWED_BUCKETS.has(body.bucket)) return json({ error: 'bucket not allowed' }, 403)
  // Users may only write inside their own <uid>/ folder.
  if (!String(body.path).startsWith(`${uid}/`)) return json({ error: 'path not allowed' }, 403)

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

  // 2b) Rate limit: max 40 uploads / 10 min per user (generous for a 20-photo
  // gallery batch, but blocks abuse of the free storage tier).
  const since = new Date(Date.now() - 600_000).toISOString()
  await admin.from('auth_attempts').delete().lt('created_at', new Date(Date.now() - 3_600_000).toISOString())
  const { count } = await admin.from('auth_attempts').select('id', { count: 'exact', head: true })
    .eq('identifier', `upload:${uid}`).gte('created_at', since)
  if ((count ?? 0) >= 40) return json({ error: 'Too many uploads in a short time. Please wait a few minutes.' }, 429)
  await admin.from('auth_attempts').insert({ identifier: `upload:${uid}` })

  // 3) Decode and upload with the service role (bypasses Storage RLS safely).
  const bytes = Uint8Array.from(atob(body.dataBase64), (c) => c.charCodeAt(0))
  const { error: upErr } = await admin.storage.from(body.bucket).upload(body.path, bytes, {
    contentType: body.contentType || 'application/octet-stream',
    upsert: true,
  })
  if (upErr) return json({ error: upErr.message }, 500)

  const { data: pub } = admin.storage.from(body.bucket).getPublicUrl(body.path)
  return json({ publicUrl: pub.publicUrl })
})
