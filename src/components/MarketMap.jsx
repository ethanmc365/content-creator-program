import { useEffect, useRef } from 'react'
import { geoArea, geoBounds, geoCentroid, geoDistance, geoGraticule10, geoInterpolate, geoOrthographic, geoPath } from 'd3-geo'
import { loadMapFeatures } from '../lib/mapCountries'
import { COUNTRIES } from '../lib/countries'
import { cx } from '../lib/utils'

// THE MARKET'S OWN COUNTRY, ON THE CARD OF ITS CHALLENGE (1 Oct 2026).
//
// Ethan: "I think you could maybe not have the Portugal flag but have the actual zoomed-in map of Europe with Portugal
// highlighted in the background. It's kind of animated the way we have the worldwide thing rotating in the background
// ... Properly build that in for all of the markets, showing the appropriate country, obviously. For the Nordics you
// can show all of them ... a generic card with data for future markets."
//
// NOTHING IS STORED PER MARKET. A market already says which countries it covers (`country_codes`); this finds those
// countries in the atlas the rest of the app draws, centres the view on them, and zooms to the width they cover (a
// small country is shown among its neighbours, a spread of countries like the Nordics fills the frame). So a market
// created next month has its map the moment it exists, and there is no table of "map settings" to fall out of date.
//
// It is the same real atlas and the same canvas technique as SpinningEarth (one parse for the session, a thinned
// copy, no DOM per frame, stops when off screen or the tab is hidden, one still frame under reduced motion), but the
// globe is held steady and drifts a few degrees about its centre instead of turning, so the country stays in view.

// Names the atlas spells differently from our own country list.
const ATLAS_NAME = {
  'Czech Republic': 'Czechia',
  'United States': 'United States of America',
  'Bosnia and Herzegovina': 'Bosnia and Herz.',
  'North Macedonia': 'North Macedonia',
  'Dominican Republic': 'Dominican Rep.',
}

const CITIES = [
  [-0.13, 51.51], [-3.7, 40.42], [-9.14, 38.72], [2.35, 48.86], [13.4, 52.52], [26.1, 44.43],
  [18.07, 59.33], [-6.26, 53.35], [12.5, 41.9], [28.98, 41.01], [24.94, 60.17], [10.75, 59.91],
  [12.57, 55.68], [4.9, 52.37], [16.37, 48.21], [21.01, 52.23], [23.72, 37.98], [14.42, 50.08],
  [-8.61, 41.15], [2.17, 41.39], [-0.38, 39.47], [8.54, 47.37], [19.04, 47.5], [30.52, 50.45],
]

const PLANE = typeof Path2D === 'function'
  ? new Path2D('M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z')
  : null

const FLIGHT_MS = 11000

let thinned = null
function thin(fc) {
  if (thinned) return thinned
  const ring = (r) => (r.length > 12 ? r.filter((_, i) => i % 2 === 0 || i === r.length - 1) : r)
  // See SpinningEarth: a ring wound the other way is the rest of the planet.
  const rewind = (f) => (geoArea(f) > 2 * Math.PI ? {
    ...f,
    geometry: f.geometry.type === 'Polygon'
      ? { ...f.geometry, coordinates: f.geometry.coordinates.map((r) => [...r].reverse()) }
      : { ...f.geometry, coordinates: f.geometry.coordinates.map((p) => p.map((r) => [...r].reverse())) },
  } : f)
  thinned = {
    type: 'FeatureCollection',
    features: (fc?.features || []).map((f) => {
      const g = f.geometry
      if (!g) return f
      if (g.type === 'Polygon') return rewind({ ...f, geometry: { ...g, coordinates: g.coordinates.map(ring) } })
      if (g.type === 'MultiPolygon') return rewind({ ...f, geometry: { ...g, coordinates: g.coordinates.map((p) => p.map(ring)) } })
      return f
    }).filter((f) => !f.geometry || geoArea(f) <= 2 * Math.PI),
  }
  return thinned
}

/** The atlas names for a market's ISO country codes. */
export function atlasNamesFor(codes) {
  const want = new Set((codes || []).map((c) => String(c).toUpperCase()))
  return COUNTRIES.filter((c) => want.has(c.iso2)).map((c) => ATLAS_NAME[c.name] || c.name)
}

/** Where to look and how wide: the centre of the highlighted countries and the half-angle (degrees) the frame covers. */
function frameFor(features) {
  if (!features.length) return { centre: [10, 50], half: 38 }
  // Only the biggest piece of each country sets the frame: Portugal has the Azores, Spain the Canaries, Norway
  // Svalbard, and framing those would zoom the map out across the Atlantic.
  const main = features.map((f) => {
    const g = f.geometry
    if (!g || g.type !== 'MultiPolygon') return f
    let best = g.coordinates[0]
    let bestArea = 0
    for (const poly of g.coordinates) {
      const a = geoArea({ type: 'Polygon', coordinates: poly })
      if (a > bestArea) { bestArea = a; best = poly }
    }
    return { ...f, geometry: { type: 'Polygon', coordinates: best } }
  })
  const fc = { type: 'FeatureCollection', features: main }
  const [lng, lat] = geoCentroid(fc)
  const [[w, s], [e, n]] = geoBounds(fc)
  let lonSpan = e - w
  if (lonSpan < 0) lonSpan += 360
  const span = Math.max(lonSpan * Math.cos((lat * Math.PI) / 180), n - s)
  // A lone small country is shown among its neighbours; a spread of them fills the frame.
  const half = Math.min(62, Math.max(19, span * 1.05 + 11))
  return { centre: [lng, lat], half }
}

export default function MarketMap({ codes, className = '' }) {
  const canvasRef = useRef(null)
  const key = (codes || []).join(',')

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const ctx = canvas.getContext('2d')
    if (!ctx) return undefined
    let land = null
    let lit = []
    let frame = { centre: [10, 50], half: 38 }
    let size = 0
    let raf = 0
    let last = 0
    let visible = true
    let alive = true
    let clock = 0
    const quiet = document.documentElement.hasAttribute('data-reduce-motion')
      || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

    const projection = geoOrthographic().clipAngle(90).precision(0.6)
    const path = geoPath(projection, ctx)
    const graticule = geoGraticule10()
    const interps = []

    const resize = () => {
      const r = canvas.getBoundingClientRect()
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      size = Math.max(1, Math.round(Math.min(r.width, r.height)))
      canvas.width = size * dpr
      canvas.height = size * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      // The canvas edge is `half` degrees from the centre of the view, so the sphere's own edge is never on screen.
      projection.translate([size / 2, size / 2]).scale(size / 2 / Math.sin((frame.half * Math.PI) / 180))
    }

    const draw = (t) => {
      if (!size) return
      // The globe is held and drifts a few degrees, so the country stays put and the land still moves.
      const drift = quiet ? 0 : 1
      const lam = frame.centre[0] + drift * 5 * Math.sin(t / 5200)
      const phi = frame.centre[1] + drift * 2.5 * Math.cos(t / 6800)
      projection.rotate([-lam, -phi, 0])
      ctx.clearRect(0, 0, size, size)

      ctx.beginPath(); path(graticule)
      ctx.strokeStyle = 'rgba(255,255,255,0.09)'; ctx.lineWidth = 0.7; ctx.stroke()

      if (land) {
        ctx.beginPath(); path(land)
        ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fill()
        ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 0.6; ctx.stroke()
      }
      if (lit.length) {
        // The market's own countries: brighter, breathing, with a clear edge.
        const pulse = 0.5 + 0.5 * Math.sin(t / 900)
        const fc = { type: 'FeatureCollection', features: lit }
        ctx.beginPath(); path(fc)
        ctx.fillStyle = `rgba(255,255,255,${0.7 + 0.15 * pulse})`; ctx.fill()
        ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 1.4; ctx.stroke()
      }

      const centre = [lam, phi]
      const reach = (frame.half * Math.PI) / 180
      // Cities in view: a soft halo breathing out of step, and a bright core.
      CITIES.forEach((p, i) => {
        if (geoDistance(p, centre) > reach) return
        const pulse = 0.5 + 0.5 * Math.sin(t / 700 + i * 1.7)
        path.pointRadius(Math.max(3, size / 95) * (1 + pulse * 0.6))
        ctx.beginPath(); path({ type: 'Point', coordinates: p })
        ctx.fillStyle = `rgba(255,255,255,${0.10 + 0.12 * pulse})`; ctx.fill()
        path.pointRadius(Math.max(1.4, size / 250))
        ctx.beginPath(); path({ type: 'Point', coordinates: p })
        ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fill()
      })

      // A few aeroplanes crossing between the cities in view.
      interps.forEach((it, i) => {
        const k = (((t / FLIGHT_MS) + i / interps.length) % 1)
        const ramp = Math.min(1, k / 0.12, (1 - k) / 0.12)
        const ease = ramp * ramp * (3 - 2 * ramp)
        if (ease <= 0.01) return
        const here = it.f(k)
        if (geoDistance(here, centre) > reach) return
        const a = projection(here)
        const b = projection(it.f(Math.min(1, k + 0.02)))
        const c2 = projection(it.f(Math.max(0, k - 0.02)))
        if (!a || !b || !c2) return
        const angle = Math.atan2(b[1] - c2[1], b[0] - c2[0]) + Math.PI / 2
        const alpha = 0.95 * ease
        if (PLANE) {
          const sc = (Math.max(10, size / 30) / 24) * (0.55 + 0.45 * ease)
          ctx.save()
          ctx.translate(a[0], a[1]); ctx.rotate(angle); ctx.scale(sc, sc); ctx.translate(-11.5, -12)
          ctx.shadowColor = `rgba(0,0,0,${0.25 * alpha})`; ctx.shadowBlur = 3
          ctx.fillStyle = `rgba(255,255,255,${alpha})`; ctx.fill(PLANE)
          ctx.restore()
        }
      })
    }

    const loop = (now) => {
      raf = 0
      if (!alive || !visible || document.hidden) return
      if (now - last >= 15) {
        const dt = last ? Math.min(100, now - last) : 0
        last = now
        clock += dt
        draw(clock)
      }
      raf = requestAnimationFrame(loop)
    }
    const start = () => {
      if (quiet) { draw(0); return }
      if (!raf && visible && !document.hidden) { last = 0; raf = requestAnimationFrame(loop) }
    }

    resize()
    loadMapFeatures().then((fc) => {
      if (!alive) return
      land = thin(fc)
      const names = new Set(atlasNamesFor(codes))
      lit = land.features.filter((f) => names.has(f.properties?.name))
      frame = frameFor(lit)
      // Routes between pairs of cities that are inside the frame, chosen once.
      const inView = CITIES.filter((p) => geoDistance(p, frame.centre) < (frame.half * Math.PI) / 180 * 0.92)
      interps.length = 0
      for (let i = 0; i < inView.length && interps.length < 6; i += 1) {
        const j = (i * 3 + 2) % inView.length
        if (i !== j) interps.push({ f: geoInterpolate(inView[i], inView[j]) })
      }
      resize(); draw(0); start()
    })

    const ro = new ResizeObserver(() => { resize(); draw(clock) })
    ro.observe(canvas)
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) start() })
    io.observe(canvas)
    const onVis = () => start()
    document.addEventListener('visibilitychange', onVis)

    return () => {
      alive = false
      if (raf) cancelAnimationFrame(raf)
      ro.disconnect(); io.disconnect()
      document.removeEventListener('visibilitychange', onVis)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return <canvas ref={canvasRef} aria-hidden className={cx('pointer-events-none aspect-square', className)} />
}
