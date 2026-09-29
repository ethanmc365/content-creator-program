import { describe, expect, it } from 'vitest'
import { playsInline, videoEmbed } from './videoPreview'

// WHAT A CLICK ON AN ENTRY DOES. This decides between the in-app lightbox and
// opening the post on the platform, so getting it wrong is either a dead black
// rectangle or a needless trip out of the app.
describe('playsInline', () => {
  it('plays a reel, a TikTok video and a YouTube link', () => {
    expect(playsInline('https://www.instagram.com/reel/Cabc123/')).toBe(true)
    expect(playsInline('https://www.tiktok.com/@someone/video/7688651686713330966')).toBe(true)
    expect(playsInline('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true)
    expect(playsInline('https://youtu.be/dQw4w9WgXcQ')).toBe(true)
  })

  // The bug Ethan reported: a carousel has a perfectly good embed URL and
  // simply never plays.
  it('refuses an Instagram post, which is where carousels live', () => {
    expect(playsInline('https://www.instagram.com/p/Cabc123/')).toBe(false)
    expect(playsInline('https://instagram.com/someone/p/Cabc123/')).toBe(false)
    // …but a reel is still a reel.
    expect(playsInline('https://www.instagram.com/reels/Cabc123/')).toBe(true)
  })

  it('refuses a TikTok photo post', () => {
    expect(playsInline('https://www.tiktok.com/@someone/photo/7688651686713330966')).toBe(false)
  })

  it('refuses Facebook, which has no tokenless player at all', () => {
    expect(playsInline('https://www.facebook.com/share/r/1BKpq4JCDZ/')).toBe(false)
    expect(playsInline('https://fb.watch/abc123/')).toBe(false)
  })

  // The one genuine maybe: no id in the link, so it takes a lookup to know.
  it('gives a shortened TikTok link the benefit of the doubt', () => {
    expect(playsInline('https://vm.tiktok.com/ZGdabc123/')).toBe(true)
    expect(videoEmbed('https://vm.tiktok.com/ZGdabc123/')).toBeNull()
  })

  it('refuses a link it has never heard of, and nothing at all', () => {
    expect(playsInline('https://vimeo.com/12345')).toBe(false)
    expect(playsInline('')).toBe(false)
    expect(playsInline()).toBe(false)
  })
})
