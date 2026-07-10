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
const mem = new Map() // in-session cache + in-flight de-dupe

function key(city, country) {
  return `${(city || '').trim().toLowerCase()}|${(country || '').trim().toLowerCase()}`
}

// Returns { lat, lng } or null. Never throws (geocoding is best-effort).
export async function geocodeCity(city, country) {
  if (!city && !country) return null
  const k = key(city, country)

  if (mem.has(k)) return mem.get(k)

  // localStorage cache (persists across sessions).
  try {
    const cached = localStorage.getItem(CACHE_PREFIX + k)
    if (cached) {
      const parsed = JSON.parse(cached)
      const val = parsed && Number.isFinite(parsed.lat) ? parsed : null
      mem.set(k, Promise.resolve(val))
      return val
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
        // Cache the miss briefly in-session so we don't hammer a bad town.
        return null
      }
      const val = { lat: data.lat, lng: data.lng }
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
