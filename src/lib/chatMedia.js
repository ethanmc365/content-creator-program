import { compressImage } from './image'
import { uploadFile, uploadPrivateFile, uploadRawFile } from './upload'
import { ensureMp4Brand } from './videoRemux'
import { supabase } from './supabase'

function validateImage(file) {
  const looksImage = file.type.startsWith('image/') || /\.(heic|heif|jpe?g|png|webp|gif)$/i.test(file.name)
  if (!looksImage) throw new Error('Only image files can be attached.')
  if (file.size > 15 * 1024 * 1024) throw new Error('Images must be under 15MB.')
}

// Upload a COMMUNITY chat image to the public "chat-media" bucket and return its
// URL. Files land in chat-media/<user id>/... so the RLS policy applies. Group
// chat is public by design, so a public URL is fine here.
export async function uploadChatImage(file, userId) {
  validateImage(file)
  const compressed = await compressImage(file, { maxDim: 1280, quality: 0.82 })
  const ext = (compressed.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg')
  const path = `${userId}/${Date.now()}.${ext}`
  return uploadFile('chat-media', path, compressed, compressed.type || 'image/jpeg')
}

// Upload a community chat VIDEO clip. We can't reliably transcode video in the
// browser (needs a heavy wasm lib), so we size-cap it (protecting the free
// storage tier) and upload as-is; short phone clips fit fine. Rendered inline
// with a <video> player.
//
// Video goes through the same reliable service-role `upload` edge function as
// images, but via the RAW-binary path (uploadRawFile) instead of base64 JSON:
// direct client-to-storage uploads intermittently fail with "new row violates
// row-level security policy" (the storage node validates the JWT against a
// per-node JWKS cache that lags a signing-key rotation), while base64-in-JSON
// inflates a 25MB clip to ~33MB and blows the function's CPU budget. Raw bytes
// through the proxy avoid both: the proxy verifies the user against the auth
// server and writes with the service role, streaming the body straight through.
const CHAT_VIDEO_MAX = 25 * 1024 * 1024
const VIDEO_MIME = { mov: 'video/mp4', qt: 'video/mp4', m4v: 'video/mp4', mp4: 'video/mp4', webm: 'video/webm', ogv: 'video/ogg' }
export async function uploadChatVideo(file, userId) {
  const looksVideo = file.type.startsWith('video/') || /\.(mp4|webm|mov|m4v|ogv)$/i.test(file.name)
  if (!looksVideo) throw new Error('Only image or video files can be attached.')
  if (file.size > CHAT_VIDEO_MAX) {
    throw new Error('Video is too large (max 25MB). Trim it or lower the resolution and try again.')
  }
  // iPhone .mov (QuickTime-branded H.264) won't play in Chrome/Firefox/Android;
  // losslessly rewrite the container brand to MP4 so it plays everywhere.
  const playable = await ensureMp4Brand(file)
  const ext = (playable.name.split('.').pop() || 'mp4').toLowerCase()
  const contentType = playable.type || VIDEO_MIME[ext] || 'video/mp4'
  const path = `${userId}/video-${Date.now()}.${ext}`
  const out = await uploadRawFile('chat-media', path, playable, contentType)
  return out.publicUrl
}

// Upload a DIRECT-MESSAGE image to the PRIVATE "dm-media" bucket, keyed by the
// conversation id so only its two participants can read it back. Returns the
// storage PATH (not a URL) - render it with signDmImage(). This keeps private
// conversations private (the old shared public bucket exposed DM images by URL).
export async function uploadDmImage(file, conversationId) {
  validateImage(file)
  const compressed = await compressImage(file, { maxDim: 1280, quality: 0.82 })
  const ext = (compressed.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg')
  const path = `${conversationId}/${Date.now()}.${ext}`
  return uploadPrivateFile('dm-media', path, compressed, compressed.type || 'image/jpeg')
}

// A DM image field is either a legacy full public URL (old messages, stored in
// chat-media) or a dm-media storage path (new, private). Legacy ones render
// directly; private paths get a short-lived signed URL.
export function isSignedDmPath(imageField) {
  return !!imageField && !/^https?:\/\//i.test(imageField)
}

// Turn a set of dm-media storage paths into signed URLs in one round-trip.
// Returns a Map(path -> signedUrl). Failures are simply omitted.
export async function signDmImages(paths, expiresIn = 3600) {
  const unique = [...new Set(paths.filter(isSignedDmPath))]
  if (!unique.length) return new Map()
  const { data } = await supabase.storage.from('dm-media').createSignedUrls(unique, expiresIn)
  const map = new Map()
  for (const row of data ?? []) {
    if (row?.signedUrl && !row.error) map.set(row.path, row.signedUrl)
  }
  return map
}
