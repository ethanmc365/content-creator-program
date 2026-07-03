import { memo, useEffect, useMemo, useState } from 'react'
import { ComposableMap, Geographies, Geography, ZoomableGroup } from 'react-simple-maps'
import { GEO_URL, loadMapCountryNames } from '../lib/mapCountries'

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

function WorldMap({ selected = [], onToggle, selectable = false }) {
  const [tooltip, setTooltip] = useState('')
  const [position, setPosition] = useState({ coordinates: [12, 8], zoom: 1 })
  const [query, setQuery] = useState('')
  const [allNames, setAllNames] = useState([])
  const selectedSet = new Set(selected)

  // The full country-name list for the search box, shared with the collab board.
  useEffect(() => {
    if (!selectable) return
    let cancelled = false
    loadMapCountryNames().then((names) => { if (!cancelled) setAllNames(names) })
    return () => { cancelled = true }
  }, [selectable])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return allNames.filter((n) => n.toLowerCase().includes(q)).slice(0, 6)
  }, [query, allNames])

  const zoomBy = (factor) =>
    setPosition((p) => ({ ...p, zoom: Math.min(8, Math.max(1, p.zoom * factor)) }))
  const resetView = () => setPosition({ coordinates: [12, 8], zoom: 1 })

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

          {/* Selected countries as removable chips */}
          {selected.length > 0 && (
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

      <div className="relative w-full overflow-hidden rounded-card bg-cloud/60">
        {/* Country name tooltip on hover */}
        {tooltip && (
          <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full bg-ink px-3 py-1 text-xs font-medium text-white">
            {tooltip}
          </div>
        )}

        {/* On-screen zoom controls: work everywhere, no pinch needed. */}
        {selectable && (
          <div className="absolute right-2 top-2 z-10 flex flex-col gap-1">
            <button type="button" onClick={() => zoomBy(1.6)} aria-label="Zoom in"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-lg font-semibold text-ink shadow-card transition-transform hover:scale-105 active:scale-95">+</button>
            <button type="button" onClick={() => zoomBy(1 / 1.6)} aria-label="Zoom out"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-lg font-semibold text-ink shadow-card transition-transform hover:scale-105 active:scale-95">−</button>
            <button type="button" onClick={resetView} aria-label="Reset map view"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-smoke shadow-card transition-transform hover:scale-105 active:scale-95">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9 9 0 0 0-6.7 3M3 4v4h4"/></svg>
            </button>
          </div>
        )}

        {/* width/height set the SVG viewBox; the projection is scaled and
            re-centred so the world fills the frame without the huge empty
            oceans the defaults leave above and below. */}
        <ComposableMap
          width={880}
          height={440}
          projectionConfig={{ scale: 160, center: [12, 8] }}
          style={{ width: '100%', height: 'auto', display: 'block' }}
          aria-label="World map of countries visited"
        >
          <ZoomableGroup
            zoom={position.zoom}
            center={position.coordinates}
            minZoom={1}
            maxZoom={8}
            onMoveEnd={(pos) => setPosition(pos)}
          >
            <Geographies geography={GEO_URL}>
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
                      onClick={selectable && onToggle ? () => onToggle(name) : undefined}
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
                          fill: isSelected ? BRAND : UNSELECTED,
                          stroke: '#ffffff',
                          strokeWidth: 0.4,
                          outline: 'none',
                          transition: 'fill 0.2s ease',
                        },
                        hover: {
                          fill: isSelected ? BRAND : selectable ? BRAND_LIGHT : UNSELECTED,
                          stroke: '#ffffff',
                          strokeWidth: 0.4,
                          outline: 'none',
                          cursor: selectable ? 'pointer' : 'default',
                        },
                        pressed: { fill: BRAND, outline: 'none' },
                      }}
                    />
                  )
                })
              }
            </Geographies>
          </ZoomableGroup>
        </ComposableMap>

        {selectable && (
          <p className="absolute bottom-2 left-3 rounded-full bg-white/80 px-3 py-1 text-[11px] text-smoke">
            Search above, or tap the map · use + / − to zoom
          </p>
        )}
      </div>
    </div>
  )
}

// memo: the map only re-renders when the selection actually changes.
export default memo(WorldMap)
