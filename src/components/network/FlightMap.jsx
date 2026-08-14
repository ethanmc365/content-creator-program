import { memo, useEffect, useMemo, useState } from 'react'
import { ComposableMap, Geographies, Geography, ZoomableGroup } from 'react-simple-maps'
import { geoEqualEarth } from 'd3-geo'
import { loadMapFeatures } from '../../lib/mapCountries'
import { useIsDark } from '../../lib/theme'

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
  return { d: `M${ax} ${ay} Q ${cx} ${cy} ${bx} ${by}`, ax, ay, bx, by, chord }
}

function FlightMap({ routes = [], airports = [] }) {
  const dark = useIsDark()
  const [features, setFeatures] = useState(null)
  const [position, setPosition] = useState({ coordinates: [12, 8], zoom: 1 })

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

  const zoomBy = (f) => setPosition((p) => ({ ...p, zoom: Math.min(8, Math.max(1, p.zoom * f)) }))

  return (
    <div className="relative w-full overflow-hidden rounded-card bg-cloud/60">
      <div className="absolute right-2 top-2 z-10 flex flex-col gap-1">
        <button type="button" onClick={() => zoomBy(1.6)} aria-label="Zoom in"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-lg font-semibold text-ink shadow-card transition-transform hover:scale-105 active:scale-95">+</button>
        <button type="button" onClick={() => zoomBy(1 / 1.6)} aria-label="Zoom out"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-lg font-semibold text-ink shadow-card transition-transform hover:scale-105 active:scale-95">−</button>
      </div>

      <ComposableMap
        width={WIDTH}
        height={HEIGHT}
        projectionConfig={{ scale: 160, center: [12, 8] }}
        style={{ width: '100%', height: 'auto', display: 'block' }}
        aria-label="A map of every flight you have logged"
      >
        <ZoomableGroup
          zoom={position.zoom}
          center={position.coordinates}
          minZoom={1}
          maxZoom={8}
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
          {arcs.map((r, i) => (
            <path
              key={r.key}
              d={r.d}
              fill="none"
              stroke={BRAND}
              strokeWidth={Math.max(0.6, 1.1 / position.zoom)}
              strokeLinecap="round"
              opacity={0.75}
              className="flight-arc"
              style={{
                '--arc-len': Math.round(r.chord * 1.15),
                animationDelay: `${Math.min(i, 20) * 55}ms`,
              }}
            />
          ))}

          {pins.map((a) => (
            <g key={a.iata} className="flight-pin" style={{ transformOrigin: `${a.x}px ${a.y}px` }}>
              <circle
                cx={a.x}
                cy={a.y}
                r={Math.max(1.4, (a.weight > 4 ? 3.4 : a.weight > 1 ? 2.8 : 2.2) / position.zoom)}
                fill={a.weight > 1 ? BRAND : BRAND_LIGHT}
                stroke="#fff"
                strokeWidth={Math.max(0.3, 0.7 / position.zoom)}
              >
                <title>{`${a.iata} · ${a.city} · ${a.weight} ${a.weight === 1 ? 'flight' : 'flights'}`}</title>
              </circle>
            </g>
          ))}
        </ZoomableGroup>
      </ComposableMap>

      {routes.length === 0 && (
        <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-[11px] text-smoke">
          Log a flight and it will appear here.
        </p>
      )}
    </div>
  )
}

export default memo(FlightMap)
