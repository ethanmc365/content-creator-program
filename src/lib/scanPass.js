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
 * @param {Blob|File|ImageBitmap|HTMLVideoElement} source
 * @returns {Promise<string|null>} the raw barcode text, or null
 */
export async function scanBarcode(source) {
  const native = nativeDetector()
  if (native) {
    try {
      const results = await native.detect(source)
      const hit = results?.find((r) => r.rawValue)
      if (hit) return hit.rawValue
    } catch {
      // A detector that throws on this frame is not a reason to give up; fall
      // through to the wasm one, which reads some angles the native one will
      // not.
    }
  }
  // The wasm reader takes a Blob, so a bitmap or a video frame has to be drawn
  // out first.
  const blob = await toBlob(source)
  if (!blob) return null
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
