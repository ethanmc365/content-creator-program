// Shared source of truth for country names that match the world map.
// The names come from the map's OWN world-atlas TopoJSON, so anything selected
// via a search/datalist lines up exactly with what the map highlights.
export const GEO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json'

let cache = null
let inflight = null

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
