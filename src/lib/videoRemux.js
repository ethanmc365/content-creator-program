// Make iPhone videos playable in browsers WITHOUT re-encoding.
//
// iPhones record H.264/AAC (both web-safe codecs) but wrap them in a QuickTime
// container whose `ftyp` box declares the major brand `qt  `. Chrome, Firefox and
// Android WebView read that brand and treat the file as QuickTime — which they
// can't demux — so an inline <video> shows a black frame that never plays, even
// though we serve it as Content-Type: video/mp4. Safari plays it (native QT), so
// it "works on iPhone" but not elsewhere: exactly the reported symptom.
//
// The container is otherwise ISO-BMFF (the same box layout MP4 uses), so we can
// LOSSLESSLY convert it to a real MP4 by rewriting just the `ftyp` brand — no
// transcode, no quality loss, no heavy wasm. We keep the box the exact same size
// so every downstream atom offset (moov/mdat/stco) stays valid. Verified: a real
// iPhone clip's top-level atoms (ftyp/moov/wide/mdat) are byte-identical after
// the patch, only the 20-byte ftyp changes qt→isom.
//
// Anything that isn't a `qt  `-branded file (already-MP4, WebM, etc.) is returned
// untouched.
const MP4_BRANDS = ['isom', 'iso2', 'mp41', 'avc1']

function fourcc(str, buf, at) {
  for (let i = 0; i < 4; i++) buf[at + i] = str.charCodeAt(i)
}

export async function ensureMp4Brand(file) {
  try {
    const head = new Uint8Array(await file.slice(0, 16).arrayBuffer())
    // Expect an ISO-BMFF file: bytes 4..8 must spell "ftyp".
    if (head[4] !== 0x66 || head[5] !== 0x74 || head[6] !== 0x79 || head[7] !== 0x70) return file
    const major = String.fromCharCode(head[8], head[9], head[10], head[11])
    if (major !== 'qt  ') return file // already an MP4-family brand — leave it.

    const size = ((head[0] << 24) >>> 0) + (head[1] << 16) + (head[2] << 8) + head[3]
    if (size < 16 || size > 4096) return file // not a sane ftyp box — don't touch it.

    const buf = new Uint8Array(await file.arrayBuffer())
    fourcc('isom', buf, 8)                              // major brand
    buf[12] = 0; buf[13] = 0; buf[14] = 0x02; buf[15] = 0 // minor version 512
    // Overwrite the compatible-brand slots (bytes 16..size) in place.
    let bi = 0
    for (let off = 16; off + 4 <= size; off += 4) { fourcc(MP4_BRANDS[bi % MP4_BRANDS.length], buf, off); bi++ }

    const name = (file.name || 'video').replace(/\.(mov|qt|qtff)$/i, '') + '.mp4'
    return new File([buf], name, { type: 'video/mp4' })
  } catch {
    return file // never block an upload because the remux probe failed.
  }
}
