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

// Can this browser actually ENCODE WebP? Safari could display WebP long before
// its canvas could write one, and a `toBlob` that cannot honour the type
// silently hands back a PNG - which is BIGGER than the JPEG we were trying to
// beat. So we ask the canvas to produce one pixel and check what came out.
// Computed once and cached; it cannot change mid-session.
let webpOk = null
function canEncodeWebp() {
  if (webpOk !== null) return webpOk
  try {
    const c = document.createElement('canvas')
    c.width = 1
    c.height = 1
    webpOk = c.toDataURL('image/webp').startsWith('data:image/webp')
  } catch {
    webpOk = false
  }
  return webpOk
}

// WEBP IS THE DEFAULT, not an opt-in. It was opt-in, and the result was measured
// on 24 Aug 2026: 270 of 274 gallery files were JPEG averaging 409 kB, against
// 4 WebP averaging 136 kB. Eleven of the JPEGs had been uploaded that month, so
// this was not legacy - it was live. The cause was that only the travel gallery
// asked for WebP; flight photos went into the SAME bucket through a call that
// did not, and every other surface encoded JPEG too.
//
// Making it the default is a three-times size reduction with no visible quality
// change - WebP at 0.82 is cleaner than JPEG at 0.82, not worse - which is worth
// far more than shaving dimensions or quality would be. Callers that genuinely
// need JPEG can still pass `format: 'jpeg'`; a browser that cannot encode WebP
// falls back on its own.
export async function compressImage(file, { maxDim = 1280, quality = 0.82, format = 'webp' } = {}) {
  // Keep GIFs as-is (animation would be lost by canvas re-encoding).
  if (file.type === 'image/gif') return file
  const useWebp = format === 'webp' && canEncodeWebp()
  const outType = useWebp ? 'image/webp' : 'image/jpeg'
  const outExt = useWebp ? 'webp' : 'jpg'

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

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, outType, quality))
    if (!blob) throw new Error('encode-failed')
    // If compression made it bigger (tiny images), keep the (web-safe) source.
    if (blob.size >= source.size && WEB_SAFE.includes(source.type)) return source
    const newName = (source.name || 'photo').replace(/\.(png|webp|heic|heif|jpe?g)$/i, '') + '.' + outExt
    return new File([blob], newName, { type: outType })
  } catch {
    // Couldn't process it. A web-safe original still uploads/displays fine;
    // anything else can't, so tell the user rather than store a broken file.
    if (WEB_SAFE.includes(source.type)) return source
    throw new Error('That image format isn’t supported. Please use a JPEG, PNG or WebP.')
  }
}
