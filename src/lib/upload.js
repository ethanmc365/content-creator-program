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

export async function uploadFile(bucket, path, fileOrBlob, contentType) {
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
  return out.publicUrl
}
