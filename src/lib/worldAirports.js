// EVERY AIRPORT IN THE WORLD, AS A BACKGROUND LAYER ON THE FLIGHT MAP.
//
// The brief: "you want every airport in the world... getting the right location
// of that airport, pinning it on the map with a little light orange circle. It
// needs a lazy load, compact asset and zoom tiered rendering. Ensure no airport
// is missed, and the map doesn't look absolutely cluttered when it's zoomed
// out - they should be smaller, and when you zoom in more it's a little bit
// bigger."
//
// THREE SEPARATE PROBLEMS, AND CONFLATING THEM IS HOW THIS GOES WRONG.
//
//   THE ASSET. 6,074 airports is 331KB of JSON, which has no business being in
//   the JavaScript bundle. It lives in public/geo, it is fetched ONCE per
//   session on the first map that wants it, and the promise is cached at module
//   scope so four components mounting together share one request rather than
//   racing. Built by scripts/gen-world-airports.py from OpenFlights; that file
//   documents where the data and the tiers come from.
//
//   THE COUNT. Six thousand dots drawn at world zoom is not a map, it is a
//   grey wash with a coastline behind it. Every airport carries a TIER from 0
//   (a major hub, or anywhere the app lets you log a flight to) to 3 (an
//   airstrip with no scheduled service), and the zoom decides how far down that
//   list to read. Zoomed out you get the hubs; zoom into northern Norway and
//   the local fields appear, because at that magnification there is room.
//
//   THE SIZE. Separate from the count, and the thing people mean when they say
//   a map is cluttered. See `dotRadius`.
//
// WHAT THIS IS NOT: the type-ahead. `lib/airports.js` is still the table behind
// the log form, still bundled, still about 700 rows. The two files overlap and
// that is deliberate - every code in the bundled table is forced to tier 0 here,
// so anywhere you can log a flight to is visible on the map at every zoom.

/** Zoom at which each tier is FULLY drawn. Tier 0 is always on. */
const TIER_ZOOM = [0, 1.8, 3.6, 7]

// A TIER FADES IN. IT DOES NOT POP.
//
// THE BUG: "when scrolling quickly in and out of the map, the airport dots are
// still visually appearing and disappearing."
//
// This used to be a hard cut - `tier <= tierAt(zoom)` - so the instant the zoom
// crossed 1.8, every tier-1 airport on Earth arrived on one frame, and crossing
// back deleted them on one frame. Wheel-zooming in and out over that boundary
// (which is where a lot of reading of this map actually happens) is therefore a
// strobe. The earlier fix in FlightMap made the CULLING WINDOW stable during a
// gesture, which was a real bug and a different one; the thresholds themselves
// were always going to flash.
//
// So each tier now has a BAND rather than an edge: it is invisible below
// `z / RAMP`, fully drawn above `z * RAMP`, and interpolated between. A tier
// arrives over roughly two thirds of a doubling of the zoom, which at any
// realistic wheel speed is several frames, so it reads as coming into focus.
// Nothing else changes: the count at rest, at every zoom, is what it was.
const TIER_RAMP = 1.3

/**
 * How strongly a tier is drawn at this zoom: 0 (not yet), 1 (fully), or a
 * fraction while it is arriving. Multiply the dot's own opacity by this.
 * @param {number} tier 0..3
 * @param {number} zoom
 * @returns {number} 0..1
 */
export function tierOpacity(tier, zoom) {
  const at = TIER_ZOOM[tier]
  if (!at) return 1                       // tier 0 is always on
  const from = at / TIER_RAMP
  const to = at * TIER_RAMP
  if (zoom <= from) return 0
  if (zoom >= to) return 1
  return (zoom - from) / (to - from)
}

/**
 * The deepest tier worth DRAWING at this zoom - i.e. the deepest one that has
 * begun to fade in. This is the cull limit, not the visibility test; a tier at
 * the bottom of its band is drawn at an opacity of nearly zero, which is the
 * point.
 * @param {number} zoom
 * @returns {number} 0..3
 */
export function tierAt(zoom) {
  let deepest = 0
  for (let t = 1; t < TIER_ZOOM.length; t += 1) {
    if (tierOpacity(t, zoom) > 0) deepest = t
  }
  return deepest
}

// HOW BIG A DOT IS, AND WHY IT SHRINKS AS YOU GO IN.
//
// Everything on this map is drawn in PROJECTION units inside a group that is
// scaled by the zoom, so a constant radius grows on screen exactly as fast as
// you zoom. Dividing by the zoom holds it at a fixed apparent size instead,
// which sounds correct and is not what is wanted: at world zoom the dots have
// to be small enough that 736 of them read as texture rather than noise, and
// zoomed right into one city you want the dot smaller still, because by then
// the thing you are looking at is the airport's POSITION, not the marker.
//
// IT IS EXACTLY `base / zoom` NOW: A CONSTANT SIZE ON SCREEN.
//
// This was `base / z^0.85` - which is an apparent `base * z^0.15`, so a dot
// grew from about 1.5px across at world zoom to 2.6px at maximum. The argument
// for that growth was that zoomed right in you are looking at a position rather
// than a marker, and it is a decent argument; it is not what was asked for.
// Ethan, on zooming in and out quickly: "fix this so it's just a constant
// scale." A dot that is quietly resizing throughout every gesture is the other
// half of what made this layer feel unstable, and the tier ramp above is only
// worth having if the thing being ramped is not also breathing.
//
// A falloff of exactly 1 cancels the group's scale, so the radius is fixed in
// SCREEN pixels at every magnification. The tier hierarchy stays - a tier-3
// airstrip is smaller than a hub, always, rather than only at some zooms.
//
// The floor is a guard against a zero radius and nothing more. A floor in MAP
// units is a trap the route markers fell into once: past the zoom where it
// bites, the radius stops falling and apparent size grows LINEARLY. At 0.04 it
// cannot bite below a zoom of about 37, which is far past the maximum.
const DOT_FALLOFF = 1
const TIER_BASE = [1.5, 1.25, 1.05, 0.85]
const MIN_RADIUS = 0.04

export function dotRadius(tier, zoom) {
  const base = TIER_BASE[tier] ?? TIER_BASE[3]
  return Math.max(MIN_RADIUS, base / Math.pow(zoom, DOT_FALLOFF))
}

import { WORLD_AIRPORTS_VERSION } from './worldAirportsVersion'

let pending = null

/**
 * Fetch and expand the world airport table. Cached: the second caller gets the
 * first caller's promise, and a failed fetch is not cached, so a map opened
 * again after a dropped connection retries rather than staying empty for ever.
 *
 * @returns {Promise<Array<{iata,name,city,country,lat,lng,tier}>>}
 */
export function loadWorldAirports() {
  if (pending) return pending
  // THE VERSION IN THE URL IS LOAD-BEARING. The file sits at a stable path with
  // a long cache header, so without it a regenerated table never reaches anyone
  // - which is exactly what happened when this went from 6,074 airports to
  // 8,809 and the map carried on drawing the old one. The hash is stamped by
  // scripts/gen-world-airports.py; see the note there.
  pending = fetch(`/geo/airports-world.json?v=${WORLD_AIRPORTS_VERSION}`)
    .then((r) => {
      if (!r.ok) throw new Error(`airports-world: ${r.status}`)
      return r.json()
    })
    .then((data) => {
      // Country codes are interned - 8,800 airports across 236 countries, and
      // "US" does not need storing 1,500 times. `country` is ISO-2, which is
      // what the map's own country layer keys on; it used to be the country's
      // NAME, and matching "United States" against the atlas's "United States
      // of America" by string is the sort of thing that works until it does not.
      const codes = data.countries || []
      return (data.rows || []).map((r) => ({
        iata: r[0], name: r[1], city: r[2], country: codes[r[3]] || '',
        lat: r[4], lng: r[5], tier: r[6],
      }))
    })
    .catch((err) => {
      // A background layer failing must never take the map with it. Forget the
      // rejection so the next mount can try again.
      pending = null
      throw err
    })
  return pending
}
