import { describe, it, expect } from 'vitest'
import { thumbUrl } from './avatarUrl'

// A map pin draws a circle 24 units across and was fetching the original
// upload to fill it: 82,743 bytes, measured on production, times forty pins.
// Ethan: "it takes a lot of time for the profile pictures to load in on the
// pins." These pin the rules that keep the rewrite safe to put in front of
// every `photo_url` in the codebase.

const OURS = 'https://heuhqqoxyggawuckxocp.supabase.co/storage/v1/object/public/avatars/abc/avatar-1.jpg'

describe('thumbUrl', () => {
  it('asks the edge for the size it is actually drawn at', () => {
    const out = thumbUrl(OURS, 32)
    expect(out).toContain('/storage/v1/render/image/public/avatars/abc/avatar-1.jpg')
    expect(out).toContain('resize=cover')
  })

  it('doubles for retina, because the sharp version is still tiny', () => {
    expect(thumbUrl(OURS, 32)).toContain('width=64')
    expect(thumbUrl(OURS, 64)).toContain('width=128')
  })

  it('never goes below a floor, so a decorative avatar is still a face', () => {
    expect(thumbUrl(OURS, 1)).toContain('width=16')
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
