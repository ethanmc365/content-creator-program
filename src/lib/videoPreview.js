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
      const val = {
        thumbnail: j?.thumbnail_url || staticThumb || null,
        title: j?.title || null,
        author: j?.author_name || null,
      }
      // Only keep it if we actually got a thumbnail to show.
      const result = val.thumbnail ? val : (staticThumb ? { thumbnail: staticThumb, title: null, author: null } : null)
      cache.set(url, result)
      return result
    })
    .catch(() => {
      const val = staticThumb ? { thumbnail: staticThumb, title: null, author: null } : null
      cache.set(url, val)
      return val
    })
    .finally(() => inflight.delete(url))

  inflight.set(url, p)
  return p
}
