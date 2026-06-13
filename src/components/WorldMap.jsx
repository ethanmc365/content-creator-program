import { memo, useState } from 'react'
import { ComposableMap, Geographies, Geography, ZoomableGroup } from 'react-simple-maps'

// Interactive world map for "countries visited".
//  * Free & open source: react-simple-maps + the world-atlas TopoJSON from
//    the jsDelivr CDN. No API keys, no paid services.
//  * selectable=true  → tapping a country toggles it (used while editing).
//  * selectable=false → read-only display (used on profiles).
// Countries are stored by their map name (e.g. "United Kingdom") in
// profiles.countries_visited so display and filtering stay simple.
const GEO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json'

const BRAND = '#d94407'
const BRAND_LIGHT = '#f5853f'
const UNSELECTED = '#ECECEE'

function WorldMap({ selected = [], onToggle, selectable = false }) {
  const [tooltip, setTooltip] = useState('')
  const selectedSet = new Set(selected)

  return (
    <div className="relative w-full overflow-hidden rounded-card bg-cloud/60">
      {/* Country name tooltip on hover */}
      {tooltip && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full bg-ink px-3 py-1 text-xs font-medium text-white">
          {tooltip}
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
        <ZoomableGroup minZoom={1} maxZoom={5}>
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
        <p className="absolute bottom-2 right-3 rounded-full bg-white/80 px-3 py-1 text-[11px] text-smoke">
          Tap countries to toggle · pinch/scroll to zoom
        </p>
      )}
    </div>
  )
}

// memo: the map only re-renders when the selection actually changes.
export default memo(WorldMap)
