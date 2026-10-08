import { supabase } from './supabase'

// Client helper for the `geocode` edge function. Turns a creator's free-text
// town into { lat, lng } so we can pin them on the creator map. Results are
// cached in localStorage (a town resolves to the same point forever) so we only
// ever hit the geocoder once per distinct town, per browser.
//
// Used two ways:
//  * on save (Onboarding / EditProfile) → store the coords on the profile.
//  * as a read-time fallback in CreatorMap for any legacy profile that has a
//    town but no stored coords yet, so nobody is silently missing from the map.

const CACHE_PREFIX = 'tryp_geocode_'
const MISS_TTL_MS = 7 * 24 * 3600 * 1000
// Misses remembered before the 8 Oct 2026 fix are not trusted: Nominatim was refusing every request from the edge,
// so "not found" then meant "never asked".
const MISS_TRUSTED_AFTER = Date.UTC(2026, 9, 8, 11, 0)
const mem = new Map() // in-session cache + in-flight de-dupe

function key(city, country) {
  return `${(city || '').trim().toLowerCase()}|${(country || '').trim().toLowerCase()}`
}

// Returns { lat, lng } or null. Never throws (geocoding is best-effort).
export async function geocodeCity(city, country) {
  if (!city && !country) return null
  const k = key(city, country)

  if (mem.has(k)) return mem.get(k)

  // localStorage cache (persists across sessions). A MISS IS REMEMBERED TOO, for a week (7 Oct
  // 2026): a town the geocoder cannot place ("Melbournr", "28821", "-") used to be asked for again
  // on every map view in every browser - 3,700 edge calls a day, each three writes to the rate
  // limiter, on the day the database ran out of room.
  try {
    const cached = localStorage.getItem(CACHE_PREFIX + k)
    if (cached) {
      const parsed = JSON.parse(cached)
      const missFresh = parsed && parsed.miss > MISS_TRUSTED_AFTER && Date.now() - parsed.miss < MISS_TTL_MS
      if (missFresh || (parsed && Number.isFinite(parsed.lat))) {
        const val = missFresh ? null : parsed
        mem.set(k, Promise.resolve(val))
        return val
      }
    }
  } catch {
    /* ignore storage errors */
  }

  const promise = (async () => {
    try {
      const { data, error } = await supabase.functions.invoke('geocode', {
        body: { city, country },
      })
      if (error || !data?.found) {
        // A real "not found" is kept for a week; an error (rate limit, offline) only for this session.
        if (!error) {
          try { localStorage.setItem(CACHE_PREFIX + k, JSON.stringify({ miss: Date.now() })) } catch { /* ignore */ }
        }
        return null
      }
      const val = { lat: data.lat, lng: data.lng }
      // A typo the geocoder corrected ("Melbournr" -> Melbourne). See suggestCity below.
      if (data.suggestion?.city) val.suggestion = { city: data.suggestion.city, country: data.suggestion.country || '' }
      try {
        localStorage.setItem(CACHE_PREFIX + k, JSON.stringify(val))
      } catch {
        /* ignore storage errors */
      }
      return val
    } catch {
      return null
    }
  })()

  mem.set(k, promise)
  return promise
}

const fold = (t) => (t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()

// "DID YOU MEAN MELBOURNE?" (8 Oct 2026). Ethan: "when you notice there's something wrong, suggest it. They
// could always change it again later". Returns { city, country } when the geocoder only found the town by
// correcting its spelling, and null when what was typed is already right (or could not be placed at all).
export async function suggestCity(city, country) {
  if (!city?.trim()) return null
  const hit = await geocodeCity(city, country)
  const s = hit?.suggestion
  if (!s?.city) return null
  const typed = fold(city.split(/[/,(]/)[0])
  if (fold(s.city) === typed) return null
  return { city: s.city, country: country?.trim() ? country.trim() : s.country }
}
