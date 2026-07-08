import { supabase } from './supabase'

// The first http(s) URL in a message body (trailing punctuation trimmed).
export function firstUrl(text) {
  if (!text) return null
  const m = text.match(/https?:\/\/[^\s<>()]+/i)
  return m ? m[0].replace(/[.,!?)\]]+$/, '') : null
}

// YouTube + TikTok hand a consent/bot page (no OG tags) to server-side scrapers,
// but their oEmbed endpoints are CORS-open and return a reliable title +
// thumbnail straight from the browser — so unfurl those two client-side.
async function clientOembed(url) {
  let host
  try { host = new URL(url).hostname.replace(/^www\./, '') } catch { return null }
  let endpoint = null
  let site = ''
  if (host === 'youtube.com' || host === 'youtu.be' || host.endsWith('.youtube.com')) { endpoint = 'https://www.youtube.com/oembed?format=json&url='; site = 'YouTube' }
  else if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) { endpoint = 'https://www.tiktok.com/oembed?url='; site = 'TikTok' }
  if (!endpoint) return null
  try {
    const r = await fetch(endpoint + encodeURIComponent(url))
    if (!r.ok) return null
    const j = await r.json()
    if (!j?.title && !j?.thumbnail_url) return null
    return { url, title: j.title ?? null, description: j.author_name ?? null, image: j.thumbnail_url ?? null, siteName: site }
  } catch {
    return null
  }
}

// Fetch an Open Graph card for a URL. YouTube/TikTok via client oEmbed, every
// other site via the `link-preview` edge function. Module-cached (+ in-flight
// dedup) so a URL is only unfurled once per session.
const cache = new Map()
const inflight = new Map()

export async function getLinkPreview(url) {
  if (!url) return null
  if (cache.has(url)) return cache.get(url)
  if (inflight.has(url)) return inflight.get(url)
  const p = (async () => {
    try {
      const oe = await clientOembed(url)
      if (oe) { cache.set(url, oe); return oe }
      const { data, error } = await supabase.functions.invoke('link-preview', { body: { url } })
      const preview = !error && data && (data.title || data.image) ? data : null
      cache.set(url, preview)
      return preview
    } catch {
      cache.set(url, null)
      return null
    } finally {
      inflight.delete(url)
    }
  })()
  inflight.set(url, p)
  return p
}
