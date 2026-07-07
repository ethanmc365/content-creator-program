import { describe, it, expect } from 'vitest'
import { isSignedDmPath } from './chatMedia'

// DM images are private storage paths that must be signed before rendering.
// Legacy messages hold a full public URL and must NOT be treated as a path.
describe('isSignedDmPath', () => {
  it('treats a bare storage path as needing a signed URL', () => {
    expect(isSignedDmPath('conv-id/1699999999999.jpg')).toBe(true)
  })
  it('leaves legacy public URLs alone', () => {
    expect(isSignedDmPath('https://x.supabase.co/storage/v1/object/public/chat-media/u/1.jpg')).toBe(false)
    expect(isSignedDmPath('http://localhost/x.jpg')).toBe(false)
  })
  it('handles empty / missing values', () => {
    expect(isSignedDmPath('')).toBe(false)
    expect(isSignedDmPath(null)).toBe(false)
    expect(isSignedDmPath(undefined)).toBe(false)
  })
})
