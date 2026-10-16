// Reading a video link without fetching it.
//
// The same rules the `view-sync` Edge Function applies server-side, kept here so
// the UI can name the platform and spot a hopeless link before spending a round
// trip on it. Pure functions only, so they are cheap to test - and they are
// tested (videoLinks.test.js) against the real shapes creators actually paste,
// which is share-sheet links far more often than canonical URLs.

export const PLATFORMS = ['Instagram', 'TikTok', 'YouTube', 'Facebook']

function hostOf(url) {
  try {
    return new URL(url.trim()).hostname
  } catch {
    return null
  }
}

export function platformOf(url) {
  if (typeof url !== 'string') return null
  // Anchored at BOTH ends: `tiktok.com.evil.test` is not TikTok, and treating it
  // as such would send a fetch at whoever owns that domain.
  const host = hostOf(url) ?? ''
  if (/(^|\.)tiktok\.com$/i.test(host)) return 'TikTok'
  if (/(^|\.)instagram\.com$/i.test(host)) return 'Instagram'
  if (/(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)$/i.test(host)) return 'YouTube'
  if (/(^|\.)(facebook\.com|fb\.com|fb\.watch|fb\.me)$/i.test(host)) return 'Facebook'
  return null
}

// A TikTok URL only carries the numeric id in canonical form. vm./vt. short
// links carry nothing at all and have to be followed, which only the server can
// do - so `null` here means "resolvable, but not from the browser", not "bad".
export function tiktokId(url) {
  if (typeof url !== 'string') return null
  return url.match(/\/(?:video|photo)\/(\d{6,})/)?.[1] ?? url.match(/[?&]item_id=(\d{6,})/)?.[1] ?? null
}

export function isTiktokShortLink(url) {
  const host = hostOf(url)
  return !!host && /^(vm|vt)\.tiktok\.com$/i.test(host)
}

// Every YouTube surface reduces to the same eleven-character id.
export function youtubeId(url) {
  if (typeof url !== 'string') return null
  return (
    url.match(/[?&]v=([A-Za-z0-9_-]{11})/)?.[1] ??
    url.match(/youtu\.be\/([A-Za-z0-9_-]{11})/)?.[1] ??
    url.match(/\/(?:shorts|embed|live|v)\/([A-Za-z0-9_-]{11})/)?.[1] ??
    null
  )
}

export function facebookId(url) {
  if (typeof url !== 'string') return null
  return url.match(/\/(?:videos|reel|video)\/(\d{6,})/)?.[1] ?? url.match(/[?&]v=(\d{6,})/)?.[1] ?? null
}

export function instagramShortcode(url) {
  if (typeof url !== 'string') return null
  return url.match(/instagram\.com\/(?:[^/]+\/)?(?:reels?|p|tv)\/([A-Za-z0-9_-]{5,})/)?.[1] ?? null
}

/** The id this link resolves to, whichever platform it belongs to. */
export function videoIdOf(url) {
  switch (platformOf(url)) {
    case 'TikTok': return tiktokId(url)
    case 'YouTube': return youtubeId(url)
    case 'Facebook': return facebookId(url)
    case 'Instagram': return instagramShortcode(url)
    default: return null
  }
}

// What the UI can say about a link before anything is fetched.
export function describeLink(url) {
  const platform = platformOf(url)
  if (!platform) {
    return {
      platform: null,
      ready: false,
      note: 'Only TikTok, Instagram, YouTube and Facebook links carry a view count we can read.',
    }
  }

  if (platform === 'TikTok') {
    const id = tiktokId(url)
    if (id) return { platform, id, ready: true, note: 'Canonical link, read in one request.' }
    if (isTiktokShortLink(url)) {
      return { platform, id: null, ready: true, note: 'Share-sheet link. It is followed once to find the video, then cached.' }
    }
    return { platform, id: null, ready: true, note: 'No id in the link. It will be followed to see where it lands.' }
  }

  if (platform === 'YouTube') {
    const id = youtubeId(url)
    return id
      ? { platform, id, ready: true, note: 'Exact count, read through the YouTube Data API.' }
      : { platform, id: null, ready: false, note: 'No video id in that YouTube link.' }
  }

  if (platform === 'Facebook') {
    const id = facebookId(url)
    return {
      platform,
      id,
      ready: true,
      note: 'Facebook link found. The exact play count is read off the public reel.',
    }
  }

  const code = instagramShortcode(url)
  if (!code) return { platform, id: null, ready: false, note: 'No post code in that Instagram link.' }
  return { platform, id: code, ready: true, note: 'Reel code found. Matched on the creator\u2019s public reels tab, signed out.' }
}

// PHOTO POSTS DO NOT COUNT (16 Oct 2026). A photo or a carousel has no view count on Instagram or Facebook, so an
// entry made of one scored nothing and sat "could not read" until the team typed a number in by hand. TikTok is left
// alone: its photo posts DO state views.
//
// What the link alone can say:
//   'photo'  refuse now. Facebook's share sheet names the kind in the path: /share/r/ is a reel, /share/v/ a video,
//            /share/p/ a post (every Facebook photo entry so far came as one), and /photo/, photo.php, /media/set are
//            pictures by name.
//   'check'  ask the server. An Instagram /p/ link is a reel OR a photo (a reel copied from a computer reads /p/),
//            and a Facebook /posts/ or story link can hold either.
//   null     nothing to ask: a reel, a video, or another platform.
export function postKindOf(url) {
  const platform = platformOf(url)
  if (platform === 'Facebook') {
    if (/\/share\/p\/|\/photos?(?:\/|\.php|$|\?)|\/media\/set/i.test(url)) return 'photo'
    if (/\/posts\/|permalink\.php|story\.php/i.test(url)) return 'check'
    return null
  }
  if (platform === 'Instagram') {
    if (/instagram\.com\/(?:[^/]+\/)?p\/[A-Za-z0-9_-]{5,}/i.test(url)) return 'check'
    return null
  }
  return null
}

/** How a challenge names what it accepts on each platform: Instagram and Facebook take Reels, never photo posts. */
export const PLATFORM_ACCEPTS = { Instagram: 'Instagram Reels', Facebook: 'Facebook Reels and videos' }
export function acceptsLabel(platform) { return PLATFORM_ACCEPTS[platform] || platform }
