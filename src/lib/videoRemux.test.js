import { describe, it, expect } from 'vitest'
import { ensureMp4Brand } from './videoRemux'

// Build a minimal ISO-BMFF file: a 20-byte ftyp box with the given major brand,
// followed by a tiny fake "moov" box so we can assert the tail is untouched.
function makeFile(majorBrand, { name = 'clip.mov' } = {}) {
  const ftyp = new Uint8Array([
    0, 0, 0, 20, // size = 20
    0x66, 0x74, 0x79, 0x70, // 'ftyp'
    majorBrand.charCodeAt(0), majorBrand.charCodeAt(1), majorBrand.charCodeAt(2), majorBrand.charCodeAt(3),
    0, 0, 0, 0, // minor
    majorBrand.charCodeAt(0), majorBrand.charCodeAt(1), majorBrand.charCodeAt(2), majorBrand.charCodeAt(3), // 1 compat brand
  ])
  const moov = new Uint8Array([0, 0, 0, 12, 0x6d, 0x6f, 0x6f, 0x76, 1, 2, 3, 4])
  const bytes = new Uint8Array([...ftyp, ...moov])
  return new File([bytes], name, { type: 'video/quicktime' })
}

async function bytesOf(file) {
  return new Uint8Array(await file.arrayBuffer())
}

describe('ensureMp4Brand', () => {
  it('rewrites a QuickTime (qt  ) brand to isom and marks it video/mp4', async () => {
    const out = await ensureMp4Brand(makeFile('qt  '))
    const b = await bytesOf(out)
    expect(String.fromCharCode(b[8], b[9], b[10], b[11])).toBe('isom') // major brand
    expect(out.type).toBe('video/mp4')
    expect(out.name).toMatch(/\.mp4$/)
  })

  it('keeps the box size and every downstream byte identical (offsets preserved)', async () => {
    const src = makeFile('qt  ')
    const before = await bytesOf(src)
    const after = await bytesOf(await ensureMp4Brand(src))
    expect(after.length).toBe(before.length) // no shift
    // moov box (bytes 20+) is byte-for-byte unchanged
    expect([...after.slice(20)]).toEqual([...before.slice(20)])
  })

  it('leaves an already-MP4 (isom) file untouched', async () => {
    const src = makeFile('isom', { name: 'clip.mp4' })
    const out = await ensureMp4Brand(src)
    expect(out).toBe(src) // same reference, no rewrite
  })

  it('ignores non-ISO-BMFF data', async () => {
    const src = new File([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])], 'x.bin')
    const out = await ensureMp4Brand(src)
    expect(out).toBe(src)
  })
})
