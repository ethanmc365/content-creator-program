import { describe, expect, it } from 'vitest'
import { qrPath } from './qr'

describe('qrPath', () => {
  it('draws one unit square per dark module, nothing for light ones', () => {
    const m = { size: 2, dark: [true, false, false, true] }
    expect(qrPath(m)).toBe('M0 0h1v1h-1zM1 1h1v1h-1z')
  })
  it('is empty with no matrix', () => {
    expect(qrPath(null)).toBe('')
  })
})
