// Client-side image compression.
//
// Phone photos are often 3-8 MB. Before uploading anything to Supabase
// Storage we downscale to a sensible max dimension and re-encode as JPEG,
// which typically shrinks a photo to 100-400 KB with no visible quality loss
// at screen sizes. This is what keeps the free 1 GB storage tier lasting:
// ~3,000-10,000 images instead of a few hundred.
//
// Returns a File (so existing upload code works unchanged). If anything goes
// wrong we fall back to the original file rather than blocking the upload.
export async function compressImage(file, { maxDim = 1280, quality = 0.82 } = {}) {
  // Only process raster images; skip GIFs (animation would be lost) and non-images.
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file

  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))
    const width = Math.round(bitmap.width * scale)
    const height = Math.round(bitmap.height * scale)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close?.()

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
    if (!blob) return file

    // If compression somehow made it bigger (tiny images), keep the original.
    if (blob.size >= file.size) return file

    const newName = file.name.replace(/\.(png|webp|heic|heif|jpe?g)$/i, '') + '.jpg'
    return new File([blob], newName, { type: 'image/jpeg' })
  } catch {
    return file // canvas/bitmap unsupported → upload original
  }
}
