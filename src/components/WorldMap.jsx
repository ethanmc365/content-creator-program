import { memo, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ComposableMap, Geographies, Geography, Marker, ZoomableGroup } from 'react-simple-maps'
import { loadMapFeatures, loadMapCountryNames, loadMapCentroids } from '../lib/mapCountries'
import { useIsDark } from '../lib/theme'
import { sameCountry } from '../lib/countryFacts'
import CountryPanel from './CountryPanel'
import { lockScroll } from '../lib/scrollLock'

// Interactive world map for "countries visited".
//  * Free & open source: react-simple-maps + the world-atlas TopoJSON from
//    the jsDelivr CDN. No API keys, no paid services.
//  * selectable=true  → tapping a country toggles it (used while editing).
//  * selectable=false → read-only display (used on profiles).
// Countries are stored by their map name (e.g. "United Kingdom") in
// profiles.countries_visited so display and filtering stay simple.
//
// On phones, tapping tiny countries on the map is fiddly, so when selectable
// we ALSO show a type-to-add search box + removable chips. The search list is
// built from the map's OWN TopoJSON (via lib/mapCountries), so the names always
// match exactly what a map tap stores.
const BRAND = '#d94407'
const BRAND_LIGHT = '#f5853f'
const UNSELECTED = '#ECECEE'

// A stable empty collection for the frame before the shared atlas resolves.
// It must be the SAME object every render, or `<Geographies>` treats each render
// as a new source and re-runs its own loading path.
const EMPTY_GEO = { type: 'FeatureCollection', features: [] }

// `owner` turns the read-only profile map into something you can ask questions
// of. Tapping a country opens what we know about the place (flag, continent,
// currency, what it is known for) plus the one person this map is about, with a
// DM button - because on somebody's profile the useful question is not "who has
// been here" (the community map answers that) but "you have been here, tell me
// about it". Without `owner` the map stays exactly as read-only as it was.
// `here` puts ONE person on the map, where they are today. See the note above
// the marker at the foot of this file for what it draws and why it is a face
// rather than a pin.
// The zoom range this map allows. Module scope so every reader of it - the
// full-screen open, the + / - buttons - is looking at the same two numbers.
const clampZoom = (z) => Math.min(8, Math.max(1, z))

function WorldMap({ selected = [], onToggle, selectable = false, chips = false, focusCountry = null, fitSelected = false, owner = null, here = null }) {
  const dark = useIsDark()
  const [country, setCountry] = useState(null)
  // Unvisited land + the hairline between countries darken in dark mode so the
  // map reads as land-on-deep-sea instead of a glaring light-grey block.
  const UNSELECTED_FILL = dark ? '#2a2c31' : UNSELECTED
  const SEPARATOR = dark ? '#0c0d10' : '#ffffff'
  const [tooltip, setTooltip] = useState('')
  const [position, setPosition] = useState({ coordinates: [12, 8], zoom: 1 })
  const [focusPos, setFocusPos] = useState(null)
  const [fitPos, setFitPos] = useState(null)
  const [query, setQuery] = useState('')
  const [allNames, setAllNames] = useState([])
  // Filling the screen with the map. See the note on the map box below.
  const [full, setFull] = useState(false)
  // The map's geometry, from the ONE shared parse (see lib/mapCountries). Handing
  // `<Geographies>` an object rather than a URL is what stops every instance on
  // the page fetching and decoding the atlas for itself.
  const [features, setFeatures] = useState(null)
  const selectedSet = new Set(selected)

  useEffect(() => {
    let cancelled = false
    loadMapFeatures().then((fc) => { if (!cancelled) setFeatures(fc) })
    return () => { cancelled = true }
  }, [])

  // WHILE THE MAP FILLS THE SCREEN: the page behind it must not scroll, and
  // Escape must get you out. A full-screen overlay you can only leave by
  // finding one small button is a trap on a phone.
  useEffect(() => {
    if (!full) return undefined
    const release = lockScroll()
    const onKey = (e) => { if (e.key === 'Escape') setFull(false) }
    document.addEventListener('keydown', onKey)
    return () => { release(); document.removeEventListener('keydown', onKey) }
  }, [full])

  // IT OPENS ON THE FRAME YOU WERE ALREADY LOOKING AT (fixed 1 Sep 2026).
  //
  // Ethan: "when you click the full screen mode on the map, it starts with the
  // map zoomed in a bit, rather than just showing it normally first."
  //
  // It used to force `zoom >= 2` AND drop `fitPos`/`focusPos` on the way in. So
  // pressing full screen did two things nobody asked for: it threw away the
  // frame fitted to this creator's own countries - the entire point of the map
  // on a profile - and then zoomed into whatever happened to be in the middle
  // afterwards. Opening full screen is a request for MORE of the same picture,
  // never a different one.
  //
  // WHAT THE FORCED ZOOM WAS FOR, and why it is not needed. The map is 880x440
  // and fits to WIDTH, so it used to draw a 187px strip in the middle of a
  // white screen and "full screen" changed only the surroundings. That is fixed
  // by the BOX (`h-full` below plus `preserveAspectRatio="xMidYMid slice"`),
  // which is a layout answer to a layout problem - the camera was never the
  // right place to solve it, and moving the camera is what somebody notices.
  //
  // The fit is carried across as the position rather than left as an override,
  // because `zoomBy` and the map's own gestures write `position` and the
  // overrides would be dropped on the first pinch anyway - so this keeps the
  // frame AND makes it editable, which is what full screen is for.
  useEffect(() => {
    if (!full) return
    setPosition((p) => {
      const base = focusPos || fitPos || p
      return { coordinates: base.coordinates, zoom: clampZoom(base.zoom) }
    })
    setFocusPos(null)
    setFitPos(null)
    // `focusPos` / `fitPos` are read once, on the frame full screen opens; they
    // are deliberately not dependencies, or re-fitting mid-view would re-frame
    // a map somebody is already panning.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [full])

  // The full country-name list for the search box, shared with the collab board.
  useEffect(() => {
    if (!selectable) return
    let cancelled = false
    loadMapCountryNames().then((names) => { if (!cancelled) setAllNames(names) })
    return () => { cancelled = true }
  }, [selectable])

  // Zoom the map onto one country (used by the collab cards) via its centroid.
  useEffect(() => {
    if (!focusCountry) { setFocusPos(null); return }
    let cancelled = false
    loadMapCentroids().then((cmap) => {
      const c = cmap.get(focusCountry)
      if (!cancelled && c) setFocusPos({ coordinates: c, zoom: 4 })
    })
    return () => { cancelled = true }
  }, [focusCountry])

  // fitSelected → zoom the read-only map to the countries actually visited
  // (bounding box of their centroids), so a Europe-heavy map shows Europe big
  // instead of a tiny world with empty oceans.
  useEffect(() => {
    if (!fitSelected || selected.length === 0) { setFitPos(null); return }
    let cancelled = false
    loadMapCentroids().then((cmap) => {
      if (cancelled) return
      const pts = selected.map((n) => cmap.get(n)).filter(Boolean)
      if (pts.length === 0) return
      const lngs = pts.map((p) => p[0]), lats = pts.map((p) => p[1])
      const minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
      const minLat = Math.min(...lats), maxLat = Math.max(...lats)
      const lngSpan = Math.max(maxLng - minLng, 8), latSpan = Math.max(maxLat - minLat, 8)
      const zoom = Math.min(4, Math.max(1, Math.min(300 / (lngSpan * 1.6), 150 / (latSpan * 1.9))))
      setFitPos({ coordinates: [(minLng + maxLng) / 2, (minLat + maxLat) / 2], zoom })
    })
    return () => { cancelled = true }
  }, [fitSelected, selected])

  const view = focusPos || fitPos || position

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return allNames.filter((n) => n.toLowerCase().includes(q)).slice(0, 6)
  }, [query, allNames])

  // ZOOMING HAS TO TAKE THE VIEW OVER, not just edit the one it is not using.
  //
  // `view` is `focusPos || fitPos || position`, and a profile map is opened
  // framed on the countries somebody has visited - so `fitPos` is set and
  // `position` is what nothing is looking at. The + button edited `position`,
  // the map went on drawing `fitPos`, and the control did nothing at all. Both
  // overrides are dropped the moment you touch the zoom, taking the frame you
  // can currently see as the starting point so nothing jumps.
  const zoomBy = (factor) => {
    const base = focusPos || fitPos || position
    setFocusPos(null)
    setFitPos(null)
    setPosition({ ...base, zoom: clampZoom(base.zoom * factor) })
  }
  const resetView = () => {
    setFocusPos(null)
    setFitPos(null)
    setPosition({ coordinates: [12, 8], zoom: 1 })
  }

  const countryPanel = owner && country ? (
    <CountryPanel
      className="max-w-sm"
      country={country}
      variant="personal"
      owner={owner}
      ownerState={
        sameCountry(owner.country, country)
          ? 'lives'
          : selectedSet.has(country) || (owner.countries_visited || []).some((n) => sameCountry(n, country))
            ? 'visited'
            : 'none'
      }
      onClose={() => setCountry(null)}
    />
  ) : null

  // THE MAP BOX. Rendered in place normally, and THROUGH A PORTAL when it is
  // filling the screen.
  //
  // A portal and not just `position: fixed`, because this map sits deep inside
  // a profile whose sections are wrapped in `Reveal` - and `Reveal` animates a
  // transform, which makes every one of those wrappers a containing block. A
  // fixed overlay inside one is positioned and STACKED against that wrapper
  // rather than the viewport, so the app header and the bottom tab bar drew on
  // top of a "full screen" map. The community map learned this already; this is
  // the same lesson.
  //
  // Not the Fullscreen API: on a phone that path also wants an orientation
  // lock, which is the transition Ethan reports as laggy, and iOS Safari
  // refuses it on an arbitrary element anyway. A portalled fixed layer is
  // instant everywhere and has nothing to animate.
  const mapBox = (
    // Full screen means the BOX fills the screen, not just the page behind it.
    // The map fits to width (880x440), so on a 375px phone it draws 187px tall
    // wherever it is - a "full screen" that left a 187px strip floating in the
    // middle of a white page was a button that changed the surroundings and not
    // the map. Full height plus the opening zoom above is what actually makes
    // it bigger, and panning then has somewhere to go.
    // `data-zoomable` OPTS THIS OUT OF THE PLATFORM-WIDE PINCH GUARD.
    // The map does its own zooming (d3-zoom, through ZoomableGroup) and draws
    // MORE map rather than bigger pixels, which is the whole reason browser
    // zoom is switched off everywhere else. See lib/pinchGuard.
    <div
      data-zoomable
      className={full
        ? 'relative h-full w-full overflow-hidden rounded-card bg-cloud/60'
        : 'relative w-full overflow-hidden rounded-card bg-cloud/60'}
    >
        {/* Country name tooltip on hover */}
        {tooltip && (
          <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full bg-ink px-3 py-1 text-xs font-medium text-white">
            {tooltip}
          </div>
        )}

        {/* On-screen zoom controls: work everywhere, no pinch needed.
            NOT `selectable` any more. These were drawn only on the editable map
            in Edit profile, so the read-only creator map on a profile - the one
            most people actually look at - had no way to zoom in on a continent
            at all. Ethan: "creator maps on profiles need zoom buttons." */}
        <div className="absolute right-2 top-2 z-10 flex flex-col gap-1">
          <button type="button" onClick={() => zoomBy(1.6)} aria-label="Zoom in"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-lg font-semibold text-ink shadow-card transition-transform hover:scale-105 active:scale-95">+</button>
          <button type="button" onClick={() => zoomBy(1 / 1.6)} aria-label="Zoom out"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-lg font-semibold text-ink shadow-card transition-transform hover:scale-105 active:scale-95">−</button>
          <button type="button" onClick={resetView} aria-label="Reset map view"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-smoke shadow-card transition-transform hover:scale-105 active:scale-95">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9 9 0 0 0-6.7 3M3 4v4h4"/></svg>
        </button>
          {/* OPEN IT BIG. The profile map had zoom buttons and no way to fill
              the screen, which on a 180px-tall box means zooming into a
              letterbox. Ethan: "creator maps on profiles need zoom and full
              screen buttons." */}
          <button
            type="button"
            onClick={() => setFull((v) => !v)}
            aria-label={full ? 'Close full screen map' : 'Open the map full screen'}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-smoke shadow-card transition-transform hover:scale-105 active:scale-95"
          >
            {full ? (
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3m8 0h3a2 2 0 0 0 2-2v-3" /></svg>
            )}
          </button>
        </div>

        {/* width/height set the SVG viewBox; the projection is scaled and
            re-centred so the world fills the frame without the huge empty
            oceans the defaults leave above and below. */}
        <ComposableMap
          width={880}
          height={440}
          projectionConfig={{ scale: 160, center: [12, 8] }}
          style={{ width: '100%', height: full ? '100%' : 'auto', display: 'block' }}
          // FILL THE SCREEN, DO NOT LETTERBOX IT. The default `meet` fits the
          // whole 880x440 viewBox inside the box, so on a portrait phone full
          // screen drew the same 187px strip it drew in the card and only the
          // white around it changed. `slice` fills the box and crops the
          // overflow instead, which is what makes the map actually bigger - and
          // it is why the camera no longer has to be moved to fake it.
          preserveAspectRatio={full ? 'xMidYMid slice' : 'xMidYMid meet'}
          aria-label="World map of countries visited"
        >
          <ZoomableGroup
            zoom={view.zoom}
            center={view.coordinates}
            minZoom={1}
            maxZoom={8}
            // Keep the map inside the frame: a small margin allows a slight
            // nudge, but you can never drag the map completely out of view,
            // even when fully zoomed out. d3-zoom clamps panning to this extent.
            translateExtent={[[-60, -50], [940, 490]]}
            onMoveEnd={(pos) => { if (!focusCountry) setPosition(pos) }}
          >
            {/* THE SAME ARRIVAL AS EVERY OTHER MAP. This one had none at all:
                the countries simply existed the moment the atlas resolved,
                which on a page where every other element rises into view read
                as the map having been there all along and everything else being
                late. Nothing draws until the atlas is in, then the land pulls
                back into place. See `.map-arrive` in index.css. */}
            {features && (
            <g className="map-arrive">
            <Geographies geography={features || EMPTY_GEO}>
              {({ geographies }) =>
                geographies
                  // Antarctica is huge, never visited, and wrecks the framing.
                  .filter((geo) => geo.properties.name !== 'Antarctica')
                  .map((geo) => {
                  const name = geo.properties.name
                  const isSelected = selectedSet.has(name)
                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      onClick={
                        selectable && onToggle
                          ? () => onToggle(name)
                          : owner
                            ? () => setCountry(name)
                            : undefined
                      }
                      onMouseEnter={() => setTooltip(name)}
                      onMouseLeave={() => setTooltip('')}
                      tabIndex={selectable ? 0 : -1}
                      onKeyDown={
                        selectable && onToggle
                          ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(name) } }
                          : undefined
                      }
                      style={{
                        default: {
                          fill: isSelected ? BRAND : UNSELECTED_FILL,
                          stroke: SEPARATOR,
                          strokeWidth: 0.4,
                          outline: 'none',
                          transition: 'fill 0.2s ease',
                        },
                        hover: {
                          fill: isSelected ? BRAND : selectable || owner ? BRAND_LIGHT : UNSELECTED_FILL,
                          stroke: SEPARATOR,
                          strokeWidth: 0.4,
                          outline: 'none',
                          cursor: selectable || owner ? 'pointer' : 'default',
                        },
                        pressed: { fill: BRAND, outline: 'none' },
                      }}
                    />
                  )
                })
              }
            </Geographies>

            {/* ---- WHERE THEY ARE RIGHT NOW ----
                Ethan: "it should show where they are right now, maybe with a
                pulsing profile icon on the map, and it should show if they're
                in a country currently travelling or just in their home country
                if that's where they currently are."

                A FACE, NOT A PIN. The map already uses colour to mean "has been
                here"; another orange shape on it would be read as another
                visited country. A photograph is unambiguously a person, and on
                a profile there is only ever one of them.

                THE RING IS THE STATE AND THE ONLY STATE. Travelling gets the
                brand ring and the pulse; at home it is a quiet grey ring and
                nothing moves. A pulse that runs whether or not anything is
                happening is decoration, and it would make every profile on the
                platform look like somebody is on a trip.

                COUNTER-SCALED, so it stays the same size on screen at every
                zoom. Everything inside a ZoomableGroup is scaled by the zoom,
                and a face that grows to fill Europe is not a marker.
                `pointer-events: none` so it never blocks the country underneath
                it, which is the thing that opens the panel. */}
            {here && Number.isFinite(here.lng) && Number.isFinite(here.lat) && (
              <Marker coordinates={[here.lng, here.lat]} style={{ default: { pointerEvents: 'none' } }}>
                <g transform={`scale(${1 / view.zoom})`} style={{ pointerEvents: 'none' }}>
                  {here.travelling && (
                    <circle r={13} className="profile-here-pulse" fill={BRAND} opacity={0.35} />
                  )}
                  <circle r={11} fill="#fff" stroke={here.travelling ? BRAND : '#c9c9cf'} strokeWidth={2} />
                  <clipPath id="profile-here-clip">
                    <circle r={9} />
                  </clipPath>
                  {here.photo ? (
                    <image
                      href={here.photo}
                      x={-9} y={-9} width={18} height={18}
                      clipPath="url(#profile-here-clip)"
                      preserveAspectRatio="xMidYMid slice"
                    />
                  ) : (
                    <text textAnchor="middle" dy="3.5" fontSize="9" fontWeight="700" fill={BRAND}>
                      {(here.name || '?').trim().charAt(0).toUpperCase()}
                    </text>
                  )}
                </g>
              </Marker>
            )}
            </g>
            )}
          </ZoomableGroup>
        </ComposableMap>

        {selectable && (
          <p className="absolute bottom-2 left-3 rounded-full bg-white/85 px-3 py-1 text-[11px] text-smoke backdrop-blur-sm">
            Search above, or tap the map · use + / − to zoom
          </p>
        )}

        {/* THE "TAP A COUNTRY" HINT IS GONE. A coloured country on a map you
            can tap is already an affordance; a label explaining it sat over the
            map on every profile in the product, permanently, to say something
            most people find out by tapping once. Ethan asked for it off. */}

        {/* Desktop: over the map. Phones get it UNDER the map instead - see
            below - because the map box is only about 180px tall at 375px and an
            overlay there covers the thing it is describing. */}
        {countryPanel && (
          <div className="pointer-events-none absolute inset-3 z-20 hidden flex-col items-start justify-end sm:flex">
            {countryPanel}
          </div>
        )}
    </div>
  )

  return (
    <div>
      {/* ---- Type-to-add search (the reliable path on phones) ---- */}
      {selectable && (
        <div className="mb-3">
          <div className="relative">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search a country to add it…"
              className="input"
              aria-label="Search for a country to add"
              autoComplete="off"
            />
            {matches.length > 0 && (
              <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-card border border-gray-100 bg-white shadow-lift">
                {matches.map((name) => {
                  const isSel = selectedSet.has(name)
                  return (
                    <li key={name}>
                      <button
                        type="button"
                        onClick={() => { onToggle?.(name); setQuery('') }}
                        className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-cloud"
                      >
                        <span>{name}</span>
                        <span className={isSel ? 'text-xs font-medium text-brand' : 'text-xs text-smoke'}>
                          {isSel ? 'Added ✓ tap to remove' : 'Add +'}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {/* THE CHIP LIST USED TO BE HERE TOO, and that is why the countries
              appeared twice on Edit profile - once above the map and once
              below. Ethan: "it's now showing up every country listed above the
              map and below the map, remove the ones that appear above."
              He is right about which one to keep: above the map they sat
              between the search box and the map itself, pushing the map down
              the screen by however many countries you had visited, so somebody
              with forty had to scroll past their own list to reach the thing
              they were selecting from. Below, the map is the control and the
              list is the receipt.
              `chips` lets a caller ask for them back if a surface ever wants
              them here; nothing does today. */}
          {chips && selected.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {[...selected].sort((a, b) => a.localeCompare(b)).map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => onToggle?.(name)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-brand-tint px-3 py-1 text-xs font-medium text-brand transition-colors hover:bg-brand hover:text-white"
                  aria-label={`Remove ${name}`}
                >
                  {name}
                  <span aria-hidden className="text-sm leading-none">×</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {full ? (
        createPortal(
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-white p-2">
            {mapBox}
          </div>,
          document.body,
        )
      ) : mapBox}

      {countryPanel && <div className="mt-3 sm:hidden">{countryPanel}</div>}
    </div>
  )
}

// memo: the map only re-renders when the selection actually changes.
export default memo(WorldMap)
