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
  // The MIME type is not reliable here. A HEIC dragged out of Finder arrives as
  // `image/heic`, one from an iPhone burst as `image/heic-sequence`, and one
  // that has been through a share sheet or a file picker on Android often
  // arrives with an EMPTY type and nothing but its name to go on. All three are
  // the same problem, so all three are matched.
  const t = (file.type || '').toLowerCase()
  return t.startsWith('image/heic') || t.startsWith('image/heif')
    || /\.(heic|heif)$/i.test(file.name || '')
}

// AND WHEN THE NAME AND THE TYPE BOTH LIE, ASK THE BYTES.
//
// `isHeic` reads the two things the file says about itself, and there is a
// third case where it says nothing true at all: a photo that has been through
// AirDrop, a messaging app, or a re-save arrives as `IMG_4821` with an empty
// `type` and no extension whatsoever. Ethan: "can you properly build a way for
// it to quickly convert or just accept any format" - accepting any format
// starts with correctly RECOGNISING any format, and a file we do not recognise
// as HEIC goes straight to `createImageBitmap`, fails there, and is refused as
// "that image format isn't supported" when it is in fact the one format we know
// how to handle.
//
// ISO-BMFF puts a box length in bytes 0-4 and the tag `ftyp` in bytes 4-8, with
// the brand in 8-12. The brand list below is the HEIF still-image set; `avif`
// is deliberately NOT on it, because browsers decode AVIF natively and sending
// it to heic2any would be paying 1.35 MB to do worse than the canvas.
const HEIF_BRANDS = ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1']

async function sniffHeic(file) {
  try {
    const head = new Uint8Array(await file.slice(0, 12).arrayBuffer())
    if (head.length < 12) return false
    const ascii = (from, to) => String.fromCharCode(...head.slice(from, to))
    return ascii(4, 8) === 'ftyp' && HEIF_BRANDS.includes(ascii(8, 12).toLowerCase())
  } catch {
    return false
  }
}

// CAN THIS PAGE RUN A BLOB WORKER AT ALL?
//
// THE BUG THIS FIXES, AND IT IS THE WHOLE OF "IT LOADS FOREVER" (8 Sep 2026).
// Ethan: "with the onboarding, uploading the profile photo, if I try to upload
// a HEIC photo it's still not working. It just loads forever and doesn't stop."
//
// `heic2any` does its libheif decode in a Web Worker that it builds AT IMPORT
// TIME from an object URL - literally
// `new Worker(URL.createObjectURL(blob))`, at the top of its module. The
// platform's Content-Security-Policy said `worker-src 'self'`, and a `blob:`
// URL is not `'self'`, so on production - and ONLY on production, because the
// Vite dev server sends no CSP at all - Chrome refused it:
//
//   Creating a worker from 'blob:https://trypcreators.vercel.app/...' violates
//   the following Content Security Policy directive: "worker-src 'self'".
//
// The refusal is not an exception. The `Worker` object is constructed, the
// failure arrives as an async `error` event nobody is listening for, and
// `postMessage` posts into a void - so the promise heic2any returns NEVER
// SETTLES. Not slow: never. That is why the spinner ran until the tab was
// closed, and why the 30-second timeout below is the only thing that ever
// stopped it, with a message blaming the phone's camera settings for a policy
// header. The policy is fixed (`worker-src 'self' blob:` in vercel.json).
//
// THIS PROBE EXISTS SO IT CAN NEVER SILENTLY COME BACK. Anything that tightens
// that header again - a security sweep, a new host, a copied config - breaks
// HEIC and nothing else, which is exactly the kind of regression that goes
// unnoticed for a month. One tiny worker, one ping, cached for the session:
// if it does not answer we know before paying 1.35 MB for a download that
// cannot work, and we say what is actually wrong instead of guessing.
let blobWorkerOk = null
function canRunBlobWorker() {
  if (blobWorkerOk !== null) return blobWorkerOk
  blobWorkerOk = (async () => {
    let url
    let worker
    try {
      url = URL.createObjectURL(new Blob(
        ['self.onmessage=function(){self.postMessage(1)}'],
        { type: 'application/javascript' },
      ))
      worker = new Worker(url)
      return await new Promise((resolve) => {
        const done = (ok) => { resolve(ok) }
        worker.onmessage = () => done(true)
        worker.onerror = () => done(false)
        worker.postMessage(0)
        setTimeout(() => done(false), 2000)
      })
    } catch {
      return false
    } finally {
      try { worker?.terminate() } catch { /* never constructed */ }
      if (url) URL.revokeObjectURL(url)
    }
  })()
  return blobWorkerOk
}

// EVERY DECODE HAS A CLOCK, AND THERE IS MORE THAN ONE WAY TO DECODE.
//
// THE BUG THIS FIXES (8 Sep 2026, second attempt). The Content-Security-Policy
// header was one cause of "it loads forever" and it is fixed and verified in
// production - `worker-src 'self' blob:` is on the live response right now. It
// was not the only cause, because Ethan hit the same forever-spinner again on
// an iPhone, where the CSP path is never even reached: Safari decodes HEIC
// natively, so `heic2any` is never imported and no worker is ever built.
//
// WHAT IS LEFT IS THAT A DECODE CAN SIMPLY NOT COME BACK. `createImageBitmap`
// and `canvas.toBlob` are both callback/promise APIs with no specified failure
// mode for "the platform gave up": iOS Safari under memory pressure - a
// 12-megapixel HEIC on a phone that already has twenty tabs open - resolves
// neither. Nothing above them ever settles, so `busy` is never cleared, so the
// ring spins until the tab is closed. That is not a bug in one function; it is
// an entire class of bug, and the fix is structural rather than local:
//
//   1. NOTHING IS AWAITED WITHOUT A DEADLINE. Every step below is wrapped.
//   2. THERE IS ALWAYS A SECOND WAY. A decode that stalls falls through to a
//      plain `<img>`, which is the oldest and most forgiving image path a
//      browser has, and the one that works on an iPhone when the modern one
//      does not.
//   3. FAILURE IS AN ERROR, NEVER A HANG. Whatever happens, this function
//      settles, so the caller can say something.
const DECODE_BUDGET = 20000

// Decode via an <img> element and an object URL.
//
// This is deliberately the crustiest possible implementation, because that is
// the point of a fallback: no ImageBitmap, no fetch, no worker, nothing that
// was added to the platform this decade. If Safari can show the photo in a
// page - and it can, it is Apple's own format - it can decode it here.
function decodeViaImg(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    // The revoke must not happen before the draw: an object URL revoked while
    // the image is still being painted gives a blank canvas on some browsers.
    // The caller closes it.
    img.onload = () => resolve({
      source: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      close: () => URL.revokeObjectURL(url),
    })
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('img-decode-failed')) }
    img.src = url
  })
}

async function decodeViaBitmap(file) {
  const bmp = await createImageBitmap(file)
  return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close?.() }
}

/**
 * Decode `file` into something `drawImage` accepts, or null.
 *
 * Never throws and never hangs: both paths are on a clock, and a browser that
 * cannot do either gets a null it can act on.
 */
async function decodeImage(file) {
  try {
    return await withTimeout(decodeViaBitmap(file), DECODE_BUDGET, 'decode-timeout')
  } catch { /* the modern path is allowed to fail; that is why there are two */ }
  try {
    return await withTimeout(decodeViaImg(file), DECODE_BUDGET, 'decode-timeout')
  } catch {
    return null
  }
}

// CAN THIS BROWSER DECODE THE FILE ITSELF?
//
// Safari can decode HEIC natively - it is Apple's format - and Safari is where
// almost every HEIC comes from. Everything else (Chrome, Firefox, Android)
// cannot. Asking the browser first is worth doing precisely because the fallback
// is so expensive: `heic2any` is a 1.35 MB chunk that then decodes a 5 MB photo
// on the main thread.
//
// IT ASKS BOTH WAYS BEFORE SAYING NO, and that is the difference between this
// and the version that hung. It used to be `createImageBitmap` alone, so a
// phone where that call stalled sat inside it for ever - and even with a
// timeout it would then have paid 1.35 MB to convert a file Safari could have
// decoded through an `<img>` in one frame.
async function canDecodeNatively(file) {
  const d = await decodeImage(file)
  if (!d) return false
  d.close()
  return true
}

// A DECODE THAT NEVER FINISHES IS THE WORST OUTCOME, SO IT IS GIVEN A CLOCK.
//
// THE BUG THIS FIXES (7 Sep 2026). Ethan: "for the onboarding, the profile
// photo seems to struggle or not accept HEIC formats, some with travel photos,
// it causes forever loading."
//
// Forever is the exact word. `heic2any` decodes on the main thread, and a
// 12-megapixel HEIC off a recent iPhone takes anywhere from four seconds on a
// laptop to well over a minute on a mid-range phone - with the tab frozen
// throughout, so the spinner cannot even animate. There was no timeout, so a
// decode that was never going to finish looked identical to one that was about
// to. Thirty seconds is far longer than any decode that is going to succeed and
// far shorter than a creator's patience: past it, they get a sentence they can
// act on instead of a spinner they cannot.
function withTimeout(promise, ms, message) {
  let timer
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms) }),
  ])
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
export function compressImage(file, opts = {}) {
  // ONE DEADLINE OVER THE WHOLE THING, ON TOP OF THE PER-STEP ONES.
  //
  // Every individual await below is already bounded, and this is still worth
  // having: the per-step clocks bound each KNOWN step, and the guarantee the
  // caller needs is about the function, not about its parts. Anything added
  // here later - a new decode path, a new encoder - inherits the promise that
  // this settles, without whoever adds it having to remember. A spinner that
  // never stops is the single worst failure this app has shipped, twice, and
  // it should not be possible to reintroduce it by writing an ordinary await.
  return withTimeout(compressImageInner(file, opts), 100000, 'compress-timeout')
    .catch((err) => {
      if (err?.message !== 'compress-timeout') throw err
      throw new Error('That photo took too long to process on this device. Try a smaller one, or send it to yourself as a JPEG and upload that.')
    })
}

async function compressImageInner(file, { maxDim = 1280, quality = 0.82, format = 'webp' } = {}) {
  // Keep GIFs as-is (animation would be lost by canvas re-encoding).
  if (file.type === 'image/gif') return file
  const useWebp = format === 'webp' && canEncodeWebp()
  const outType = useWebp ? 'image/webp' : 'image/jpeg'
  const outExt = useWebp ? 'webp' : 'jpg'

  let source = file
  // THE BROWSER GETS FIRST REFUSAL, AND ON AN IPHONE IT ALWAYS WINS.
  //
  // The old code went straight to `heic2any` for anything that looked like a
  // HEIC. On Safari that is a 1.35 MB download and a slow software decode to
  // reproduce something the browser was already able to do instantly - and
  // Safari is where HEICs come from, so it was the common path that paid for
  // the rare one. The canvas below only needs a decodable bitmap; where the
  // browser can make one, the file goes through untouched and comes out the
  // other side as a normal WebP.
  //
  // The name and the type are asked first because they are free; the BYTES are
  // only read when both came back negative, so the common case never pays for
  // the sniff. See `sniffHeic`.
  // Order matters for cost: `canDecodeNatively` decodes the WHOLE image, and the
  // canvas step below is about to decode it again, so it is asked LAST and only
  // about files we already believe are HEIC. Reversing these two would put a
  // full second decode of every JPEG anybody ever uploads in front of the
  // upload.
  if ((isHeic(file) || await sniffHeic(file)) && !(await canDecodeNatively(file))) {
    if (!(await canRunBlobWorker())) {
      // We know the decode cannot run before we download 1.35 MB to attempt it.
      // This sentence is for us, not for the creator: it names the header, so
      // whoever reads the Sentry issue fixes the policy instead of the photo.
      throw new Error(
        'This browser is not allowed to run the photo converter '
        + '(Content-Security-Policy worker-src must include blob:). '
        + 'Please tell the Tryp.com team - and in the meantime a JPEG will upload fine.',
      )
    }
    try {
      const heic2any = (await import('heic2any')).default
      // NINETY SECONDS, NOT THIRTY, AND THE REASON IS THAT THE CLOCK NOW WORKS.
      //
      // The old 30s was set against a decode that could not finish at all, so
      // it was really a "give up" timer wearing a stopwatch's clothes, and it
      // had to be short because it fired on every single attempt. With the
      // worker actually running, the decode is off the main thread - the tab
      // stays responsive, the spinner animates, and the only thing this bounds
      // is a genuinely slow old phone chewing a 12-megapixel photo. Cutting
      // that off at 30s fails the exact creator most likely to be shooting
      // HEIC. It is a backstop against a hang, not a performance budget.
      const out = await withTimeout(
        heic2any({ blob: file, toType: 'image/jpeg', quality }),
        90000,
        'slow-decode',
      )
      const blob = Array.isArray(out) ? out[0] : out
      source = new File([blob], (file.name || 'photo').replace(/\.(heic|heif)$/i, '') + '.jpg', { type: 'image/jpeg' })
    } catch (err) {
      // NO MORE CAMERA-SETTINGS LECTURE.
      //
      // Ethan: "rather than this, can you properly build a way for it to
      // quickly convert or just accept any format." The old copy walked the
      // reader through Settings > Camera > Formats > Most Compatible and told
      // them to re-take the photograph - advice that could not possibly have
      // helped, because the conversion was being blocked by our own response
      // header, and which is useless anyway for the photo they already have and
      // want to use. Converting is our job. If we could not do it, that is our
      // failure and the sentence says so.
      throw new Error(
        err?.message === 'slow-decode'
          ? 'That photo took too long for us to convert here. Try a smaller one, or send it to yourself as a JPEG and upload that.'
          : 'We could not read that photo. Try another one, or send it to yourself as a JPEG and upload that.',
        { cause: err },
      )
    }
  }

  let decoded
  try {
    decoded = await decodeImage(source)
    if (!decoded) throw new Error('decode-failed')
    const scale = Math.min(1, maxDim / Math.max(decoded.width, decoded.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(decoded.width * scale))
    canvas.height = Math.max(1, Math.round(decoded.height * scale))
    // `drawImage` takes an ImageBitmap and an HTMLImageElement alike, which is
    // the whole reason `decodeImage` normalises to `{ source, width, height }`
    // rather than returning one or the other and making this branch.
    canvas.getContext('2d').drawImage(decoded.source, 0, 0, canvas.width, canvas.height)

    const blob = await encodeCanvas(canvas, outType, quality)
    if (!blob) throw new Error('encode-failed')
    // If compression made it bigger (tiny images), keep the (web-safe) source.
    if (blob.size >= source.size && WEB_SAFE.includes(source.type)) return source
    const newName = (source.name || 'photo').replace(/\.(png|webp|heic|heif|jpe?g)$/i, '') + '.' + outExt
    return new File([blob], newName, { type: outType })
  } catch {
    // Couldn't process it. A web-safe original still uploads/displays fine;
    // anything else can't, so tell the user rather than store a broken file.
    if (WEB_SAFE.includes(source.type)) return source
    throw new Error('We could not read that photo. Try another one, or send it to yourself as a JPEG and upload that.')
  } finally {
    // Frees the ImageBitmap, or revokes the object URL the <img> was built on.
    // Skipping this leaked a full-size decoded photo per attempt, which on the
    // phones this bug shows up on is precisely the wrong thing to leak.
    try { decoded?.close() } catch { /* already gone */ }
  }
}

// ENCODE, ALSO ON A CLOCK, ALSO WITH A SECOND WAY.
//
// `canvas.toBlob` takes a callback and has no failure path: a browser that
// cannot honour the request is permitted to simply never call it back, and iOS
// Safari does exactly that when the encoder runs out of memory. `toDataURL` is
// synchronous - it either returns a string or throws - so it cannot hang, which
// makes it the right last resort even though it costs a base64 round trip.
async function encodeCanvas(canvas, type, quality) {
  const viaBlob = await withTimeout(
    new Promise((resolve) => { canvas.toBlob(resolve, type, quality) }),
    15000,
    'encode-timeout',
  ).catch(() => null)
  if (viaBlob) return viaBlob

  try {
    const url = canvas.toDataURL(type, quality)
    const comma = url.indexOf(',')
    if (comma < 0) return null
    const bytes = atob(url.slice(comma + 1))
    const buf = new Uint8Array(bytes.length)
    for (let i = 0; i < bytes.length; i += 1) buf[i] = bytes.charCodeAt(i)
    // The browser may have ignored the type it was asked for (Safari did this
    // with WebP for years), so the blob is labelled with what actually came
    // back rather than with what we wanted.
    const actual = url.slice(5, url.indexOf(';')) || type
    return new Blob([buf], { type: actual })
  } catch {
    return null
  }
}
