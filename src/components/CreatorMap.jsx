import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { ComposableMap, Geographies, Geography, ZoomableGroup, Marker } from 'react-simple-maps'
import { Link } from 'react-router-dom'
import { GEO_URL } from '../lib/mapCountries'
import { geocodeCity } from '../lib/geocode'

// The creator map directory: every creator pinned on a world map at their home
// town, with their photo + name. Built on the same react-simple-maps + world
// atlas stack as WorldMap (no API keys, no tile servers, CSP-clean), so it
// zooms deeply and renders offline-friendly vector geography.
//
// Creators in the same town share a pin (their coords are identical); the pin
// shows a stacked avatar + a "+N" badge, and clicking it opens a card listing
// everyone there. Pins are counter-scaled against the zoom so they stay a
// constant, tappable size however far you zoom in.
const BRAND = '#d94407'
const LAND = '#ECECEE'

// Group by rounded coordinates so a town = one pin. Creators who typed the same
// town geocode to the same point, so they naturally cluster together.
function townKey(lat, lng) {
  return `${lat.toFixed(3)},${lng.toFixed(3)}`
}

function initials(name = '') {
  return name.split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?'
}

// One map pin. `scale` counter-scales the artwork so it stays constant size as
// the map zooms. The tip of the pin sits exactly on the coordinate (0,0).
function Pin({ group, scale, active, onSelect }) {
  const lead = group.creators[0]
  const count = group.creators.length
  const s = 1 / scale
  const r = 17 // avatar radius in screen px
  const cy = -30 // avatar centre sits above the tip
  return (
    <Marker coordinates={group.coords} onClick={() => onSelect(group.key)}>
      <g transform={`scale(${s})`} style={{ cursor: 'pointer' }} className="creator-pin">
        {/* teardrop tail from the avatar down to the exact point */}
        <path
          d={`M0 0 L-8 ${cy + r - 2} A ${r + 3} ${r + 3} 0 1 1 8 ${cy + r - 2} Z`}
          fill="#ffffff"
          stroke={active ? BRAND : '#ffffff'}
          strokeWidth={active ? 2 : 0}
          style={{ filter: 'drop-shadow(0 2px 3px rgba(20,20,30,0.28))' }}
        />
        {/* avatar photo or initials, clipped to a circle */}
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
              fontSize={r * 0.9} fontWeight="600" fill={BRAND}>{initials(lead.name)}</text>
          </>
        )}
        <circle cx={0} cy={cy} r={r} fill="none" stroke={active ? BRAND : '#ffffff'} strokeWidth={active ? 3 : 2.5} />
        {/* "+N" badge when several creators share the town */}
        {count > 1 && (
          <g transform={`translate(${r - 3}, ${cy - r + 3})`}>
            <circle r={10} fill={BRAND} stroke="#ffffff" strokeWidth={2} />
            <text x={0} y={1} textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight="700" fill="#ffffff">
              {count}
            </text>
          </g>
        )}
      </g>
    </Marker>
  )
}

function CreatorMap({ creators = [] }) {
  // Coords come from the profile (backfilled + written on save). For any legacy
  // profile that has a town but no stored coords, geocode on the fly so nobody
  // is silently missing from the map.
  const [extraCoords, setExtraCoords] = useState({}) // id -> { lat, lng }
  const [tooltip, setTooltip] = useState('')
  const [selected, setSelected] = useState(null)
  const [position, setPosition] = useState({ coordinates: [10, 30], zoom: 1.4 })
  const didInitCenter = useRef(false)

  // Resolve missing coordinates once.
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

  // Cluster into towns.
  const towns = useMemo(() => {
    const map = new Map()
    for (const c of located) {
      const key = townKey(c._lat, c._lng)
      if (!map.has(key)) map.set(key, { key, coords: [c._lng, c._lat], creators: [] })
      map.get(key).creators.push(c)
    }
    return [...map.values()]
  }, [located])

  // Fit the initial view to the bounding box of everyone with a location, so
  // every creator is on screen on load (they can then zoom in as far as they
  // like). Zoom is approximated from the lng/lat span of the group.
  useEffect(() => {
    if (didInitCenter.current || located.length === 0) return
    didInitCenter.current = true
    const lngs = located.map((c) => c._lng)
    const lats = located.map((c) => c._lat)
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
    const minLat = Math.min(...lats), maxLat = Math.max(...lats)
    const lngSpan = Math.max(maxLng - minLng, 0.01)
    const latSpan = Math.max(maxLat - minLat, 0.01)
    // 360°/180° is the whole world at zoom 1; leave padding so pins aren't at the edge.
    const zoom = Math.min(6, Math.max(1, Math.min(360 / (lngSpan * 1.5), 180 / (latSpan * 1.8))))
    setPosition({ coordinates: [(minLng + maxLng) / 2, (minLat + maxLat) / 2], zoom })
  }, [located])

  const selectedTown = selected ? towns.find((t) => t.key === selected) : null

  const zoomBy = (factor) =>
    setPosition((p) => ({ ...p, zoom: Math.min(40, Math.max(1, p.zoom * factor)) }))
  const resetView = () => setPosition({ coordinates: [10, 30], zoom: 1.4 })

  return (
    <div className="relative w-full overflow-hidden rounded-card border border-gray-100 bg-cloud/60">
      {/* Hover tooltip: town name + count */}
      {tooltip && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded-full bg-ink px-3 py-1 text-xs font-medium text-white">
          {tooltip}
        </div>
      )}

      {/* Zoom controls */}
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
        width={880}
        height={480}
        projectionConfig={{ scale: 160, center: [12, 8] }}
        style={{ width: '100%', height: 'auto', display: 'block' }}
        aria-label="Map of where every creator is based"
      >
        <defs>
          <clipPath id="creator-pin-clip">
            <circle cx={0} cy={-30} r={17} />
          </clipPath>
        </defs>
        <ZoomableGroup
          zoom={position.zoom}
          center={position.coordinates}
          minZoom={1}
          maxZoom={40}
          onMoveEnd={(pos) => setPosition(pos)}
        >
          <Geographies geography={GEO_URL}>
            {({ geographies }) =>
              geographies
                .filter((geo) => geo.properties.name !== 'Antarctica')
                .map((geo) => (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    style={{
                      default: { fill: LAND, stroke: '#ffffff', strokeWidth: 0.4, outline: 'none' },
                      hover: { fill: LAND, stroke: '#ffffff', strokeWidth: 0.4, outline: 'none' },
                      pressed: { fill: LAND, outline: 'none' },
                    }}
                  />
                ))
            }
          </Geographies>

          {towns.map((town) => (
            <g
              key={town.key}
              onMouseEnter={() => setTooltip(
                town.creators.length === 1
                  ? `${town.creators[0].name} · ${town.creators[0].city || ''}`.trim()
                  : `${town.creators[0].city || 'This town'} · ${town.creators.length} creators`
              )}
              onMouseLeave={() => setTooltip('')}
            >
              <Pin group={town} scale={position.zoom} active={selected === town.key} onSelect={setSelected} />
            </g>
          ))}
        </ZoomableGroup>
      </ComposableMap>

      {/* Selected-town card: everyone based there */}
      {selectedTown && (
        <div className="absolute bottom-3 left-3 right-3 z-20 mx-auto max-w-sm rounded-card border border-gray-100 bg-white p-4 shadow-lift sm:right-auto">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-ink">{selectedTown.creators[0].city || 'Here'}</p>
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
            {selectedTown.creators.map((c) => (
              <Link key={c.id} to={`/profile/${c.id}`}
                className="flex items-center gap-3 rounded-xl p-1.5 transition-colors hover:bg-cloud">
                {c.photo_url ? (
                  <img src={c.photo_url} alt={c.name} className="h-10 w-10 shrink-0 rounded-full object-cover ring-2 ring-white" />
                ) : (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-tint text-sm font-semibold text-brand ring-2 ring-white">
                    {initials(c.name)}
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-ink">{c.name}</span>
                  {c.countries_visited?.length > 0 && (
                    <span className="block text-xs text-smoke">🌍 {c.countries_visited.length} countries</span>
                  )}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <p className="pointer-events-none absolute bottom-2 left-3 z-10 rounded-full bg-white/80 px-3 py-1 text-[11px] text-smoke">
        Tap a pin to see who's there · use + / − to zoom
      </p>
    </div>
  )
}

export default memo(CreatorMap)
