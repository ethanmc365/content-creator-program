// Fetches a lightweight preview (thumbnail + title) for a submitted video link
// using free, tokenless oEmbed endpoints. No view counts (those need per-creator
// OAuth) - just enough to make submission cards look rich.
//
//  * TikTok  - https://www.tiktok.com/oembed (tokenless, CORS-open)
//  * YouTube - https://www.youtube.com/oembed (tokenless, CORS-open) + a
//              guaranteed static thumbnail derived from the video id.
//  * Instagram - oEmbed needs a Facebook app token since 2020, so we can't fetch
//              it client-side; those cards fall back to a branded placeholder.
//
// Results are cached in-memory (per page load) and in-flight requests are
// de-duplicated, so a grid of cards never hammers the endpoints.

const cache = new Map() // url -> { thumbnail, title, author } | null
const inflight = new Map() // url -> Promise

export function detectPlatformFromUrl(url = '') {
  const u = url.toLowerCase()
  if (u.includes('instagram.com')) return 'Instagram'
  if (u.includes('tiktok.com')) return 'TikTok'
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'YouTube'
  return 'Other'
}

// Pull the 11-char video id out of the common YouTube URL shapes.
export function youtubeId(url = '') {
  const m =
    url.match(/[?&]v=([\w-]{11})/) ||
    url.match(/youtu\.be\/([\w-]{11})/) ||
    url.match(/youtube\.com\/(?:shorts|embed)\/([\w-]{11})/)
  return m ? m[1] : null
}

// A thumbnail we can build with zero network calls (YouTube only).
export function staticThumbnail(url = '') {
  const id = youtubeId(url)
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null
}

// Build an in-app embed for a submitted link so an entry plays INSIDE the
// platform (in a lightbox) instead of bouncing out to the app/site. Returns
// { type, embedUrl, vertical } or null when we can't build one (a shortened
// vm.tiktok.com link with no id, a private post, an unknown host) - the caller
// then falls back to opening the original link in a new tab.
//
//  * YouTube   - youtube-nocookie.com/embed/{id}  (16:9, or 9:16 for Shorts)
//  * TikTok    - tiktok.com/player/v1/{id}        (official tokenless player)
//  * Instagram - instagram.com/{reel|p|tv}/{code}/embed  (tokenless embed page)
export function videoEmbed(url = '') {
  const platform = detectPlatformFromUrl(url)
  if (platform === 'YouTube') {
    const id = youtubeId(url)
    if (!id) return null
    return {
      type: 'YouTube',
      embedUrl: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&playsinline=1`,
      vertical: /\/shorts\//.test(url),
    }
  }
  if (platform === 'TikTok') {
    const m = url.match(/\/video\/(\d+)/) || url.match(/[?&]item_id=(\d+)/)
    if (!m) return null
    return {
      type: 'TikTok',
      embedUrl: `https://www.tiktok.com/player/v1/${m[1]}?autoplay=1&controls=1&loop=0`,
      vertical: true,
    }
  }
  if (platform === 'Instagram') {
    const m = url.match(/instagram\.com\/(?:[^/]+\/)?(reel|reels|p|tv)\/([A-Za-z0-9_-]+)/i)
    if (!m) return null
    const kind = m[1].toLowerCase() === 'reels' ? 'reel' : m[1].toLowerCase()
    return {
      type: 'Instagram',
      embedUrl: `https://www.instagram.com/${kind}/${m[2]}/embed/`,
      vertical: true,
    }
  }
  return null
}

// Like videoEmbed(), but for a shortened TikTok link (vm.tiktok.com/...) with no
// id in the URL it falls back to the oEmbed lookup to resolve the numeric video
// id, so those entries can still play inline. Async; resolves to null when we
// truly can't embed.
export async function resolveVideoEmbed(url = '') {
  const direct = videoEmbed(url)
  if (direct) return direct
  if (detectPlatformFromUrl(url) === 'TikTok') {
    const p = await getVideoPreview(url)
    if (p?.videoId) {
      return {
        type: 'TikTok',
        embedUrl: `https://www.tiktok.com/player/v1/${p.videoId}?autoplay=1&controls=1&loop=0`,
        vertical: true,
      }
    }
  }
  return null
}

// Best-effort preview. Never throws - resolves to null when nothing is available.
export function getVideoPreview(url) {
  if (!url) return Promise.resolve(null)
  if (cache.has(url)) return Promise.resolve(cache.get(url))
  if (inflight.has(url)) return inflight.get(url)

  const platform = detectPlatformFromUrl(url)
  const staticThumb = staticThumbnail(url)

  // Instagram / unknown links: no tokenless oEmbed. Cache the static thumb
  // (usually null) so we don't retry.
  if (platform === 'Instagram' || platform === 'Other') {
    const val = staticThumb ? { thumbnail: staticThumb, title: null, author: null } : null
    cache.set(url, val)
    return Promise.resolve(val)
  }

  const endpoint =
    platform === 'TikTok'
      ? `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`
      : `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`

  const p = fetch(endpoint)
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      // TikTok oEmbed resolves shortened vm.tiktok.com links and its html
      // carries the numeric video id, which lets us build an inline player even
      // when the original URL has no id in it.
      let videoId = null
      if (platform === 'TikTok' && j?.html) {
        const m = j.html.match(/data-video-id="(\d+)"/) || j.html.match(/\/video\/(\d+)/)
        if (m) videoId = m[1]
      }
      const thumbnail = j?.thumbnail_url || staticThumb || null
      // Keep the row if we got a thumbnail OR a resolvable video id.
      const result = (thumbnail || videoId)
        ? { thumbnail, title: j?.title || null, author: j?.author_name || null, videoId }
        : null
      cache.set(url, result)
      return result
    })
    .catch(() => {
      const val = staticThumb ? { thumbnail: staticThumb, title: null, author: null, videoId: null } : null
      cache.set(url, val)
      return val
    })
    .finally(() => inflight.delete(url))

  inflight.set(url, p)
  return p
}
