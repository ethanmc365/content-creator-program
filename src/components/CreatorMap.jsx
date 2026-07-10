import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { ComposableMap, Geographies, Geography, ZoomableGroup, Marker } from 'react-simple-maps'
import { geoEqualEarth, geoDistance, geoContains } from 'd3-geo'
import { feature } from 'topojson-client'
import { Link } from 'react-router-dom'
import { GEO_URL } from '../lib/mapCountries'
import { geocodeCity } from '../lib/geocode'

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

// One map pin. Counter-scaled against the zoom so it never balloons, but grows
// gently as you zoom in (so photos stay easy to see, never shrink away).
function Pin({ group, zoom, active, onSelect }) {
  const lead = group.creators[0]
  const count = group.creators.length
  const s = Math.pow(1 / Math.max(zoom, 1), 0.82) // net on-screen size ~ zoom^0.18
  const r = 18
  const cy = -32
  return (
    <Marker coordinates={group.coords} onClick={() => onSelect(group.key)}>
      <g transform={`scale(${s})`} style={{ cursor: 'pointer' }}>
        {/* white teardrop body with a drop shadow */}
        <path
          d={`M0 0 L-9 ${cy + r - 1} A ${r + 4} ${r + 4} 0 1 1 9 ${cy + r - 1} Z`}
          fill="#ffffff"
          style={{ filter: 'drop-shadow(0 2px 3px rgba(20,20,30,0.30))' }}
        />
        {/* avatar photo (clipped to a perfect circle via objectBoundingBox) or initials */}
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
              fontSize={r * 0.85} fontWeight="600" fill={BRAND}>{initials(lead.name)}</text>
          </>
        )}
        <circle cx={0} cy={cy} r={r} fill="none" stroke={active ? BRAND : '#ffffff'} strokeWidth={active ? 3.5 : 2.5} />
        {count > 1 && (
          <g transform={`translate(${r - 4}, ${cy - r + 4})`}>
            <circle r={11} fill={BRAND} stroke="#ffffff" strokeWidth={2} />
            <text x={0} y={1} textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight="700" fill="#ffffff">
              {count}
            </text>
          </g>
        )}
      </g>
    </Marker>
  )
}

// A small airplane, pointed along the travel direction, for over-water hops.
function Plane({ x, y, angle, zoom }) {
  const s = 1 / Math.max(zoom, 1)
  return (
    <g transform={`translate(${x} ${y}) scale(${s}) rotate(${angle})`} style={{ pointerEvents: 'none' }}>
      <circle r={11} fill="#ffffff" style={{ filter: 'drop-shadow(0 1px 2px rgba(20,20,30,0.25))' }} />
      {/* nose points to +x (0deg), matching the segment direction */}
      <path
        transform="rotate(90)"
        d="M0 -8 L2.4 -1 L7 5 L7 6.6 L1.6 4.2 L1.4 7.2 L3.4 8.6 L3.4 9.6 L0 8.6 L-3.4 9.6 L-3.4 8.6 L-1.4 7.2 L-1.6 4.2 L-7 6.6 L-7 5 L-2.4 -1 Z"
        fill={BRAND}
      />
    </g>
  )
}

function CreatorMap({ creators = [] }) {
  const [extraCoords, setExtraCoords] = useState({}) // legacy rows: id -> {lat,lng}
  const [homeNames, setHomeNames] = useState(() => new Set()) // countries to tint
  const [tooltip, setTooltip] = useState('')
  const [selected, setSelected] = useState(null)
  const [position, setPosition] = useState({ coordinates: [10, 30], zoom: 1.3 })
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
      const len = Math.hypot(dx, dy) || 1
      const bulge = Math.min(len * 0.22, 70)
      const cx = mx + (-dy / len) * bulge, cyc = my + (dx / len) * bulge
      segs.push({
        d: `M${ax} ${ay} Q ${cx} ${cyc} ${bx} ${by}`,
        midx: 0.25 * ax + 0.5 * cx + 0.25 * bx,
        midy: 0.25 * ay + 0.5 * cyc + 0.25 * by,
        angle: (Math.atan2(dy, dx) * 180) / Math.PI,
        overseas: geoDistance(a, b) * 6371 > 500,
      })
    }
    return segs
  }, [towns])

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
          if (located.some((c) => geoContains(f, [c._lng, c._lat]))) names.add(f.properties.name)
        }
        setHomeNames(names)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [located])

  // The view that fits everyone with a location on screen (all creators visible).
  const fitView = useMemo(() => {
    if (located.length === 0) return { coordinates: [10, 30], zoom: 1.3 }
    const lngs = located.map((c) => c._lng), lats = located.map((c) => c._lat)
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
    const minLat = Math.min(...lats), maxLat = Math.max(...lats)
    const lngSpan = Math.max(maxLng - minLng, 0.01), latSpan = Math.max(maxLat - minLat, 0.01)
    const zoom = Math.min(6, Math.max(1, Math.min(360 / (lngSpan * 1.5), 180 / (latSpan * 1.8))))
    return { coordinates: [(minLng + maxLng) / 2, (minLat + maxLat) / 2], zoom }
  }, [located])

  // Fit to everyone on first load.
  useEffect(() => {
    if (didInitCenter.current || located.length === 0) return
    didInitCenter.current = true
    setPosition(fitView)
  }, [located, fitView])

  const selectedTown = selected ? towns.find((t) => t.key === selected) : null
  const z = position.zoom

  const zoomBy = (factor) =>
    setPosition((p) => ({ ...p, zoom: Math.min(40, Math.max(1, p.zoom * factor)) }))
  const resetView = () => setPosition(fitView)

  return (
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
          onMoveEnd={(pos) => setPosition(pos)}
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
                        default: { fill: isHome ? HOME : LAND, stroke: '#ffffff', strokeWidth: 0.4, outline: 'none' },
                        hover: { fill: isHome ? HOME : LAND, stroke: '#ffffff', strokeWidth: 0.4, outline: 'none' },
                        pressed: { fill: isHome ? HOME : LAND, outline: 'none' },
                      }}
                    />
                  )
                })
            }
          </Geographies>

          {/* Connection lines (behind the pins) */}
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
            {segments.filter((s) => s.overseas).map((seg, i) => (
              <Plane key={i} x={seg.midx} y={seg.midy} angle={seg.angle} zoom={z} />
            ))}
          </g>

          {towns.map((town) => (
            <g
              key={town.key}
              onMouseEnter={() => setTooltip(
                town.creators.length === 1
                  ? `${town.creators[0].name} · ${(town.creators[0].city || '').trim()}`.trim()
                  : `${(town.creators[0].city || 'This town').trim()} · ${town.creators.length} creators`
              )}
              onMouseLeave={() => setTooltip('')}
            >
              <Pin group={town} zoom={z} active={selected === town.key} onSelect={setSelected} />
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
