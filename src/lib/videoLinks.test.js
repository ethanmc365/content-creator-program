import { describe, it, expect } from 'vitest'
import {
  platformOf,
  tiktokId,
  isTiktokShortLink,
  youtubeId,
  facebookId,
  instagramShortcode,
  instagramMediaId,
  videoIdOf,
  describeLink,
} from './videoLinks'

// The cases here are the shapes that are actually in the submissions table, not
// invented ones. Creators paste whatever the share sheet gives them, which is a
// vm.tiktok.com stub most of the time and a canonical URL with forty tracking
// parameters the rest of it.

describe('platform detection', () => {
  it('names all four platforms we can read', () => {
    expect(platformOf('https://vm.tiktok.com/ZN8dY7Qxm/')).toBe('TikTok')
    expect(platformOf('https://www.tiktok.com/@sh.orms/video/7667272639412440342')).toBe('TikTok')
    expect(platformOf('https://www.instagram.com/reel/DbTKSGui3F9/')).toBe('Instagram')
    expect(platformOf('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('YouTube')
    expect(platformOf('https://youtu.be/dQw4w9WgXcQ')).toBe('YouTube')
    expect(platformOf('https://www.facebook.com/reel/1041137542129999')).toBe('Facebook')
    expect(platformOf('https://fb.watch/abc123/')).toBe('Facebook')
  })

  it('does not guess at anything else', () => {
    expect(platformOf('https://vimeo.com/12345')).toBeNull()
    expect(platformOf('not a url')).toBeNull()
    expect(platformOf(null)).toBeNull()
  })

  // A hostname check, not a substring one: a URL can mention another site in
  // its path or query and must not be claimed on that basis.
  it('reads the host, not the whole string', () => {
    expect(platformOf('https://example.com/?next=https://tiktok.com/@a/video/123')).toBeNull()
    expect(platformOf('https://tiktok.com.evil.test/video/123')).toBeNull()
    expect(platformOf('https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ')).toBeNull()
    expect(platformOf('https://facebook.com.evil.test/reel/123456789')).toBeNull()
  })
})

describe('tiktok ids', () => {
  it('finds the id in a canonical link, tracking parameters and all', () => {
    expect(tiktokId('https://www.tiktok.com/@sh.orms/video/7667272639412440342?_r=1&u_code=x&share_app_id=1233')).toBe(
      '7667272639412440342',
    )
  })

  it('handles photo posts, which carry stats the same way', () => {
    expect(tiktokId('https://www.tiktok.com/@a/photo/7669022134382972182')).toBe('7669022134382972182')
  })

  // Not a failure: a short link is resolvable, just not without a request.
  it('returns nothing for a share-sheet link but recognises one', () => {
    expect(tiktokId('https://vm.tiktok.com/ZN8dY7Qxm/')).toBeNull()
    expect(isTiktokShortLink('https://vm.tiktok.com/ZN8dY7Qxm/')).toBe(true)
    expect(isTiktokShortLink('https://vt.tiktok.com/ZSabc123/')).toBe(true)
    expect(isTiktokShortLink('https://www.tiktok.com/@a/video/7667272639412440342')).toBe(false)
  })
})

describe('youtube ids', () => {
  it('reads every surface a creator might paste', () => {
    expect(youtubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(youtubeId('https://youtu.be/dQw4w9WgXcQ?si=xyz')).toBe('dQw4w9WgXcQ')
    expect(youtubeId('https://www.youtube.com/shorts/tPEE9ZwTmy0')).toBe('tPEE9ZwTmy0')
    expect(youtubeId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    // a playlist link with the video still in it
    expect(youtubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLabc')).toBe('dQw4w9WgXcQ')
  })

  it('returns nothing for a channel or a malformed id', () => {
    expect(youtubeId('https://www.youtube.com/@sometraveller')).toBeNull()
    expect(youtubeId('https://www.youtube.com/watch?v=tooshort')).toBeNull()
  })
})

describe('facebook ids', () => {
  it('reads the shapes Facebook hands out', () => {
    expect(facebookId('https://www.facebook.com/reel/1041137542129999')).toBe('1041137542129999')
    expect(facebookId('https://www.facebook.com/100003258369689/videos/1593649765491272/')).toBe('1593649765491272')
    expect(facebookId('https://www.facebook.com/watch/?v=2170178560576547')).toBe('2170178560576547')
  })

  // fb.watch carries nothing until it is followed, which only the server can do.
  it('finds nothing in a share link, which is not a failure', () => {
    expect(facebookId('https://fb.watch/xY9aBc/')).toBeNull()
  })
})

describe('one id, whichever platform', () => {
  it('routes to the right reader', () => {
    expect(videoIdOf('https://www.youtube.com/shorts/tPEE9ZwTmy0')).toBe('tPEE9ZwTmy0')
    expect(videoIdOf('https://www.instagram.com/reel/DbTKSGui3F9/')).toBe('DbTKSGui3F9')
    expect(videoIdOf('https://www.tiktok.com/@a/video/7667272639412440342')).toBe('7667272639412440342')
    expect(videoIdOf('https://www.facebook.com/reel/1041137542129999')).toBe('1041137542129999')
    expect(videoIdOf('https://vimeo.com/12345')).toBeNull()
  })
})

describe('instagram codes', () => {
  it('reads reel, post and tv links, with or without a handle in the path', () => {
    expect(instagramShortcode('https://www.instagram.com/reel/DbTKSGui3F9/')).toBe('DbTKSGui3F9')
    expect(instagramShortcode('https://www.instagram.com/p/DbjKzotjAv0/?igsh=bnU5')).toBe('DbjKzotjAv0')
    expect(instagramShortcode('https://www.instagram.com/denisahadarau_/reel/DbpxlShtiot/')).toBe('DbpxlShtiot')
    expect(instagramShortcode('https://www.instagram.com/reels/DbVZdZHtbhg/')).toBe('DbVZdZHtbhg')
  })

  it('strips the igsh share parameter rather than swallowing it into the code', () => {
    expect(instagramShortcode('https://www.instagram.com/reel/DcJwJHEMJ4L/?igsh=MW93NTl2MThhZXRwZQ==')).toBe(
      'DcJwJHEMJ4L',
    )
  })

  // The shortcode IS the media id in Instagram's own base64. Getting this wrong
  // means asking the API about somebody else's post, so it is pinned to values
  // checked against the live API.
  it('decodes a shortcode to the numeric media id', () => {
    expect(instagramMediaId('DbTKSGui3F9')).toBe('3950546522773090685')
    expect(instagramMediaId('DbVZdZHtbhg')).toBe('3951176219087976544')
    expect(instagramMediaId('DcE2C7AM_hw')).toBe('3964531267297605744')
  })

  it('refuses a code containing a character outside the alphabet', () => {
    expect(instagramMediaId('bad code!')).toBeNull()
    expect(instagramMediaId(null)).toBeNull()
  })
})

describe('what the UI is told before fetching', () => {
  it('marks readable links ready and says how they will be read', () => {
    expect(describeLink('https://vm.tiktok.com/ZN8dY7Qxm/')).toMatchObject({ platform: 'TikTok', ready: true })
    expect(describeLink('https://www.instagram.com/reel/DbTKSGui3F9/')).toMatchObject({
      platform: 'Instagram',
      id: 'DbTKSGui3F9',
      ready: true,
    })
  })

  it('warns that a Facebook number is rounded', () => {
    expect(describeLink('https://www.facebook.com/reel/1041137542129999').note).toMatch(/rounded|approximate/i)
  })

  it('turns away what it cannot read, with a reason', () => {
    const other = describeLink('https://vimeo.com/12345')
    expect(other.ready).toBe(false)
    expect(other.note).toMatch(/TikTok, Instagram, YouTube and Facebook/)

    const noCode = describeLink('https://www.instagram.com/denisahadarau_/')
    expect(noCode.ready).toBe(false)
  })
})
