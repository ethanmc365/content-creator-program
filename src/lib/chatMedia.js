import { compressImage } from './image'
import { uploadFile, uploadPrivateFile } from './upload'
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
