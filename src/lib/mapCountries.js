// Shared source of truth for country names that match the world map.
// The names come from the map's OWN world-atlas TopoJSON, so anything selected
// via a search/datalist lines up exactly with what the map highlights.
import { feature } from 'topojson-client'
import { geoCentroid } from 'd3-geo'

// 50m (medium-res) TopoJSON. The 110m file we used before dropped every small
// country (Monaco, Vatican, San Marino, Liechtenstein, Malta, Singapore, Cabo
// Verde, Andorra, Maldives, Seychelles…); the 50m file includes them all (241
// countries) while staying light enough to render cleanly. The 10m file has
// them too but is ~6x more detailed per country, which made react-simple-maps
// render one giant filled blob (a single path was ~2.4M chars) - so 50m is the
// sweet spot. Every name in the old 110m file is also in 50m, so existing saved
// selections still highlight.
export const GEO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json'

// ONE FETCH, ONE PARSE, FOR THE WHOLE SESSION.
//
// THE BUG THIS FIXES. Three different things wanted this file - the name list,
// the centroids, and every `<Geographies geography={GEO_URL}>` on the page -
// and each of them fetched and parsed it for itself. react-simple-maps takes a
// URL, fetches it and runs `feature()` PER INSTANCE, so the collab board, which
// draws a small world map on every trip card, was decoding a megabyte of
// TopoJSON and rebuilding 241 GeoJSON features six times over on open. The
// browser's HTTP cache spares the download; it does nothing about the parse,
// and the parse is what blocks the main thread while the cards above are
// mid-animation. That is the whole "the maps are slow to load and the animation
// isn't smooth" report.
//
// Now there is one promise. `loadMapFeatures()` resolves to the parsed
// FeatureCollection and everything else is derived from it - including the maps
// themselves, which pass the OBJECT to `<Geographies geography={...}>` and so
// never fetch or parse anything.
let topoInflight = null
let featureCache = null
let cache = null
let centroidCache = null

const EMPTY_FC = { type: 'FeatureCollection', features: [] }

export function loadMapFeatures() {
  if (featureCache) return Promise.resolve(featureCache)
  if (topoInflight) return topoInflight
  topoInflight = fetch(GEO_URL)
    .then((r) => r.json())
    .then((topo) => {
      featureCache = feature(topo, topo.objects.countries)
      return featureCache
    })
    .catch(() => (featureCache = EMPTY_FC))
  return topoInflight
}

// Map of country name -> [lng, lat] centroid, used to zoom a map onto a country.
export function loadMapCentroids() {
  if (centroidCache) return Promise.resolve(centroidCache)
  return loadMapFeatures().then((fc) => {
    if (centroidCache) return centroidCache
    const m = new Map()
    for (const f of fc.features) {
      const name = f.properties?.name
      if (name) m.set(name, geoCentroid(f))
    }
    centroidCache = m
    return m
  })
}

export function loadMapCountryNames() {
  if (cache) return Promise.resolve(cache)
  return loadMapFeatures().then((fc) => {
    if (cache) return cache
    cache = fc.features
      .map((f) => f.properties?.name)
      .filter((n) => n && n !== 'Antarctica')
      .sort((a, b) => a.localeCompare(b))
    return cache
  })
}

// Resolve free-text (e.g. "portugal") to the canonical map name ("Portugal"),
// or null if it doesn't match a country on the map.
export function canonicalCountry(input, names) {
  if (!input) return null
  const q = input.trim().toLowerCase()
  return names.find((n) => n.toLowerCase() === q) || null
}
