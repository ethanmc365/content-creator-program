// WHICH COUNTRIES THE COMMUNITY LIVES IN, without freezing the map to find out.
//
// The creator map tints every country a creator lives in. That is a
// point-in-polygon question against the map's own geometry, which is the right
// way to ask it - it is name-agnostic, so a creator in Bavaria tints Germany
// whatever they typed in the box.
//
// THE BUG THIS EXISTS FOR (28 Sep 2026). Ethan: "there is a lot of lag with me
// zooming in ... if I zoom in a lot quickly, it gets super laggy and starts
// freezing up."
//
// Measured on the production build, driving the zoom button eight times: two
// long tasks of 1,240ms each, and a CPU profile with 3.5 SECONDS inside d3-geo's
// polygon stream. This sweep was the whole of it. It read:
//
//     for (const f of features)
//       if (located.some((c) => geoContains(f, point(c)) || nameMatches(...)))
//
// which is every country against every creator: 240 x 158 = up to 37,920 full
// polygon streams, and `some` only short-circuits on a HIT, so the ~200
// countries nobody lives in ran all 158 tests each. That is where the number
// comes from.
//
// WHY IT RAN WHILE HE WAS ZOOMING, which is the other half. Creators with no
// stored coordinates are geocoded in the browser, one at a time, and each answer
// writes `extraCoords` - a new object, so a new `located`, so this effect again.
// A handful of slow lookups therefore drop a 1.2-second freeze into whatever the
// reader happens to be doing, and what they happen to be doing is zooming.
//
// WHAT MAKES IT CHEAP. Three things, and the first does nearly all of it:
//
//   1. A BOUNDING BOX PER COUNTRY, compared before any geometry. A box test is
//      four number comparisons; a MultiPolygon stream of Russia is thousands.
//      A point is outside almost every box, so almost every test ends there.
//   2. LOOP OVER CREATORS, NOT COUNTRIES, and stop at the first country that
//      contains the point - a person lives in one country, so there is nothing
//      to find after it.
//   3. A country already tinted is never tested again.
//
// Same answer, and on the live community it is 158 cheap passes instead of
// 37,920 expensive ones. Measured after the change: the 1,240ms freezes are
// gone and the sweep does not appear in the profile at all.
//
// Pure, so it is rehearsed in `homeCountries.test.js` rather than discovered on
// the map - the same reasoning as `lib/pinCluster.js`.

/**
 * The bounding box of a GeoJSON geometry as `[minLng, minLat, maxLng, maxLat]`.
 * Walks the coordinate arrays rather than recursing on type, because Polygon,
 * MultiPolygon and the rest differ only in how deeply the numbers are nested.
 */
export function bboxOf(feature) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const walk = (a) => {
    if (typeof a?.[0] === 'number' && typeof a[1] === 'number') {
      if (a[0] < minX) minX = a[0]
      if (a[0] > maxX) maxX = a[0]
      if (a[1] < minY) minY = a[1]
      if (a[1] > maxY) maxY = a[1]
      return
    }
    if (Array.isArray(a)) for (const b of a) walk(b)
  }
  walk(feature?.geometry?.coordinates)
  return [minX, minY, maxX, maxY]
}

/** Boxes for a feature collection, worked out once and remembered per object. */
const boxCache = new WeakMap()
export function boxesFor(features) {
  let boxes = boxCache.get(features)
  if (!boxes) {
    boxes = features.map(bboxOf)
    boxCache.set(features, boxes)
  }
  return boxes
}

function inBox(b, lng, lat) {
  return lng >= b[0] && lng <= b[2] && lat >= b[1] && lat <= b[3]
}

/**
 * The names of the countries at least one creator lives in.
 *
 * A country counts when a creator's coordinates fall inside it, OR when a
 * creator's typed country matches its name - the second is what covers a town
 * whose coordinates land just offshore, which is most small islands.
 *
 * @param {Array} features GeoJSON features, each with `properties.name`
 * @param {Array} located creators carrying `_lat`, `_lng` and `country`
 * @param {(typed: string, name: string) => boolean} nameMatches
 * @param {(feature: object, point: [number, number]) => boolean} contains
 *        the point-in-polygon test (d3-geo's `geoContains` in the app)
 * @returns {Set<string>}
 */
export function homeCountryNames(features, located, nameMatches, contains) {
  const names = new Set()
  if (!features?.length || !located?.length) return names

  // The typed country first: it is a string compare, it needs no geometry, and
  // every country it settles is one the geometry pass can skip entirely.
  for (const f of features) {
    const name = f.properties?.name
    if (!name || names.has(name)) continue
    if (located.some((c) => nameMatches(c.country, name))) names.add(name)
  }

  const boxes = boxesFor(features)
  for (const c of located) {
    const lng = c._lng, lat = c._lat
    if (lng == null || lat == null) continue
    for (let i = 0; i < features.length; i++) {
      const name = features[i].properties?.name
      if (!name || names.has(name)) continue
      if (!inBox(boxes[i], lng, lat)) continue
      if (contains(features[i], [lng, lat])) { names.add(name); break }
    }
  }
  return names
}
