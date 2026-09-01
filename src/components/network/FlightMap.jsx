import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ComposableMap, Geographies, Geography, ZoomableGroup } from 'react-simple-maps'
import { loadWorldAirports, tierAt, dotRadius } from '../../lib/worldAirports'
import { geoEqualEarth } from 'd3-geo'
import { loadMapFeatures } from '../../lib/mapCountries'
import { countryKey } from '../../lib/countryFacts'
import { useIsDark } from '../../lib/theme'
import { cx } from '../../lib/utils'
import { flagFromIso } from '../../lib/flags'
import Icon from '../Icon'
import PhotoLightbox from '../PhotoLightbox'

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
  // A ROUTE WHOSE ENDS DO NOT PROJECT HAS NO PATH, AND MUST SAY SO.
  //
  // This is the stray aeroplane in the top-left corner. `projection()` returns
  // null for a point it cannot place and NaN for a null lat/lng, so one airport
  // row with missing coordinates produced `d="MNaN NaN Q NaN NaN NaN NaN"`.
  // An `animateMotion` given an unparseable path does not fail loudly - it
  // simply never moves its parent, and the parent's untransformed position is
  // the viewBox ORIGIN. Hence: a plane, at 0,0, going nowhere, on a map where
  // nobody has flown to the top-left corner of the world. Ethan: "occasionally
  // a random plane icon appears near the top left corner, why is this here."
  const pa = projection([a.lng, a.lat])
  const pb = projection([b.lng, b.lat])
  if (!pa || !pb) return { d: null, chord: 0 }
  const [ax, ay] = pa
  const [bx, by] = pb
  if (![ax, ay, bx, by].every(Number.isFinite)) return { d: null, chord: 0 }
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

// HOW BIG A MARKER IS AT A GIVEN ZOOM.
//
// Everything on this map was `base / z` with a floor: `Math.max(1.4, 3.4 / z)`.
// Dividing by z holds a marker at a CONSTANT APPARENT SIZE, which sounds right
// and is not what the zoom is for here. Ethan: "when I zoom in a lot the
// circles and planes should also get a bit smaller, for example even with the
// map zoomed out or in, my flight from Belfast to Dublin can barely be seen."
//
// He is describing the real failure. BFS to DUB is about six projection units
// long; two 3.4-unit dots sit on top of the whole route, so the arc between
// them is invisible - and zooming in did not help, because the dots grew with
// it. Worse, the `Math.max` floor is in MAP units, so past z ~2.4 they stopped
// shrinking at all and just got bigger and bigger on screen.
//
// Dividing by `z^1.15` makes the apparent size fall gently as you go in: a
// weight-4 pin is 3.4px across the whole world, about 2.8px at z=4, and holds
// there. Enough for the short hop to open up underneath it, never so small it
// disappears. The floor is now small enough to be a genuine last resort.
// AND THE AEROPLANE STARTS SMALLER THAN THE PINS DO.
//
// Ethan: "when fully zoomed out on these maps, the plane icon is too big, it
// should be a bit smaller." At z=1 a 0.85 marker draws a glyph 18-19 units
// across the sprite's own box, which on a world map is about the width of
// Ireland. 0.62 is the same aeroplane at roughly three quarters the size:
// still unmistakably a plane on a long-haul arc, no longer a landmark.
const PLANE_BASE = 0.62
const MARKER_FALLOFF = 1.15
const scaleAt = (base, z, min) => Math.max(min, base / Math.pow(z, MARKER_FALLOFF))
function ArcPlane({ path, chord, size, faint = false, delay = 0 }) {
  // The second half of the top-left-corner fix: even with arcFor guarded, this
  // is the component that would park at the origin, so it declines to render
  // rather than trusting its caller.
  if (!path) return null
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

// EVERY AIRPORT IN THE WORLD, UNDERNEATH EVERYTHING ELSE.
//
// The rules for how many and how big are in lib/worldAirports and the argument
// for them is there too. What is here is the drawing, plus the two things that
// make eight thousand of anything survive contact with React, plus the hit
// testing - which is its own problem and the reason this is not just circles.
//
// PROJECT ONCE, NOT PER RENDER. The projection is module-level and fixed - the
// zoom and pan are a transform on the group, not a new projection - so every
// airport's position is computed on the frame the data lands and never again.
//
// CULL TO THE VIEWPORT. Tier alone is not enough: zoomed into Norway at z=12
// the tier filter still admits every tier-3 field on Earth, and 5,000 dots
// drawn 40 screens away cost exactly what 5,000 visible ones do.
//
// AND THEY ARE CLICKABLE NOW, WHICH NEEDED A SECOND CIRCLE PER DOT.
//
// Ethan: "I said every airport little dot should be clickable." They were
// `pointer-events: none` scenery. The difficulty is that the visible dot is
// measured at 1.5 to 2.4 SCREEN PIXELS - that is the whole point of the sizing
// work - and a two-pixel tap target does not exist on a phone. So each shown
// airport also gets an invisible circle at a fixed ~9px of screen, which is
// what actually receives the press.
//
// The hit circles are a SEPARATE GROUP drawn after the visible ones rather than
// a bigger stroke on each, because they have to overlap each other freely and
// must never paint. Their radius divides by the zoom so it stays a constant
// finger-sized target at every magnification - the opposite rule to the dots,
// and correct for the opposite reason.
//
// AND THE HIT TARGETS ARE DRAWN IN A SEPARATE PASS, ABOVE THE ROUTES.
//
// THE BUG: "if I click on an airport dot near a flight trail, it clicks on the
// flight trail instead." SVG has no z-index - the last thing painted is the
// thing on top and the thing that gets the press - and this whole component was
// rendered BEFORE the arcs. Each arc carries an invisible 14px stroke so a
// two-pixel line can be tapped with a thumb, and that fat stroke was therefore
// lying across every airport dot within seven pixels of a route. On a map whose
// dots ARE the ends of those routes, that is most of them.
//
// The two layers want opposite orders and cannot both be satisfied by moving
// the component: the visible dots belong UNDER the routes (they are scenery you
// read through), and the hit circles belong OVER them. So `layer` renders one or
// the other and FlightMap draws it twice, once on each side of the arcs.
function WorldAirports({ placed, zoom, center, onPick, selected, layer = 'dots' }) {
  const shown = useMemo(() => {
    if (!placed.length) return []
    const deepest = tierAt(zoom)
    const c = projection(center) || [WIDTH / 2, HEIGHT / 2]
    // A margin of one dot radius, so a marker whose centre is just outside the
    // frame does not pop as it crosses the edge.
    const halfW = WIDTH / (2 * zoom) + 4
    const halfH = HEIGHT / (2 * zoom) + 4
    return placed.filter((a) => a.tier <= deepest
      && Math.abs(a.x - c[0]) <= halfW && Math.abs(a.y - c[1]) <= halfH)
  }, [placed, zoom, center])

  if (!shown.length) return null
  const hit = Math.max(1.2, 9 / zoom)

  if (layer === 'hits') {
    return (
      <g>
        {shown.map((a) => (
          <circle
            key={a.iata}
            cx={a.x}
            cy={a.y}
            r={hit}
            fill="transparent"
            style={{ cursor: 'pointer' }}
            onClick={(e) => { e.stopPropagation(); onPick(a.iata) }}
          >
            {/* A native tooltip on the hit target, so hovering a dot on a
                laptop names it without opening anything. */}
            <title>{`${a.iata} - ${a.name}`}</title>
          </circle>
        ))}
      </g>
    )
  }

  return (
    <>
      <g style={{ pointerEvents: 'none' }} aria-hidden>
        {shown.map((a) => (
          <circle
            key={a.iata}
            cx={a.x}
            cy={a.y}
            r={a.iata === selected ? dotRadius(a.tier, zoom) * 2.6 : dotRadius(a.tier, zoom)}
            fill={a.iata === selected ? BRAND : BRAND_LIGHT}
            // Light on the land, and it has to be light: this is a layer you
            // read THROUGH to the routes above it. A tier-3 airstrip is fainter
            // again, which does the same job as the size difference and survives
            // at a radius where a size difference is under a pixel.
            opacity={a.iata === selected ? 1 : a.tier === 0 ? 0.62 : a.tier === 3 ? 0.3 : 0.44}
          />
        ))}
      </g>
    </>
  )
}

function FlightMap({ routes = [], airports = [], routeExtra = null }) {
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
  // AND THE LIVE CENTRE, FOR THE SAME REASON AND A DIFFERENT SYMPTOM.
  //
  // THE BUG: "the airport dots temporarily fade away and then reappear, which
  // looks odd." The world-airport layer culls to the viewport, and the window
  // it culls against was computed from the LIVE zoom and the SETTLED centre.
  // A wheel or pinch zoom in react-simple-maps is anchored on the pointer, so
  // the centre moves throughout the gesture: half a frame into a zoom the
  // window had already shrunk around a point the map had left, and every dot
  // outside it was dropped - then `onMoveEnd` wrote the real centre and they
  // all came back. Both halves of the window have to come from the same
  // moment, so the centre is tracked live too.
  const [liveCenter, setLiveCenter] = useState([12, 8])
  const z = liveZoom
  const handleMove = useCallback((pos) => {
    setLiveZoom(pos.zoom)
    if (pos.coordinates) setLiveCenter(pos.coordinates)
  }, [])
  const handleMoveEnd = useCallback((pos) => {
    setPosition(pos)
    setLiveZoom(pos.zoom)
    if (pos.coordinates) setLiveCenter(pos.coordinates)
  }, [])
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
  useEffect(() => { setLiveCenter(position.coordinates) }, [position.coordinates])

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
  // THE WORLD LIST LIVES HERE, NOT IN THE LAYER, because three things need it
  // now: the dots, the card that opens when you press one, and the country card,
  // which has to be able to say how many airports are in a country rather than
  // how many of them you personally have used.
  const [world, setWorld] = useState([])
  useEffect(() => {
    let alive = true
    loadWorldAirports().then((rows) => { if (alive) setWorld(rows) }).catch(() => {})
    return () => { alive = false }
  }, [])

  const worldPlaced = useMemo(() => {
    const out = []
    for (const a of world) {
      const pt = projection([a.lng, a.lat])
      // `projection()` returns null for a point it cannot place. See the note on
      // arcFor: an unguarded null here is a dot at the viewBox origin.
      if (!pt || !Number.isFinite(pt[0]) || !Number.isFinite(pt[1])) continue
      out.push({ ...a, x: pt[0], y: pt[1] })
    }
    // Deepest tier first so the hubs paint last and sit on top where two
    // airports share a pixel.
    out.sort((a, b) => b.tier - a.tier)
    return out
  }, [world])

  const worldByCode = useMemo(() => {
    const m = new Map()
    for (const a of world) m.set(a.iata, a)
    return m
  }, [world])

  // A trip photograph, blown up over the map. Its own portal layer, for the
  // reason PhotoLightbox documents: the card it opens from is drawn inside the
  // map's own stacking context and a z-index written here could never clear it.
  const [photo, setPhoto] = useState(null)
  const [pickedAirport, setPickedAirport] = useState(null)
  const [country, setCountry] = useState(null)
  // A NEW CARD ALWAYS CLOSES THE OLD ONE, IN BOTH DIRECTIONS.
  //
  // `pickRoute` cleared the country and `pickCountry` did not clear the route,
  // so the exclusivity only worked one way round: click an arc for its flight
  // card, then click Spain, and the country card opened ON TOP of it. Ethan:
  // "clicking a new thing that shows a popup should always close the other one."
  const pickCountry = useCallback((name, iso) => {
    setSelected(null)
    setPickedAirport(null)
    setCountry({ name, iso })
  }, [])

  // The third card, and it obeys the same rule as the other two: opening one
  // closes the others. Pressing the same dot again closes it.
  const pickAirport = useCallback((iata) => {
    setSelected(null)
    setCountry(null)
    setPickedAirport((cur) => (cur === iata ? null : iata))
  }, [])
  // "1 AIRPORT HERE" WAS TRUE AND READ AS A LIE.
  //
  // This counted the airports in YOUR LOG for the country you pressed, and drew
  // "1 airport · 4 flights through it". Ethan, pressing Ireland: "clicking on
  // them just shows up information on like one airport, it says one airport
  // here." Of course it does - he has flown through one. But the map now draws
  // every airport in the world, so the sentence is sitting next to a dozen
  // visible dots in that country and the only available reading is that the map
  // thinks Ireland has one airport.
  //
  // So the card now says both numbers, and says which is which.
  const countryDetail = useMemo(() => {
    if (!country) return null
    const here = airports
      .filter((a) => a.country === country.iso)
      .sort((a, b) => b.weight - a.weight)
    const total = world.reduce((n, a) => n + (a.country === country.iso ? 1 : 0), 0)
    return {
      ...country,
      airports: here,
      total,
      flights: here.reduce((n, a) => n + a.weight, 0),
    }
  }, [country, airports, world])

  // WHAT ONE DOT KNOWS ABOUT ITSELF. The world row, plus whatever the log has
  // to say about it - which is the part that makes pressing a dot worth doing.
  const airportDetail = useMemo(() => {
    if (!pickedAirport) return null
    const w = worldByCode.get(pickedAirport)
    if (!w) return null
    const mine = airports.find((a) => a.iata === pickedAirport) || null
    const legs = routes.filter((r) => r.from?.iata === pickedAirport || r.to?.iata === pickedAirport)
    return { ...w, mine, legs }
  }, [pickedAirport, worldByCode, airports, routes])

  const arcs = useMemo(
    () => routes.map((r) => ({ ...r, ...arcFor(r.from, r.to) })),
    [routes],
  )

  const pins = useMemo(
    () => airports.flatMap((a) => {
      const p = projection([a.lng, a.lat])
      if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) return []
      return [{ ...a, x: p[0], y: p[1] }]
    }),
    [airports],
  )

  const active = useMemo(() => arcs.find((r) => r.key === selected) || null, [arcs, selected])

  // ONE CARD AT A TIME. Two overlapping popovers at the bottom of a map is a
  // stack of paper, and the second one hides the first.
  const pickRoute = useCallback((key) => {
    setCountry(null)
    setPickedAirport(null)
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
    () => arcs.filter((r) => r.d).sort((a, b) => b.chord - a.chord).slice(0, 10),
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
      {/* THE SAME RESET GLYPH EVERY OTHER MAP ON THE PLATFORM USES.
          This one had a globe, which in a stack under + and − reads as "switch
          to a globe view" rather than "put it back". Ethan: "the reset icon for
          this map is a globe rather than the reset icon like on other maps."
          Inlined rather than added to Icon.jsx because CreatorMap carries the
          identical inline path - one shape, two call sites, no third source of
          truth to keep in step. */}
      <button type="button" onClick={reset} aria-label="Reset map view"
        className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-smoke shadow-card transition-transform hover:scale-105 active:scale-95">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9 9 0 0 0-6.7 3M3 4v4h4"/></svg>
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

        {/* EVERY AIRPORT IN THE WORLD, FIRST IN THE GROUP SO IT IS LAST IN THE
            STACK. SVG paints in document order, so this has to be drawn before
            the routes or six thousand dots sit on top of the thing the map is
            actually about. `liveZoom` and not `position.zoom`, for the reason
            in the note above: during a zoom gesture the state lags the
            transform, and a marker sized from the stale value is visibly the
            wrong size until the gesture ends. */}
        <WorldAirports
          placed={worldPlaced}
          zoom={liveZoom}
          center={liveCenter}
          onPick={pickAirport}
          selected={pickedAirport}
          layer="dots"
        />

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

        {/* THE AIRPORT PRESS TARGETS, ABOVE THE ROUTES.
            Their dots are painted under the routes, twenty lines up, because
            they are scenery you read through. The invisible circles that
            actually receive a press have to be here instead: an arc carries a
            14px transparent stroke so a two-pixel line can be tapped, and
            underneath that stroke an airport dot was unreachable. Nothing is
            drawn twice - the two passes render different elements. */}
        <WorldAirports
          placed={worldPlaced}
          zoom={liveZoom}
          center={liveCenter}
          onPick={pickAirport}
          selected={pickedAirport}
          layer="hits"
        />

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
              size={scaleAt(PLANE_BASE, z, 0.12)}
              faint={!!selected && r.key !== selected}
              delay={(i % 5) * 0.9}
            />
          ))}
          {active && !flying.some((r) => r.key === active.key) && (
            <ArcPlane
              key={`fly-${active.key}`}
              path={active.d}
              chord={active.chord}
              size={scaleAt(PLANE_BASE, z, 0.12)}
            />
          )}
        </g>

        {pins.map((a) => {
          // A pin belonging to the open route is drawn up; everything else
          // steps back, which is what makes one route readable on a busy map.
          const on = active && (a.iata === active.from.iata || a.iata === active.to.iata)
          const r = scaleAt(a.weight > 4 ? 3.4 : a.weight > 1 ? 2.8 : 2.2, z, 0.32)
          return (
            <g key={a.iata} className={arrived ? undefined : 'flight-pin'} style={{ transformOrigin: `${a.x}px ${a.y}px` }}>
              {/* A PIN IS PRESSABLE, AND UNTIL NOW IT WAS THE ONE DOT ON THE
                  MAP THAT WAS NOT.
                  Ethan: "I still seem to be unable to select an airport if a
                  trip is already from there, it doesn't let me click it on the
                  map." The world-airport layer puts an invisible finger-sized
                  hit circle under every dot - but these pins are painted LAST,
                  they are the biggest circles on the map, and they had no
                  handler. SVG has no z-index: the last thing painted takes the
                  press. So every airport you have actually flown from was
                  covered by a target that did nothing, which is precisely the
                  set of airports worth pressing. */}
              <circle
                cx={a.x}
                cy={a.y}
                r={on ? r * 1.5 : r}
                fill={on ? BRAND : a.weight > 1 ? BRAND : BRAND_LIGHT}
                stroke="#fff"
                strokeWidth={scaleAt(0.7, z, 0.07)}
                opacity={selected && !on ? 0.35 : 1}
                style={{ cursor: 'pointer' }}
                onClick={(e) => { e.stopPropagation(); pickAirport(a.iata) }}
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
  // A route's rows, with anything that is not a real flight object dropped.
  // Belt and braces on top of the FlightCommunity fix: a caller that hands this
  // map a sparse array should get a shorter list, never a crash inside a
  // popover.
  const activeRows = (active?.flights || []).filter((f) => f && f.id)
  const activeCount = active ? (active.count ?? active.flights?.length ?? 0) : 0

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
            {/* `count` when the caller gave one (the community map knows how
                many flights a route carries but is not allowed to know whose or
                when), otherwise the length of the rows we actually hold. */}
            {activeCount} {activeCount === 1 ? 'flight' : 'flights'}
            {activeRows[0]?.dist ? ` · ${fmtKm(activeRows[0].dist)} km each way` : ''}
          </span>
        </span>
        <button type="button" onClick={() => setSelected(null)} aria-label="Close"
          className="-mr-1.5 -mt-1.5 shrink-0 rounded-full p-1.5 text-smoke transition-colors hover:bg-cloud hover:text-ink">
          <Icon name="close" className="h-4 w-4" />
        </button>
      </div>
      {/* NO ROWS IS A LEGITIMATE STATE, not an empty list.
          On the community map a route is a count and nothing else - who flew it
          and when is deliberately not readable (migration 103) - so the card
          says what it can say instead of drawing an empty scroller. */}
      {/* WHAT THE CALLER CAN ADD. On the community map the per-flight rows are
          deliberately unavailable (migration 103 - a date and a flight number
          are somebody's movement history), but WHO flies a route is public, and
          Ethan asked for the same richer card there: "same for the across the
          community trips, and it should provide some info, show the creator's
          name and profile picture." The map does not know how to fetch that, so
          the page that does hands it down. */}
      {routeExtra?.(active)}
      {activeRows.length === 0 ? (
        <p className="px-5 py-3.5 text-xs text-smoke">
          Dates and airlines stay private to whoever logged the flight. This is
          how many times the community has flown the route.
        </p>
      ) : (
      /* Five, then a count. A route somebody flies weekly could be forty rows
         and this is a popover on a map, not the log.
         EACH ROW IS THE TRIP, NOT A LINE OF METADATA.
         Ethan: "when clicking on a trip on your personal map it should show up
         something more like that with the photo if you logged one and more
         details, I think it would look better." "That" is the trip sheet at the
         foot of the log, and he is right that the two were answering the same
         question at wildly different quality: this card was one grey line per
         flight naming an airline. It now leads with the photograph where there
         is one - which is the thing that makes a route on a map worth pressing
         - and carries the direction, the aircraft, the distance and the note
         under it. */
      <ul className="max-h-64 divide-y divide-gray-50 overflow-y-auto overscroll-contain">
        {activeRows.slice(0, 5).map((f) => {
          const back = f.from.iata !== active.from.iata
          return (
            <li key={f.id} className="flex items-start gap-3 px-5 py-3">
              {f.photo_url ? (
                <button
                  type="button"
                  onClick={() => setPhoto(f.photo_url)}
                  className="group relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-cloud"
                  aria-label="Open the photo full size"
                >
                  <img src={f.photo_url} alt="" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                  <span className="absolute inset-0 flex items-center justify-center bg-ink/0 text-white opacity-0 transition-all duration-200 group-hover:bg-ink/35 group-hover:opacity-100">
                    <Icon name="expand" className="h-4 w-4" />
                  </span>
                </button>
              ) : (
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-cloud text-gray-300">
                  <Icon name="plane" className="h-5 w-5" />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="text-xs font-semibold tabular-nums text-ink">{f.flown_on}</span>
                  <span className="flex items-center gap-1 text-[11px] font-bold tracking-wider text-brand">
                    {f.from.iata}
                    <Icon name="plane" className="h-3 w-3 text-brand-light" />
                    {f.to.iata}
                  </span>
                  {back && <span className="text-[10px] font-semibold uppercase tracking-wide text-smoke">Back</span>}
                </span>
                <span className="mt-0.5 block truncate text-[11px] text-smoke">
                  {[f.airline, f.flight_number, f.aircraft].filter(Boolean).join(' · ') || 'No airline logged'}
                </span>
                <span className="mt-0.5 block text-[11px] tabular-nums text-gray-400">
                  {f.dist ? `${fmtKm(f.dist)} km` : ''}
                  {f.dist && f.seat ? ' · ' : ''}
                  {f.seat ? `seat ${f.seat}` : ''}
                </span>
                {f.note && <span className="mt-1 line-clamp-2 block text-[11px] leading-4 text-smoke">{f.note}</span>}
              </span>
            </li>
          )
        })}
      </ul>
      )}
      {activeRows.length > 5 && (
        <p className="border-t border-gray-50 px-5 py-2.5 text-[11px] text-smoke">
          and {activeRows.length - 5} more on this route
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
            {/* BOTH NUMBERS, AND WHICH IS WHICH. See the note on countryDetail:
                this used to print only the airports in your own log, which read
                as the map claiming Ireland has one airport. */}
            {countryDetail.airports.length > 0
              ? `You have used ${countryDetail.airports.length} of ${countryDetail.total} airports here`
              : `${countryDetail.total} ${countryDetail.total === 1 ? 'airport' : 'airports'} here, none of them yours yet`}
            {countryDetail.flights > 0 && ` · ${countryDetail.flights} ${countryDetail.flights === 1 ? 'flight' : 'flights'} through it`}
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

  // ONE DOT, PRESSED. The same object as the route and country cards, because it
  // answers the same kind of question about a smaller thing: what is this, where
  // is it, and does it mean anything to me.
  //
  // The last line is the one worth having. An airport you have never used says
  // so plainly rather than pretending to be a destination - "somewhere you have
  // not been yet" is an invitation, and an empty card is a dead end.
  const airportCard = airportDetail && (
    <div className="pointer-events-auto absolute inset-x-3 bottom-3 z-20 mx-auto max-w-md overflow-hidden rounded-card border border-gray-100 bg-white/97 shadow-lift backdrop-blur animate-map-in">
      <div className="flex items-start gap-3 px-5 py-4">
        <span className="flex h-9 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-xs font-bold tracking-wider text-brand">
          {airportDetail.iata}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-bold">{airportDetail.name}</span>
          {/* THE FLAG, NOT THE CODE. `country` on a world row is ISO-2, which is
              the right thing to STORE (it is what the map's country layer keys
              on) and the wrong thing to print - the card was reading "Dublin,
              IE". `flagFromIso` covers every country in the table, where a
              name lookup would only cover the ones the app already knows about. */}
          <span className="block truncate text-xs text-smoke">
            {airportDetail.city || airportDetail.name}
            {airportDetail.country && (
              <span aria-hidden className="ml-1.5">{flagFromIso(airportDetail.country)}</span>
            )}
          </span>
        </span>
        <button type="button" onClick={() => setPickedAirport(null)} aria-label="Close"
          className="-mr-1.5 -mt-1.5 shrink-0 rounded-full p-1.5 text-smoke transition-colors hover:bg-cloud hover:text-ink">
          <Icon name="close" className="h-4 w-4" />
        </button>
      </div>
      <div className="border-t border-gray-100 px-5 py-3">
        {airportDetail.mine ? (
          <p className="flex items-center gap-2 text-xs text-ink">
            <Icon name="check" className="h-3.5 w-3.5 shrink-0 text-green-600" />
            <span>
              <span className="font-semibold">
                {airportDetail.mine.weight} {airportDetail.mine.weight === 1 ? 'flight' : 'flights'}
              </span>
              {' through here'}
              {airportDetail.legs.length > 0 && `, on ${airportDetail.legs.length} ${airportDetail.legs.length === 1 ? 'route' : 'routes'}`}
            </span>
          </p>
        ) : (
          <p className="flex items-center gap-2 text-xs text-smoke">
            <Icon name="plane" className="h-3.5 w-3.5 shrink-0 text-gray-300" />
            Somewhere you have not been yet.
          </p>
        )}
      </div>
    </div>
  )

  const hint = routes.length > 0 && !active && !countryDetail && !airportCard && (
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
          {airportCard}
          {hint}
        </div>
        <PhotoLightbox src={photo} onClose={() => setPhoto(null)} />
      </div>,
      document.body,
    )
  }

  return (
    <>
      <div className="relative w-full overflow-hidden rounded-card bg-cloud/60">
        {controls}
        {map}
        {card}
        {countryCard}
        {airportCard}
        {hint}
        {routes.length === 0 && (
          <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-[11px] text-smoke">
            Log a flight and it will appear here.
          </p>
        )}
      </div>
      <PhotoLightbox src={photo} onClose={() => setPhoto(null)} />
      {/* THE OPENFLIGHTS LINE HAS MOVED, NOT GONE.
          Ethan asked for it off both map pages, and it is off them. It could
          not simply be deleted: the six thousand faint airport dots are
          OpenFlights data under the Open Database Licence, and ODbL requires
          attribution wherever that data is used - so it now lives once, in the
          credits on /flights/aircraft, next to the photo credits that are there
          for the same reason. If it should sit somewhere more prominent that is
          a decision to take deliberately, not by dropping it. */}
    </>
  )
}

export default memo(FlightMap)
