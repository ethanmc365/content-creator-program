import { supabase } from './supabase'

// Upload a chat image to the public "chat-media" bucket and return its URL.
// Files land in chat-media/<user id>/... so the RLS policy applies.
// Used by both the group chat and DMs.
export async function uploadChatImage(file, userId) {
  if (!file.type.startsWith('image/')) {
    throw new Error('Only image files can be attached.')
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new Error('Images must be under 8MB.')
  }
  const ext = file.name.split('.').pop() || 'jpg'
  const path = `${userId}/${Date.now()}.${ext}`
  const { error } = await supabase.storage.from('chat-media').upload(path, file)
  if (error) throw new Error(error.message)
  return supabase.storage.from('chat-media').getPublicUrl(path).data.publicUrl
}
