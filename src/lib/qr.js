import { useEffect, useState } from 'react'

// A QR CODE, DRAWN BY US FROM ZXING'S MATRIX (28 Sep 2026).
//
// Ethan, on the boarding-pass certificate: "rather than the barcode, I was
// thinking you should have a QR code, and maybe the QR code could actually take
// you to the certificate ID website ... verifying it whenever you scan it."
//
// zxing-wasm is already the platform's barcode READER (lib/scanPass); its
// writer half encodes. The writer is 650 kB of WebAssembly, so it is imported
// only when something asks for a code, served from our own origin
// (`public/zxing_writer.wasm`, for the same CSP reason as the reader), and each
// text is encoded once per session. We take the module MATRIX rather than its
// ready-made SVG so the code can be drawn in the certificate's own colours and
// photographed by domSnapshot like any other shape.

let writerMod = null
async function writer() {
  if (writerMod) return writerMod
  const mod = await import('zxing-wasm/writer')
  mod.prepareZXingModule({
    overrides: { locateFile: (path, prefix) => (path.endsWith('.wasm') ? '/zxing_writer.wasm' : prefix + path) },
    fireImmediately: false,
  })
  writerMod = mod
  return writerMod
}

const cache = new Map()

/**
 * Encode `text` as a QR code.
 * @returns {Promise<{ size: number, dark: boolean[] } | null>} a size x size
 *   grid, row-major, true where a module is dark; null if encoding failed.
 */
export function qrMatrix(text) {
  const key = String(text || '')
  if (!key) return Promise.resolve(null)
  if (!cache.has(key)) {
    cache.set(key, (async () => {
      try {
        const mod = await writer()
        const res = await mod.writeBarcode(key, { format: 'QRCode', ecLevel: 'M', withQuietZones: false, scale: 1 })
        const sym = res?.symbol
        if (!sym || !sym.width || res.error) return null
        const dark = new Array(sym.width * sym.height)
        // One byte per module: 0 is black (dark), 255 white.
        for (let i = 0; i < dark.length; i++) dark[i] = sym.data[i] < 128
        return { size: sym.width, dark }
      } catch {
        cache.delete(key)
        return null
      }
    })())
  }
  return cache.get(key)
}

/** The matrix for `text`, or null while it is being made (or if it cannot be). */
export function useQrMatrix(text) {
  const [state, setState] = useState({ text: null, m: null })
  useEffect(() => {
    let alive = true
    qrMatrix(text).then((m) => { if (alive) setState({ text, m }) })
    return () => { alive = false }
  }, [text])
  return state.text === text ? state.m : null
}

/** One SVG path for every dark module, so a code is a single element. */
export function qrPath(m) {
  if (!m) return ''
  let d = ''
  for (let y = 0; y < m.size; y++) {
    for (let x = 0; x < m.size; x++) {
      if (m.dark[y * m.size + x]) d += `M${x} ${y}h1v1h-1z`
    }
  }
  return d
}
