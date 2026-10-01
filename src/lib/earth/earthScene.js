import { geoArea, geoBounds, geoCentroid, geoDistance, geoGraticule10, geoInterpolate, geoOrthographic, geoPath } from 'd3-geo'

// THE TURNING EARTH, AS A SCENE THAT DOES NOT CARE WHERE IT RUNS (1 Oct 2026).
//
// Ethan: "the entire platform is super laggy... Let me know if the worldwide map with the animations in the background
// and the Europe map is really slowing the whole platform down." It was. The Earth redrew all 240 countries of the
// atlas sixty times a second ON THE MAIN THREAD - the thread that also scrolls the page, runs every other animation
// and answers every tap - and each market card ran a second loop of its own. Two or three of those on the Challenges
// page was most of a phone's frame budget gone before the page did anything.
//
// The drawing lives here so it can run in a Web Worker on an OffscreenCanvas (lib/earth/earthWorker.js), where it
// cannot hold up anything the reader touches. Browsers without OffscreenCanvas run the same scene on the main thread,
// but cheaper than before: the far side of the planet is never drawn, the atlas is thinned harder (it is a 300px
// globe) and the loop runs at 30fps.

export const CITIES = [
  [-0.13, 51.51], [-3.7, 40.42], [-9.14, 38.72], [2.35, 48.86], [13.4, 52.52], [26.1, 44.43],
  [18.07, 59.33], [-6.26, 53.35], [12.5, 41.9], [28.98, 41.01], [-74.0, 40.71], [-118.24, 34.05],
  [-99.13, 19.43], [-46.63, -23.55], [-58.38, -34.6], [3.38, 6.52], [31.24, 30.04], [18.42, -33.92],
  [36.82, -1.29], [55.27, 25.2], [72.88, 19.08], [103.82, 1.35], [100.5, 13.76], [139.69, 35.69],
  [126.98, 37.57], [151.21, -33.87], [-79.38, 43.65], [114.17, 22.32], [-43.2, -22.9], [24.94, 60.17],
]
const ROUTES = [[0, 10], [1, 13], [2, 15], [3, 19], [4, 23], [5, 18], [6, 21], [0, 25], [1, 12], [3, 22]]
const PLANE_D = 'M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z'
const FLIGHT_MS = 9000

/** Thin the atlas for a small globe and note where each country sits, so the far side can be skipped. */
export function prepareLand(fc, keepEvery = 4) {
  const ring = (r) => (r.length > 16 ? r.filter((_, i) => i % keepEvery === 0 || i === r.length - 1) : r)
  // A ring wound the other way is the rest of the planet (see the old SpinningEarth): turn it round.
  const rewind = (f) => (geoArea(f) > 2 * Math.PI ? {
    ...f,
    geometry: f.geometry.type === 'Polygon'
      ? { ...f.geometry, coordinates: f.geometry.coordinates.map((r) => [...r].reverse()) }
      : { ...f.geometry, coordinates: f.geometry.coordinates.map((p) => p.map((r) => [...r].reverse())) },
  } : f)
  const out = []
  for (const f of fc?.features || []) {
    const g = f.geometry
    if (!g) continue
    let t = f
    if (g.type === 'Polygon') t = rewind({ ...f, geometry: { ...g, coordinates: g.coordinates.map(ring) } })
    else if (g.type === 'MultiPolygon') t = rewind({ ...f, geometry: { ...g, coordinates: g.coordinates.map((p) => p.map(ring)) } })
    if (geoArea(t) > 2 * Math.PI) continue
    const c = geoCentroid(t)
    const [[w, s], [e, n]] = geoBounds(t)
    // The furthest corner of the country's box from its centre: if the centre is further than 90deg + this from the
    // middle of the view, no part of the country can be on the visible side.
    const reach = Math.max(geoDistance(c, [w, s]), geoDistance(c, [e, n]), geoDistance(c, [w, n]), geoDistance(c, [e, s]))
    out.push({ f: t, c, reach: Number.isFinite(reach) ? Math.min(Math.PI, reach) : Math.PI })
  }
  return out
}

export function createEarthScene(ctx, { tilt = -18, makePath2D } = {}) {
  const projection = geoOrthographic().clipAngle(90).precision(1)
  const path = geoPath(projection, ctx)
  const graticule = geoGraticule10()
  const sphere = { type: 'Sphere' }
  const routes = ROUTES.map(([a, b]) => ({ type: 'LineString', coordinates: [CITIES[a], CITIES[b]] }))
  const interps = ROUTES.map(([a, b]) => geoInterpolate(CITIES[a], CITIES[b]))
  const plane = makePath2D ? makePath2D(PLANE_D) : null
  let land = []
  let size = 0

  return {
    setLand(prepared) { land = prepared || [] },
    resize(px, dpr) {
      size = Math.max(1, Math.round(px))
      ctx.canvas.width = Math.round(size * dpr)
      ctx.canvas.height = Math.round(size * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      projection.translate([size / 2, size / 2]).scale(size / 2 - 2)
    },
    draw(t, lambda) {
      if (!size) return
      projection.rotate([lambda, tilt, 0])
      ctx.clearRect(0, 0, size, size)
      const c = size / 2
      const glow = ctx.createRadialGradient(c * 0.7, c * 0.62, size * 0.05, c, c, c)
      glow.addColorStop(0, 'rgba(255,255,255,0.20)')
      glow.addColorStop(0.7, 'rgba(255,255,255,0.07)')
      glow.addColorStop(1, 'rgba(255,255,255,0.02)')
      ctx.beginPath(); path(sphere); ctx.fillStyle = glow; ctx.fill()

      ctx.beginPath(); path(graticule)
      ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 0.7; ctx.stroke()

      const centre = [-lambda, -tilt]
      if (land.length) {
        ctx.beginPath()
        for (const l of land) {
          if (geoDistance(l.c, centre) - l.reach > Math.PI / 2) continue
          path(l.f)
        }
        ctx.fillStyle = 'rgba(255,255,255,0.19)'; ctx.fill()
        ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.lineWidth = 0.5; ctx.stroke()
      }

      ctx.setLineDash([3, 4])
      ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1
      ctx.beginPath()
      for (const r of routes) path(r)
      ctx.stroke()
      ctx.setLineDash([])

      const planeSize = Math.max(9, size / 34)
      interps.forEach((f, i) => {
        const k = ((t / FLIGHT_MS) + i / interps.length) % 1
        // Take-off and landing: fade and grow over the first and last 12% of the route.
        const ramp = Math.min(1, k / 0.12, (1 - k) / 0.12)
        const ease = ramp * ramp * (3 - 2 * ramp)
        if (ease <= 0.01) return
        const here = f(k)
        const away = geoDistance(here, centre)
        if (away > Math.PI / 2 - 0.02) return
        const a = projection(here)
        const b = projection(f(Math.min(1, k + 0.02)))
        const c2 = projection(f(Math.max(0, k - 0.02)))
        if (!a || !b || !c2) return
        const angle = Math.atan2(b[1] - c2[1], b[0] - c2[0]) + Math.PI / 2
        const edge = Math.min(1, (Math.PI / 2 - away) / 0.35)
        const alpha = 0.98 * edge * ease
        if (plane) {
          const sc = (planeSize / 24) * (0.55 + 0.45 * ease)
          ctx.save()
          ctx.translate(a[0], a[1]); ctx.rotate(angle); ctx.scale(sc, sc); ctx.translate(-11.5, -12)
          ctx.fillStyle = `rgba(255,255,255,${alpha})`
          ctx.fill(plane)
          ctx.restore()
        }
      })

      CITIES.forEach((p, i) => {
        if (geoDistance(p, centre) > Math.PI / 2) return
        const pulse = 0.5 + 0.5 * Math.sin(t / 700 + i * 1.7)
        path.pointRadius(Math.max(3, size / 110) * (1 + pulse * 0.6))
        ctx.beginPath(); path({ type: 'Point', coordinates: p })
        ctx.fillStyle = `rgba(255,255,255,${0.10 + 0.12 * pulse})`; ctx.fill()
        path.pointRadius(Math.max(1.3, size / 300))
        ctx.beginPath(); path({ type: 'Point', coordinates: p })
        ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fill()
      })

      ctx.beginPath(); path(sphere)
      ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 1; ctx.stroke()
    },
  }
}
