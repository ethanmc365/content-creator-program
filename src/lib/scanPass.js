// TURNING A PHOTOGRAPH OF A BOARDING PASS INTO A BARCODE STRING.
//
// `lib/bcbp` knows how to read the string; this is the part that gets it off a
// photograph. Two decoders, in this order:
//
//   1. `BarcodeDetector`, the browser's own. Chrome and Chrome on Android have
//      it, it is hardware-accelerated, it costs nothing to load, and it reads
//      PDF417 and Aztec - the two symbologies a boarding pass ever uses.
//
//   2. zxing-wasm, lazily, for everybody else. Safari has never shipped
//      `BarcodeDetector` and iOS is most of this community, so "use the native
//      one" on its own would mean the feature does not exist for the people it
//      was built for.
//
// THE WASM IS A MEGABYTE AND IT IS NEVER LOADED UNTIL SOMEBODY SCANS. It is
// behind a dynamic import inside a function that only runs on a button press,
// so a creator who never scans a pass never pays for it. It is also served from
// our own origin (`public/zxing_reader.wasm`) rather than the CDN the library
// defaults to: `default-src 'self'` would block the CDN outright, and a feature
// that depends on jsdelivr being up is a feature that breaks without warning.
// WebAssembly instantiation needs `'wasm-unsafe-eval'` in script-src - that is
// in vercel.json, and it is gated by script-src rather than connect-src, which
// is the thing everybody gets wrong once.
//
// WHAT A PASS LOOKS LIKE IN PRACTICE. A printed pass photographed at an angle,
// a phone screen photographed off another phone, or - most often for this
// community - a SCREENSHOT of the Apple Wallet pass. All three are the same
// problem: find a PDF417 or Aztec somewhere in the frame. Both decoders are
// asked to try hard rather than fast, because this is a one-shot operation a
// person is waiting on, not a video loop.

const FORMATS = ['pdf417', 'aztec', 'qr_code', 'data_matrix']

function nativeDetector() {
  if (typeof window === 'undefined') return null
  const BD = window.BarcodeDetector
  if (!BD) return null
  try { return new BD({ formats: FORMATS }) } catch { return null }
}

/** Is there any way at all to decode on this device? Always yes now, but the
 *  UI asks so it can say "this may take a moment" only when it is true. */
export function scanNeedsDownload() {
  return !nativeDetector()
}

let zxing = null
async function zxingReader() {
  if (zxing) return zxing
  const mod = await import('zxing-wasm/reader')
  // Serve the binary from our own origin. See the note above.
  mod.prepareZXingModule({
    overrides: { locateFile: (path, prefix) => (path.endsWith('.wasm') ? '/zxing_reader.wasm' : prefix + path) },
    fireImmediately: false,
  })
  zxing = mod
  return zxing
}

/**
 * Read the first boarding-pass barcode out of an image.
 *
 * ROTATION IS NOT OPTIONAL AND THAT IS WHY THE PAPER PASS NEVER WORKED.
 *
 * Ethan's Aer Lingus pass out of Oslo prints its PDF417 turned on its side: a
 * tall narrow strip down the left edge of the ticket rather than the wide short
 * band the symbology is normally laid out in. Photograph that and hand it to a
 * decoder and you get nothing, every time, on a barcode that is in perfect
 * condition. `BarcodeDetector` has no rotation option AT ALL, and zxing's
 * `tryRotate` is a hint that does not reliably cover a quarter turn on PDF417.
 *
 * The fix is to stop hinting and just try it: draw the image at 0, 90, 270 and
 * 180 degrees and decode each one. 90 and 270 come before 180 because a
 * sideways barcode is the case this exists for, and an upside-down one is
 * rarer than a mirrored camera.
 *
 * AND ONLY FOR A FILE, NEVER FOR THE LIVE CAMERA. The camera loop runs every
 * 400ms and the person holding the phone can simply turn it, so paying four
 * decodes a tick there would make the viewfinder lag for no gain. A picked
 * photo is one shot with somebody waiting on it, so it gets everything.
 *
 * @param {Blob|File|ImageBitmap|HTMLVideoElement} source
 * @param {{exhaustive?: boolean}} [opts] `exhaustive` turns on the rotations
 *   and the upscale. Use it for a chosen file, not for a video frame.
 * @returns {Promise<string|null>} the raw barcode text, or null
 */
export async function scanBarcode(source, { exhaustive = false } = {}) {
  const blob = await toBlob(source)
  if (!blob) return null

  // Straight on first. This is the only attempt the camera loop makes, and it
  // is the one that succeeds for every app-issued pass.
  const direct = await decodeBlob(blob)
  if (direct || !exhaustive) return direct

  let bitmap
  try {
    bitmap = await createImageBitmap(blob)
  } catch {
    // No `createImageBitmap` (or a file the browser cannot decode as an image).
    // The straight-on attempt above already happened, so there is nothing left.
    return null
  }

  try {
    for (const deg of [90, 270, 180]) {
      const turned = await rasterise(bitmap, deg, 1)
      const hit = turned && await decodeBlob(turned)
      if (hit) return hit
    }

    // LAST RESORT: DOUBLE IT. A photograph taken from far enough back that the
    // barcode is a couple of hundred pixels wide has bars narrower than one
    // pixel, and no amount of trying harder recovers a bar that was never
    // sampled. Upscaling cannot invent detail, but it does give the binarizer
    // something to threshold, and it is the difference between a read and a
    // miss on a picture taken across a table. Only for genuinely small images -
    // doubling a 12 megapixel photo is a way to run out of memory on a phone.
    const longest = Math.max(bitmap.width, bitmap.height)
    if (longest < 1600) {
      for (const deg of [0, 90, 270]) {
        const big = await rasterise(bitmap, deg, 2)
        const hit = big && await decodeBlob(big)
        if (hit) return hit
      }
    }
  } finally {
    bitmap.close?.()
  }
  return null
}

/** Both decoders, native first, against one image. */
async function decodeBlob(blob) {
  const native = nativeDetector()
  if (native) {
    try {
      const results = await native.detect(blob)
      const hit = results?.find((r) => r.rawValue)
      if (hit) return hit.rawValue
    } catch {
      // A detector that throws on this frame is not a reason to give up; fall
      // through to the wasm one, which reads some angles the native one will
      // not.
    }
  }
  try {
    const { readBarcodes } = await zxingReader()
    const results = await readBarcodes(blob, {
      formats: ['PDF417', 'Aztec', 'QRCode', 'DataMatrix'],
      // A person is waiting on this, and a boarding pass photographed on a
      // table is rarely square to the camera.
      tryHarder: true,
      tryRotate: true,
      tryInvert: true,
      maxNumberOfSymbols: 4,
    })
    const hit = results?.find((r) => r.text)
    return hit?.text || null
  } catch {
    return null
  }
}

/**
 * Redraw a bitmap turned by `deg` and scaled by `scale`.
 *
 * The canvas is sized to the RESULT, so a quarter turn swaps width and height -
 * getting that the wrong way round crops the image to a square and throws away
 * exactly the long thin strip a sideways PDF417 lives in.
 *
 * PNG, not JPEG: a barcode is hard edges, and JPEG ringing around a hard edge
 * is precisely the artefact that makes a marginal read fail.
 */
async function rasterise(bitmap, deg, scale) {
  if (typeof document === 'undefined') return null
  const swap = deg === 90 || deg === 270
  const w = Math.round((swap ? bitmap.height : bitmap.width) * scale)
  const h = Math.round((swap ? bitmap.width : bitmap.height) * scale)
  if (!w || !h || w * h > 40e6) return null
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingQuality = 'high'
  ctx.translate(w / 2, h / 2)
  ctx.rotate((deg * Math.PI) / 180)
  ctx.drawImage(bitmap, (-bitmap.width * scale) / 2, (-bitmap.height * scale) / 2,
    bitmap.width * scale, bitmap.height * scale)
  return new Promise((res) => canvas.toBlob(res, 'image/png'))
}

async function toBlob(source) {
  if (source instanceof Blob) return source
  if (typeof document === 'undefined') return null
  const w = source.videoWidth || source.width
  const h = source.videoHeight || source.height
  if (!w || !h) return null
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d').drawImage(source, 0, 0, w, h)
  return new Promise((res) => canvas.toBlob(res, 'image/png'))
}
