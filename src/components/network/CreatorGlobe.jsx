import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { geoOrthographic, geoPath, geoGraticule10, geoInterpolate, geoDistance } from 'd3-geo'
import { loadMapFeatures } from '../../lib/mapCountries'
import { geocodeCity } from '../../lib/geocode'
import { thin } from '../SpinningEarth'
import { Avatar } from '../ui'
import Icon from '../Icon'
import { cx } from '../../lib/utils'

// THE INTERACTIVE GLOBE, BUILT LOCALHOST-ONLY FOR ETHAN'S REVIEW (23 Sep 2026).
//
// Ethan: "design a globe similar to the one in the background of Challenges,
// but have it for the Everyone Right Now map as an option... it should be
// spinnable and interactive, you can zoom in... constantly rotating unless
// you zoom in, then it stops... all the pins have those fly things, similar
// to how the Everyone Right Now map works, but in that cool rotating globe."
//
// SAME DRAWING TECHNIQUE AS THE CHALLENGE CARD'S EARTH (`SpinningEarth`),
// REAL DATA INSTEAD OF DECORATION. That component proved the canvas approach
// - one orthographic projection, the same thinned world atlas every map in
// the app already shares, redrawn every frame without touching the DOM -
// this reuses its land mass (`thin`, exported for exactly this) and its
// arriving-aircraft drawing, and replaces the decorative city/route lists
// with real creator pins (geocoded the same way `CreatorMap` does, via
// `lib/geocode`) and real current trips.
//
// A PIN LANDS, IT DOES NOT APPEAR. `landedAt` is stamped the first time a
// creator's coordinates resolve - once, in a ref, never reset by a
// re-render - and every pin's radius/opacity is an eased ramp off how long
// ago that was. That is the flat map's `map-pin-land` idea (drop from above,
// settle with a small overshoot) played out in canvas frames instead of a
// CSS keyframe, because nothing here is a DOM node a keyframe could attach
// to.
//
// AUTO-ROTATION IS A COURTESY, NOT A FIGHT. It runs until the reader does
// anything - drag or zoom - and then gets out of the way completely; it only
// resumes once they have been still for a few seconds AND have zoomed back
// out close to the start, so nudging the globe half a turn to find somebody
// does not get undone by the globe carrying on without them.
export default function CreatorGlobe({ creators = [], trips = {}, myId, onClose }) {
  const canvasRef = useRef(null)
  const wrapRef = useRef(null)
  const [pins, setPins] = useState([])
  const [selected, setSelected] = useState(null)
  const [ready, setReady] = useState(false)
  const landedAtRef = useRef(new Map()) // creator id -> performance.now() of first paint
  // THE DRAW LOOP BELOW IS SET UP ONCE (empty dependency array - restarting
  // it on every resolved pin would reset the rotation and re-attach the drag
  // listeners mid-gesture), so it cannot read `pins`/`tripArcs` as plain
  // closed-over variables and ever see an update. It reads these refs
  // instead, kept in step by the two effects just below.
  const pinsRef = useRef([])
  const arcsRef = useRef([])

  // ---------------------------------------------------------------- pins
  //
  // GEOCODED THE SAME WAY THE FLAT MAP IS, AND FOR THE SAME REASON A CREATOR
  // WHO TYPED A TOWN WITHOUT SAVED COORDINATES MUST NOT SILENTLY VANISH.
  // Capped at 6 concurrent lookups (the flat map has no cap because it has a
  // real bar for progress; here it would just make everybody flicker in at
  // once mid-scroll) and cancellable, because this view can close mid-fetch.
  useEffect(() => {
    let alive = true
    const withCoords = []
    const needsGeocode = []
    for (const c of creators) {
      if (c.show_on_map === false) continue
      if (c.city_lat != null && c.city_lng != null) withCoords.push(c)
      else if (c.city || c.country) needsGeocode.push(c)
    }
    setPins(withCoords.map((c) => ({ ...c, lat: c.city_lat, lng: c.city_lng })))

    async function resolveRest() {
      const queue = [...needsGeocode]
      const worker = async () => {
        while (queue.length && alive) {
          const c = queue.shift()
          const coords = await geocodeCity(c.city, c.country)
          if (!alive || !coords) continue
          setPins((prev) => [...prev, { ...c, lat: coords.lat, lng: coords.lng }])
        }
      }
      await Promise.all(Array.from({ length: 6 }, worker))
    }
    resolveRest()
    return () => { alive = false }
  }, [creators])

  useEffect(() => { pinsRef.current = pins }, [pins])

  // Active trip per creator, with its own coordinates (a home + a
  // destination, drawn exactly like `SpinningEarth`'s routes).
  const [tripArcs, setTripArcs] = useState([])
  useEffect(() => { arcsRef.current = tripArcs }, [tripArcs])
  useEffect(() => {
    let alive = true
    async function build() {
      const out = []
      for (const c of pins) {
        const list = trips[c.id]
        const t = list?.find((x) => x.current)
        if (!t) continue
        let dest = t.city_lat != null && t.city_lng != null ? { lat: t.city_lat, lng: t.city_lng } : await geocodeCity(t.city, t.country)
        if (!alive || !dest) continue
        out.push({ from: [c.lng, c.lat], to: [dest.lng, dest.lat], name: c.name })
      }
      if (alive) setTripArcs(out)
    }
    build()
    return () => { alive = false }
  }, [pins, trips])

  // --------------------------------------------------------------- canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const ctx = canvas.getContext('2d')
    if (!ctx) return undefined

    let size = 0
    let raf = 0
    let last = 0
    let lambda = -10
    let phi = -20
    let zoom = 1
    let alive = true
    const quiet = document.documentElement.hasAttribute('data-reduce-motion')
      || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

    let autoRotate = !quiet
    let idleTimer = 0
    let land = null

    const projection = geoOrthographic().clipAngle(90).precision(0.6)
    const path = geoPath(projection, ctx)
    const graticule = geoGraticule10()
    const sphere = { type: 'Sphere' }

    const resize = () => {
      const r = canvas.getBoundingClientRect()
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      size = Math.max(1, Math.round(Math.min(r.width, r.height)))
      canvas.width = size * dpr
      canvas.height = size * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      projection.translate([size / 2, size / 2]).scale((size / 2 - 4) * zoom)
    }

    const project = (lng, lat) => projection([lng, lat])

    const draw = (t) => {
      if (!size) return
      projection.rotate([lambda, phi, 0]).scale((size / 2 - 4) * zoom)
      ctx.clearRect(0, 0, size, size)
      const c = size / 2

      const glow = ctx.createRadialGradient(c * 0.7, c * 0.6, size * 0.05, c, c, c)
      glow.addColorStop(0, 'rgba(255,138,76,0.16)')
      glow.addColorStop(0.7, 'rgba(217,68,7,0.05)')
      glow.addColorStop(1, 'rgba(217,68,7,0.015)')
      ctx.beginPath(); path(sphere); ctx.fillStyle = glow; ctx.fill()

      ctx.beginPath(); path(graticule)
      ctx.strokeStyle = 'rgba(217,68,7,0.07)'; ctx.lineWidth = 0.6; ctx.stroke()

      if (land) {
        ctx.beginPath(); path(land)
        ctx.fillStyle = 'rgba(217,68,7,0.14)'; ctx.fill()
        ctx.strokeStyle = 'rgba(217,68,7,0.28)'; ctx.lineWidth = 0.6; ctx.stroke()
      }

      // Trip arcs, dashed, with a plane travelling each one - identical
      // technique to SpinningEarth, real destinations instead of decoration.
      const centre = [-lambda, -phi]
      ctx.setLineDash([3, 4])
      ctx.strokeStyle = 'rgba(217,68,7,0.45)'; ctx.lineWidth = 1.1
      for (const arc of arcsRef.current) {
        ctx.beginPath(); path({ type: 'LineString', coordinates: [arc.from, arc.to] }); ctx.stroke()
      }
      ctx.setLineDash([])
      arcsRef.current.forEach((arc, i) => {
        const interp = geoInterpolate(arc.from, arc.to)
        const k = ((t / 6000) + i / Math.max(1, arcsRef.current.length)) % 1
        const here = interp(k)
        const away = geoDistance(here, centre)
        if (away > Math.PI / 2 - 0.02) return
        const a = project(here[0], here[1])
        if (!a) return
        const b = project(...interp(Math.min(1, k + 0.02)))
        const c2 = project(...interp(Math.max(0, k - 0.02)))
        const angle = b && c2 ? Math.atan2(b[1] - c2[1], b[0] - c2[0]) + Math.PI / 2 : 0
        ctx.save()
        ctx.translate(a[0], a[1])
        ctx.rotate(angle)
        ctx.beginPath()
        ctx.moveTo(0, -5); ctx.lineTo(3.5, 4); ctx.lineTo(0, 1.5); ctx.lineTo(-3.5, 4)
        ctx.closePath()
        ctx.fillStyle = 'rgba(217,68,7,0.9)'
        ctx.fill()
        ctx.restore()
      })

      // The pins themselves, each on its own landing ramp.
      pinsRef.current.forEach((p) => {
        if (p.lat == null || p.lng == null) return
        const away = geoDistance([p.lng, p.lat], centre)
        if (away > Math.PI / 2 - 0.01) return
        const a = project(p.lng, p.lat)
        if (!a) return
        let landedAt = landedAtRef.current.get(p.id)
        if (landedAt == null) { landedAt = t; landedAtRef.current.set(p.id, t) }
        const since = t - landedAt
        const LAND_MS = 650
        const raw = Math.min(1, since / LAND_MS)
        // Overshoot ease - the same shape as `map-pin-land`'s cubic-bezier.
        const eased = raw < 1 ? 1 - Math.pow(1 - raw, 3) * Math.cos(raw * 4) * 0.25 : 1
        const drop = (1 - raw) * -14
        const baseR = Math.max(2.4, size / 130)
        const isMe = p.id === myId
        const r = baseR * (0.4 + 0.6 * Math.min(1, eased)) * (isMe ? 1.5 : 1)
        const alpha = Math.min(1, raw * 1.6)

        ctx.save()
        ctx.translate(a[0], a[1] + drop)
        // Halo
        ctx.beginPath()
        ctx.arc(0, 0, r * 2.2, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(217,68,7,${0.12 * alpha})`
        ctx.fill()
        // Core
        ctx.beginPath()
        ctx.arc(0, 0, r, 0, Math.PI * 2)
        ctx.fillStyle = isMe ? `rgba(255,255,255,${alpha})` : `rgba(217,68,7,${alpha})`
        ctx.fill()
        if (isMe) {
          ctx.lineWidth = 1.4
          ctx.strokeStyle = `rgba(217,68,7,${alpha})`
          ctx.stroke()
        }
        ctx.restore()
      })

      ctx.beginPath(); path(sphere)
      ctx.strokeStyle = 'rgba(217,68,7,0.3)'; ctx.lineWidth = 1; ctx.stroke()
    }

    // ALWAYS RUNNING, NOT JUST WHILE AUTO-ROTATING. A drag or a zoom needs a
    // fresh frame the instant the pointer moves, and a landing pin needs a
    // few hundred more milliseconds of frames after the reader has done
    // nothing at all - so the loop reschedules itself unconditionally and
    // `autoRotate` only ever gates the one line that turns the globe.
    const loop = (now) => {
      raf = 0
      if (!alive || document.hidden) return
      if (now - last >= 15) {
        const dt = last ? Math.min(100, now - last) : 0
        last = now
        if (autoRotate) lambda = (lambda + (6 * dt) / 1000) % 360
        draw(now)
      }
      raf = requestAnimationFrame(loop)
    }
    const start = () => { if (!raf) { last = 0; raf = requestAnimationFrame(loop) } }

    // ------------------------------------------------------------ pointer
    let dragging = false
    let dragStart = null
    const markInteracted = () => {
      autoRotate = false
      clearTimeout(idleTimer)
      // Resumes on its own once the reader has been still for a few seconds
      // AND has come back close to the starting zoom - see the file header.
      idleTimer = setTimeout(() => {
        if (zoom <= 1.15) autoRotate = true
      }, 3200)
    }
    const onDown = (e) => {
      dragging = true
      dragStart = { x: e.clientX, y: e.clientY, lambda, phi }
      canvas.setPointerCapture?.(e.pointerId)
      markInteracted()
    }
    const onMove = (e) => {
      if (!dragging || !dragStart) return
      const dx = e.clientX - dragStart.x
      const dy = e.clientY - dragStart.y
      lambda = dragStart.lambda + dx * 0.35
      phi = Math.max(-85, Math.min(85, dragStart.phi - dy * 0.35))
    }
    const onUp = (e) => {
      if (!dragging) return
      dragging = false
      // A press that barely moved is a TAP, not a drag - hit-test for a pin.
      const moved = dragStart && Math.hypot(e.clientX - dragStart.x, e.clientY - dragStart.y) > 6
      if (!moved) {
        const rect = canvas.getBoundingClientRect()
        const px = e.clientX - rect.left
        const py = e.clientY - rect.top
        const centre = [-lambda, -phi]
        let hit = null
        let bestDist = 14
        for (const p of pinsRef.current) {
          if (p.lat == null) continue
          if (geoDistance([p.lng, p.lat], centre) > Math.PI / 2 - 0.01) continue
          const a = project(p.lng, p.lat)
          if (!a) continue
          const d = Math.hypot(a[0] - px, a[1] - py)
          if (d < bestDist) { bestDist = d; hit = p }
        }
        setSelected(hit)
      }
      dragStart = null
    }
    const onWheel = (e) => {
      e.preventDefault()
      zoom = Math.max(1, Math.min(4.5, zoom * (1 - e.deltaY * 0.0012)))
      markInteracted()
    }

    resize()
    draw(0)
    setReady(true)
    loadMapFeatures().then((fc) => { if (!alive) return; land = thin(fc); draw(performance.now()) })
    start()

    const ro = new ResizeObserver(() => { resize(); draw(performance.now()) })
    ro.observe(canvas)
    canvas.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    canvas.addEventListener('wheel', onWheel, { passive: false })

    return () => {
      alive = false
      if (raf) cancelAnimationFrame(raf)
      clearTimeout(idleTimer)
      ro.disconnect()
      canvas.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('wheel', onWheel)
    }
    // `pins`/`tripArcs` are read fresh each frame via closure over the state
    // variables below - re-running this whole effect every time a pin
    // resolves would reset the rotation and the drag listeners mid-gesture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return createPortal(
    <div className="fixed inset-0 z-[70] flex flex-col bg-ink text-white" ref={wrapRef}>
      <div className="flex items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3 sm:px-6">
        <div className="flex items-center gap-2">
          <Icon name="globe" className="h-5 w-5 text-brand" />
          <h2 className="text-base font-semibold sm:text-lg">Everyone, on the globe</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
          aria-label="Close"
        >
          <Icon name="close" className="h-5 w-5" />
        </button>
      </div>

      <div className="relative flex-1 overflow-hidden">
        <canvas
          ref={canvasRef}
          className={cx('absolute left-1/2 top-1/2 aspect-square h-[92%] max-h-[92vw] -translate-x-1/2 -translate-y-1/2 touch-none sm:h-[85%]', !ready && 'opacity-0')}
        />
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-brand" />
          </div>
        )}

        {selected && (
          <Link
            to={`/profile/${selected.id}`}
            className="absolute bottom-[max(1.5rem,env(safe-area-inset-bottom))] left-1/2 flex w-[min(22rem,calc(100%-2rem))] -translate-x-1/2 items-center gap-3 rounded-2xl bg-white p-3 text-ink shadow-lift transition-transform hover:-translate-y-0.5"
          >
            <Avatar src={selected.photo_url} name={selected.name} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{selected.name}</span>
              {(selected.city || selected.country) && (
                <span className="block truncate text-xs text-smoke">{[selected.city, selected.country].filter(Boolean).join(', ')}</span>
              )}
            </span>
            <Icon name="chevronRight" className="h-4 w-4 shrink-0 text-gray-300" />
          </Link>
        )}

        <p className="pointer-events-none absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 text-center text-[11px] font-medium text-white/50 sm:hidden">
          {!selected && 'Drag to spin · pinch to zoom · tap a pin'}
        </p>
      </div>
    </div>,
    document.body,
  )
}
