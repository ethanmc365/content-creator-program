// Supabase Edge Function: geocode
// Turns a creator's free-text town ("London", "Dublin/ Sligo", "Florida") into
// coordinates for the creator map, using OpenStreetMap's Nominatim geocoder.
//
// Why server-side: the browser CSP only allows connect-src to our own hosts, and
// Nominatim's usage policy wants a descriptive User-Agent (which a browser can't
// set). Doing it here keeps the CSP unchanged and stays policy-compliant. Results
// are cached client-side and persisted on the profile, so this is called rarely
// (once per new/changed town), well within Nominatim's 1 req/sec guidance.
//
// verify_jwt stays ON: only signed-in creators geocode their own town.
//
// Deploy:  supabase functions deploy geocode

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
    // Cache a resolved town for a day at the edge; the same town resolves the same.
    headers: { ...cors(req), 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=86400' },
  })

// Normalise common shorthands so Nominatim resolves them reliably.
function normaliseCountry(c: string): string {
  const k = c.trim().toLowerCase().replace(/\.$/, '')
  const map: Record<string, string> = {
    uk: 'United Kingdom',
    'u.k': 'United Kingdom',
    'great britain': 'United Kingdom',
    england: 'United Kingdom',
    scotland: 'United Kingdom',
    wales: 'United Kingdom',
    'northern ireland': 'United Kingdom',
    us: 'United States',
    usa: 'United States',
    'u.s': 'United States',
    'u.s.a': 'United States',
    america: 'United States',
  }
  return map[k] || c.trim()
}

// A town field can be messy: "Dublin/ Sligo", "London (UK)". Take the first
// meaningful token so we geocode a single place.
function cleanCity(city: string): string {
  return city.split(/[/,(]/)[0].trim()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) })
  if (req.method !== 'POST') return json(req, { error: 'method not allowed' }, 405)

  let body: { city?: string; country?: string }
  try {
    body = await req.json()
  } catch {
    return json(req, { error: 'invalid body' }, 400)
  }

  const city = cleanCity((body.city || '').toString())
  const country = normaliseCountry((body.country || '').toString())
  if (!city && !country) return json(req, { error: 'city or country required' }, 400)

  const q = [city, country].filter(Boolean).join(', ')
  const url =
    'https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=0&limit=1&q=' +
    encodeURIComponent(q)

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        // Nominatim requires an identifying UA with contact info.
        'User-Agent': 'TrypCreatorProgram/1.0 (https://trypcreators.vercel.app; info@tryp.com)',
        'Accept': 'application/json',
      },
    })
    clearTimeout(timer)
    if (!res.ok) return json(req, { error: 'geocoder unavailable', found: false }, 200)
    const arr = await res.json()
    const hit = Array.isArray(arr) && arr[0]
    if (!hit) return json(req, { found: false }, 200)
    const lat = parseFloat(hit.lat)
    const lng = parseFloat(hit.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return json(req, { found: false }, 200)
    return json(req, { found: true, lat, lng, display_name: hit.display_name || q })
  } catch {
    return json(req, { error: 'geocode failed', found: false }, 200)
  }
})
