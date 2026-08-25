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

// Instagram's own base64 alphabet. The shortcode in /reel/<code>/ IS the media
// id encoded against it, so one converts to the other with no lookup.
const IG_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

export function instagramShortcode(url) {
  if (typeof url !== 'string') return null
  return url.match(/instagram\.com\/(?:[^/]+\/)?(?:reels?|p|tv)\/([A-Za-z0-9_-]{5,})/)?.[1] ?? null
}

export function instagramMediaId(shortcode) {
  if (!shortcode) return null
  let n = 0n
  for (const ch of shortcode) {
    const i = IG_ALPHABET.indexOf(ch)
    if (i < 0) return null
    n = n * 64n + BigInt(i)
  }
  return n.toString()
}

// Whose profile a link belongs to. Instagram view counts are read off the
// creator's public reels tab, so the handle is what the reader needs, and a
// wrong one sends it to the wrong profile - or, if a route word slipped through,
// to instagram.com/reel/reels/ as though "reel" were a person. The Edge Function
// applies the same rule (igHandleFrom); this exists so the rule is pinned by a
// test. Handles are compared lower-case because Instagram treats them that way.
const INSTAGRAM_ROUTES = new Set([
  'p', 'reel', 'reels', 'tv', 'explore', 'stories', 'accounts', 'direct', 'api', 'graphql', 's',
])

export function instagramHandleFrom(url) {
  if (typeof url !== 'string' || !url.trim()) return null
  let first
  try {
    const u = new URL(url.trim())
    if (!/(^|\.)instagram\.com$/i.test(u.hostname)) return null
    first = u.pathname.split('/').filter(Boolean)[0]
  } catch {
    // Not a URL: accept a bare handle, with or without the @.
    first = url.trim().replace(/^@/, '')
  }
  if (!first || INSTAGRAM_ROUTES.has(first.toLowerCase())) return null
  return /^[A-Za-z0-9._]{1,30}$/.test(first) ? first.toLowerCase() : null
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
      note: 'Facebook only states a rounded figure, so the count is saved as approximate.',
    }
  }

  const code = instagramShortcode(url)
  if (!code) return { platform, id: null, ready: false, note: 'No post code in that Instagram link.' }
  return { platform, id: code, ready: true, note: 'Reel code found. Matched on the creator\u2019s public reels tab, signed out.' }
}
