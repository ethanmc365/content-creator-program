import { supabase } from './supabase'

// Reliable uploads via the `upload` Edge Function. Storage RLS validation can be
// briefly unreliable right after a JWT signing-key rotation (per-node JWKS
// caches), so we upload through a function that verifies the user against the
// auth server and writes with the service role. Returns the public URL.
const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/upload`

function toBase64(bytes) {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

async function callUpload(bucket, path, fileOrBlob, contentType) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('You need to be signed in to upload.')
  const bytes = new Uint8Array(await fileOrBlob.arrayBuffer())
  const res = await fetch(FN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      apikey: supabase.supabaseKey,
    },
    body: JSON.stringify({
      bucket,
      path,
      contentType: contentType || fileOrBlob.type || 'application/octet-stream',
      dataBase64: toBase64(bytes),
    }),
  })
  const out = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(out.error || 'Upload failed. Please try again.')
  return out
}

// Upload to a PUBLIC bucket (avatars / gallery / chat-media). Returns the
// permanent public URL.
export async function uploadFile(bucket, path, fileOrBlob, contentType) {
  const out = await callUpload(bucket, path, fileOrBlob, contentType)
  return out.publicUrl
}

// Upload to a PRIVATE bucket (dm-media). Returns the storage PATH - callers read
// it back through a short-lived signed URL, so the object is never public.
export async function uploadPrivateFile(bucket, path, fileOrBlob, contentType) {
  const out = await callUpload(bucket, path, fileOrBlob, contentType)
  return out.path
}

// Upload a LARGE file (chat video) through the same reliable service-role proxy,
// but send the RAW bytes as the request body instead of base64 JSON. Big clips
// were failing/timing out when base64-encoded into a JSON body (~33MB + a heavy
// decode loop); a raw body streams through cleanly. Metadata rides in headers.
// Returns the full response ({ path, publicUrl } for a public bucket).
export async function uploadRawFile(bucket, path, fileOrBlob, contentType) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('You need to be signed in to upload.')
  const type = contentType || fileOrBlob.type || 'application/octet-stream'
  const res = await fetch(FN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': type,
      Authorization: `Bearer ${session.access_token}`,
      apikey: supabase.supabaseKey,
      'x-upload-bucket': bucket,
      'x-upload-path': path,
      'x-upload-content-type': type,
    },
    body: fileOrBlob,
  })
  const out = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(out.error || 'Upload failed. Please try again.')
  return out
}
