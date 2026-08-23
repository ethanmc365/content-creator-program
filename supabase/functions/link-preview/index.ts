// Supabase Edge Function: link-preview
// Fetches a URL server-side and returns its Open Graph / meta card
// (title, description, image, site name) so the chat can render a link preview.
// Cross-origin OG scraping can't be done from the browser, hence this proxy.
//
// verify_jwt stays ON so only signed-in users can call it.
//
// ---------------------------------------------------------------------------
// THIS IS AN SSRF ENDPOINT AND IT HAS TO BE TREATED AS ONE
// ---------------------------------------------------------------------------
//
// It takes a URL from a user and fetches it from inside our infrastructure,
// then hands the CONTENT BACK. That is the textbook shape of Server-Side
// Request Forgery, and the August 2026 audit found the guard around it was
// three separate kinds of not-enough:
//
//   1. IT FOLLOWED REDIRECTS BLIND. `redirect: 'follow'` with the check done
//      only on the URL the user submitted. So `https://my-site.example/x`
//      returning `302 -> http://169.254.169.254/latest/meta-data/` walked
//      straight into the cloud metadata service and returned whatever the
//      <title> of that response was. That is the whole bypass in one line, and
//      it needed no cleverness at all.
//
//   2. IT MATCHED PRIVATE RANGES AS TEXT. `/^(127\.|10\.|192\.168\.)/` catches
//      dotted-decimal and nothing else. `http://2130706433/` is 127.0.0.1.
//      So is `http://0x7f.1/`, `http://017700000001/` and
//      `http://[::ffff:127.0.0.1]/`. None of them matched.
//
//   3. IT NEVER RESOLVED THE HOSTNAME. `http://internal.attacker-domain.com/`
//      with an A record pointing at 10.0.0.5 is a public-looking name and a
//      private address, and only DNS knows the difference.
//
// What it does now: parse and normalise the address, resolve every A/AAAA
// record and reject the request if ANY of them is private, restrict the port to
// 80/443, and follow redirects BY HAND so every hop goes through the same three
// checks. Plus a per-user rate limit, because an authenticated open fetcher is
// still a port scanner and a bandwidth bill.
//
// The residual risk that is NOT closed here is DNS rebinding: the name can
// resolve to a public address for our check and a private one microseconds
// later for the fetch. Closing that properly means connecting to the resolved
// IP with the Host header pinned, which Deno's fetch does not expose. It is
// documented in SECURITY.md rather than pretended away.
//
// Deploy:  supabase functions deploy link-preview
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { allowedTarget, isBlockedHost } from '../_shared/net.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const json = (req: Request, obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=86400' },
  })

// --------------------------------------------------------------------------
// Address checks
// --------------------------------------------------------------------------
//
// The judgement lives in _shared/net.ts, on its own and with a test beside it -
// it is the only thing between this endpoint and the metadata service, so it is
// not going to be a regex buried in a request handler.

/** Resolve, and refuse if ANY answer is private. Fails closed on a DNS error. */
const resolveHost = async (hostname: string): Promise<string[]> => {
  const out: string[] = []
  for (const kind of ['A', 'AAAA'] as const) {
    try {
      out.push(...(await Deno.resolveDns(hostname, kind)))
    } catch {
      // NXDOMAIN for AAAA is normal; only a total absence of answers is fatal,
      // and allowedTarget treats an empty list as a refusal.
    }
  }
  return out
}

const allowed = (url: URL) => allowedTarget(url, resolveHost)

// --------------------------------------------------------------------------
// Parsing the page
// --------------------------------------------------------------------------

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&#x2F;/gi, '/').replace(/&nbsp;/g, ' ')
}

// Pull a meta tag's content by property/name, tolerant of attribute order.
//
// `[^>]{0,600}` rather than `[^>]+`: the input is attacker-controlled HTML, and
// an unbounded run inside a repeated group is how a page full of `<meta` with
// no closing bracket turns 250KB into minutes of backtracking. No real meta tag
// is 600 characters wide.
function metaContent(html: string, keys: string[]): string | null {
  for (const key of keys) {
    const re = new RegExp(
      `<meta[^>]{0,600}?(?:property|name)=["']${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]{0,600}?>`,
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

const MAX_HOPS = 4
const MAX_BYTES = 262144
const TIMEOUT_MS = 6000

/** A preview with nothing in it. Returned for anything we decline to fetch. */
const blank = (url: URL) => ({
  url: url.toString(), title: null, description: null, image: null,
  siteName: url.hostname.replace(/^www\./, ''),
})

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return json(req, { error: 'method not allowed' }, 405)

  const body = await req.json().catch(() => null)
  let target: URL
  try {
    target = new URL(String(body?.url ?? ''))
  } catch {
    return json(req, { error: 'bad url' }, 400)
  }
  if (!(await allowed(target))) return json(req, { error: 'url not allowed' }, 400)

  // RATE LIMIT, because an authenticated open fetcher is still an open fetcher.
  // 60 previews per 10 minutes is far more than a person pasting links into a
  // chat and far less than a useful scanner. Keyed on the caller, and the JWT is
  // verified by the platform (verify_jwt is ON) so the id cannot be forged.
  const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
  const uid = jwt ? (() => {
    try { return JSON.parse(atob(jwt.split('.')[1] ?? ''))?.sub ?? null } catch { return null }
  })() : null
  if (uid) {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })
    const since = new Date(Date.now() - 600_000).toISOString()
    const { count } = await admin.from('auth_attempts').select('id', { count: 'exact', head: true })
      .eq('identifier', `preview:${uid}`).gte('created_at', since)
    if ((count ?? 0) >= 60) return json(req, { error: 'too many previews' }, 429)
    await admin.from('auth_attempts').insert({ identifier: `preview:${uid}` })
  }

  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS)
  try {
    // REDIRECTS ARE FOLLOWED BY HAND so every hop is checked. This is the fix
    // for the bypass described at the top of the file.
    let res: Response | null = null
    let current = target
    for (let hop = 0; hop < MAX_HOPS; hop++) {
      res = await fetch(current.toString(), {
        signal: ac.signal,
        redirect: 'manual',
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TrypLinkPreview/1.0)', Accept: 'text/html' },
      })
      if (res.status < 300 || res.status > 399) break
      const location = res.headers.get('location')
      if (!location) break
      let next: URL
      try { next = new URL(location, current) } catch { return json(req, blank(target)) }
      // The body of a redirect is not interesting and must not be left open.
      await res.body?.cancel().catch(() => {})
      if (!(await allowed(next))) return json(req, blank(target))
      current = next
      res = null
    }
    if (!res) return json(req, blank(target))

    const ctype = res.headers.get('content-type') || ''
    if (!res.ok || !ctype.includes('text/html')) {
      await res.body?.cancel().catch(() => {})
      return json(req, blank(target))
    }

    // Read at most ~256KB - the <head> is all we need.
    const reader = res.body?.getReader()
    let html = ''
    if (reader) {
      const dec = new TextDecoder()
      let total = 0
      while (total < MAX_BYTES) {
        const { done, value } = await reader.read()
        if (done) break
        total += value.length
        html += dec.decode(value, { stream: true })
        if (/<\/head>/i.test(html)) break
      }
      reader.cancel().catch(() => {})
    }

    let image = metaContent(html, ['og:image:secure_url', 'og:image', 'twitter:image', 'twitter:image:src'])
    if (image) {
      // The image URL is handed to a browser as an <img src>, so it gets the
      // same treatment: absolute, http(s), public.
      try {
        const abs = new URL(image, current)
        image = (abs.protocol === 'https:' || abs.protocol === 'http:') && !isBlockedHost(abs.hostname)
          ? abs.toString()
          : null
      } catch { image = null }
    }
    const preview = {
      url: target.toString(),
      title: metaContent(html, ['og:title', 'twitter:title'])
        || html.match(/<title[^>]{0,200}?>([^<]{0,300})<\/title>/i)?.[1]?.trim()
        || null,
      description: metaContent(html, ['og:description', 'twitter:description', 'description']),
      image,
      siteName: metaContent(html, ['og:site_name']) || target.hostname.replace(/^www\./, ''),
    }
    if (preview.title) preview.title = decodeEntities(preview.title)
    return json(req, preview)
  } catch (_e) {
    return json(req, blank(target))
  } finally {
    clearTimeout(timer)
  }
})
