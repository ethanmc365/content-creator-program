import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ComposableMap, Geographies, Geography, ZoomableGroup } from 'react-simple-maps'
import { geoEqualEarth } from 'd3-geo'
import { loadMapFeatures } from '../../lib/mapCountries'
import { useIsDark } from '../../lib/theme'
import { cx } from '../../lib/utils'
import Icon from '../Icon'

// Every flight you have logged, drawn at once.
//
// THE MAP IS THE POINT OF A FLIGHT LOG. A table of two hundred rows is a
// spreadsheet; the same two hundred rows as arcs across a world map is the
// thing people screenshot. So this is the centre of the page and everything
// else is a number beside it.
//
// WHY THE ARCS ARE DRAWN BY HAND RATHER THAN AS GeoJSON LINES. A great circle
// projected onto Equal Earth is a genuinely curved path, and drawing it
// properly means sampling it - a hundred points per route, thousands of path
// commands for a well-travelled log, re-tessellated on every zoom. A quadratic
// bezier through a perpendicular offset is not the geodesic, but at this scale
// it reads as one, it is three numbers per route, and it is what makes a
// hundred flights render in a frame. The same trade CreatorMap makes.
//
// The frame and the projection MUST match the ComposableMap props below or the
// arcs land somewhere other than the countries they belong to.
const WIDTH = 880
const HEIGHT = 480
const projection = geoEqualEarth()
  .translate([WIDTH / 2, HEIGHT / 2])
  .center([12, 8])
  .scale(160)

const BRAND = '#d94407'
const BRAND_LIGHT = '#f5853f'

const EMPTY_GEO = { type: 'FeatureCollection', features: [] }

// HOW FAR IN IT GOES.
//
// It was 8, which is nowhere near enough for the flights this log is mostly
// full of. A Gatwick to Amsterdam arc is about forty pixels long on an
// 880-wide world map; at 8x that is a three-hundred-pixel line with two dots
// on it and no way to see which airports they are. Ethan asked to be able to
// "zoom in on the map more, especially for shorter flights". At 40 a
// single-country hop fills the frame.
const MAX_ZOOM = 40
// Past this, the map is looking at one region and there is room for the city
// names. Below it there is not, and drawing them anyway is the overlapping
// mess that made labels a bad idea the first time.
const LABEL_ZOOM = 3.2

// A route's arc, plus the length of it, so the draw-on animation can be timed
// to the distance rather than every line taking the same time regardless.
function arcFor(a, b) {
  const [ax, ay] = projection([a.lng, a.lat])
  const [bx, by] = projection([b.lng, b.lat])
  const mx = (ax + bx) / 2
  const my = (ay + by) / 2
  const dx = bx - ax
  const dy = by - ay
  const chord = Math.hypot(dx, dy) || 1
  // The bulge is capped so a Sydney-London arc does not loop over the top of
  // the frame, and it is proportional so a Gatwick-Malaga hop still curves.
  const bulge = Math.min(chord * 0.18, 58)
  const cx = mx + (-dy / chord) * bulge
  const cy = my + (dx / chord) * bulge
  return { d: `M${ax} ${ay} Q ${cx} ${cy} ${bx} ${by}`, ax, ay, bx, by, cx, cy, chord }
}

// A point and a heading along the quadratic, for putting an aeroplane on it.
// The derivative of a quadratic bezier is a straight line between its two
// control legs, which is why this is four multiplications rather than a
// sampled tangent.
function alongArc(r, t) {
  const u = 1 - t
  const x = u * u * r.ax + 2 * u * t * r.cx + t * t * r.bx
  const y = u * u * r.ay + 2 * u * t * r.cy + t * t * r.by
  const dx = 2 * u * (r.cx - r.ax) + 2 * t * (r.bx - r.cx)
  const dy = 2 * u * (r.cy - r.ay) + 2 * t * (r.by - r.cy)
  return { x, y, angle: (Math.atan2(dy, dx) * 180) / Math.PI }
}

const fmtKm = (n) => Math.round(n).toLocaleString('en-GB')

// The aeroplane that rides the selected route. THE PLANE FACES LEFT in the
// brand artwork, so a silhouette drawn nose-right has to be its own shape - and
// at this size a path is cheaper and sharper than the cutout PNG the hero
// scenes use. `rotate` is applied on a wrapper <g> and the scale on the inner
// one: a CSS transform on an element OVERRIDES its SVG transform attribute, and
// combining them is the bug that silently flattened the Flight Path aircraft to
// scale 1 for weeks.
function ArcPlane({ x, y, angle, size }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle})`} style={{ pointerEvents: 'none' }}>
      <g transform={`scale(${size})`}>
        <path
          d="M9 0 L-2 -4 L-5 -4 L-3 0 L-5 4 L-2 4 Z M-1 0 L-7 -6 L-9 -6 L-6 0 L-9 6 L-7 6 Z"
          fill={BRAND}
          stroke="#fff"
          strokeWidth="0.7"
          strokeLinejoin="round"
        />
      </g>
    </g>
  )
}

function FlightMap({ routes = [], airports = [] }) {
  const dark = useIsDark()
  const [features, setFeatures] = useState(null)
  const [position, setPosition] = useState({ coordinates: [12, 8], zoom: 1 })
  const [selected, setSelected] = useState(null)   // route key
  const [fullscreen, setFullscreen] = useState(false)
  const [closing, setClosing] = useState(false)
  // Drives the aeroplane along whichever arc is selected. rAF rather than a CSS
  // animation because the position has to be computed on the bezier, and rather
  // than SMIL because an `animateMotion` on a path that changes when you zoom
  // restarts from the beginning every time.
  const [t, setT] = useState(0)
  const fsRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    loadMapFeatures().then((fc) => { if (!cancelled) setFeatures(fc) })
    return () => { cancelled = true }
  }, [])

  const LAND = dark ? '#2a2c31' : '#ECECEE'
  const SEPARATOR = dark ? '#0c0d10' : '#ffffff'

  const arcs = useMemo(
    () => routes.map((r) => ({ ...r, ...arcFor(r.from, r.to) })),
    [routes],
  )

  const pins = useMemo(
    () => airports.map((a) => {
      const [x, y] = projection([a.lng, a.lat])
      return { ...a, x, y }
    }),
    [airports],
  )

  const active = useMemo(() => arcs.find((r) => r.key === selected) || null, [arcs, selected])

  // THE AEROPLANE ONLY FLIES WHILE A ROUTE IS OPEN.
  //
  // One plane on the selected arc, not one per route. Twelve aircraft crawling
  // across a world map at once is a screensaver; one on the line you just
  // tapped is the map answering "this one".
  useEffect(() => {
    if (!active) { setT(0); return undefined }
    let raf = 0
    let start = 0
    // Long routes take longer, but not proportionally - a Sydney arc at the
    // same speed as a Gatwick hop would take half a minute to cross.
    const dur = Math.min(6000, 1600 + active.chord * 6)
    const tick = (now) => {
      if (!start) start = now
      setT(((now - start) % dur) / dur)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [active])

  const zoomBy = (f) => setPosition((p) => ({ ...p, zoom: Math.min(MAX_ZOOM, Math.max(1, p.zoom * f)) }))
  const reset = () => { setPosition({ coordinates: [12, 8], zoom: 1 }); setSelected(null) }

  // See the note in CreatorMap: the exit has to outlive the decision or there
  // is nothing left on screen to animate.
  const exitFullscreen = useCallback(() => {
    try { if (document.fullscreenElement) document.exitFullscreen() } catch { /* already out */ }
    setClosing(true)
    setTimeout(() => { setFullscreen(false); setClosing(false) }, 180)
  }, [])

  const enterFullscreen = useCallback(async () => {
    setFullscreen(true)
    try {
      const el = fsRef.current
      if (el?.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' })
    } catch { /* denied or unsupported: the overlay still fills the window */ }
  }, [])

  useEffect(() => {
    if (!fullscreen) return undefined
    const onKey = (e) => { if (e.key === 'Escape') exitFullscreen() }
    const onChange = () => { if (!document.fullscreenElement) setFullscreen(false) }
    document.addEventListener('keydown', onKey)
    document.addEventListener('fullscreenchange', onChange)
    document.documentElement.classList.add('overlay-lock')
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('fullscreenchange', onChange)
      document.documentElement.classList.remove('overlay-lock')
    }
  }, [fullscreen, exitFullscreen])

  const showLabels = position.zoom >= LABEL_ZOOM

  const controls = (
    <div className="absolute right-2 top-2 z-10 flex flex-col gap-1">
      <button type="button" onClick={() => zoomBy(1.7)} aria-label="Zoom in"
        className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-lg font-semibold text-ink shadow-card transition-transform hover:scale-105 active:scale-95">+</button>
      <button type="button" onClick={() => zoomBy(1 / 1.7)} aria-label="Zoom out"
        className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-lg font-semibold text-ink shadow-card transition-transform hover:scale-105 active:scale-95">−</button>
      <button type="button" onClick={reset} aria-label="Show the whole world"
        className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-ink shadow-card transition-transform hover:scale-105 active:scale-95">
        <Icon name="globe" className="h-4 w-4" />
      </button>
      {!fullscreen && (
        <button type="button" onClick={enterFullscreen} aria-label="Full screen"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-ink shadow-card transition-transform hover:scale-105 active:scale-95">
          <Icon name="expand" className="h-4 w-4" />
        </button>
      )}
    </div>
  )

  const map = (
    <ComposableMap
      width={WIDTH}
      height={HEIGHT}
      projectionConfig={{ scale: 160, center: [12, 8] }}
      // In the page the SVG sets its own height from the viewBox aspect (the
      // card grows to fit it); full screen it has to FILL a box whose height
      // comes from the window instead. `height: 100%` against an auto-height
      // parent resolves to auto and the map collapses, so this cannot just be
      // one value for both.
      style={fullscreen
        ? { width: '100%', height: '100%', display: 'block' }
        : { width: '100%', height: 'auto', display: 'block' }}
      aria-label="A map of every flight you have logged"
    >
      <ZoomableGroup
        zoom={position.zoom}
        center={position.coordinates}
        minZoom={1}
        maxZoom={MAX_ZOOM}
        translateExtent={[[-60, -50], [WIDTH + 60, HEIGHT + 50]]}
        onMoveEnd={setPosition}
      >
        <Geographies geography={features || EMPTY_GEO}>
          {({ geographies }) =>
            geographies
              .filter((geo) => geo.properties.name !== 'Antarctica')
              .map((geo) => (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  style={{
                    default: { fill: LAND, stroke: SEPARATOR, strokeWidth: 0.4, outline: 'none' },
                    hover: { fill: LAND, stroke: SEPARATOR, strokeWidth: 0.4, outline: 'none' },
                    pressed: { fill: LAND, outline: 'none' },
                  }}
                />
              ))
          }
        </Geographies>

        {/* THE ROUTES DRAW THEMSELVES IN.
            `stroke-dasharray` set to the path's own length with the offset
            animated to zero is the one way to make an SVG path appear to be
            drawn, and it composites - so a hundred routes arriving at once
            costs the compositor and not the main thread. The delay ladder is
            capped: past about twenty routes an increasing delay stops reading
            as "one after another" and starts reading as "still loading". */}
        {arcs.map((r, i) => {
          const on = r.key === selected
          return (
            <g key={r.key}>
              {/* A LINE IS TWO PIXELS WIDE AND A FINGER IS FORTY.
                  So the thing you actually press is an invisible fat stroke
                  over the top of the visible one. Without it, tapping a route
                  on a phone is a game of chance. */}
              <path
                d={r.d}
                fill="none"
                stroke="transparent"
                strokeWidth={Math.max(6, 14 / position.zoom)}
                strokeLinecap="round"
                style={{ cursor: 'pointer' }}
                onClick={() => setSelected(on ? null : r.key)}
              />
              <path
                d={r.d}
                fill="none"
                stroke={on ? BRAND : BRAND}
                strokeWidth={Math.max(0.6, (on ? 2.2 : 1.1) / position.zoom)}
                strokeLinecap="round"
                opacity={selected && !on ? 0.22 : 0.75}
                className="flight-arc"
                style={{
                  '--arc-len': Math.round(r.chord * 1.15),
                  animationDelay: `${Math.min(i, 20) * 55}ms`,
                  pointerEvents: 'none',
                  transition: 'opacity 200ms ease-out',
                }}
              />
            </g>
          )
        })}

        {/* The aeroplane, on the open route only. */}
        {active && (() => {
          const p = alongArc(active, t)
          return <ArcPlane x={p.x} y={p.y} angle={p.angle} size={Math.max(0.35, 1.1 / position.zoom)} />
        })()}

        {pins.map((a) => {
          // A pin belonging to the open route is drawn up; everything else
          // steps back, which is what makes one route readable on a busy map.
          const on = active && (a.iata === active.from.iata || a.iata === active.to.iata)
          const r = Math.max(1.4, (a.weight > 4 ? 3.4 : a.weight > 1 ? 2.8 : 2.2) / position.zoom)
          return (
            <g key={a.iata} className="flight-pin" style={{ transformOrigin: `${a.x}px ${a.y}px` }}>
              <circle
                cx={a.x}
                cy={a.y}
                r={on ? r * 1.5 : r}
                fill={on ? BRAND : a.weight > 1 ? BRAND : BRAND_LIGHT}
                stroke="#fff"
                strokeWidth={Math.max(0.3, 0.7 / position.zoom)}
                opacity={selected && !on ? 0.35 : 1}
              >
                <title>{`${a.iata} · ${a.city} · ${a.weight} ${a.weight === 1 ? 'flight' : 'flights'}`}</title>
              </circle>

              {/* THE NAME, WHEN THERE IS ROOM FOR IT.
                  Ethan: "highlight the name of the city in small writing, if
                  they're too close together and it looks odd then it just shows
                  up when you tap the line or circle, or when you zoom in
                  further." Both halves of that are here - a label appears once
                  the map is zoomed past the point where names would collide,
                  and the two ends of an open route are labelled at any zoom,
                  because you asked for that one specifically.

                  The text COUNTER-SCALES. Everything inside a ZoomableGroup is
                  scaled by the zoom, so a 6px label at 20x is a 120px word
                  across half a continent. Dividing by the zoom holds it at a
                  constant size on screen, which is the only size a label can
                  usefully be. */}
              {(showLabels || on) && (
                <g transform={`translate(${a.x} ${a.y - r - 2}) scale(${1 / position.zoom})`} style={{ pointerEvents: 'none' }}>
                  <text
                    textAnchor="middle"
                    fontSize="9"
                    fontWeight="700"
                    fill={on ? BRAND : dark ? '#e8e8ea' : '#26272b'}
                    stroke={dark ? '#0c0d10' : '#ffffff'}
                    strokeWidth="2.4"
                    paintOrder="stroke"
                    strokeLinejoin="round"
                  >
                    {a.city}
                  </text>
                </g>
              )}
            </g>
          )
        })}
      </ZoomableGroup>
    </ComposableMap>
  )

  // WHAT A ROUTE ACTUALLY WAS.
  //
  // Ethan: "clicking on the line on the map should show a popup with info on
  // the flight you took and when." A route on this map is one line per PAIR of
  // airports, so it can stand for eight flights - the card names all of them,
  // newest first, rather than picking one and calling it the answer.
  const card = active && (
    <div className="pointer-events-auto absolute inset-x-3 bottom-3 z-20 mx-auto max-w-sm overflow-hidden rounded-card border border-gray-100 bg-white/97 shadow-lift backdrop-blur animate-map-in">
      <div className="flex items-start gap-3 border-b border-gray-100 px-4 py-3">
        <span className="flex shrink-0 items-center gap-1.5 text-sm font-bold tracking-wider text-brand">
          {active.from.iata}
          <Icon name="plane" className="h-3.5 w-3.5 text-gray-300" />
          {active.to.iata}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{active.from.city} to {active.to.city}</span>
          <span className="block text-[11px] text-smoke">
            {active.flights.length} {active.flights.length === 1 ? 'flight' : 'flights'}
            {active.flights[0]?.dist ? ` · ${fmtKm(active.flights[0].dist)} km each way` : ''}
          </span>
        </span>
        <button type="button" onClick={() => setSelected(null)} aria-label="Close"
          className="-mr-1 -mt-1 shrink-0 rounded-full p-1.5 text-smoke transition-colors hover:bg-cloud hover:text-ink">
          <Icon name="close" className="h-4 w-4" />
        </button>
      </div>
      {/* Five, then a count. A route somebody commutes could be forty rows and
          this is a popover on a map, not the log. */}
      <ul className="max-h-44 divide-y divide-gray-50 overflow-y-auto overscroll-contain">
        {active.flights.slice(0, 5).map((f) => (
          <li key={f.id} className="flex items-baseline gap-2 px-4 py-2 text-xs">
            <span className="shrink-0 font-semibold tabular-nums text-ink">{f.flown_on}</span>
            <span className="min-w-0 flex-1 truncate text-smoke">
              {f.from.iata === active.from.iata ? '' : 'return · '}
              {[f.airline, f.flight_number, f.aircraft].filter(Boolean).join(' · ') || 'No airline logged'}
            </span>
            {f.rating > 0 && <span className="shrink-0 text-brand">{'★'.repeat(f.rating)}</span>}
          </li>
        ))}
      </ul>
      {active.flights.length > 5 && (
        <p className="border-t border-gray-50 px-4 py-2 text-[11px] text-smoke">
          and {active.flights.length - 5} more on this route
        </p>
      )}
    </div>
  )

  const hint = routes.length > 0 && !active && (
    <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-[11px] text-smoke">
      Tap a route to see when you flew it
    </p>
  )

  if (fullscreen) {
    return createPortal(
      <div
        ref={fsRef}
        className={cx('fixed inset-0 z-[70] flex flex-col bg-white', closing ? 'animate-map-out' : 'animate-map-in')}
        // All four insets: landscape puts the notch on the short sides, which
        // is where the exit button and the zoom stack live.
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          paddingLeft: 'env(safe-area-inset-left)',
          paddingRight: 'env(safe-area-inset-right)',
        }}
      >
        <div className="relative min-h-0 flex-1">
          <button
            type="button"
            onClick={exitFullscreen}
            className="absolute left-4 top-4 z-40 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3.5 py-2 text-xs font-semibold text-ink shadow-card ring-1 ring-black/5 backdrop-blur transition-transform hover:scale-105 active:scale-95"
          >
            <Icon name="chevronLeft" className="h-3.5 w-3.5" />
            Exit full screen
          </button>
          {controls}
          <div className="h-full w-full [&>svg]:h-full">{map}</div>
          {card}
          {hint}
        </div>
      </div>,
      document.body,
    )
  }

  return (
    <div className="relative w-full overflow-hidden rounded-card bg-cloud/60">
      {controls}
      {map}
      {card}
      {hint}
      {routes.length === 0 && (
        <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-[11px] text-smoke">
          Log a flight and it will appear here.
        </p>
      )}
    </div>
  )
}

export default memo(FlightMap)
