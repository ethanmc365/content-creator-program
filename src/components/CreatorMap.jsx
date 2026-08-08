import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ComposableMap, Geographies, Geography, ZoomableGroup, Marker } from 'react-simple-maps'
import { geoEqualEarth, geoDistance, geoContains } from 'd3-geo'
import { feature } from 'topojson-client'
import { Link } from 'react-router-dom'
import { GEO_URL, loadMapCentroids } from '../lib/mapCountries'
import { geocodeCity } from '../lib/geocode'
import { formatDate } from '../lib/utils'
import { useIsDark } from '../lib/theme'
import Icon from './Icon'

// The creator map directory: every creator pinned on a world map at their home
// town (photo + name), the countries they live in tinted orange, and a curved
// dashed "we're all connected" line threading the whole community together with
// a little plane on the long over-water hops.
//
// Built on the same react-simple-maps + world-atlas stack as WorldMap (no API
// keys, no tile servers, CSP-clean, deep zoom). Everything derives from the
// `creators` prop, so it updates automatically as members join or move.
const BRAND = '#d94407'
const BRAND_LIGHT = '#f5853f'
const LAND = '#ECECEE'
const HOME = '#f9c9a7' // soft orange tint for countries creators live in

// Every plane flies at EXACTLY the same speed. Duration = true curve length /
// speed, with NO clamping - clamping was what made short hops crawl and long
// hops race. Speed is in projection units per second.
const PLANE_SPEED = 10
const flightDur = (len) => len / PLANE_SPEED

// Arc length of the quadratic curve we draw (M a Q c b), sampled. Using the
// straight-line chord instead would make curved (bulged) routes run fast, so we
// measure the path the plane actually flies.
function quadLength(ax, ay, cx, cy, bx, by, steps = 24) {
  let len = 0, px = ax, py = ay
  for (let i = 1; i <= steps; i++) {
    const t = i / steps, u = 1 - t
    const x = u * u * ax + 2 * u * t * cx + t * t * bx
    const y = u * u * ay + 2 * u * t * cy + t * t * by
    len += Math.hypot(x - px, y - py)
    px = x; py = y
  }
  return len
}

// Planes only ride the longer threads, so dense clusters (Ireland/UK, mainland
// Europe) stay tidy. The dashed line still connects EVERY town - only the plane
// count is thinned.
const MIN_PLANE_LEN = 90 // projection units; shorter hops get line but no plane
const MAX_PLANES = 7

// The Tryp plane silhouette, drawn nose-up.
const PLANE_D = 'M0 -11 C1.1 -11 1.8 -9 1.8 -6.2 L1.8 -4.4 L10 1 L10 3.1 L1.8 -0.2 L1.8 5 L4.4 7.6 L4.4 9.2 L0 7.7 L-4.4 9.2 L-4.4 7.6 L-1.8 5 L-1.8 -0.2 L-10 3.1 L-10 1 L-1.8 -4.4 L-1.8 -6.2 C-1.8 -9 -1.1 -11 0 -11 Z'

// The map frame + projection. These MUST match the <ComposableMap> props below
// so our hand-drawn connection lines line up exactly with the pins/geography.
const WIDTH = 880
const HEIGHT = 480
const projection = geoEqualEarth()
  .translate([WIDTH / 2, HEIGHT / 2])
  .center([12, 8])
  .scale(160)

function townKey(lat, lng) {
  return `${lat.toFixed(3)},${lng.toFixed(3)}`
}
function initials(name = '') {
  return name.split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?'
}

// Match a creator's typed country against a map geography name. Point-in-polygon
// (geoContains) misses coastal / island towns whose coords land just offshore,
// so we also tint by the country the creator explicitly stated. Normalised +
// a small alias table for the names world-atlas spells differently.
const norm = (s) => (s || '').toLowerCase().replace(/[^a-z]/g, '')
const COUNTRY_ALIASES = {
  usa: 'unitedstatesofamerica', us: 'unitedstatesofamerica', unitedstates: 'unitedstatesofamerica', america: 'unitedstatesofamerica',
  uk: 'unitedkingdom', england: 'unitedkingdom', scotland: 'unitedkingdom', wales: 'unitedkingdom',
  northernireland: 'unitedkingdom', britain: 'unitedkingdom', greatbritain: 'unitedkingdom',
  uae: 'unitedarabemirates', southkorea: 'southkorea', czechia: 'czechrepublic', czech: 'czechrepublic',
  russia: 'russia', ireland: 'ireland', republicofireland: 'ireland',
}
const canonCountry = (s) => { const n = norm(s); return COUNTRY_ALIASES[n] || n }
function countryNameMatches(typed, geoName) {
  if (!typed) return false
  return canonCountry(typed) === canonCountry(geoName)
}

// One map pin: a round photo sitting in a classic teardrop, with a small pointer
// tip on the exact coordinate. The avatar is CONCENTRIC with the white disc so
// it's dead-centre in the pin. Counter-scaled against the zoom so it stays a
// calm, readable size (a hair of growth when you zoom in, never a balloon).
function Pin({ group, zoom, active, dim, onSelect }) {
  const lead = group.creators[0]
  const count = group.creators.length
  // Counter-scale so pins are small at the default zoom (you can see the
  // countries underneath) but grow noticeably as you zoom in to find people:
  // net on-screen size ~ zoom^0.3.
  const s = Math.pow(1 / Math.max(zoom, 1), 0.7)
  const r = 12 // avatar radius (smaller base than before)
  const cy = -26 // avatar centre above the tip
  const disc = r + 3 // white ring around the photo
  return (
    <Marker coordinates={group.coords} onClick={() => onSelect(group)}>
      <g transform={`scale(${s})`} style={{ cursor: 'pointer', opacity: dim ? 0.25 : 1, transition: 'opacity 0.2s' }}>
        {/* pointer tail + white disc, concentric with the avatar, share one shadow */}
        <g style={{ filter: 'drop-shadow(0 2px 3px rgba(20,20,30,0.30))' }}>
          <path d={`M${-r * 0.62} ${cy + disc * 0.5} L0 0 L${r * 0.62} ${cy + disc * 0.5} Z`} fill="#ffffff" />
          <circle cx={0} cy={cy} r={disc} fill="#ffffff" />
        </g>
        {/* avatar photo (perfect circle via objectBoundingBox) or initials, centred on (0,cy) */}
        {lead.photo_url ? (
          <image
            href={lead.photo_url}
            x={-r} y={cy - r} width={r * 2} height={r * 2}
            clipPath="url(#creator-pin-clip)"
            preserveAspectRatio="xMidYMid slice"
          />
        ) : (
          <>
            <circle cx={0} cy={cy} r={r} fill="#fbe6da" />
            <text x={0} y={cy} textAnchor="middle" dominantBaseline="central"
              fontSize={r * 0.8} fontWeight="600" fill={BRAND}>{initials(lead.name)}</text>
          </>
        )}
        <circle cx={0} cy={cy} r={r} fill="none" stroke={active ? BRAND : '#ffffff'} strokeWidth={active ? 3 : 2} />
        {count > 1 && (
          <g transform={`translate(${r - 3}, ${cy - r + 3})`}>
            <circle r={9.5} fill={BRAND} stroke="#ffffff" strokeWidth={2} />
            <text x={0} y={0.5} textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight="700" fill="#ffffff">
              {count}
            </text>
          </g>
        )}
      </g>
    </Marker>
  )
}

// An airplane that FLIES along a path (animateMotion), nose pointed the way it
// travels. Used both for the "we're all connected" threads and the travelling-
// now journeys, so every plane on the map moves. `dur` (seconds) is set by the
// caller from path length so all planes share one speed.
function FlyingPlane({ path, dur, zoom, opacity = 1 }) {
  const s = 0.85 / Math.max(zoom, 1)
  return (
    <g style={{ pointerEvents: 'none', opacity }}>
      <g transform={`scale(${s}) rotate(90)`}>
        <path
          d={PLANE_D}
          fill={BRAND}
          stroke="#ffffff"
          strokeWidth={1.3}
          strokeLinejoin="round"
          style={{ filter: 'drop-shadow(0 1px 1.5px rgba(20,20,30,0.35))' }}
        />
      </g>
      <animateMotion dur={`${dur}s`} repeatCount="indefinite" rotate="auto" path={path} />
    </g>
  )
}

function CreatorMap({ creators = [], trips = {}, highlightIds = null, nearMe = false, nearCount = 0, nearMeDisabled = false, onToggleNearMe = null, travelActive = null, onToggleTravel = null, onTravellersChange = null, onCreatorClick = null, connectionsActive = null, onToggleConnections = null, connectionIds = null, travelOnlyView = false, myId = null, maxFitZoom = 6, controls = true }) {
  const dark = useIsDark()
  // Dark-mode map palette: deep land on near-black sea, so the light-grey map
  // doesn't glare. Home countries keep a muted warm tint.
  const LAND_FILL = dark ? '#2a2c31' : LAND
  const HOME_FILL = dark ? '#5c3a1f' : HOME
  const SEPARATOR = dark ? '#0c0d10' : '#ffffff'
  const highlighting = highlightIds && highlightIds.size > 0
  const [extraCoords, setExtraCoords] = useState({}) // legacy rows: id -> {lat,lng}
  const [homeNames, setHomeNames] = useState(() => new Set()) // countries to tint
  const [tooltip, setTooltip] = useState('')
  const [selected, setSelected] = useState(null)
  const [position, setPosition] = useState({ coordinates: [10, 30], zoom: 1.3 })
  // Tracks the zoom DURING a gesture so pin/plane counter-scaling keeps up.
  const [liveZoom, setLiveZoom] = useState(1.3)
  const didInitCenter = useRef(false)

  // Resolve any legacy profile that has a town but no stored coordinates.
  useEffect(() => {
    let cancelled = false
    const missing = creators.filter(
      (c) => c.city_lat == null && !extraCoords[c.id] && (c.city || c.country)
    )
    if (missing.length === 0) return
    ;(async () => {
      for (const c of missing) {
        const coords = await geocodeCity(c.city, c.country)
        if (cancelled) return
        if (coords) setExtraCoords((prev) => ({ ...prev, [c.id]: coords }))
      }
    })()
    return () => { cancelled = true }
  }, [creators, extraCoords])

  // Every creator that has a location, with resolved coords attached.
  const located = useMemo(() => {
    return creators
      .map((c) => {
        const lat = c.city_lat ?? extraCoords[c.id]?.lat
        const lng = c.city_lng ?? extraCoords[c.id]?.lng
        return lat != null && lng != null ? { ...c, _lat: lat, _lng: lng } : null
      })
      .filter(Boolean)
  }, [creators, extraCoords])

  // Cluster into towns (creators who typed the same town share a pin).
  const towns = useMemo(() => {
    const map = new Map()
    for (const c of located) {
      const key = townKey(c._lat, c._lng)
      if (!map.has(key)) map.set(key, { key, coords: [c._lng, c._lat], creators: [] })
      map.get(key).creators.push(c)
    }
    return [...map.values()]
  }, [located])

  // Thread all the towns into one flowing path (nearest-neighbour from the
  // westmost), so the dashed connection line visits everyone once.
  const segments = useMemo(() => {
    if (towns.length < 2) return []
    const remaining = towns.map((t) => t.coords).sort((a, b) => a[0] - b[0])
    const order = [remaining.shift()]
    while (remaining.length) {
      const last = order[order.length - 1]
      let bi = 0, bd = Infinity
      remaining.forEach((p, i) => { const d = geoDistance(last, p); if (d < bd) { bd = d; bi = i } })
      order.push(remaining.splice(bi, 1)[0])
    }
    const segs = []
    for (let i = 0; i < order.length - 1; i++) {
      const a = order[i], b = order[i + 1]
      const [ax, ay] = projection(a)
      const [bx, by] = projection(b)
      const mx = (ax + bx) / 2, my = (ay + by) / 2
      const dx = bx - ax, dy = by - ay
      const chord = Math.hypot(dx, dy) || 1
      const bulge = Math.min(chord * 0.22, 70)
      const cx = mx + (-dy / chord) * bulge, cyc = my + (dx / chord) * bulge
      const curve = quadLength(ax, ay, cx, cyc, bx, by)
      segs.push({
        key: `${i}-${Math.round(ax)},${Math.round(ay)}`,
        d: `M${ax} ${ay} Q ${cx} ${cyc} ${bx} ${by}`,
        curve,
        dur: flightDur(curve),
      })
    }
    return segs
  }, [towns])

  // Which threads actually carry a plane: the longest ones, capped, so short
  // hops in dense areas don't turn into a swarm. Every thread is still drawn.
  const planeSegments = useMemo(() => {
    const long = segments.filter((s) => s.curve >= MIN_PLANE_LEN)
    // Nothing long enough (a tightly-clustered community)? Still fly one, so the
    // "we're all connected" idea always reads.
    const pool = long.length ? long : segments.slice()
    return [...pool].sort((a, b) => b.curve - a.curve).slice(0, MAX_PLANES)
  }, [segments])

  // Tint the countries creators actually live in. Point-in-polygon against the
  // map's own geometry, so it's name-agnostic and always correct.
  useEffect(() => {
    let cancelled = false
    if (located.length === 0) { setHomeNames(new Set()); return }
    fetch(GEO_URL)
      .then((r) => r.json())
      .then((topo) => {
        if (cancelled) return
        const fc = feature(topo, topo.objects.countries)
        const names = new Set()
        for (const f of fc.features) {
          const gname = f.properties.name
          // Tint if a creator's point falls inside OR their typed country matches.
          const hit = located.some((c) =>
            geoContains(f, [c._lng, c._lat]) || countryNameMatches(c.country, gname)
          )
          if (hit) names.add(gname)
        }
        setHomeNames(names)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [located])

  // "Travelling now" journeys: creators with a current/upcoming collab-board
  // trip get a little plane animating from their home pin to the destination
  // country, so the map shows who's on the move. Destination = the country's
  // centroid (country-level is plenty at world zoom).
  const [centroids, setCentroids] = useState(null)
  useEffect(() => {
    if (Object.keys(trips).length === 0) return
    let cancelled = false
    loadMapCentroids().then((c) => { if (!cancelled) setCentroids(c) })
    return () => { cancelled = true }
  }, [trips])

  const journeys = useMemo(() => {
    if (!centroids) return []
    const canonToCentroid = new Map()
    for (const [name, c] of centroids) canonToCentroid.set(canonCountry(name), c)
    const out = []
    for (const c of located) {
      // One journey per creator: their NEXT trip that actually leaves the home
      // country (a trip within it has no arc to draw, so we fall through to
      // the next one). Once a trip ends it drops out of `trips` server-side
      // and the following one takes over automatically.
      const list = Array.isArray(trips[c.id]) ? trips[c.id] : trips[c.id] ? [trips[c.id]] : []
      for (const trip of list) {
        if (!trip?.country) continue
        const dest = canonToCentroid.get(canonCountry(trip.country))
        if (!dest) continue
        const [ax, ay] = projection([c._lng, c._lat])
        const [bx, by] = projection(dest)
        const dx = bx - ax, dy = by - ay
        const len = Math.hypot(dx, dy)
        if (len < 14) continue // inside the home country: try the next trip
        const bulge = Math.min(len * 0.3, 55)
        const cx2 = (ax + bx) / 2 + (-dy / len) * bulge
        const cy2 = (ay + by) / 2 + (dx / len) * bulge
        out.push({
          id: c.id, name: c.name, trip,
          d: `M${ax} ${ay} Q ${cx2} ${cy2} ${bx} ${by}`, dest: [bx, by],
          // Same uniform speed as every other plane on the map.
          dur: flightDur(quadLength(ax, ay, cx2, cy2, bx, by)),
        })
        break
      }
    }
    return out
  }, [centroids, trips, located])

  // "Who's travelling" view + single-traveller focus (tap a plane). The view can
  // be driven by the parent (controlled: it also filters the creator cards
  // below) or fall back to local state when used standalone.
  const [internalTravel, setInternalTravel] = useState(false)
  // travelOnlyView (the collab board's "where everyone's headed" map) forces the
  // who's-travelling view permanently on and hides the filter buttons.
  const travelView = travelOnlyView ? true : (onToggleTravel ? !!travelActive : internalTravel)
  const [focusId, setFocusId] = useState(null)
  const focusJourney = journeys.find((j) => j.id === focusId) || null
  const travellerIds = useMemo(() => new Set(journeys.map((j) => j.id)), [journeys])
  const toggleTravel = () => { if (onToggleTravel) onToggleTravel(); else setInternalTravel((v) => !v); setFocusId(null) }

  // "My connections" view: show only the towns where the viewer's accepted
  // connections live. Controlled by the parent (which also filters the grid).
  const connectionsView = !!connectionsActive
  const connSet = useMemo(() => (connectionIds instanceof Set ? connectionIds : new Set(connectionIds || [])), [connectionIds])
  // Do any of the viewer's connections actually appear on the map?
  const hasMappedConnections = useMemo(
    () => connectionsView && located.some((c) => connSet.has(c.id)),
    [connectionsView, located, connSet]
  )

  // Let the parent filter the creator cards to exactly the travellers the map
  // shows, so the "Who's travelling" button and the grid stay in lockstep.
  useEffect(() => { onTravellersChange?.(travellerIds) }, [travellerIds, onTravellersChange])
  const visibleTowns = useMemo(() => {
    const only = (ids) => towns
      .map((t) => ({ ...t, creators: t.creators.filter((c) => ids.has(c.id)) }))
      .filter((t) => t.creators.length > 0)
    if (focusJourney) return only(new Set([focusJourney.id]))
    if (connectionsView) return only(connSet)
    if (travelView) return only(travellerIds)
    return towns
  }, [towns, focusJourney, connectionsView, connSet, travelView, travellerIds])
  // SVG has no z-index: whatever is drawn LAST sits on top. Two rules:
  //  1. Draw north-to-south, so a southern pin's body naturally overlaps its
  //     northern neighbour rather than being sliced by it.
  //  2. Float the SELECTED pin to the very end, so tapping a pin always brings
  //     it fully to the front instead of leaving it buried behind others.
  //     Deselecting restores the normal order.
  const paintOrder = useMemo(() => {
    const list = [...visibleTowns].sort((a, b) => b.coords[1] - a.coords[1])
    if (!selected) return list
    const i = list.findIndex((t) => t.key === selected.key)
    if (i === -1) return list
    const [picked] = list.splice(i, 1)
    list.push(picked)
    return list
  }, [visibleTowns, selected])

  const visibleJourneys = connectionsView ? [] : (focusJourney ? [focusJourney] : journeys)
  const quietMap = travelView || connectionsView || nearMe || !!focusJourney // hide the full thread web

  // Planes for the FILTERED views ("My connections" / "Creators near me"): a few
  // flights from the viewer's own town out to those creators, so the map still
  // feels alive and shows how you're connected. Capped so it never gets busy.
  const linkSegments = useMemo(() => {
    if (!(connectionsView || nearMe) || !myId) return []
    const me = located.find((c) => c.id === myId)
    if (!me) return []
    const targetIds = connectionsView ? connSet : (highlightIds || new Set())
    const [ax, ay] = projection([me._lng, me._lat])
    const seen = new Set()
    const out = []
    for (const t of towns) {
      if (!t.creators.some((c) => targetIds.has(c.id))) continue
      const k = t.key
      if (seen.has(k)) continue
      seen.add(k)
      const [bx, by] = projection(t.coords)
      const dx = bx - ax, dy = by - ay
      const chord = Math.hypot(dx, dy)
      if (chord < 12) continue // same town as me: nothing to draw
      const bulge = Math.min(chord * 0.25, 60)
      const cx = (ax + bx) / 2 + (-dy / chord) * bulge
      const cy = (ay + by) / 2 + (dx / chord) * bulge
      const d = `M${ax} ${ay} Q ${cx} ${cy} ${bx} ${by}`
      const curve = quadLength(ax, ay, cx, cy, bx, by)
      out.push({ key: k, d, curve, dur: flightDur(curve) })
    }
    // Longest few, so the picks are visually distinct rather than a cluster.
    return out.sort((a, b) => b.curve - a.curve).slice(0, 5)
  }, [connectionsView, nearMe, myId, located, connSet, highlightIds, towns])

  // The view that fits everyone with a location on screen (all creators visible).
  //
  // maxFitZoom is a prop because the right answer depends on what the map is
  // OF. A world map of 43 creators across 13 nations wants a ceiling, or one
  // outlier in Australia drags everyone else into a smudge. A market map of the
  // creators in Spain wants to go much closer, because that IS the point: you
  // are looking for Madrid and Valencia, not for Europe.
  const fitView = useMemo(() => {
    if (located.length === 0) return { coordinates: [10, 30], zoom: 1.3 }
    const lngs = located.map((c) => c._lng), lats = located.map((c) => c._lat)
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
    const minLat = Math.min(...lats), maxLat = Math.max(...lats)
    const lngSpan = Math.max(maxLng - minLng, 0.01), latSpan = Math.max(maxLat - minLat, 0.01)
    const zoom = Math.min(maxFitZoom, Math.max(1, Math.min(360 / (lngSpan * 1.5), 180 / (latSpan * 1.8))))
    return { coordinates: [(minLng + maxLng) / 2, (minLat + maxLat) / 2], zoom }
  }, [located, maxFitZoom])

  // Fit to everyone on first load.
  useEffect(() => {
    if (didInitCenter.current || located.length === 0) return
    didInitCenter.current = true
    setPosition(fitView)
    setLiveZoom(fitView.zoom)
  }, [located, fitView])

  const selectedTown = selected // a town snapshot ({ key, coords, creators })

  // Counter-scaling reads the LIVE zoom, not the settled one. Reading only the
  // post-gesture value made every pin and plane balloon for a frame mid-zoom.
  // The rAF throttle keeps the re-renders to one per frame so it stays smooth.
  const z = liveZoom
  const rafRef = useRef(0)
  const handleMove = useCallback((pos) => {
    if (rafRef.current) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0
      setLiveZoom(pos.zoom)
    })
  }, [])
  const handleMoveEnd = useCallback((pos) => {
    setPosition(pos)
    setLiveZoom(pos.zoom)
  }, [])
  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  const zoomBy = (factor) =>
    setPosition((p) => {
      const zoom = Math.min(40, Math.max(1, p.zoom * factor))
      setLiveZoom(zoom)
      return { ...p, zoom }
    })
  const resetView = () => { setPosition(fitView); setLiveZoom(fitView.zoom) }

  // The three view filters. Rendered twice: as an overlay on desktop, and in a
  // row beneath the map on phones (where an overlay would cover the map).
  //
  // `controls={false}` drops them entirely. A market map is already a filtered
  // view (these creators, this place), so offering "who's travelling" over the
  // top of it would let you filter a filter and land somewhere nobody asked to
  // be.
  const filterButtons = !controls ? null : (
    <>
      {onToggleConnections && (
        <button
          type="button"
          onClick={onToggleConnections}
          className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold shadow-card transition-all hover:scale-[1.03] active:scale-95 ${
            connectionsView ? 'bg-brand text-white' : 'bg-white/95 text-ink'
          }`}
        >
          <Icon name="users" className="h-3.5 w-3.5" />
          My connections{connectionsView ? ` · ${connSet.size}` : ''}
        </button>
      )}
      {journeys.length > 0 && (
        <button
          type="button"
          onClick={toggleTravel}
          className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold shadow-card transition-all hover:scale-[1.03] active:scale-95 ${
            travelView ? 'bg-brand text-white' : 'bg-white/95 text-ink'
          }`}
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
            <path d="M12 1.55 C13.05 1.55 13.71 3.45 13.71 6.11 L13.71 7.82 L21.5 12.95 L21.5 14.95 L13.71 11.81 L13.71 16.75 L16.18 19.22 L16.18 20.74 L12 19.32 L7.82 20.74 L7.82 19.22 L10.29 16.75 L10.29 11.81 L2.5 14.95 L2.5 12.95 L10.29 7.82 L10.29 6.11 C10.29 3.45 10.95 1.55 12 1.55 Z" />
          </svg>
          Who's travelling{travelView ? ` · ${journeys.length}` : ''}
        </button>
      )}
      {onToggleNearMe && (
        <button
          type="button"
          onClick={onToggleNearMe}
          disabled={nearMeDisabled}
          title={nearMeDisabled ? 'Add your city in your profile to use this' : undefined}
          className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold shadow-card transition-all hover:scale-[1.03] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 ${
            nearMe ? 'bg-brand text-white' : 'bg-white/95 text-ink'
          }`}
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11Z" /><circle cx="12" cy="10" r="2.6" />
          </svg>
          Creators near me{nearMe ? ` · ${nearCount}` : ''}
        </button>
      )}
    </>
  )

  const mapBox = (
    <div className="relative w-full overflow-hidden rounded-card border border-gray-100 bg-cloud/60">
      {tooltip && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded-full bg-ink px-3 py-1 text-xs font-medium text-white">
          {tooltip}
        </div>
      )}

      <div className="absolute right-2 top-2 z-20 flex flex-col gap-1">
        <button type="button" onClick={() => zoomBy(1.6)} aria-label="Zoom in"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-lg font-semibold text-ink shadow-card transition-transform hover:scale-105 active:scale-95">+</button>
        <button type="button" onClick={() => zoomBy(1 / 1.6)} aria-label="Zoom out"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-lg font-semibold text-ink shadow-card transition-transform hover:scale-105 active:scale-95">−</button>
        <button type="button" onClick={resetView} aria-label="Reset map view"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-smoke shadow-card transition-transform hover:scale-105 active:scale-95">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9 9 0 0 0-6.7 3M3 4v4h4"/></svg>
        </button>
      </div>

      <ComposableMap
        width={WIDTH}
        height={HEIGHT}
        projectionConfig={{ scale: 160, center: [12, 8] }}
        style={{ width: '100%', height: 'auto', display: 'block' }}
        aria-label="Map of where every creator is based"
      >
        <defs>
          {/* objectBoundingBox → clips each avatar to a perfect circle of its own bounds */}
          <clipPath id="creator-pin-clip" clipPathUnits="objectBoundingBox">
            <circle cx="0.5" cy="0.5" r="0.5" />
          </clipPath>
        </defs>
        <ZoomableGroup
          zoom={position.zoom}
          center={position.coordinates}
          minZoom={1}
          maxZoom={40}
          // Keep the map inside the frame: you can nudge it a little (the small
          // margin) but never drag it completely out of view, even fully zoomed
          // out. d3-zoom clamps panning to this world-extent.
          translateExtent={[[-60, -50], [WIDTH + 60, HEIGHT + 50]]}
          // Stable callbacks: inline arrows re-registered the d3-zoom behaviour
          // on every render, which is what made zooming feel laggy.
          onMove={handleMove}
          onMoveEnd={handleMoveEnd}
        >
          <Geographies geography={GEO_URL}>
            {({ geographies }) =>
              geographies
                .filter((geo) => geo.properties.name !== 'Antarctica')
                .map((geo) => {
                  const isHome = homeNames.has(geo.properties.name)
                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      style={{
                        default: { fill: isHome ? HOME_FILL : LAND_FILL, stroke: SEPARATOR, strokeWidth: 0.4, outline: 'none' },
                        hover: { fill: isHome ? HOME_FILL : LAND_FILL, stroke: SEPARATOR, strokeWidth: 0.4, outline: 'none' },
                        pressed: { fill: isHome ? HOME_FILL : LAND_FILL, outline: 'none' },
                      }}
                    />
                  )
                })
            }
          </Geographies>

          {/* Connection lines (behind the pins). Hidden while focusing on a
              traveller or in the who's-travelling view, to keep it clean. */}
          {!quietMap && (
            <g style={{ pointerEvents: 'none' }}>
              {segments.map((seg, i) => (
                <path
                  key={i}
                  d={seg.d}
                  fill="none"
                  stroke={BRAND_LIGHT}
                  strokeWidth={1.6 / z}
                  strokeLinecap="round"
                  strokeDasharray={`${5 / z} ${5 / z}`}
                  opacity={0.75}
                />
              ))}
              {/* Only the longer threads carry a plane, so dense clusters stay
                  tidy. All planes share one speed. No destination pulse, so they
                  read differently from the "travelling now" journeys below. */}
              {planeSegments.map((seg) => (
                <FlyingPlane key={`p${seg.key}`} path={seg.d} dur={seg.dur} zoom={z} opacity={0.9} />
              ))}
            </g>
          )}

          {/* Filtered views ("My connections" / "Creators near me"): a handful of
              flights from your town out to them, so the map still feels alive. */}
          {(connectionsView || nearMe) && linkSegments.length > 0 && (
            <g style={{ pointerEvents: 'none' }}>
              {linkSegments.map((seg) => (
                <path
                  key={`ls${seg.key}`}
                  d={seg.d}
                  fill="none"
                  stroke={BRAND_LIGHT}
                  strokeWidth={1.4 / z}
                  strokeLinecap="round"
                  strokeDasharray={`${4 / z} ${5 / z}`}
                  opacity={0.7}
                />
              ))}
              {linkSegments.map((seg) => (
                <FlyingPlane key={`lp${seg.key}`} path={seg.d} dur={seg.dur} zoom={z} opacity={0.95} />
              ))}
            </g>
          )}

          {/* Travelling now: an animated plane flying from each traveller's
              home pin to their next collab-trip country, on repeat. Tap a
              plane (or its destination pulse) to focus that trip. */}
          <g>
            {visibleJourneys.map((j) => (
              <g
                key={j.id}
                onClick={() => setFocusId((cur) => (cur === j.id ? null : j.id))}
                style={{ cursor: 'pointer' }}
                aria-label={`${j.name} is travelling to ${j.trip.country}`}
              >
                <path d={j.d} fill="none" stroke={BRAND} strokeWidth={1.1 / z} strokeDasharray={`${2.5 / z} ${5 / z}`} strokeLinecap="round" opacity={focusJourney ? 0.85 : 0.5} style={{ pointerEvents: 'none' }} />
                <circle cx={j.dest[0]} cy={j.dest[1]} fill={BRAND} opacity="0.8">
                  <animate attributeName="r" values={`${2.5 / z};${6 / z};${2.5 / z}`} dur="2.4s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.8;0.15;0.8" dur="2.4s" repeatCount="indefinite" />
                </circle>
                <g>
                  {/* generous invisible hit-target so the moving plane is easy to tap */}
                  <circle r={14 / Math.max(z, 1)} fill="transparent" />
                  {/* nose-up plane rotated to face along the motion path */}
                  <g transform={`scale(${0.85 / Math.max(z, 1)}) rotate(90)`} style={{ pointerEvents: 'none' }}>
                    <path
                      d="M0 -11 C1.1 -11 1.8 -9 1.8 -6.2 L1.8 -4.4 L10 1 L10 3.1 L1.8 -0.2 L1.8 5 L4.4 7.6 L4.4 9.2 L0 7.7 L-4.4 9.2 L-4.4 7.6 L-1.8 5 L-1.8 -0.2 L-10 3.1 L-10 1 L-1.8 -4.4 L-1.8 -6.2 C-1.8 -9 -1.1 -11 0 -11 Z"
                      fill={BRAND} stroke="#ffffff" strokeWidth={1.2} strokeLinejoin="round"
                    />
                  </g>
                  <animateMotion dur={`${j.dur}s`} repeatCount="indefinite" rotate="auto" path={j.d} />
                </g>
              </g>
            ))}
          </g>

          {paintOrder.map((town) => (
            <g
              key={town.key}
              onMouseEnter={() => setTooltip(
                town.creators.length === 1
                  ? `${town.creators[0].name} · ${(town.creators[0].city || '').trim()}`.trim()
                  : `${(town.creators[0].city || 'This town').trim()} · ${town.creators.length} creators`
              )}
              onMouseLeave={() => setTooltip('')}
            >
              <Pin group={town} zoom={z} active={selected?.key === town.key} dim={highlighting && !town.creators.some((c) => highlightIds.has(c.id))} onSelect={setSelected} />
            </g>
          ))}
        </ZoomableGroup>
      </ComposableMap>

      {selectedTown && (
        <div className="absolute bottom-3 left-3 right-3 z-20 mx-auto max-w-sm rounded-card border border-gray-100 bg-white p-4 shadow-lift sm:right-auto">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-ink">{(selectedTown.creators[0].city || 'Here').trim()}</p>
              <p className="text-xs text-smoke">
                {selectedTown.creators[0].country
                  ? selectedTown.creators[0].country.trim()
                  : `${selectedTown.creators.length} creator${selectedTown.creators.length > 1 ? 's' : ''}`}
              </p>
            </div>
            <button type="button" onClick={() => setSelected(null)} aria-label="Close"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-smoke transition-colors hover:bg-cloud">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
            </button>
          </div>
          <div className="flex max-h-56 flex-col gap-1 overflow-y-auto">
            {selectedTown.creators.map((c) => {
              const inner = (
                <>
                  {c.photo_url ? (
                    <img src={c.photo_url} alt={c.name} className="h-10 w-10 shrink-0 rounded-full object-cover ring-2 ring-white" />
                  ) : (
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-tint text-sm font-semibold text-brand ring-2 ring-white">
                      {initials(c.name)}
                    </span>
                  )}
                  <span className="min-w-0 text-left">
                    <span className="block truncate text-sm font-medium text-ink">{c.name}</span>
                    {(c.countries_visited?.length || c.countries) > 0 && (
                      <span className="flex items-center gap-1 text-xs text-smoke"><Icon name="globe" className="h-3 w-3" /> {c.countries_visited?.length || c.countries} countries</span>
                    )}
                  </span>
                </>
              )
              // On the public landing page we intercept the click to show a
              // mini-profile + join prompt instead of navigating into the app.
              return onCreatorClick ? (
                <button key={c.id} type="button" onClick={() => onCreatorClick(c)}
                  className="flex w-full items-center gap-3 rounded-xl p-1.5 text-left transition-colors hover:bg-cloud">
                  {inner}
                </button>
              ) : (
                <Link key={c.id} to={`/profile/${c.id}`}
                  className="flex items-center gap-3 rounded-xl p-1.5 transition-colors hover:bg-cloud">
                  {inner}
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* Focused trip: a banner naming the traveller + destination, with a
          clear button. Everything else on the map is hidden while it's up. */}
      {focusJourney && (
        <div className="absolute left-1/2 top-3 z-20 flex max-w-[92%] -translate-x-1/2 items-center gap-2 rounded-full bg-ink/90 py-2 pl-4 pr-2 text-xs font-medium text-white shadow-lift">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="currentColor" aria-hidden>
            <path d="M12 1.55 C13.05 1.55 13.71 3.45 13.71 6.11 L13.71 7.82 L21.5 12.95 L21.5 14.95 L13.71 11.81 L13.71 16.75 L16.18 19.22 L16.18 20.74 L12 19.32 L7.82 20.74 L7.82 19.22 L10.29 16.75 L10.29 11.81 L2.5 14.95 L2.5 12.95 L10.29 7.82 L10.29 6.11 C10.29 3.45 10.95 1.55 12 1.55 Z" />
          </svg>
          <span className="min-w-0 truncate">
            {focusJourney.name} → {(focusJourney.trip.city || '').trim() ? `${focusJourney.trip.city.trim()}, ` : ''}{focusJourney.trip.country}
            {' · '}{formatDate(focusJourney.trip.start_date)} – {formatDate(focusJourney.trip.end_date)}
          </span>
          <button type="button" onClick={() => setFocusId(null)} aria-label="Show everyone again"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-white/20">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button>
        </div>
      )}

      {/* "My connections" view with no one to show: overlay a friendly nudge. */}
      {connectionsView && !hasMappedConnections && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center p-6">
          <div className="pointer-events-auto max-w-xs rounded-card border border-gray-100 bg-white/95 p-5 text-center shadow-lift backdrop-blur">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-tint text-brand">
              <Icon name="users" className="h-6 w-6" />
            </div>
            <p className="text-sm font-semibold text-ink">No connections on the map yet</p>
            <p className="mt-1 text-xs text-smoke">
              Once you connect with other creators they'll appear here. Head to a profile or the Connections page to start building your network.
            </p>
          </div>
        </div>
      )}

      {/* Filter toggles overlay the map on desktop only - on phones they'd cover
          most of it, so there they render in a row UNDER the map instead. */}
      <div className={`absolute bottom-3 left-3 z-10 hidden flex-col items-start gap-2 sm:flex ${travelOnlyView ? '!hidden' : ''}`}>
        {filterButtons}
      </div>

      {/* Hint moved to the top-right (clears the zoom buttons), out of the way
          of the filter toggles and town card. */}
      <p className="pointer-events-none absolute right-14 top-2 z-10 hidden max-w-[15rem] rounded-full bg-white/85 px-3 py-1 text-right text-[11px] text-smoke backdrop-blur-sm sm:block">
        Tap a pin to see who's there · use + / − to zoom
      </p>
    </div>
  )

  return (
    <div className="w-full">
      {mapBox}
      {/* Mobile: the same filters in a wrapping row below the map. */}
      {!travelOnlyView && (
        <div className="mt-3 flex flex-wrap gap-2 sm:hidden">
          {filterButtons}
        </div>
      )}
    </div>
  )
}

export default memo(CreatorMap)
