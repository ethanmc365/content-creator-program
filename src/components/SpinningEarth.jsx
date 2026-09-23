import { useEffect, useRef } from 'react'
import { geoArea, geoDistance, geoOrthographic, geoPath, geoGraticule10, geoInterpolate } from 'd3-geo'
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
// Cheap on purpose: the atlas is thinned once (every third vertex), and the
// loop stops completely whenever the card is off screen or
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

// AN AEROPLANE, NOT A DOT (22 Sep 2026). Ethan: "rather than the white dots
// moving, I would have a small airplane icon moving so it looks like it's
// flying." A top-down airliner, nose UP, centred on (12, 12) in a 24-unit box.
const PLANE = typeof Path2D === 'function'
  ? new Path2D('M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z')
  : null

// How long one flight takes, end to end. Slower reads as cruising.
const FLIGHT_MS = 9000

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
      // Each route flies one aeroplane, pointed along its own great circle.
      // A plane on the far side of the planet is not drawn; one near the edge
      // fades out as it goes over the horizon rather than blinking off.
      const centre = [-lambda, -tilt]
      const planeSize = Math.max(9, size / 34)
      interps.forEach((f, i) => {
        const k = ((t / FLIGHT_MS) + i / interps.length) % 1
        // TAKE-OFF AND LANDING, NOT A BLINK (22 Sep 2026). Ethan: "they seem
        // to be a bit jittery... currently they just seem to flash in and
        // out." A plane used to vanish at its destination and reappear at full
        // size at its origin on the same frame. Now it fades up and grows over
        // the first 12% of its route and fades and shrinks over the last 12%,
        // on an ease so neither end has a corner.
        const ramp = Math.min(1, k / 0.12, (1 - k) / 0.12)
        const ease = ramp * ramp * (3 - 2 * ramp)
        if (ease <= 0.01) return
        const here = f(k)
        const away = geoDistance(here, centre)
        if (away > Math.PI / 2 - 0.02) return
        const a = projection(here)
        // The heading is taken over a wider stretch of the route, so it turns
        // smoothly instead of twitching with every pixel of rounding.
        const b = projection(f(Math.min(1, k + 0.02)))
        const c2 = projection(f(Math.max(0, k - 0.02)))
        if (!a || !b || !c2) return
        const angle = Math.atan2(b[1] - c2[1], b[0] - c2[0]) + Math.PI / 2
        const edge = Math.min(1, (Math.PI / 2 - away) / 0.35)
        const alpha = 0.98 * edge * ease
        if (PLANE) {
          const sc = (planeSize / 24) * (0.55 + 0.45 * ease)
          ctx.save()
          ctx.translate(a[0], a[1])
          ctx.rotate(angle)
          ctx.scale(sc, sc)
          ctx.translate(-11.5, -12)
          ctx.shadowColor = `rgba(0,0,0,${0.25 * alpha})`
          ctx.shadowBlur = 3
          ctx.fillStyle = `rgba(255,255,255,${alpha})`
          ctx.fill(PLANE)
          ctx.restore()
        } else {
          path.pointRadius(Math.max(1.6, size / 260))
          ctx.beginPath(); path({ type: 'Point', coordinates: here })
          ctx.fillStyle = `rgba(255,255,255,${alpha})`; ctx.fill()
        }
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
      // EVERY FRAME, NOT EVERY OTHER ONE. At 30fps a plane crossing the
      // globe stepped a pixel or two at a time, which is the jitter; the
      // drawing is cheap enough (thinned atlas) to run at display rate.
      if (now - last >= 15) {
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
