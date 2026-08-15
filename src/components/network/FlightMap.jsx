import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ComposableMap, Geographies, Geography, ZoomableGroup } from 'react-simple-maps'
import { geoEqualEarth } from 'd3-geo'
import { loadMapFeatures } from '../../lib/mapCountries'
import { countryKey } from '../../lib/countryFacts'
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

const fmtKm = (n) => Math.round(n).toLocaleString('en-GB')

// THE PLANE, AND IT IS THE SAME PLANE AS EVERY OTHER MAP.
//
// THE BUG THIS FIXES. This map drew its own aircraft: a two-part path of
// rectangles meant to read as a jet from above, which at any size under about
// twenty pixels is a smudge with a notch in it. Ethan: "the animation when you
// click it shows a weird icon, it should be the proper plane icon like the
// other maps." CreatorMap's silhouette is the one the rest of the product uses
// and it is drawn NOSE-UP, so it is rotated 90 degrees onto the direction of
// travel, exactly as it is there.
const PLANE_D = 'M0 -11 C1.1 -11 1.8 -9 1.8 -6.2 L1.8 -4.4 L10 1 L10 3.1 L1.8 -0.2 L1.8 5 L4.4 7.6 L4.4 9.2 L0 7.7 L-4.4 9.2 L-4.4 7.6 L-1.8 5 L-1.8 -0.2 L-10 3.1 L-10 1 L-1.8 -4.4 L-1.8 -6.2 C-1.8 -9 -1.1 -11 0 -11 Z'

// EVERY ROUTE CARRIES A PLANE, ALL THE TIME.
//
// It used to be one aeroplane on the SELECTED route only, moved by a
// requestAnimationFrame that set React state sixty times a second. Two things
// were wrong with that and this fixes both:
//
//   * IT ONLY MOVED WHEN YOU CLICKED. Ethan: "with the line, [I want] a
//     constant animated airplane animation, not just when you click it." A map
//     of flights whose aircraft are parked is a diagram.
//   * SETTING STATE EVERY FRAME RE-RENDERED THE WHOLE MAP every frame -
//     240 country paths, every arc, every pin - to move one aeroplane twelve
//     pixels. `animateMotion` is the browser doing this on its own timeline
//     with no React involved at all, which is why it can now be running on ten
//     routes at once and cost less than one did.
//
// `dur` comes from the chord so every plane flies at the same speed rather than
// every route taking the same time regardless of length - the rule CreatorMap
// already uses. The nose follows the path (`rotate="auto"`).
const PLANE_SPEED = 26 // projection units per second
function ArcPlane({ path, chord, size, faint = false, delay = 0 }) {
  const dur = Math.max(2.4, chord / PLANE_SPEED)
  return (
    <g style={{ pointerEvents: 'none' }} opacity={faint ? 0.55 : 1}>
      <g transform={`scale(${size}) rotate(90)`}>
        <path d={PLANE_D} fill={BRAND} stroke="#fff" strokeWidth="1.3" strokeLinejoin="round" />
      </g>
      <animateMotion
        dur={`${dur}s`}
        begin={`${delay}s`}
        repeatCount="indefinite"
        rotate="auto"
        path={path}
      />
    </g>
  )
}

// THE LAND, MEMOISED, for the same reason CreatorMap's is: `<Geographies>`
// takes a render prop, so 240 country paths were rebuilt on every render of
// this component - and with an aeroplane on a rAF that was sixty times a
// second. Nothing about the land depends on the zoom or the selection.
//
// AND THE COUNTRIES YOU HAVE BEEN TO ARE COLOURED IN.
//
// Ethan: "on the everywhere you've been map, the countries you've been to should
// also be highlighted, and you can then click on the route or the country."
//
// The map already knew this and was not saying it. Every airport in the log
// carries an ISO-2 country code, so the set of countries you have landed in is
// free - and it is the single most satisfying thing a flight log can draw,
// because it is the picture people actually want to screenshot. The arcs say
// where you went; the fill says how much of the world that adds up to.
//
// JOINING THE TWO DATASETS. The atlas gives a country NAME and nothing else;
// the airports table gives ISO-2. `countryKey` is the one alias table in this
// codebase that turns either into the same key, which is why it exists (see
// lib/countryFacts) and why nothing here tries to match on names.
//
// A VISITED COUNTRY IS ALSO A TARGET. Unvisited land is inert - clicking the
// Pacific or a country you have never landed in should do nothing rather than
// open an empty card - so only the filled ones take a pointer.
const Countries = memo(function Countries({ features, land, separator, visited, fill, fillHover, onPick }) {
  return (
    <Geographies geography={features || EMPTY_GEO}>
      {({ geographies }) =>
        geographies
          .filter((geo) => geo.properties.name !== 'Antarctica')
          .map((geo) => {
            const iso = countryKey(geo.properties.name)
            const on = visited.has(iso)
            const base = { fill: on ? fill : land, stroke: separator, strokeWidth: 0.4, outline: 'none' }
            return (
              <Geography
                key={geo.rsmKey}
                geography={geo}
                onClick={on ? () => onPick(geo.properties.name, iso) : undefined}
                style={{
                  default: { ...base, cursor: on ? 'pointer' : 'default' },
                  hover: { ...base, fill: on ? fillHover : land, cursor: on ? 'pointer' : 'default' },
                  pressed: { ...base, fill: on ? fillHover : land, outline: 'none' },
                }}
              />
            )
          })
      }
    </Geographies>
  )
})

function FlightMap({ routes = [], airports = [] }) {
  const dark = useIsDark()
  const [features, setFeatures] = useState(null)
  const [position, setPosition] = useState({ coordinates: [12, 8], zoom: 1 })
  // THE COUNTER-SCALE READS THE LIVE ZOOM, NOT THE SETTLED ONE.
  //
  // THE BUG THIS FIXES. Everything drawn on this map is divided by the zoom to
  // hold it at a constant size on screen - the aircraft, the pins, the route
  // strokes, the city labels - and the divisor came from `position`, which was
  // only ever written by `onMoveEnd`. So for the WHOLE of a pinch or a wheel
  // gesture the group was scaling up and nothing on it was compensating: at the
  // end of a zoom from 1 to 6 the aeroplanes were briefly drawn six times too
  // big, and then snapped back the instant the gesture finished. Ethan: "on the
  // main map, when zooming in the planes temporarily appear way too big and then
  // go to normal size."
  //
  // `onMove` fires inside react-simple-maps' own d3 handler, in the same
  // synchronous event as the setState that actually scales the group, so React
  // 18 batches the two into one render and the map and its contents change size
  // on the same painted frame. Deferring this into a rAF would put it in a
  // later batch and reintroduce the same bug one frame wide - which is exactly
  // what had to be undone on CreatorMap.
  const [liveZoom, setLiveZoom] = useState(1)
  const z = liveZoom
  const handleMove = useCallback((pos) => { setLiveZoom(pos.zoom) }, [])
  const handleMoveEnd = useCallback((pos) => { setPosition(pos); setLiveZoom(pos.zoom) }, [])
  // The +/- buttons and the reset write `position` directly and never fire
  // `onMoveEnd`, so the live value is derived from it as well as pushed to it.
  // Setting it in every caller by hand is the version of this that goes wrong
  // the first time somebody adds a fourth way to move the map.
  const [selected, setSelected] = useState(null)   // route key
  const [fullscreen, setFullscreen] = useState(false)
  const [closing, setClosing] = useState(false)
  const fsRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    loadMapFeatures().then((fc) => { if (!cancelled) setFeatures(fc) })
    return () => { cancelled = true }
  }, [])

  // The arrival plays once per map, not once per mount - going full screen
  // remounts this subtree into a portal and every entrance would otherwise run
  // again over the top of a map that was already settled. See the long note in
  // CreatorMap, which hit this first.
  useEffect(() => { setLiveZoom(position.zoom) }, [position.zoom])

  const [arrived, setArrived] = useState(false)
  useEffect(() => {
    if (!features || arrived) return undefined
    // A little past the end of the arrival: the arcs draw for 520ms and the
    // pins pop at 280ms for 300ms, so everything has settled by 600.
    const t = setTimeout(() => setArrived(true), 750)
    return () => clearTimeout(t)
  }, [features, arrived])

  const LAND = dark ? '#2a2c31' : '#ECECEE'
  const SEPARATOR = dark ? '#0c0d10' : '#ffffff'
  // The fill for a country you have landed in. A TINT, not the brand itself:
  // on a well-travelled log this covers a third of the map, and a third of the
  // map in #d94407 is a poster rather than a chart. Hover takes it one step
  // warmer, which is the whole affordance that it can be pressed.
  const VISITED = dark ? '#4a2a17' : '#fbe6da'
  const VISITED_HOVER = dark ? '#61361b' : '#f7d3bd'

  // Every country the log has ever landed in, as ISO-2. Cheap - one pass over
  // the airports already computed for the pins.
  const visited = useMemo(
    () => new Set(airports.map((a) => a.country).filter(Boolean)),
    [airports],
  )

  // WHAT YOU FLEW IN AND OUT OF, IN ONE COUNTRY.
  //
  // The route card answers "when did I fly this line". This answers the other
  // question the map now invites by colouring a country in: what does this
  // place amount to in my log. Airports, busiest first, with the number of
  // flights through each - which is the same shape of answer, so the two cards
  // can be the same object.
  const [country, setCountry] = useState(null)
  const pickCountry = useCallback((name, iso) => setCountry({ name, iso }), [])
  const countryDetail = useMemo(() => {
    if (!country) return null
    const here = airports
      .filter((a) => a.country === country.iso)
      .sort((a, b) => b.weight - a.weight)
    return { ...country, airports: here, flights: here.reduce((n, a) => n + a.weight, 0) }
  }, [country, airports])

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

  // ONE CARD AT A TIME. Two overlapping popovers at the bottom of a map is a
  // stack of paper, and the second one hides the first.
  const pickRoute = useCallback((key) => {
    setCountry(null)
    setSelected((cur) => (cur === key ? null : key))
  }, [])

  // WHICH ROUTES CARRY TRAFFIC.
  //
  // All of them would be a swarm on a log with sixty routes in it, and a swarm
  // is not "alive", it is busy. The ten longest get an aeroplane, which is the
  // same rule CreatorMap uses for its threads and it picks the right ones for
  // the same reason: a long arc has room for a plane to be seen travelling
  // along it, and a forty-pixel hop does not.
  //
  // The staggered `begin` matters more than it looks. Ten aircraft that all
  // start at t=0 leave every airport at the same instant and arrive together,
  // which reads as a mechanism; offset, they read as traffic. The offset is
  // derived from the route's own index so it is stable across renders.
  const flying = useMemo(
    () => [...arcs].sort((a, b) => b.chord - a.chord).slice(0, 10),
    [arcs],
  )

  const zoomBy = (f) => setPosition((p) => ({ ...p, zoom: Math.min(MAX_ZOOM, Math.max(1, p.zoom * f)) }))
  const reset = () => { setPosition({ coordinates: [12, 8], zoom: 1 }); setSelected(null); setCountry(null) }

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

  const showLabels = z >= LABEL_ZOOM

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
        onMove={handleMove}
        onMoveEnd={handleMoveEnd}
      >
        {/* NOTHING DRAWS UNTIL THE ATLAS IS IN, and the routes follow the land
            rather than arriving before it. See `.map-arrive` in index.css. */}
        {features && (
        <g className={arrived ? undefined : 'map-arrive'}>
        <Countries
          features={features}
          land={LAND}
          separator={SEPARATOR}
          visited={visited}
          fill={VISITED}
          fillHover={VISITED_HOVER}
          onPick={pickCountry}
        />

        <g className={arrived ? undefined : 'map-arrive-overlay'}>

        {/* THE ROUTES DRAW THEMSELVES IN.
            `stroke-dasharray` set to the path's own length with the offset
            animated to zero is the one way to make an SVG path appear to be
            drawn, and it composites - so a hundred routes arriving at once
            costs the compositor and not the main thread. The delay ladder is
            capped: past about twenty routes an increasing delay stops reading
            as "one after another" and starts reading as "still loading". */}
        {arcs.map((r) => {
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
                strokeWidth={Math.max(6, 14 / z)}
                strokeLinecap="round"
                style={{ cursor: 'pointer' }}
                onClick={() => pickRoute(r.key)}
              />
              <path
                d={r.d}
                fill="none"
                stroke={on ? BRAND : BRAND}
                strokeWidth={Math.max(0.6, (on ? 2.2 : 1.1) / z)}
                strokeLinecap="round"
                opacity={selected && !on ? 0.22 : 0.75}
                className={arrived ? undefined : 'flight-arc'}
                style={{
                  '--arc-len': Math.round(r.chord * 1.15),
                  pointerEvents: 'none',
                  transition: 'opacity 200ms ease-out',
                }}
              />
            </g>
          )
        })}

        {/* THE TRAFFIC. Always moving, one aircraft per long route, plus one on
            whatever route is open even if it was not long enough to make the
            cut - tapping a line and getting no plane on it would be the map
            answering the wrong question. */}
        <g className={arrived ? undefined : 'map-plane-in'}>
          {flying.map((r, i) => (
            <ArcPlane
              key={`fly-${r.key}`}
              path={r.d}
              chord={r.chord}
              size={Math.max(0.28, 0.85 / z)}
              faint={!!selected && r.key !== selected}
              delay={(i % 5) * 0.9}
            />
          ))}
          {active && !flying.some((r) => r.key === active.key) && (
            <ArcPlane
              key={`fly-${active.key}`}
              path={active.d}
              chord={active.chord}
              size={Math.max(0.28, 0.85 / z)}
            />
          )}
        </g>

        {pins.map((a) => {
          // A pin belonging to the open route is drawn up; everything else
          // steps back, which is what makes one route readable on a busy map.
          const on = active && (a.iata === active.from.iata || a.iata === active.to.iata)
          const r = Math.max(1.4, (a.weight > 4 ? 3.4 : a.weight > 1 ? 2.8 : 2.2) / z)
          return (
            <g key={a.iata} className={arrived ? undefined : 'flight-pin'} style={{ transformOrigin: `${a.x}px ${a.y}px` }}>
              <circle
                cx={a.x}
                cy={a.y}
                r={on ? r * 1.5 : r}
                fill={on ? BRAND : a.weight > 1 ? BRAND : BRAND_LIGHT}
                stroke="#fff"
                strokeWidth={Math.max(0.3, 0.7 / z)}
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
                <g transform={`translate(${a.x} ${a.y - r - 2}) scale(${1 / z})`} style={{ pointerEvents: 'none' }}>
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
        </g>
        </g>
        )}
      </ZoomableGroup>
    </ComposableMap>
  )

  // WHAT A ROUTE ACTUALLY WAS.
  //
  // Ethan: "clicking on the line on the map should show a popup with info on
  // the flight you took and when." A route on this map is one line per PAIR of
  // airports, so it can stand for eight flights - the card names all of them,
  // newest first, rather than picking one and calling it the answer.
  // A BIGGER CARD. Ethan: "when you click on a flight on the map it shows up the
  // little card with info, can you make this card a bit bigger."
  // It was `max-w-sm` with 11px type and a 44-unit scroller, which on a route
  // flown eight times showed two and a half rows and then a scrollbar - a card
  // small enough that reading it was work. `max-w-md`, a size up on every line
  // and room for four rows before it scrolls; still a popover, but one you can
  // read at arm's length.
  const card = active && (
    <div className="pointer-events-auto absolute inset-x-3 bottom-3 z-20 mx-auto max-w-md overflow-hidden rounded-card border border-gray-100 bg-white/97 shadow-lift backdrop-blur animate-map-in">
      <div className="flex items-start gap-3 border-b border-gray-100 px-5 py-4">
        <span className="flex shrink-0 items-center gap-2 text-base font-bold tracking-wider text-brand">
          {active.from.iata}
          {/* THE AEROPLANE BETWEEN THE TWO CODES IS ORANGE.
              It was `text-gray-300` - a pale grey glyph between two orange
              words, which at 14px on a white card is very nearly invisible.
              Ethan: "the plane icon is grey and hard to see, can you make it
              orange, maybe the lighter orange to differentiate."
              BRAND_LIGHT rather than BRAND is the whole point: it reads as
              part of the same phrase as the airport codes without competing
              with them for it. */}
          <Icon name="plane" className="h-4 w-4 text-brand-light" />
          {active.to.iata}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{active.from.city} to {active.to.city}</span>
          <span className="block text-xs text-smoke">
            {active.flights.length} {active.flights.length === 1 ? 'flight' : 'flights'}
            {active.flights[0]?.dist ? ` · ${fmtKm(active.flights[0].dist)} km each way` : ''}
          </span>
        </span>
        <button type="button" onClick={() => setSelected(null)} aria-label="Close"
          className="-mr-1.5 -mt-1.5 shrink-0 rounded-full p-1.5 text-smoke transition-colors hover:bg-cloud hover:text-ink">
          <Icon name="close" className="h-4 w-4" />
        </button>
      </div>
      {/* Five, then a count. A route somebody commutes could be forty rows and
          this is a popover on a map, not the log. */}
      <ul className="max-h-56 divide-y divide-gray-50 overflow-y-auto overscroll-contain">
        {active.flights.slice(0, 5).map((f) => (
          <li key={f.id} className="flex items-baseline gap-2.5 px-5 py-2.5 text-xs">
            <span className="shrink-0 font-semibold tabular-nums text-ink">{f.flown_on}</span>
            <span className="min-w-0 flex-1 truncate text-smoke">
              {f.from.iata === active.from.iata ? '' : 'return · '}
              {[f.airline, f.flight_number, f.aircraft].filter(Boolean).join(' · ') || 'No airline logged'}
            </span>
          </li>
        ))}
      </ul>
      {active.flights.length > 5 && (
        <p className="border-t border-gray-50 px-5 py-2.5 text-[11px] text-smoke">
          and {active.flights.length - 5} more on this route
        </p>
      )}
    </div>
  )

  // The same object as the route card, because it answers the same kind of
  // question about a different shape of thing. Only one of the two is ever on
  // screen; see `pickRoute`.
  const countryCard = countryDetail && (
    <div className="pointer-events-auto absolute inset-x-3 bottom-3 z-20 mx-auto max-w-md overflow-hidden rounded-card border border-gray-100 bg-white/97 shadow-lift backdrop-blur animate-map-in">
      <div className="flex items-start gap-3 border-b border-gray-100 px-5 py-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-tint text-brand">
          <Icon name="globe" className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-bold">{countryDetail.name}</span>
          <span className="block text-xs text-smoke">
            {countryDetail.airports.length} {countryDetail.airports.length === 1 ? 'airport' : 'airports'}
            {' · '}
            {countryDetail.flights} {countryDetail.flights === 1 ? 'flight' : 'flights'} through it
          </span>
        </span>
        <button type="button" onClick={() => setCountry(null)} aria-label="Close"
          className="-mr-1.5 -mt-1.5 shrink-0 rounded-full p-1.5 text-smoke transition-colors hover:bg-cloud hover:text-ink">
          <Icon name="close" className="h-4 w-4" />
        </button>
      </div>
      <ul className="max-h-56 divide-y divide-gray-50 overflow-y-auto overscroll-contain">
        {countryDetail.airports.map((a) => (
          <li key={a.iata} className="flex items-baseline gap-2.5 px-5 py-2.5 text-xs">
            <span className="shrink-0 font-bold tracking-wider text-brand">{a.iata}</span>
            <span className="min-w-0 flex-1 truncate text-smoke">{a.city}</span>
            <span className="shrink-0 tabular-nums text-smoke">
              {a.weight} {a.weight === 1 ? 'flight' : 'flights'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )

  const hint = routes.length > 0 && !active && !countryDetail && (
    <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-[11px] text-smoke">
      Tap a route, or a country you have landed in
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
          {countryCard}
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
      {countryCard}
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
