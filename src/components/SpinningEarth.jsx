import { useEffect, useRef } from 'react'
import { geoArea, geoOrthographic, geoPath, geoGraticule10, geoInterpolate } from 'd3-geo'
import { loadMapFeatures } from '../lib/mapCountries'
import { cx } from '../lib/utils'

// THE EARTH BEHIND THE GLOBAL CHALLENGE (21 Sep 2026).
//
// Ethan: "make it look more like the actual Earth rather than just the lines.
// Make it look like the Earth with the continents and cities, and it's
// rotating. Really work on improving that." The card used to carry six ellipses
// on a slow CSS spin - a wireframe of a globe.
//
// This is the real map, the same atlas every other map in the app reads (one
// fetch, one parse - lib/mapCountries), on an orthographic projection turning
// about its axis. Land is a soft white fill, cities are points of light, and a
// few Tryp.com routes arc between them. It is drawn on a canvas because an SVG
// of 240 countries re-projected every frame is thousands of path strings a
// second; a canvas redraws the same geometry without touching the DOM.
//
// Cheap on purpose: the atlas is thinned once (every third vertex), the loop
// runs at ~30fps, and it stops completely whenever the card is off screen or
// the tab is hidden. Reduced motion gets one still frame.

const CITIES = [
  [-0.13, 51.51], [-3.7, 40.42], [-9.14, 38.72], [2.35, 48.86], [13.4, 52.52], [26.1, 44.43],
  [18.07, 59.33], [-6.26, 53.35], [12.5, 41.9], [28.98, 41.01], [-74.0, 40.71], [-118.24, 34.05],
  [-99.13, 19.43], [-46.63, -23.55], [-58.38, -34.6], [3.38, 6.52], [31.24, 30.04], [18.42, -33.92],
  [36.82, -1.29], [55.27, 25.2], [72.88, 19.08], [103.82, 1.35], [100.5, 13.76], [139.69, 35.69],
  [126.98, 37.57], [151.21, -33.87], [-79.38, 43.65], [114.17, 22.32], [-43.2, -22.9], [24.94, 60.17],
]
// Routes out of the markets the programme runs in.
const ROUTES = [[0, 10], [1, 13], [2, 15], [3, 19], [4, 23], [5, 18], [6, 21], [0, 25], [1, 12], [3, 22]]

let thinned = null
function thin(fc) {
  if (thinned) return thinned
  const ring = (r) => (r.length > 12 ? r.filter((_, i) => i % 3 === 0 || i === r.length - 1) : r)
  // A RING WOUND THE OTHER WAY IS THE REST OF THE PLANET. On a flat map the
  // direction of a ring does not matter; on a sphere it decides which side is
  // inside, and a few shapes in the atlas are wound so that "inside" is
  // everything but the country - which painted the whole globe as land. Any
  // feature claiming more than a hemisphere is turned round.
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

export default function SpinningEarth({ className = '', tilt = -18, speed = 7 }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const ctx = canvas.getContext('2d')
    if (!ctx) return undefined
    let land = null
    let size = 0
    let raf = 0
    let last = 0
    let lambda = -10
    let visible = true
    let alive = true
    const quiet = document.documentElement.hasAttribute('data-reduce-motion')
      || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

    const projection = geoOrthographic().clipAngle(90).precision(0.6)
    const path = geoPath(projection, ctx)
    const graticule = geoGraticule10()
    const sphere = { type: 'Sphere' }
    const routes = ROUTES.map(([a, b]) => ({ type: 'LineString', coordinates: [CITIES[a], CITIES[b]] }))
    const interps = ROUTES.map(([a, b]) => geoInterpolate(CITIES[a], CITIES[b]))

    const resize = () => {
      const r = canvas.getBoundingClientRect()
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      size = Math.max(1, Math.round(Math.min(r.width, r.height)))
      canvas.width = size * dpr
      canvas.height = size * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      projection.translate([size / 2, size / 2]).scale(size / 2 - 2)
    }

    const draw = (t) => {
      if (!size) return
      projection.rotate([lambda, tilt, 0])
      ctx.clearRect(0, 0, size, size)
      const c = size / 2
      // The ocean: a lit disc, brightest up and to the left, so it reads as a
      // sphere and not a coin.
      const glow = ctx.createRadialGradient(c * 0.7, c * 0.62, size * 0.05, c, c, c)
      glow.addColorStop(0, 'rgba(255,255,255,0.20)')
      glow.addColorStop(0.7, 'rgba(255,255,255,0.07)')
      glow.addColorStop(1, 'rgba(255,255,255,0.02)')
      ctx.beginPath(); path(sphere); ctx.fillStyle = glow; ctx.fill()

      ctx.beginPath(); path(graticule)
      ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 0.7; ctx.stroke()

      if (land) {
        ctx.beginPath(); path(land)
        ctx.fillStyle = 'rgba(255,255,255,0.19)'; ctx.fill()
        ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.lineWidth = 0.5; ctx.stroke()
      }

      // Routes, and a plane-light travelling along each one.
      ctx.setLineDash([3, 4])
      ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1
      for (const r of routes) { ctx.beginPath(); path(r); ctx.stroke() }
      ctx.setLineDash([])
      path.pointRadius(Math.max(1.6, size / 260))
      interps.forEach((f, i) => {
        const k = ((t / 6000) + i / interps.length) % 1
        ctx.beginPath(); path({ type: 'Point', coordinates: f(k) })
        ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fill()
      })

      // Cities: a soft halo and a bright core, breathing out of step.
      CITIES.forEach((p, i) => {
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
    }

    const loop = (now) => {
      raf = 0
      if (!alive || !visible || document.hidden) return
      if (now - last >= 33) {
        const dt = last ? Math.min(100, now - last) : 0
        last = now
        lambda = (lambda + (speed * dt) / 1000) % 360
        draw(now)
      }
      raf = requestAnimationFrame(loop)
    }
    const start = () => {
      if (quiet) { draw(0); return }
      if (!raf && visible && !document.hidden) { last = 0; raf = requestAnimationFrame(loop) }
    }

    resize()
    draw(0)
    loadMapFeatures().then((fc) => { if (!alive) return; land = thin(fc); draw(performance.now()); start() })

    const ro = new ResizeObserver(() => { resize(); draw(performance.now()) })
    ro.observe(canvas)
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) start() })
    io.observe(canvas)
    const onVis = () => start()
    document.addEventListener('visibilitychange', onVis)
    start()

    return () => {
      alive = false
      if (raf) cancelAnimationFrame(raf)
      ro.disconnect()
      io.disconnect()
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [tilt, speed])

  return <canvas ref={canvasRef} aria-hidden className={cx('pointer-events-none aspect-square', className)} />
}
