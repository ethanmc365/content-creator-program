// Reading a video link without fetching it.
//
// The same rules the `view-sync` Edge Function applies server-side, kept here so
// the UI can name the platform and spot a hopeless link before spending a round
// trip on it. Pure functions only, so they are cheap to test - and they are
// tested (videoLinks.test.js) against the real shapes creators actually paste,
// which is share-sheet short links far more often than canonical URLs.

export const PLATFORMS = ['TikTok', 'Instagram']

export function platformOf(url) {
  if (typeof url !== 'string') return null
  // Anchored at BOTH ends: `tiktok.com.evil.test` is not TikTok, and treating
  // it as such would send a fetch at whoever owns that domain.
  const host = hostOf(url) ?? ''
  if (/(^|\.)tiktok\.com$/i.test(host)) return 'TikTok'
  if (/(^|\.)instagram\.com$/i.test(host)) return 'Instagram'
  return null
}

function hostOf(url) {
  try {
    return new URL(url.trim()).hostname
  } catch {
    return null
  }
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

// What the UI can say about a link before anything is fetched.
export function describeLink(url) {
  const platform = platformOf(url)
  if (!platform) {
    return { platform: null, ready: false, note: 'Only TikTok and Instagram links carry a view count we can read.' }
  }
  if (platform === 'TikTok') {
    const id = tiktokId(url)
    if (id) return { platform, id, ready: true, note: 'Canonical link, read in one request.' }
    if (isTiktokShortLink(url)) {
      return { platform, id: null, ready: true, note: 'Share-sheet link. It is followed once to find the video, then cached.' }
    }
    return { platform, id: null, ready: true, note: 'No id in the link. It will be followed to see where it lands.' }
  }
  const code = instagramShortcode(url)
  if (!code) return { platform, id: null, ready: false, note: 'No post code in that Instagram link.' }
  return { platform, id: code, ready: true, note: 'Reel code found. Instagram needs a signed-in session to show views.' }
}
