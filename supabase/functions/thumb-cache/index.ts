// Supabase Edge Function: thumb-cache
//
// A COVER FRAME THAT STILL WORKS NEXT MONTH. See supabase/functions/thumb-cache
// in the repository for the full note; the short version is that Instagram's
// cover URLs are signed and expire, and the probe that can refresh them is
// admin-only - so a challenge board and a creator's profile could never have
// had a frame by that route. One stored file fixes both.
//
// WHAT STOPS THIS BEING AN OPEN PROXY. Three things, and they are all needed:
//  * the caller must present a valid JWT;
//  * the video URL must already exist in `submissions` or `tracked_videos`;
//  * the image URL's host must be one of the platforms' own CDNs.
//
// DEPLOYED WITH CONDENSED COMMENTS, AND THAT IS WORTH KNOWING. This project
// has no Supabase CLI on the machine, so a deploy goes through the MCP tool,
// which takes file CONTENT rather than paths and has to carry every byte
// through the conversation. The bundle in production therefore holds this file
// and `_shared/cors.ts` with their long rationales trimmed. THE CODE IS
// IDENTICAL - same allow-lists, same regex (checked character by character,
// because an over-escaped `\\.` in the first attempt was a real bug), same
// control flow. The reasoning lives here. Re-send BOTH files whenever either
// changes: a deploy that names only one of them will not bundle.
//
// Deploy:  supabase functions deploy thumb-cache

import { createClient } from 'npm:@supabase/supabase-js@2'
import { createRemoteJWKSet, jwtVerify } from 'npm:jose@5'
import { corsHeaders } from '../_shared/cors.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
const BUCKET = 'video-thumbs'

const json = (req: Request, obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })

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

const IMAGE_HOSTS = [
  'cdninstagram.com',
  'fbcdn.net',
  'tiktokcdn.com',
  'tiktokcdn-eu.com',
  'tiktokcdn-us.com',
  'ibyteimg.com',
  'ytimg.com',
  'ggpht.com',
]
function hostAllowed(u: string): boolean {
  try {
    const { hostname, protocol } = new URL(u)
    if (protocol !== 'https:') return false
    return IMAGE_HOSTS.some((h) => hostname === h || hostname.endsWith(`.${h}`))
  } catch {
    return false
  }
}

function youtubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/)
  return m ? m[1] : null
}

async function tiktokCover(url: string): Promise<string | null> {
  try {
    const res = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const body = await res.json()
    const thumb = body?.thumbnail_url
    return typeof thumb === 'string' && thumb ? thumb : null
  } catch {
    return null
  }
}

async function keyFor(videoUrl: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(videoUrl))
  return [...new Uint8Array(digest)].slice(0, 20).map((b) => b.toString(16).padStart(2, '0')).join('')
}

const MAX_BYTES = 8 * 1024 * 1024

// A COVER IS A CARD, NOT A POSTER (10 Sep 2026).
//
// Measured on the first real run - the 39 entries of the UK challenge - the
// platforms hand back their FULL-SIZE cover: 33 files at an average of 236KB,
// 7.8MB in total. Two things are wrong with keeping that. Ethan's worry is the
// first ("we don't want it to take up an insane amount of storage"): a thousand
// videos would be 236MB rather than the 40MB this was estimated at. The second
// is worse and was not asked about, because nobody had seen it yet - a challenge
// board is 39 of these on one screen, so the page would have pulled NINE
// MEGABYTES of pictures to draw a grid of cards 300px wide.
//
// 720px on the long edge is about double what any card here renders at, which
// leaves room for a retina screen and for the tracker's larger 4:5 frame, and
// JPEG q78 is the point where a photograph stops paying for quality nobody sees.
// Together they take a 236KB cover to roughly 45KB.
//
// BEST EFFORT, ALWAYS. A frame that will not decode - an unusual JPEG, a WebP
// variant, anything at all - is stored as it arrived rather than dropped. The
// picture is the point; the size is an optimisation, and an optimisation must
// never be the reason there is nothing to look at.
const MAX_EDGE = 720
async function shrink(bytes: Uint8Array, contentType: string) {
  // Under ~60KB there is nothing to win and a decode to lose.
  if (bytes.byteLength < 60_000) return { bytes, contentType }
  try {
    const { decode } = await import('https://deno.land/x/imagescript@1.3.0/mod.ts')
    // deno-lint-ignore no-explicit-any
    const img = await decode(bytes) as any
    if (!img || typeof img.resize !== 'function' || typeof img.encodeJPEG !== 'function') {
      return { bytes, contentType }
    }
    const long = Math.max(img.width, img.height)
    if (long > MAX_EDGE) {
      const scale = MAX_EDGE / long
      img.resize(Math.max(1, Math.round(img.width * scale)), Math.max(1, Math.round(img.height * scale)))
    }
    const out = new Uint8Array(await img.encodeJPEG(78))
    if (!out.byteLength || out.byteLength >= bytes.byteLength) return { bytes, contentType }
    return { bytes: out, contentType: 'image/jpeg' }
  } catch {
    return { bytes, contentType }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return json(req, { error: 'method not allowed' }, 405)

  const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
  if (!jwt) return json(req, { error: 'missing token' }, 401)
  const uid = await verifyUser(jwt)
  if (!uid) return json(req, { error: 'invalid token' }, 401)

  const body = (await req.json().catch(() => ({}))) as { url?: string; src?: string; force?: boolean }
  const videoUrl = typeof body.url === 'string' ? body.url.trim() : ''
  if (!videoUrl) return json(req, { error: 'bad request' }, 400)

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

  const [{ data: sub }, { data: tracked }] = await Promise.all([
    admin.from('submissions').select('id, thumbnail_url').eq('video_url', videoUrl).limit(1).maybeSingle(),
    admin.from('tracked_videos').select('id, thumbnail_url').eq('video_url', videoUrl).limit(1).maybeSingle(),
  ])
  if (!sub && !tracked) return json(req, { error: 'unknown video' }, 404)

  const stored = [sub?.thumbnail_url, tracked?.thumbnail_url]
    .find((u) => typeof u === 'string' && u.startsWith(`${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`))
  if (stored && body.force !== true) {
    await writeBack(admin, videoUrl, stored)
    return json(req, { url: stored, cached: true })
  }

  let src = typeof body.src === 'string' ? body.src.trim() : ''
  if (src && !hostAllowed(src)) return json(req, { error: 'source host not allowed' }, 400)
  if (!src) {
    if (/tiktok\.com/i.test(videoUrl)) src = (await tiktokCover(videoUrl)) ?? ''
    else {
      const yt = youtubeId(videoUrl)
      if (yt) src = `https://i.ytimg.com/vi/${yt}/hqdefault.jpg`
    }
  }
  if (!src) return json(req, { error: 'no source' }, 422)
  if (!hostAllowed(src)) return json(req, { error: 'source host not allowed' }, 400)

  let bytes: Uint8Array
  let contentType = 'image/jpeg'
  try {
    const res = await fetch(src, {
      redirect: 'error',
      headers: { accept: 'image/*' },
      signal: AbortSignal.timeout(12_000),
    })
    if (!res.ok) return json(req, { error: `source ${res.status}` }, 502)
    const ct = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
    if (!ct.startsWith('image/')) return json(req, { error: 'not an image' }, 502)
    contentType = ct === 'image/webp' || ct === 'image/png' ? ct : 'image/jpeg'
    const buf = new Uint8Array(await res.arrayBuffer())
    if (buf.byteLength === 0) return json(req, { error: 'empty image' }, 502)
    if (buf.byteLength > MAX_BYTES) return json(req, { error: 'image too large' }, 502)
    bytes = buf
  } catch (e) {
    return json(req, { error: 'fetch failed', detail: String(e) }, 502)
  }

  const small = await shrink(bytes, contentType)
  bytes = small.bytes
  contentType = small.contentType
  // The bucket itself refuses anything over 2MB (migration 215). A source that
  // arrived larger than that and would not decode has nowhere to go, and
  // failing here says so rather than letting Storage return an opaque error.
  if (bytes.byteLength > 2 * 1024 * 1024) return json(req, { error: 'image too large' }, 502)

  const ext = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg'
  const path = `${await keyFor(videoUrl)}.${ext}`
  const { error: upErr } = await admin.storage.from(BUCKET).upload(path, bytes, {
    contentType,
    upsert: true,
    cacheControl: '604800',
  })
  if (upErr) return json(req, { error: upErr.message }, 500)

  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path)
  const publicUrl = pub.publicUrl
  await writeBack(admin, videoUrl, publicUrl)
  return json(req, { url: publicUrl, bytes: bytes.byteLength, cached: false })
})

// deno-lint-ignore no-explicit-any
async function writeBack(admin: any, videoUrl: string, url: string) {
  await Promise.all([
    admin.from('submissions').update({ thumbnail_url: url }).eq('video_url', videoUrl),
    admin.from('tracked_videos').update({ thumbnail_url: url }).eq('video_url', videoUrl),
  ])
}
