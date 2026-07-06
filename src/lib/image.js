// Client-side image compression.
//
// Phone photos are often 3-8 MB. Before uploading anything to Supabase
// Storage we downscale to a sensible max dimension and re-encode as JPEG,
// which typically shrinks a photo to 100-400 KB with no visible quality loss
// at screen sizes. This is what keeps the free 1 GB storage tier lasting.
//
// iPhones default to HEIC/HEIF, which most browsers (Chrome, Android) can't
// decode via <canvas>. Those are converted to JPEG first (heic2any, loaded
// lazily so it never bloats the main bundle). If we genuinely can't process an
// image we THROW a clear message so the uploader can tell the user, instead of
// silently uploading a file that will store broken.
const WEB_SAFE = ['image/jpeg', 'image/png', 'image/webp']

function isHeic(file) {
  return file.type === 'image/heic' || file.type === 'image/heif' || /\.(heic|heif)$/i.test(file.name || '')
}

export async function compressImage(file, { maxDim = 1280, quality = 0.82 } = {}) {
  // Keep GIFs as-is (animation would be lost by canvas re-encoding).
  if (file.type === 'image/gif') return file

  let source = file
  if (isHeic(file)) {
    try {
      const heic2any = (await import('heic2any')).default
      const out = await heic2any({ blob: file, toType: 'image/jpeg', quality })
      const blob = Array.isArray(out) ? out[0] : out
      source = new File([blob], (file.name || 'photo').replace(/\.(heic|heif)$/i, '') + '.jpg', { type: 'image/jpeg' })
    } catch {
      throw new Error('Could not read that iPhone photo (HEIC). Set your camera to "Most Compatible" (Settings › Camera › Formats), or upload a JPEG.')
    }
  }

  try {
    const bitmap = await createImageBitmap(source)
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close?.()

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
    if (!blob) throw new Error('encode-failed')
    // If compression made it bigger (tiny images), keep the (web-safe) source.
    if (blob.size >= source.size && WEB_SAFE.includes(source.type)) return source
    const newName = (source.name || 'photo').replace(/\.(png|webp|heic|heif|jpe?g)$/i, '') + '.jpg'
    return new File([blob], newName, { type: 'image/jpeg' })
  } catch {
    // Couldn't process it. A web-safe original still uploads/displays fine;
    // anything else can't, so tell the user rather than store a broken file.
    if (WEB_SAFE.includes(source.type)) return source
    throw new Error('That image format isn’t supported. Please use a JPEG, PNG or WebP.')
  }
}
