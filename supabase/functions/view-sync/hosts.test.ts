import { describe, expect, it } from 'vitest'
import { fetchHostAllowed, platformOf } from './hosts.ts'

describe('platformOf', () => {
  it('names the four platforms and their short links', () => {
    expect(platformOf('www.tiktok.com')).toBe('TikTok')
    expect(platformOf('vm.tiktok.com')).toBe('TikTok')
    expect(platformOf('youtu.be')).toBe('YouTube')
    expect(platformOf('fb.watch')).toBe('Facebook')
    expect(platformOf('www.instagram.com')).toBe('Instagram')
  })
  it('does not match look-alikes', () => {
    expect(platformOf('tiktok.com.evil.example')).toBeNull()
    expect(platformOf('eviltiktok.com')).toBeNull()
    expect(platformOf('169.254.169.254')).toBeNull()
  })
})

describe('fetchHostAllowed', () => {
  it('allows platform pages and the YouTube API', () => {
    expect(fetchHostAllowed('https://www.facebook.com/reel/1/')).toBe(true)
    expect(fetchHostAllowed('https://www.googleapis.com/youtube/v3/videos?id=x')).toBe(true)
  })
  it('refuses every other host and scheme, which is what stops a redirect leaving the platforms', () => {
    for (const bad of ['http://169.254.169.254/latest/meta-data', 'http://localhost:54321/', 'https://apps.apple.com/app/tiktok', 'file:///etc/passwd', 'javascript:alert(1)', 'not a url']) {
      expect(fetchHostAllowed(bad)).toBe(false)
    }
  })
})
