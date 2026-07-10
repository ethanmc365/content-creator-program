// Shared source of truth for country names that match the world map.
// The names come from the map's OWN world-atlas TopoJSON, so anything selected
// via a search/datalist lines up exactly with what the map highlights.
import { feature } from 'topojson-client'
import { geoCentroid } from 'd3-geo'

// 10m (high-res) TopoJSON: unlike the 110m file it includes EVERY country,
// down to the microstates (Monaco, Vatican, San Marino, Liechtenstein, Malta,
// Singapore, Cabo Verde, Andorra, Maldives, Seychelles…). Every name present in
// the old 110m file is also present here, so existing saved selections still
// highlight; it just adds the ~78 smaller countries that were missing before.
export const GEO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-10m.json'

let cache = null
let inflight = null
let centroidCache = null
let centroidInflight = null

// Map of country name -> [lng, lat] centroid, used to zoom a map onto a country.
export function loadMapCentroids() {
  if (centroidCache) return Promise.resolve(centroidCache)
  if (centroidInflight) return centroidInflight
  centroidInflight = fetch(GEO_URL)
    .then((r) => r.json())
    .then((topo) => {
      const fc = feature(topo, topo.objects.countries)
      const m = new Map()
      for (const f of fc.features) {
        const name = f.properties?.name
        if (name) m.set(name, geoCentroid(f))
      }
      centroidCache = m
      return m
    })
    .catch(() => (centroidCache = new Map()))
  return centroidInflight
}

export function loadMapCountryNames() {
  if (cache) return Promise.resolve(cache)
  if (inflight) return inflight
  inflight = fetch(GEO_URL)
    .then((r) => r.json())
    .then((topo) => {
      const geoms = topo?.objects?.countries?.geometries || []
      cache = geoms
        .map((g) => g.properties?.name)
        .filter((n) => n && n !== 'Antarctica')
        .sort((a, b) => a.localeCompare(b))
      return cache
    })
    .catch(() => (cache = []))
  return inflight
}

// Resolve free-text (e.g. "portugal") to the canonical map name ("Portugal"),
// or null if it doesn't match a country on the map.
export function canonicalCountry(input, names) {
  if (!input) return null
  const q = input.trim().toLowerCase()
  return names.find((n) => n.toLowerCase() === q) || null
}
