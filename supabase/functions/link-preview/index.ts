// Supabase Edge Function: link-preview
// Fetches a URL server-side and returns its Open Graph / meta card
// (title, description, image, site name) so the chat can render a link preview.
// Cross-origin OG scraping can't be done from the browser, hence this proxy.
//
// Safety: only public http(s) URLs, blocks localhost / private-range hosts
// (basic SSRF guard), short timeout, capped read. verify_jwt stays ON so only
// signed-in users can call it.
//
// Deploy:  supabase functions deploy link-preview

const PRIMARY_ORIGIN = 'https://trypcreators.vercel.app'
function allowOrigin(origin: string | null): string {
  if (!origin) return PRIMARY_ORIGIN
  try {
    const { hostname, protocol } = new URL(origin)
    const ok =
      (protocol === 'https:' && (hostname === 'trypcreators.vercel.app' || hostname === 'content-creator-program.vercel.app' || hostname.endsWith('.vercel.app'))) ||
      ((protocol === 'http:' || protocol === 'https:') && (hostname === 'localhost' || hostname === '127.0.0.1'))
    return ok ? origin : PRIMARY_ORIGIN
  } catch {
    return PRIMARY_ORIGIN
  }
}
function cors(req: Request) {
  return {
    'Access-Control-Allow-Origin': allowOrigin(req.headers.get('origin')),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}
const json = (req: Request, obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors(req), 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=86400' },
  })

// Block obviously-private / loopback / link-local hosts.
function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase()
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return true
  if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h)) return true
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true
  if (h === '::1' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80')) return true
  if (h === '169.254.169.254') return true // cloud metadata
  return false
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&#x2F;/gi, '/').replace(/&nbsp;/g, ' ')
}

// Pull a meta tag's content by property/name, tolerant of attribute order.
function metaContent(html: string, keys: string[]): string | null {
  for (const key of keys) {
    const re = new RegExp(
      `<meta[^>]+(?:property|name)=["']${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*>`,
      'i',
    )
    const tag = html.match(re)?.[0]
    if (tag) {
      const c = tag.match(/content=["']([^"']*)["']/i)?.[1]
      if (c) return decodeEntities(c.trim())
    }
  }
  return null
}

// NOTE: YouTube / TikTok serve a consent/bot page (no OG tags) to non-browser
// user-agents, so scraping them here fails. Those two are unfurled CLIENT-SIDE
// via their CORS-open oEmbed endpoints (see src/lib/linkPreview.js); this
// function handles general OG scraping for every other site.

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) })
  if (req.method !== 'POST') return json(req, { error: 'method not allowed' }, 405)

  const body = await req.json().catch(() => null)
  let target: URL
  try {
    target = new URL(String(body?.url ?? ''))
  } catch {
    return json(req, { error: 'bad url' }, 400)
  }
  if (!/^https?:$/.test(target.protocol) || isBlockedHost(target.hostname)) {
    return json(req, { error: 'url not allowed' }, 400)
  }

  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), 6000)
  try {
    const res = await fetch(target.toString(), {
      signal: ac.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TrypLinkPreview/1.0)', Accept: 'text/html,*/*' },
    })
    const ctype = res.headers.get('content-type') || ''
    if (!res.ok || !ctype.includes('text/html')) {
      // Not an HTML page (image/pdf/etc.) — nothing to unfurl.
      return json(req, { url: target.toString(), title: null, description: null, image: null, siteName: target.hostname })
    }
    // Read at most ~256KB — the <head> is all we need.
    const reader = res.body?.getReader()
    let html = ''
    if (reader) {
      const dec = new TextDecoder()
      let total = 0
      while (total < 262144) {
        const { done, value } = await reader.read()
        if (done) break
        total += value.length
        html += dec.decode(value, { stream: true })
        if (/<\/head>/i.test(html)) break
      }
      reader.cancel().catch(() => {})
    }

    let image = metaContent(html, ['og:image:secure_url', 'og:image', 'twitter:image', 'twitter:image:src'])
    if (image) { try { image = new URL(image, target).toString() } catch { image = null } }
    const preview = {
      url: target.toString(),
      title: metaContent(html, ['og:title', 'twitter:title']) || html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() || null,
      description: metaContent(html, ['og:description', 'twitter:description', 'description']),
      image,
      siteName: metaContent(html, ['og:site_name']) || target.hostname.replace(/^www\./, ''),
    }
    if (preview.title) preview.title = decodeEntities(preview.title)
    return json(req, preview)
  } catch (_e) {
    return json(req, { url: target.toString(), title: null, description: null, image: null, siteName: target.hostname }, 200)
  } finally {
    clearTimeout(timer)
  }
})
