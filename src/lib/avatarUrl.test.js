import { describe, it, expect } from 'vitest'
import { thumbUrl } from './avatarUrl'

// A map pin draws a circle 24 units across and was fetching the original
// upload to fill it: 82,743 bytes, measured on production, times forty pins.
// Ethan: "it takes a lot of time for the profile pictures to load in on the
// pins." These pin the rules that keep the rewrite safe to put in front of
// every `photo_url` in the codebase.

const OURS = 'https://heuhqqoxyggawuckxocp.supabase.co/storage/v1/object/public/avatars/abc/avatar-1.jpg'

describe('thumbUrl', () => {
  it('points at the small sibling file written at upload time, never the billed transform endpoint', () => {
    expect(thumbUrl(OURS, 32)).toBe('https://heuhqqoxyggawuckxocp.supabase.co/storage/v1/object/public/avatars/abc/t-1.jpg')
    expect(thumbUrl(OURS, 32)).not.toContain('/render/')
  })

  it('serves the one 192px thumbnail up to 64 drawn px, and the original above that', () => {
    expect(thumbUrl(OURS, 64)).toContain('/t-1.jpg')
    expect(thumbUrl(OURS, 112)).toBe(OURS)
  })

  it('handles every extension an avatar was stored with', () => {
    expect(thumbUrl(OURS.replace('.jpg', '.webp'), 32)).toContain('/t-1.jpg')
    expect(thumbUrl(OURS.replace('.jpg', '.png'), 32)).toContain('/t-1.jpg')
  })

  it('leaves other buckets alone: no thumbnail sibling exists for a gallery photo', () => {
    const g = 'https://heuhqqoxyggawuckxocp.supabase.co/storage/v1/object/public/gallery/abc/photo-1.jpg'
    expect(thumbUrl(g, 32)).toBe(g)
  })

  // A profile photo can be a Google account picture from OAuth, and handing an
  // external URL to the transform endpoint is a 400, not a smaller picture.
  it('leaves anything that is not our own bucket exactly as it found it', () => {
    const google = 'https://lh3.googleusercontent.com/a/ACg8ocK=s96-c'
    expect(thumbUrl(google, 32)).toBe(google)
    expect(thumbUrl('/brand/tryp-logo.png', 32)).toBe('/brand/tryp-logo.png')
  })

  it('is safe to call twice', () => {
    const once = thumbUrl(OURS, 32)
    expect(thumbUrl(once, 32)).toBe(once)
  })

  it('will not append to a URL that already carries a query of its own', () => {
    const signed = `${OURS}?token=abc`
    expect(thumbUrl(signed, 32)).toBe(signed)
  })

  it('passes nothing through as nothing, rather than inventing a URL', () => {
    expect(thumbUrl('', 32)).toBe('')
    expect(thumbUrl(null, 32)).toBe(null)
    expect(thumbUrl(undefined, 32)).toBe(undefined)
  })
})
