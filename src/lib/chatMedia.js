import { compressImage } from './image'
import { uploadFile } from './upload'

// Upload a chat image to the public "chat-media" bucket and return its URL.
// Files land in chat-media/<user id>/... so the RLS policy applies.
// Used by both the group chat and DMs. Images are downscaled before upload.
export async function uploadChatImage(file, userId) {
  const looksImage = file.type.startsWith('image/') || /\.(heic|heif|jpe?g|png|webp|gif)$/i.test(file.name)
  if (!looksImage) {
    throw new Error('Only image files can be attached.')
  }
  if (file.size > 15 * 1024 * 1024) {
    throw new Error('Images must be under 15MB.')
  }
  const compressed = await compressImage(file, { maxDim: 1280, quality: 0.82 })
  const ext = (compressed.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg')
  const path = `${userId}/${Date.now()}.${ext}`
  return uploadFile('chat-media', path, compressed, compressed.type || 'image/jpeg')
}
