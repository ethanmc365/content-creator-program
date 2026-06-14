import { supabase } from './supabase'
import { compressImage } from './image'

// Upload a chat image to the public "chat-media" bucket and return its URL.
// Files land in chat-media/<user id>/... so the RLS policy applies.
// Used by both the group chat and DMs. Images are downscaled before upload.
export async function uploadChatImage(file, userId) {
  if (!file.type.startsWith('image/')) {
    throw new Error('Only image files can be attached.')
  }
  if (file.size > 15 * 1024 * 1024) {
    throw new Error('Images must be under 15MB.')
  }
  const compressed = await compressImage(file, { maxDim: 1280, quality: 0.82 })
  const path = `${userId}/${Date.now()}.jpg`
  const { error } = await supabase.storage.from('chat-media').upload(path, compressed)
  if (error) throw new Error(error.message)
  return supabase.storage.from('chat-media').getPublicUrl(path).data.publicUrl
}
