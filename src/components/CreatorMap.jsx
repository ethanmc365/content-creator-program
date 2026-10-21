import { lockScroll } from '../lib/scrollLock'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { geoDistance, geoContains } from 'd3-geo'
import { useSearchParams } from 'react-router-dom'
import { loadMapFeatures, loadMapCentroids } from '../lib/mapCountries'
import { geocodeCity, plausibleCity } from '../lib/geocode'
import { cx, formatDate } from '../lib/utils'
import { useIsDark } from '../lib/theme'
import { countryKey, sameCountry } from '../lib/countryFacts'
import { clusterMerges, clusterStep, groupsAtReach, reachAtZoom } from '../lib/pinCluster'
import { homeCountryNames } from '../lib/homeCountries'
import CountryPanel, { TownPanel } from './CountryPanel'
import DraggablePanel from './DraggablePanel'
import Icon from './Icon'
import { useT } from '../lib/i18n'
import SlowMapGate from './SlowMapGate'
import { BRAND, LAND, HOME, EXPLORED, flightDur, quadLength, MIN_PLANE_LEN, MAX_PLANES, PLANE_D, projection, townKey, countryNameMatches, byPinPriority, TRIP_HORIZON_DAYS, NO_TRIPS, NO_CREATORS, warmPinPhotos } from './CreatorMapParts'
import CreatorMapCanvas from './CreatorMapCanvas'

// Pin grouping lives in lib/pinCluster.js (single-linkage clustering, bounded by country).

function CreatorMap({ creators = NO_CREATORS, trips = NO_TRIPS, highlightIds = null, nearMe = false, nearCount = 0, nearMeDisabled = false, onToggleNearMe = null, travelActive = null, onToggleTravel = null, onTravellersChange = null, onCreatorClick = null, connectionsActive = null, onToggleConnections = null, connectionIds = null, travelOnlyView = false, myId = null, maxFitZoom = 6, controls = true,
  // Full-screen button is its own prop: a map without filter pills can still open full screen.
  allowFullscreen = controls,
  // Navigable maps (market maps) get drag-to-pan and the +/-/reset stack outside full screen.
  // Off by default so maps in the middle of long pages never trap the scroll. The wheel stays the page's: see `filterZoomEvent`.
  navigable = false,
  // A caption bar drawn inside the map's own card (one border, one radius). Hidden in full screen.
  header = null,
  // "Where we have been, together": the set of country names anybody in the
  // network has filmed in, and a toggle to paint them. It replaces the second
  // WorldMap that used to sit at the foot of the directory - see the note on
  // the button in `renderFilterButtons`.
  exploredCountries = null, exploredActive = null, onToggleExplored = null,
  // The key for the two tints, drawn inside the card so it always matches the fills.
  legend = false,
  // `flush`: no border, radius or sea fill, so the map sits directly on the page. Presentation only; ignored in full screen.
  flush = false }) {

  const tr = useT()
  const dark = useIsDark()
  // Dark-mode map palette: deep land on near-black sea, so the light-grey map
  // doesn't glare. Home countries keep a muted warm tint.
  const LAND_FILL = dark ? '#2a2c31' : LAND
  // Dark mode tints with the brand orange at partial alpha, not a darkened brown.
  const HOME_FILL = dark ? 'rgba(217, 68, 7, 0.62)' : HOME
  // A step lighter than HOME, for the same reason HOME is a step lighter than
  // the brand: a whole continent painted at full strength stops being a
  // highlight and becomes the background.
  const EXPLORED_FILL = dark ? 'rgba(217, 68, 7, 0.24)' : EXPLORED
  // Hovering a country now means something (it is tappable), so it needs a
  // hover state - a step towards the tint rather than the tint itself, so a
  // country somebody LIVES in still reads as different from one under the
  // cursor.
  const HOVER_FILL = dark ? '#3a3d44' : '#dcdce0'
  const SEPARATOR = dark ? '#0c0d10' : '#ffffff'
  const highlighting = highlightIds && highlightIds.size > 0
  const [extraCoords, setExtraCoords] = useState({}) // legacy rows: id -> {lat,lng}
  const [homeNames, setHomeNames] = useState(() => new Set()) // countries to tint
  // The arrival plays when the map is on screen AND the atlas is drawn, not on page load.
  // The observer margin is small (6%) so it starts as the map comes up. The fallback timer only fires when the
  // IntersectionObserver delivers nothing at all (missing or stubbed in in-app webviews), never on a working browser.
  const boxRef = useRef(null)
  const [seen, setSeen] = useState(() => typeof IntersectionObserver === 'undefined')
  useEffect(() => {
    if (seen) return undefined
    const el = boxRef.current
    // FAIL OPEN. `HELD` keeps this map invisible until the arrival can start,
    // so there is no version of this effect that is allowed to do nothing: no
    // node means observe nothing means a blank card for ever.
    if (!el) { setSeen(true); return undefined }
    let delivered = false
    const io = new IntersectionObserver(
      (entries) => {
        delivered = true
        if (entries.some((e) => e.isIntersecting)) setSeen(true)
      },
      { rootMargin: '0px 0px 6% 0px' },
    )
    io.observe(el)
    const net = setTimeout(() => { if (!delivered) setSeen(true) }, 1500)
    return () => { io.disconnect(); clearTimeout(net) }
  }, [seen])

  // The atlas, from the one shared parse. See lib/mapCountries: handing
  // `<Geographies>` the parsed object rather than a URL is what keeps a page
  // with several maps on it from decoding a megabyte of TopoJSON per map.
  const [features, setFeatures] = useState(null)

  // Parsing the 614 KB atlas is a long task, so a map that is not on screen yet waits a beat before loading;
  // `seen` cancels the wait. `loadMapFeatures` is one shared promise per session.
  useEffect(() => {
    let cancelled = false
    const go = () => { loadMapFeatures().then((fc) => { if (!cancelled) setFeatures(fc) }) }
    if (seen) {
      go()
      return () => { cancelled = true }
    }
    const t = setTimeout(go, 1200)
    return () => { cancelled = true; clearTimeout(t) }
  }, [seen])

  // Start the entrance on the frame AFTER the heavy commit that draws the world (two nested rAFs), or the first
  // part of the animation is lost in one long frame. The map is held at opacity 0 in between.
  const [painted, setPainted] = useState(false)
  useEffect(() => {
    if (!features || painted) return undefined
    let inner = 0
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setPainted(true))
    })
    // Plus a timer: requestAnimationFrame does not run in a background tab.
    const safety = setTimeout(() => setPainted(true), 400)
    return () => {
      cancelAnimationFrame(outer)
      cancelAnimationFrame(inner)
      clearTimeout(safety)
    }
  }, [features, painted])

  // The arrival plays once per map, not once per mount: going full screen remounts the SVG in a portal.
  // The timer must outlast the whole sequence (pins 300 + 700 ms, aircraft 520 + 300 ms), so 1100 ms.

  const [arrived, setArrived] = useState(false)
  useEffect(() => {
    // Off `painted && seen`, not `features`: the clock has to start when the
    // animation does, or the two frames it waits come out of the end of the
    // sequence.
    if (!painted || !seen || arrived) return undefined
    const t = setTimeout(() => setArrived(true), 1100)
    return () => clearTimeout(t)
  }, [painted, seen, arrived])

  // One flag for every arrival class, so land, pins and aircraft start on the same frame.
  const entering = painted && seen && !arrived

  // Fallback for old engines: rewind the SMIL flights to frame zero when the entrance starts, so every aircraft
  // starts at the beginning of its route. `unpauseAnimations` first: Chrome suspends an unpainted SVG's clock.
  useEffect(() => {
    if (!entering) return
    const svg = boxRef.current?.querySelector('svg')
    if (!svg?.setCurrentTime) return
    try {
      svg.unpauseAnimations?.()
      svg.setCurrentTime(0)
    } catch { /* an engine without a SMIL time container has nothing to rewind */ }
  }, [entering])

  // NO HOVER STATE AT ALL ANY MORE. The name pill it fed is gone (see the note
  // where it used to be drawn), and it was the only reader - so every border
  // crossing was re-rendering this entire component, pins and all, to update a
  // string nothing displays. Deleting the state deletes that too.
  const [selected, setSelected] = useState(null)
  // Full screen: the same map without the page. On phones it asks for landscape; `screen.orientation.lock` only
  // works in real Fullscreen on Chrome/Android, so its failure is expected.
  const [fullscreen, setFullscreen] = useState(false)
  // Kept up for the length of the exit animation. See `exitFullscreen`.
  const [closing, setClosing] = useState(false)
  const rootRef = useRef(null)
  const fsRef = useRef(null)
  // The country a reader has tapped, if any: { name, lives, visited }.
  const [country, setCountry] = useState(null)

  // The open panel lives in the URL (replace, not push), so Back from a profile restores it.
  const [params, setParams] = useSearchParams()
  const urlCountry = params.get('country')
  const urlTown = params.get('town')
  const writeUrl = useCallback((next) => {
    setParams((prev) => {
      const p = new URLSearchParams(prev)
      for (const [k, v] of Object.entries(next)) {
        if (v) p.set(k, v)
        else p.delete(k)
      }
      return p
    }, { replace: true })
  }, [setParams])
  const [position, setPosition] = useState({ coordinates: [10, 30], zoom: 1.3 })
  // Tracks the zoom DURING a gesture so pin/plane counter-scaling keeps up.
  const [liveZoom, setLiveZoom] = useState(1.3)
  const didInitCenter = useRef(false)
  // Set when d3-zoom accepts a gesture, cleared by reset. Stops the auto-fit from moving the view under the reader.
  const userMoved = useRef(false)

  // SCROLL TO ZOOM WITHOUT TRAPPING THE PAGE.
  // - A wheel that arrives while the page is scrolling (within 250 ms of page movement) belongs to the page.
  // - At either zoom limit the wheel stops; it does not fall through to the page.
  // - Once a zoom is running it keeps the wheel for 400 ms of quiet, so a trackpad stream is one gesture.
  // Full screen and phones are unaffected.
  const scrolledAt = useRef(0)
  const wheelAt = useRef(0)
  // Page offset at the last wheel: a backstop for the scroll listener, because a page that is not being painted moves
  // without firing scroll events. Kept current by the listener too, or the first wheel always looks like page movement.
  const scrolledY = useRef(typeof window === 'undefined' ? 0 : (window.scrollY || 0))
  useEffect(() => {
    const onScroll = () => { scrolledAt.current = Date.now(); scrolledY.current = window.scrollY || 0 }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  // The zoom the gate reads. A ref rather than the state because
  // `filterZoomEvent` is handed to d3 once and would otherwise close over the
  // zoom this render happened to see - the same stale-closure trap `zoomBy`
  // was fixed for.
  const zoomRef = useRef(1.3)

  // WHO OWNS THIS WHEEL: the map or the page. Decided ONCE per event and
  // stashed on it, because two listeners ask (d3-zoom's filter on the svg, then
  // the box's own listener below) and the decision moves `scrolledY`.
  const wheelOwnedByMap = (event) => {
    if (event.__trypMap !== undefined) return event.__trypMap
    const now = Date.now()
    // Mid-gesture: a trackpad sends a stream, and re-deciding on every delta
    // would drop the map out of a zoom the moment it crossed a limit check on
    // one stray event.
    const continuing = now - wheelAt.current < 400
    // The page was moving. This wheel is part of that movement.
    const y = typeof window === 'undefined' ? 0 : (window.scrollY || 0)
    const moved = y !== scrolledY.current
    scrolledY.current = y
    const owned = continuing || !(moved || now - scrolledAt.current < 250)
    if (owned) wheelAt.current = now
    event.__trypMap = owned
    return owned
  }
  // The gate d3-zoom asks. True only when this wheel is the map's AND there is
  // zoom left to do in its direction (`deltaY > 0` is down, which is out).
  const wheelIsOurs = (event) => {
    if (!wheelOwnedByMap(event)) return false
    const z = zoomRef.current || 1
    return !(event.deltaY > 0 ? z <= 1.02 : z >= 39.5)
  }

  // THE OTHER HALF OF "IT SHOULD JUST STOP". d3-zoom only calls
  // `preventDefault` when it actually changes the zoom, so a wheel it refused
  // at a limit went on to scroll the page. This listener (non-passive, on the
  // box, so it runs after d3's on the svg) swallows every wheel the map owns.
  useEffect(() => {
    const el = boxRef.current
    if (!el || !navigable || fullscreen) return undefined
    const onWheel = (e) => { if (wheelOwnedByMap(e)) e.preventDefault() }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [navigable, fullscreen])

  // Resolve any legacy profile that has a town but no stored coordinates.
  useEffect(() => {
    let cancelled = false
    // A miss is remembered as `null` (checked with `in`) so a town nothing can
    // resolve is asked once, not again every time another town resolves.
    const missing = creators.filter(
      (c) => c.city_lat == null && !(c.id in extraCoords) && (plausibleCity(c.city) || (!c.city?.trim() && c.country))
    )
    if (missing.length === 0) return
    // Geocode answers are written in one batch per beat, not one state update per lookup.
    ;(async () => {
      let pending = null
      let timer = null
      const flush = () => {
        timer = null
        if (!pending || cancelled) return
        const batch = pending
        pending = null
        setExtraCoords((prev) => ({ ...prev, ...batch }))
      }
      for (const c of missing) {
        const coords = await geocodeCity(c.city, c.country)
        if (cancelled) return
        pending = { ...(pending || {}), [c.id]: coords || null }
        if (!timer) timer = setTimeout(flush, 300)
      }
      if (timer) clearTimeout(timer)
      flush()
    })()
    return () => { cancelled = true }
  }, [creators, extraCoords])

  // Planes land on the destination city when it can be resolved, otherwise on the country centroid.
  // Trips carry their own coordinates (collab_posts.city_lat/lng, migration 177); the browser geocoder is only a
  // fallback for a row that has none.
  const [tripCoords, setTripCoords] = useState({})
  const storedTripCoords = useMemo(() => {
    const out = {}
    for (const list of Object.values(trips || {})) {
      for (const t of (Array.isArray(list) ? list : [list])) {
        if (!t?.city || !t?.country) continue
        if (t.city_lat == null || t.city_lng == null) continue
        out[`${t.city.trim().toLowerCase()}|${t.country.trim().toLowerCase()}`] = { lat: t.city_lat, lng: t.city_lng }
      }
    }
    return out
  }, [trips])

  useEffect(() => {
    let cancelled = false
    const wanted = new Map()
    for (const list of Object.values(trips || {})) {
      for (const t of (Array.isArray(list) ? list : [list])) {
        if (!t?.city || !t?.country) continue
        const key = `${t.city.trim().toLowerCase()}|${t.country.trim().toLowerCase()}`
        if (storedTripCoords[key]) continue
        // `in`, not a truthiness test: a miss is stored as null so it is never asked again (a truthiness test looped forever).
        if (!(key in tripCoords)) wanted.set(key, t)
      }
    }
    if (wanted.size === 0) return undefined
    ;(async () => {
      for (const [key, t] of wanted) {
        const coords = await geocodeCity(t.city, t.country)
        if (cancelled) return
        // A miss is cached as `null` so a city nothing can resolve is not looked
        // up again on every render for the rest of the session.
        setTripCoords((prev) => ({ ...prev, [key]: coords || null }))
      }
    })()
    return () => { cancelled = true }
  }, [trips, tripCoords, storedTripCoords])

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

  // Cluster into towns (creators who typed the same town share a pin). Creators are sorted so the pin's face is the
  // most recently active creator with a photo, and the town panel opens in the same order.
  const towns = useMemo(() => {
    const map = new Map()
    for (const c of located) {
      const key = townKey(c._lat, c._lng)
      if (!map.has(key)) map.set(key, { key, coords: [c._lng, c._lat], creators: [] })
      map.get(key).creators.push(c)
    }
    for (const t of map.values()) {
      t.creators.sort(byPinPriority)
      // The town's country bounds the pin grouping (see clusterMerges), normalised through the alias table.
      // A town with no country gets its own key, so unknowns are never merged across the world.
      const named = t.creators.find((c) => c.country && countryKey(c.country))
      t.country = named ? countryKey(named.country) : `?${t.key}`
    }
    return [...map.values()]
  }, [located])

  // Tapping a country: who lives there (home town inside the country's geometry, or the country they typed) and who has
  // been there (countries_visited, stored with the atlas names). Someone who lives there is not also listed as a visitor.
  // Opening a town closes the country panel and vice versa.
  const selectTown = useCallback((t) => {
    setCountry(null)
    setSelected(t)
    writeUrl({ town: t?.key || null, country: null })
  }, [writeUrl])

  const openCountry = useCallback((geo) => {
    const name = geo.properties?.name
    if (!name) return
    const lives = located.filter(
      (c) => geoContains(geo, [c._lng, c._lat]) || countryNameMatches(c.country, name),
    )
    const liveIds = new Set(lives.map((c) => c.id))
    const visited = creators.filter(
      (c) => !liveIds.has(c.id) && (c.countries_visited || []).some((n) => sameCountry(n, name)),
    )
    const byName = (a, b) => (a.name || '').localeCompare(b.name || '')
    setSelected(null)
    setCountry({ name, lives: [...lives].sort(byName), visited: [...visited].sort(byName) })
    writeUrl({ country: name, town: null })
  }, [located, creators, writeUrl])

  // Re-open whatever the URL says once there is data. Guarded by a ref so a panel the reader closed stays closed.
  const restoredRef = useRef('')
  useEffect(() => {
    const key = `${urlCountry || ''}|${urlTown || ''}`
    if (restoredRef.current === key) return
    if (!urlCountry && !urlTown) { restoredRef.current = key; return }
    // Both panels need `located`, which needs the creators prop to have landed.
    if (located.length === 0) return
    restoredRef.current = key
    if (urlTown) {
      const town = towns.find((t) => t.key === urlTown)
      if (town) { setCountry(null); setSelected(town) }
      return
    }
    // A country panel needs the map's geometry to work out who lives inside it.
    loadMapFeatures()
      .then((fc) => {
        const geo = fc.features.find((f) => f.properties?.name === urlCountry)
        if (geo) openCountry(geo)
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlCountry, urlTown, located.length, towns])

  // Tint the countries creators live in (point-in-polygon). The arithmetic lives in lib/homeCountries, which rejects on
  // a bounding box first; the old loop cost over a second of main thread.
  useEffect(() => {
    let cancelled = false
    if (located.length === 0) { setHomeNames(new Set()); return }
    loadMapFeatures()
      .then((fc) => {
        if (cancelled) return
        setHomeNames(homeCountryNames(fc.features, located, countryNameMatches, geoContains))
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
    for (const [name, c] of centroids) canonToCentroid.set(countryKey(name), c)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const out = []
    for (const c of located) {
      // One journey per creator: their NEXT trip that actually leaves the home
      // country (a trip within it has no arc to draw, so we fall through to
      // the next one). Once a trip ends it drops out of `trips` server-side
      // and the following one takes over automatically.
      const list = Array.isArray(trips[c.id]) ? trips[c.id] : trips[c.id] ? [trips[c.id]] : []
      for (const trip of list) {
        if (!trip?.country) continue
        // The city if we could resolve it, the country's centroid if not. See
        // the note on `tripCoords`.
        const cityKey = trip.city && trip.country
          ? `${trip.city.trim().toLowerCase()}|${trip.country.trim().toLowerCase()}`
          : null
        // Stored first, geocoded second: see the note on `storedTripCoords`.
        const city = cityKey ? (storedTripCoords[cityKey] || tripCoords[cityKey]) : null
        const dest = city ? [city.lng, city.lat] : canonToCentroid.get(countryKey(trip.country))
        if (!dest) continue

        // Current and upcoming trips, up to 60 days ahead.
        const start = new Date(`${trip.start_date}T00:00:00`)
        const daysUntil = Math.round((start - today) / 86400000)
        if (daysUntil > TRIP_HORIZON_DAYS) continue
        const current = daysUntil <= 0

        const [ax, ay] = projection([c._lng, c._lat])
        const [bx, by] = projection(dest)
        const dx = bx - ax, dy = by - ay
        const len = Math.hypot(dx, dy)
        if (len < 14) continue // inside the home country: try the next trip
        const bulge = Math.min(len * 0.3, 55)
        const cx2 = (ax + bx) / 2 + (-dy / len) * bulge
        const cy2 = (ay + by) / 2 + (dx / len) * bulge
        out.push({
          id: c.id, name: c.name, photo_url: c.photo_url, trip, current, daysUntil,
          d: `M${ax} ${ay} Q ${cx2} ${cy2} ${bx} ${by}`, dest: [bx, by],
          // The destination in LONGITUDE/LATITUDE as well as projected pixels.
          // `dest` is already projected and so is useless for working out what
          // the map should be framing; the fit needs real coordinates.
          destLngLat: dest,
          // Projection length only; the zoom is applied at render (see `planeZoom`) so `journeys` keeps its identity.
          curve: quadLength(ax, ay, cx2, cy2, bx, by),
        })
        break
      }
    }
    // In the air first, then soonest to leave. A list sorted by "who is
    // actually gone" reads as news; sorted by creator id it reads as a dump.
    return out.sort((a, b) => (b.current ? 1 : 0) - (a.current ? 1 : 0) || a.daysUntil - b.daysUntil)
  }, [centroids, trips, located, tripCoords, storedTripCoords])

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
  const exploredView = !!exploredActive
  // Normalised through `countryKey`, the same alias table every other country
  // comparison in this app uses: the atlas says "United States of America" and
  // a profile says "USA", and a map that paints one and not the other is worse
  // than one that paints neither.
  const exploredSet = useMemo(
    () => new Set((exploredCountries || []).map((c) => countryKey(c)).filter(Boolean)),
    [exploredCountries],
  )
  // Do any of the viewer's connections actually appear on the map?
  const hasMappedConnections = useMemo(
    () => connectionsView && located.some((c) => connSet.has(c.id)),
    [connectionsView, located, connSet]
  )

  // Let the parent filter the creator cards to exactly the travellers the map
  // shows, so the "Who's travelling" button and the grid stay in lockstep.
  // Reported only when WHO is travelling changes, not every time the set is
  // rebuilt - a parent that stores it re-renders this map, which rebuilds it.
  const reportedTravellers = useRef('')
  useEffect(() => {
    const sig = [...travellerIds].sort().join(',')
    if (sig === reportedTravellers.current) return
    reportedTravellers.current = sig
    onTravellersChange?.(travellerIds)
  }, [travellerIds, onTravellersChange])
  const visibleTowns = useMemo(() => {
    const only = (ids) => towns
      .map((t) => ({ ...t, creators: t.creators.filter((c) => ids.has(c.id)) }))
      .filter((t) => t.creators.length > 0)
    if (focusJourney) return only(new Set([focusJourney.id]))
    if (connectionsView) return only(connSet)
    if (travelView) return only(travellerIds)
    return towns
  }, [towns, focusJourney, connectionsView, connSet, travelView, travellerIds])
  // SVG has no z-index: draw north to south, and float the selected pin to the end.
  // Pins that would overlap at the current zoom merge into one (hierarchical, built once per set of towns, see
  // clusterMerges): zooming in only splits groups and zooming out only merges them. Regrouping happens in half-octave
  // steps once the zoom pauses (`settledCluster`), so one scroll is one regroup.
  const hierarchy = useMemo(() => {
    const pts = visibleTowns
      .map((t) => {
        const p = projection(t.coords)
        return p ? { t, x: p[0], y: p[1] } : null
      })
      .filter(Boolean)
      .sort((a, b) => (b.t.creators.length - a.t.creators.length) || (a.t.key < b.t.key ? -1 : 1))
    return { pts, merges: clusterMerges(pts) }
  }, [visibleTowns])
  // Regroup 60 ms after the zoom stops changing: enough to swallow the frames within one wheel tick or pinch.
  const [settledCluster, setSettledCluster] = useState(() => clusterStep(liveZoom))
  useEffect(() => {
    const step = clusterStep(liveZoom)
    if (step === settledCluster) return undefined
    const t = setTimeout(() => setSettledCluster(step), 60)
    return () => clearTimeout(t)
  }, [liveZoom, settledCluster])
  const clusterZoom = settledCluster
  const clusteredTowns = useMemo(() => {
    const { pts, merges } = hierarchy
    return groupsAtReach(pts, merges, reachAtZoom(clusterZoom)).map((members) => {
      if (members.length === 1) return members[0]
      const creators = members.flatMap((t) => t.creators).sort(byPinPriority)
      return {
        key: `cluster:${members.map((t) => t.key).sort().join('+')}`,
        coords: members[0].coords,
        creators,
        towns: members,
      }
    })
  }, [hierarchy, clusterZoom])

  // Thread the visible (clustered) pins into one path, nearest neighbour from the westmost.
  const segments = useMemo(() => {
    if (clusteredTowns.length < 2) return []
    const remaining = clusteredTowns.map((t) => t.coords).sort((a, b) => a[0] - b[0])
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
      // NO `dur` HERE. The duration depends on the zoom and this list does not,
      // so computing it in the same memo would rebuild every path string every
      // time somebody finished a pinch. See `planeSegments`.
      segs.push({
        key: `${i}-${Math.round(ax)},${Math.round(ay)}`,
        d: `M${ax} ${ay} Q ${cx} ${cyc} ${bx} ${by}`,
        curve,
      })
    }
    return segs
  }, [clusteredTowns])

  // Pins animate when the grouping changes: split pins fly out from the group, merged pins fly in. Worked out during
  // render from the previous layout in state, so the first frame of a new grouping is the first frame of the animation.
  const pinLayout = useMemo(() => clusteredTowns.map((t) => {
    const p = projection(t.coords) || [0, 0]
    return { key: t.key, x: p[0], y: p[1], towns: t.towns ? t.towns.map((m) => m.key) : [t.key], group: t }
  }), [clusteredTowns])
  const [morph, setMorph] = useState({ layout: null, from: new Map(), ghosts: [], id: 0 })
  if (morph.layout !== pinLayout) {
    const prev = morph.layout
    const from = new Map()
    const ghosts = []
    if (prev && !entering) {
      const prevByTown = new Map()
      for (const p of prev) for (const k of p.towns) prevByTown.set(k, p)
      const prevKeys = new Set(prev.map((p) => p.key))
      const curKeys = new Set(pinLayout.map((l) => l.key))
      for (const cur of pinLayout) {
        if (prevKeys.has(cur.key)) continue
        const sources = [...new Set(cur.towns.map((k) => prevByTown.get(k)).filter(Boolean))]
        if (sources.length === 1) {
          from.set(cur.key, { dx: sources[0].x - cur.x, dy: sources[0].y - cur.y, x: cur.x, y: cur.y })
        } else if (sources.length > 1) {
          from.set(cur.key, { dx: 0, dy: 0, x: cur.x, y: cur.y, pop: true })
          for (const src of sources) {
            if (!curKeys.has(src.key)) ghosts.push({ ...src, dx: cur.x - src.x, dy: cur.y - src.y, gid: `${morph.id}:${src.key}` })
          }
        }
      }
    }
    setMorph({ layout: pinLayout, from, ghosts, id: morph.id + 1 })
  }
  useEffect(() => {
    if (!morph.ghosts.length) return undefined
    // Must outlive the 200ms leaving animation, with a frame in hand.
    const t = setTimeout(() => setMorph((m) => (m.ghosts.length ? { ...m, ghosts: [] } : m)), 280)
    return () => clearTimeout(t)
  }, [morph.id, morph.ghosts.length])

  const paintOrder = useMemo(() => {
    const list = [...clusteredTowns].sort((a, b) => b.coords[1] - a.coords[1])
    if (!selected) return list
    const i = list.findIndex((t) => t.key === selected.key)
    if (i === -1) return list
    const [picked] = list.splice(i, 1)
    list.push(picked)
    return list
  }, [clusteredTowns, selected])

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
      out.push({ key: k, d, curve })
    }
    // Longest few, so the picks are visually distinct rather than a cluster.
    return out.sort((a, b) => b.curve - a.curve).slice(0, 5)
  }, [connectionsView, nearMe, myId, located, connSet, highlightIds, towns])

  // The view that fits everyone with a location. `maxFitZoom` depends on the map: a world map needs a ceiling, a
  // market map should zoom right in. On journey maps the destinations are part of the fit.
  const fitPoints = useMemo(() => {
    if ((travelView || travelOnlyView) && journeys.length > 0) {
      const pts = []
      for (const j of journeys) {
        const home = located.find((c) => c.id === j.id)
        if (home) pts.push([home._lng, home._lat])
        if (j.destLngLat) pts.push(j.destLngLat)
      }
      if (pts.length > 0) return pts
    }
    return located.map((c) => [c._lng, c._lat])
  }, [travelView, travelOnlyView, journeys, located])

  const fitView = useMemo(() => {
    if (fitPoints.length === 0) return { coordinates: [10, 30], zoom: 1.3 }
    const lngs = fitPoints.map((p) => p[0]), lats = fitPoints.map((p) => p[1])
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
    const minLat = Math.min(...lats), maxLat = Math.max(...lats)
    const lngSpan = Math.max(maxLng - minLng, 0.01), latSpan = Math.max(maxLat - minLat, 0.01)
    const zoom = Math.min(maxFitZoom, Math.max(1, Math.min(360 / (lngSpan * 1.5), 180 / (latSpan * 1.8))))
    return { coordinates: [(minLng + maxLng) / 2, (minLat + maxLat) / 2], zoom }
  }, [fitPoints, maxFitZoom])

  // Flight durations are measured at the FITTED zoom, so zooming never changes a plane's duration (which made it jump).
  const planeZoom = Math.max(1, fitView.zoom || 1)

  // Only the longest threads carry a plane (capped), in screen units so every map flies at the same visible speed.
  // See MIN_PLANE_LEN.
  const planeSegments = useMemo(() => {
    const scaled = segments.map((s) => {
      const screen = s.curve * planeZoom
      return { ...s, screen, dur: flightDur(screen) }
    })
    const long = scaled.filter((s) => s.screen >= MIN_PLANE_LEN)
    // Nothing long enough? Fly ONE anyway, so the "we're all connected" idea still reads for a community that is merely
    // clustered - but only if the longest hop is within reach of the threshold. A market whose creators all live in one
    // city gets NO aircraft, which is what the team asked for and what the old fallback made impossible: with every hop
    // below the bar, `long` was empty and the pool became the whole list.
    const pool = long.length
      ? long
      : scaled.filter((s) => s.screen >= MIN_PLANE_LEN * 0.5)
    return [...pool].sort((a, b) => b.screen - a.screen).slice(0, MAX_PLANES)
  }, [segments, planeZoom])

  // Fit to everyone, and keep fitting until the reader moves the camera (`userMoved`): creators geocoded late would
  // otherwise be left off screen. The fit is compared by value before it is applied, so re-running is harmless.
  const appliedFit = useRef(null)
  useEffect(() => {
    if (located.length === 0 || userMoved.current) return
    const [lng, lat] = fitView.coordinates
    const last = appliedFit.current
    if (last && last.lng === lng && last.lat === lat && last.zoom === fitView.zoom) return
    appliedFit.current = { lng, lat, zoom: fitView.zoom }
    didInitCenter.current = true
    setPosition(fitView)
    setLiveZoom(fitView.zoom)
  }, [located, fitView])

  // One more fit when the destinations arrive, on the collab board only. Interactive maps never re-frame on a filter
  // change: a filter changes what is drawn, not the camera.
  const refitWithJourneys = useRef(false)
  useEffect(() => {
    if (refitWithJourneys.current) return
    if (journeys.length === 0 || !travelOnlyView) return
    refitWithJourneys.current = true
    setPosition(fitView)
    setLiveZoom(fitView.zoom)
  }, [journeys.length, travelOnlyView, fitView])

  const selectedTown = selected // a town snapshot ({ key, coords, creators })

  // Counter-scaling reads the LIVE zoom, set synchronously in onMove so the map's scale and the markers' counter-scale
  // land in the same React batch and the same frame. Deferring it to rAF made pins and planes briefly oversized.
  const z = liveZoom
  const handleMove = useCallback((pos) => { zoomRef.current = pos.zoom; setLiveZoom(pos.zoom) }, [])
  const handleMoveEnd = useCallback((pos) => {
    setPosition(pos)
    setLiveZoom(pos.zoom)
  }, [])

  // liveZoom always follows position.zoom, whatever moved the map (gesture, drag, buttons, re-fit).
  useEffect(() => { zoomRef.current = position.zoom; setLiveZoom(position.zoom) }, [position.zoom])

  // Two plain set-states, not one nested in an updater (updaters must be pure), and the factor is applied to the
  // previous state so several quick presses all count.
  const zoomBy = (factor) => {
    setPosition((p) => ({ ...p, zoom: Math.min(40, Math.max(1, p.zoom * factor)) }))
  }
  const resetView = () => {
    // Reset hands the camera back: the map resumes re-framing itself as late
    // pins arrive, which is what somebody pressing "reset" is asking for.
    userMoved.current = false
    setPosition(fitView)
    setLiveZoom(fitView.zoom)
  }

  // The view filters: an overlay on desktop, a row under the map on phones; `controls={false}` drops them.
  // One shape for every filter, a fixed width (`w-44`) so nothing reflows when one turns on.
  const pill = (on) =>
    `inline-flex w-52 items-center justify-start gap-2 rounded-full px-3.5 py-2 text-xs font-semibold shadow-card backdrop-blur transition-all hover:scale-[1.03] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 ${
      on ? 'bg-brand text-white ring-1 ring-brand' : 'bg-white/95 text-ink ring-1 ring-black/5'
    }`

  // A function, not a value: the overlay and the phone row want different variants (`compact` is the phone row:
  // three equal cells, icon over a one-word label, no counts, no "On the move").
  const cell = (on) => cx(
    'flex min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2 text-[13px] font-semibold transition-transform active:scale-95 disabled:opacity-50',
    on ? 'bg-brand text-white shadow-card' : 'bg-white text-ink ring-1 ring-gray-200',
  )
  const renderFilterButtons = ({ omitTravel = false, compact = false } = {}) => !controls ? null : compact ? (
    <>
      {onToggleConnections && (
        <button type="button" onClick={onToggleConnections} aria-pressed={connectionsView} className={cell(connectionsView)}>
          <Icon name="users" className="h-4 w-4 shrink-0" />
          <span className="truncate">{tr('Connections')}</span>
        </button>
      )}
      {onToggleExplored && (
        <button type="button" onClick={onToggleExplored} aria-pressed={exploredView} className={cell(exploredView)}>
          <Icon name="globe" className="h-4 w-4 shrink-0" />
          <span className="truncate">{tr('Travelled')}</span>
        </button>
      )}
      {onToggleNearMe && (
        <button type="button" onClick={onToggleNearMe} disabled={nearMeDisabled} aria-pressed={nearMe} className={cell(nearMe)}>
          <Icon name="pin" className="h-4 w-4 shrink-0" />
          <span className="truncate">{tr('Near me')}</span>
        </button>
      )}
    </>
  ) : (
    <>
      {onToggleConnections && (
        <button
          type="button"
          onClick={onToggleConnections}
          className={pill(connectionsView)}
        >
          <Icon name="users" className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{tr('My connections')}{connectionsView ? ` · ${connSet.size}` : ''}</span>
        </button>
      )}
      {/* WHERE WE HAVE BEEN, TOGETHER - AS A FILTER, NOT A SECOND MAP. There used to be an entire extra WorldMap at the
          bottom of the directory showing every country anybody had filmed in. they are right: it was a second world map
          on a page that already had one, three screens below it, answering a question about the same set of people. As a
          toggle it is the same information in the place you are already looking, and it costs no extra atlas parse. */}
      {onToggleExplored && (
        <button
          type="button"
          onClick={onToggleExplored}
          className={pill(exploredView)}
        >
          <Icon name="globe" className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{tr('Been together')}{exploredView ? ` · ${exploredSet.size}` : ''}</span>
        </button>
      )}
      {journeys.length > 0 && !omitTravel && (
        <button
          type="button"
          onClick={toggleTravel}
          className={pill(travelView)}
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="currentColor" aria-hidden>
            <path d="M12 1.55 C13.05 1.55 13.71 3.45 13.71 6.11 L13.71 7.82 L21.5 12.95 L21.5 14.95 L13.71 11.81 L13.71 16.75 L16.18 19.22 L16.18 20.74 L12 19.32 L7.82 20.74 L7.82 19.22 L10.29 16.75 L10.29 11.81 L2.5 14.95 L2.5 12.95 L10.29 7.82 L10.29 6.11 C10.29 3.45 10.95 1.55 12 1.55 Z" />
          </svg>
          {/* The label names both halves. "Who's travelling" on a map that also
              carries next month's flights is a label that undersells its own
              content, and a creator scanning for somebody to meet in Lisbon in
              three weeks had no reason to press it. */}
          <span className="truncate">{tr('Travelling')}{travelView ? ` · ${journeys.length}` : ''}</span>
        </button>
      )}
      {onToggleNearMe && (
        <button
          type="button"
          onClick={onToggleNearMe}
          disabled={nearMeDisabled}
          title={nearMeDisabled ? tr('Add your city in your profile to use this') : undefined}
          className={pill(nearMe)}
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11Z" /><circle cx="12" cy="10" r="2.6" />
          </svg>
          <span className="truncate">{tr('Creators near me')}{nearMe ? ` · ${nearCount}` : ''}</span>
        </button>
      )}
    </>
  )

  // Tapping the sea, anywhere outside the component, or Escape closes what is open.
  const closePanels = useCallback(() => {
    if (!selected && !country) return
    setSelected(null)
    setCountry(null)
    writeUrl({ town: null, country: null })
  }, [selected, country, writeUrl])

  useEffect(() => {
    if (!selected && !country) return undefined
    const onDown = (e) => { if (!rootRef.current?.contains(e.target)) closePanels() }
    const onKey = (e) => { if (e.key === 'Escape') closePanels() }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [selected, country, closePanels])

  // Entering and leaving full screen: the Fullscreen API where it exists, the fixed overlay otherwise.
  // The page offset is saved and restored with behavior 'instant' (scroll-behavior is smooth app-wide).
  const scrollBefore = useRef(0)

  const enterFullscreen = useCallback(async () => {
    scrollBefore.current = window.scrollY
    setFullscreen(true)
    const el = fsRef.current
    try {
      if (el?.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' })
      else if (el?.webkitRequestFullscreen) el.webkitRequestFullscreen()
    } catch { /* denied or unsupported: the overlay still fills the window */ }
    try { await window.screen?.orientation?.lock?.('landscape') } catch { /* iOS, and most desktops */ }
  }, [])

  // Leaving animates: `closing` swaps in the exit keyframes for 180 ms before the overlay unmounts. The browser's own
  // fullscreen is released immediately.
  const exitFullscreen = useCallback(() => {
    try { window.screen?.orientation?.unlock?.() } catch { /* see above */ }
    try { if (document.fullscreenElement) document.exitFullscreen() } catch { /* already out */ }
    setClosing(true)
    setTimeout(() => {
      setFullscreen(false)
      setClosing(false)
      // The page is put back by the scroll lock's own release (below), in the
      // same task as the unlock, so there is no frame at the top of the page.
    }, 180)
  }, [])

  // Leaving by the browser's own route (Escape, the system gesture, the back
  // swipe) has to put the component back too, or the overlay stays up with no
  // browser chrome around it and no way out.
  useEffect(() => {
    if (!fullscreen) return undefined
    const onChange = () => {
      if (document.fullscreenElement) return
      setFullscreen(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') exitFullscreen() }
    document.addEventListener('fullscreenchange', onChange)
    document.addEventListener('keydown', onKey)
    // The page behind must not scroll while the overlay is up: the shared scroll lock keeps its position.
    const release = lockScroll()
    return () => {
      document.removeEventListener('fullscreenchange', onChange)
      document.removeEventListener('keydown', onKey)
      release()
    }
  }, [fullscreen, exitFullscreen])

  // In full screen the panels and filters go OVER the map at every width,
  // because there is no "under the map" any more - the map is the whole screen.
  // Outside it the phone keeps them below, for the reasons in the notes further
  // down.
  const overlayCls = fullscreen ? 'flex' : 'hidden sm:flex'

  // Panel size: a 24rem card on a page, bigger in desktop full screen, smaller in phone full screen (landscape, about
  // 390px tall). The height query detects a landscape phone; `sm:` would not.
  const panelCls = fullscreen
    ? 'max-w-md [--map-panel-max-h:32rem] lg:max-w-lg [@media(max-height:540px)]:max-w-[15.5rem] [@media(max-height:540px)]:[--map-panel-max-h:100%]'
    : 'max-w-sm'

  // The width lives on the draggable wrapper, so the drag clamp measures the box you can see.
  const panelBox = `pointer-events-auto flex min-h-0 w-full flex-col ${panelCls}`

  const townPanel = selected ? (
    <TownPanel
      town={selected}
      onClose={() => selectTown(null)}
      onCreatorClick={onCreatorClick}
    />
  ) : null

  const countryPanel = country ? (
    <CountryPanel
      country={country.name}
      lives={country.lives}
      visited={country.visited}
      onClose={() => { setCountry(null); writeUrl({ country: null }) }}
      onCreatorClick={onCreatorClick}
    />
  ) : null

  // The panel is centred, and `bottom-3 + top-14` gives the card a definite box to shrink and scroll inside.
  const panelFrame = `pointer-events-none absolute inset-x-3 bottom-3 top-14 z-20 flex-col items-center justify-center ${overlayCls}`

  // One button of the control group: hover tints the ground instead of scaling (a scaled disc is clipped by the pill).
  const mapBtn = 'flex h-9 w-9 shrink-0 items-center justify-center text-smoke transition-colors hoverable:hover:bg-cloud active:bg-cloud'
  // The hairline between two buttons runs ACROSS the group's own axis, and the
  // group's axis changes at `sm` on an embedded map (a row on a phone, a stack
  // on a desktop) while a full-screen one is always a stack.
  const mapBtnDiv = fullscreen
    ? 'border-t border-gray-100'
    : 'border-l border-gray-100 sm:border-l-0 sm:border-t'

  const mapBox = (
    <div
      ref={boxRef}
      // Opts out of the platform-wide pinch guard: this map zooms itself, with
      // d3-zoom, and draws more map rather than bigger pixels. See
      // lib/pinchGuard.
      data-zoomable
      // Touch: `pan-y` outside full screen so one finger scrolls the page and two pinch the map; `none` in full screen,
      // where one finger pans the map.
      style={{ touchAction: 'none' }}
      className={cx(
        'relative w-full overflow-hidden',
        fullscreen && 'flex h-full flex-1 items-center justify-center',
        // THE SEA. `bg-cloud/60` everywhere except a flush map, where the
        // section behind it is the sea - see the `flush` prop. Full screen
        // always paints its own, because there is no page behind it.
        (!flush || fullscreen) && 'bg-cloud/60',
        // The frame belongs to whichever element is the OUTSIDE of the card. With
        // a caption bar that is the wrapper below, and drawing a second border
        // here would put a hairline between the caption and the map it names.
        !fullscreen && !header && !flush && 'rounded-card border border-gray-100',
      )}
    >
      {/* No name pill on hover: the panel names the country. `tooltip` is still tracked for hit-testing. */}

      {/* THE KEY IS NO LONGER ON THE MAP. See `legendStrip` below. */}

      {/* Outside full screen: one full-screen button (gestures are refused there, so +/- would be a one-way door).
         Inside full screen: the full zoom stack, inset from the rounded corners and notch. */}
      {!fullscreen && allowFullscreen && (
        <button
          type="button"
          onClick={enterFullscreen}
          aria-label={tr('Open the map full screen')}
          title={tr('Full screen')}
          // A glyph on phones, a labelled button on desktop (where it is the only way in). On a flush map it sits top right,
          // just right of Russia (`right-6`).
          className={cx(
            'absolute z-20 flex h-9 items-center justify-center gap-1.5 rounded-full bg-white/90 px-0 text-smoke shadow-card ring-1 ring-black/5 backdrop-blur transition-all duration-200 hoverable:hover:scale-105 hoverable:hover:text-ink active:scale-95 max-sm:w-9 sm:px-3.5',
            flush ? 'right-4 top-4 sm:right-6' : 'right-3 top-3 sm:right-5 sm:top-5',
            // On a navigable map the desktop door is the last button of the zoom
            // pill below, so this one is the phone's only.
            navigable && 'sm:hidden',
          )}
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
          </svg>
          <span className="hidden text-xs font-semibold sm:inline">{tr('Full screen')}</span>
        </button>
      )}

      {/* Zoom stack on navigable maps outside full screen, under the full-screen button. Full screen keeps its own copy. */}
      {/* A PHONE DOES NOT GET THE STACK. Two fingers still pinch and one still scrolls the page, so on a phone these
          three discs are 120px of chrome over the picture that do nothing a finger cannot. They come back at `sm`, where
          the pointer is a mouse and the wheel gate is the only other way in. */}
      {/* FULL SCREEN IS PART OF THE PILL ON A DESKTOP. So the pill takes the full-screen button's old corner and the
          labelled button above is phone-only on a navigable map. */}
      {!fullscreen && navigable && (
        <div className={cx(
          'absolute z-20 hidden flex-col overflow-hidden rounded-full bg-white/95 shadow-card ring-1 ring-black/5 backdrop-blur sm:flex',
          flush ? 'right-4 top-4 sm:right-6' : 'right-3 top-3 sm:right-5 sm:top-5',
        )}>
          <button type="button" onClick={() => { userMoved.current = true; zoomBy(1.6) }} aria-label={tr("Zoom in")} className={mapBtn}>
            <span className="text-lg font-semibold leading-none text-ink">+</span>
          </button>
          <button type="button" onClick={() => { userMoved.current = true; zoomBy(1 / 1.6) }} aria-label={tr("Zoom out")} className={cx(mapBtn, mapBtnDiv)}>
            <span className="text-lg font-semibold leading-none text-ink">−</span>
          </button>
          <button type="button" onClick={resetView} aria-label={tr("Reset map view")} className={cx(mapBtn, mapBtnDiv)}>
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9 9 0 0 0-6.7 3M3 4v4h4"/></svg>
          </button>
          {allowFullscreen && (
            <button type="button" onClick={enterFullscreen} aria-label={tr('Open the map full screen')} title={tr('Full screen')} className={cx(mapBtn, mapBtnDiv)}>
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
              </svg>
            </button>
          )}
        </div>
      )}

      {fullscreen && (
        <div className="absolute right-4 top-4 z-20 flex flex-col overflow-hidden rounded-full bg-white/95 shadow-card ring-1 ring-black/5 backdrop-blur">
          <button type="button" onClick={() => zoomBy(1.6)} aria-label={tr("Zoom in")} className={mapBtn}>
            <span className="text-lg font-semibold leading-none text-ink">+</span>
          </button>
          <button type="button" onClick={() => zoomBy(1 / 1.6)} aria-label={tr("Zoom out")} className={cx(mapBtn, mapBtnDiv)}>
            <span className="text-lg font-semibold leading-none text-ink">−</span>
          </button>
          <button type="button" onClick={resetView} aria-label={tr("Reset map view")} className={cx(mapBtn, mapBtnDiv)}>
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9 9 0 0 0-6.7 3M3 4v4h4"/></svg>
          </button>
          <button
            type="button"
            onClick={exitFullscreen}
            aria-label={tr('Exit full screen')}
            title={tr('Exit full screen')}
            className={cx(mapBtn, mapBtnDiv)}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
            </svg>
          </button>
        </div>
      )}

      <CreatorMapCanvas
        EXPLORED_FILL={EXPLORED_FILL}
        HOME_FILL={HOME_FILL}
        HOVER_FILL={HOVER_FILL}
        LAND_FILL={LAND_FILL}
        SEPARATOR={SEPARATOR}
        arrived={arrived}
        closePanels={closePanels}
        connectionsView={connectionsView}
        country={country}
        entering={entering}
        exploredSet={exploredSet}
        exploredView={exploredView}
        features={features}
        focusJourney={focusJourney}
        fullscreen={fullscreen}
        handleMove={handleMove}
        handleMoveEnd={handleMoveEnd}
        highlightIds={highlightIds}
        highlighting={highlighting}
        homeNames={homeNames}
        linkSegments={linkSegments}
        morph={morph}
        navigable={navigable}
        nearMe={nearMe}
        openCountry={openCountry}
        paintOrder={paintOrder}
        painted={painted}
        planeSegments={planeSegments}
        planeZoom={planeZoom}
        position={position}
        quietMap={quietMap}
        seen={seen}
        segments={segments}
        selectTown={selectTown}
        selected={selected}
        setFocusId={setFocusId}
        tr={tr}
        userMoved={userMoved}
        visibleJourneys={visibleJourneys}
        wheelIsOurs={wheelIsOurs}
        z={z}
      />

      {/* The country a reader tapped. Same corner as the town card and mutually
          exclusive with it - two overlapping answers to two different questions
          in one corner is how a map stops being readable. */}
      {/* Desktop only: a frame pinned to all four insets gives the panel a definite height. Phones get the panel under the
         map (end of the component). */}
      {country && <div className={panelFrame}><DraggablePanel enabled={fullscreen} resetKey={fullscreen} className={panelBox}>{countryPanel}</DraggablePanel></div>}

      {/* The city roster: same corner and card as the country panel, mutually exclusive with it. Desktop only. */}
      {/* Full screen only: the card can be dragged (a transform on a wrapper, so sizing is untouched). */}
      {selectedTown && <div className={panelFrame}><DraggablePanel enabled={fullscreen} resetKey={fullscreen} className={panelBox}>{townPanel}</DraggablePanel></div>}

      {/* WHAT THE TWO PLANES MEAN. A solid plane and a hollow one is a
          distinction nobody can be expected to guess, and an unexplained
          symbol is worse than no symbol. Only shown when both kinds are
          actually on the map. */}
      {/* Top-left: the only free corner (filters bottom-left, zoom top-right, town card bottom). */}
      {/* NOT ON A PHONE, unless the map is full screen. The map box is about 180px tall at 375px and this key is 56 of
          them - a third of the map spent explaining two symbols. Full screen it costs nothing and still earns its place. */}
      {travelView && !focusJourney && journeys.some((j) => j.current) && journeys.some((j) => !j.current) && (
        <div className={`absolute left-3 z-20 ${fullscreen ? 'flex' : 'hidden sm:flex'} flex-col gap-1.5 rounded-xl bg-white/95 px-3 py-2 text-[11px] shadow-card ring-1 ring-black/5 backdrop-blur ${fullscreen ? 'top-16' : 'top-3'}`}>
          <span className="flex items-center gap-2">
            <svg viewBox="0 0 24 24" className="h-3 w-3 shrink-0" fill={BRAND} aria-hidden><path d={PLANE_D} transform="translate(12 12) scale(0.9)" /></svg>
            <span className="font-medium text-ink">{tr("There now")}</span>
          </span>
          <span className="flex items-center gap-2">
            <svg viewBox="0 0 24 24" className="h-3 w-3 shrink-0" fill="#ffffff" stroke={BRAND} strokeWidth="2" aria-hidden><path d={PLANE_D} transform="translate(12 12) scale(0.9)" /></svg>
            <span className="text-smoke">{tr("Heading there soon")}</span>
          </span>
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
            {/* Whether this has happened yet, in the words somebody would use.
                "12 Sep - 20 Sep" makes the reader do the date arithmetic; "in
                9 days" is the thing they were working it out to find. */}
            <span className="ml-1.5 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
              {focusJourney.current
                ? 'There now'
                : focusJourney.daysUntil <= 1 ? 'Leaves tomorrow' : `In ${focusJourney.daysUntil} days`}
            </span>
          </span>
          <button type="button" onClick={() => setFocusId(null)} aria-label={tr("Show everyone again")}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-white/20">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button>
        </div>
      )}

      {/* "My connections" view with no one to show: overlay a friendly nudge. */}
      {connectionsView && !hasMappedConnections && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center p-6">
          <div className="pointer-events-auto max-w-xs rounded-card border border-gray-100 bg-white/95 p-5 text-center shadow-lift backdrop-blur">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl text-brand">
              <Icon name="users" className="h-6 w-6" />
            </div>
            <p className="text-sm font-semibold text-ink">{tr("No connections on the map yet")}</p>
            <p className="mt-1 text-xs text-smoke">
              {tr("Once you connect with other creators they'll appear here. Head to a profile or the Connections page to start building your network.")}
            </p>
          </div>
        </div>
      )}

      {/* Filter toggles overlay the map on desktop only - on phones they'd cover
          most of it, so there they render in a row UNDER the map instead. */}
      <div className={`absolute bottom-3 left-3 z-10 flex-col items-start gap-2 ${overlayCls} ${travelOnlyView ? '!hidden' : ''}`}>
        {renderFilterButtons()}
      </div>

      {/* THE "TAP A PIN FOR WHO'S THERE" HINT IS GONE. It was a white pill in the top-right corner of every map
          explaining that pins and countries are tappable and that + and − zoom. they are right on both counts: a pin on
          a map is a tappable pin, and the instruction was competing with the map for the one corner that is always
          visible. */}
    </div>
  )

  // Full screen is portalled to the body: `position: fixed` resolves against a transformed ancestor.
  if (fullscreen) {
    return createPortal(
      <div
        ref={fsRef}
        className={cx(
          'fixed inset-0 z-[70] flex flex-col bg-white',
          closing ? 'animate-map-out' : 'animate-map-in',
        )}
        // All four safe-area insets: in landscape the notch and home indicator are on the left and right.
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          paddingLeft: 'env(safe-area-inset-left)',
          paddingRight: 'env(safe-area-inset-right)',
        }}
      >
        <div ref={rootRef} className="relative flex min-h-0 flex-1 flex-col">
          {/* The way out, top-left, away from the zoom stack. A full-screen view
              whose only exit is a browser gesture is a trap on a phone. */}
          <button
            type="button"
            onClick={exitFullscreen}
            className="absolute left-4 top-4 z-40 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3.5 py-2 text-xs font-semibold text-ink shadow-card ring-1 ring-black/5 backdrop-blur transition-transform hover:scale-105 active:scale-95"
          >
            <Icon name="chevronLeft" className="h-3.5 w-3.5" />
            {tr("Exit full screen")}
          </button>

          {/* TURN THE PHONE. Shown only in portrait, and only on a screen small
              enough for it to matter. Where the orientation lock worked this is
              never seen; where it did not (every iPhone) it is the whole
              instruction, and it goes away by itself the moment it is followed. */}
          <p className="pointer-events-none absolute inset-x-0 top-16 z-30 mx-auto w-max rounded-full bg-ink/85 px-4 py-2 text-xs font-medium text-white landscape:hidden sm:hidden">
            {tr("Turn your phone sideways for the full map")}
          </p>

          {mapBox}
        </div>
      </div>,
      document.body,
    )
  }

  // The key sits under the map in one line, so it never covers the map on a phone.
  const legendStrip = legend ? (
    <div className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5">
      {[
        { fill: HOME_FILL, label: tr('Where we live') },
        { fill: EXPLORED_FILL, label: tr('Where we have filmed') },
      ].map((k) => (
        <span key={k.label} className="flex items-center gap-2 text-[11px] font-medium text-smoke">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: k.fill }} aria-hidden />
          {k.label}
        </span>
      ))}
    </div>
  ) : null

  // One card: the caption, a hairline, the map. See the note on the `header`
  // prop for what this replaces.
  const mapCard = header ? (
    <div className="overflow-hidden rounded-card border border-gray-100 bg-white shadow-card">
      <div className="border-b border-gray-100 px-4 py-3 sm:px-5">{header}</div>
      {mapBox}
    </div>
  ) : mapBox

  return (
    <div ref={rootRef} className="w-full">
      {mapCard}
      {/* Phones get the country panel under the map at full width; the country stays highlighted above. */}
      {/* AND IT COMES BEFORE THE KEY, NOT AFTER IT. they are right, and there is a reason beyond taste: the panel is the
          ANSWER to the tap that produced it, and a key sitting between the map and the answer puts a legend in the
          middle of a sentence. With nothing selected the key sits straight under the map exactly as before. */}
      {countryPanel && <div className="mt-3 sm:hidden">{countryPanel}</div>}
      {townPanel && <div className="mt-3 sm:hidden">{townPanel}</div>}
      {legendStrip}
      {/* Mobile: the same filters in a wrapping row below the map. */}
      {!travelOnlyView && (
        <div className="mt-3 grid grid-cols-3 gap-2 sm:hidden">
          {renderFilterButtons({ omitTravel: true, compact: true })}
        </div>
      )}
    </div>
  )
}

const CreatorMapMemo = memo(CreatorMap)

export default function CreatorMapGated(props) {
  useEffect(() => { warmPinPhotos(props.creators) }, [props.creators])
  return <SlowMapGate className={props.slowGateClassName}><CreatorMapMemo {...props} /></SlowMapGate>
}
