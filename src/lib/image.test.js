import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { sniffHeic } from './image'

// RECOGNISING THE FILE IS HALF OF ACCEPTING IT.
//
// Ethan asked us to "just accept any format", and accepting starts with
// recognising: a photo that has been through AirDrop or a share sheet arrives
// with an empty MIME type and no extension, so the bytes are the only honest
// answer. A file we fail to recognise as HEIC goes straight to
// `createImageBitmap`, fails there, and is refused as an unsupported format -
// when it is in fact the one format we know how to convert.

/** An ISO-BMFF header: 4 bytes of length, `ftyp`, then the major brand. */
function ftyp(brand) {
  const bytes = new Uint8Array(16)
  bytes.set([0, 0, 0, 16], 0)
  bytes.set([...'ftyp'].map((c) => c.charCodeAt(0)), 4)
  bytes.set([...brand].map((c) => c.charCodeAt(0)), 8)
  return new Blob([bytes])
}

describe('sniffHeic', () => {
  it('recognises the ordinary iPhone brands', async () => {
    for (const brand of ['heic', 'heix', 'mif1', 'msf1', 'hevc']) {
      expect(await sniffHeic(ftyp(brand)), brand).toBe(true)
    }
  })

  // THE BRAND THAT BROKE THE OLD CONVERTER. `tmap` is Apple's tone-mapped HDR
  // still, which is what every iPhone has shot since iOS 18.
  it("recognises Apple's HDR tone-map brand", async () => {
    expect(await sniffHeic(ftyp('tmap'))).toBe(true)
  })

  it('leaves formats the browser decodes itself alone', async () => {
    for (const brand of ['avif', 'mp42', 'qt  ']) {
      expect(await sniffHeic(ftyp(brand)), brand).toBe(false)
    }
  })

  it('says no rather than throwing on something that is not ISO-BMFF at all', async () => {
    expect(await sniffHeic(new Blob([new Uint8Array([1, 2, 3])]))).toBe(false)
    expect(await sniffHeic(new Blob([]))).toBe(false)
  })
})

// THE CONVERTER'S AGE IS A CORRECTNESS PROPERTY.
//
// `heic2any@0.0.4` was published in 2021 and bundles a libheif from before
// derived images existed, so it answered `ERR_LIBHEIF format not supported` -
// in nine milliseconds - for every photograph taken on a current iPhone. It was
// not slow and it was not hanging; it simply could not read the format. Two
// earlier rounds of work went into timeouts and a Content-Security-Policy
// header, both of which were real faults and neither of which was this one.
//
// This test exists so that going back is a red build rather than a quiet
// regression somebody reports a month later.
describe('the HEIC decoder', () => {
  const pkg = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'))
  const deps = { ...pkg.dependencies, ...pkg.devDependencies }

  it('is a maintained one', () => {
    expect(deps['heic-to']).toBeTruthy()
  })

  it('is not heic2any, which cannot read a photo from any current iPhone', () => {
    expect(deps.heic2any).toBeUndefined()
  })
})
