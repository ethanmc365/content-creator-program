import { useEffect, useRef } from 'react'
import { geoArea, geoBounds, geoCentroid, geoMercator, geoPath } from 'd3-geo'
import { loadMapFeatures, atlasReady } from '../lib/mapCountries'
import { useSlowNetwork } from '../lib/netQuality'
import { COUNTRIES } from '../lib/countries'
import { cx } from '../lib/utils'

// THE MARKET'S OWN COUNTRY, ON THE CARD OF ITS CHALLENGE (1 Oct 2026).
//
// Ethan: "I think you could maybe not have the Portugal flag but have the actual zoomed-in map of Europe with Portugal
// highlighted in the background. It's kind of animated the way we have the worldwide thing rotating in the background
// ... Properly build that in for all of the markets, showing the appropriate country, obviously. For the Nordics you
// can show all of them ... a generic card with data for future markets."
//
// NOTHING IS STORED PER MARKET. A market already says which countries it covers (`country_codes`); this finds those
// countries in the atlas the rest of the app draws, centres the view on them, and zooms to the width they cover (a
// small country is shown among its neighbours, a spread of countries like the Nordics fills the frame). So a market
// created next month has its map the moment it exists, and there is no table of "map settings" to fall out of date.
//
// STILL, AND THE WHOLE CARD (1 Oct 2026). Ethan: "I like the worldwide one being dynamic, but this simple one can
// just be static: just show that Portugal is highlighted and show the map of Europe in the background. It doesn't need
// to be moving, dynamic, or show aeroplanes or dots." And it was "squared off, cut off behind the leaderboard card":
// it was a square canvas in one corner, and a square's edges show on a card that is not square. It is now a flat
// map drawn ONCE (again only when the card changes size) across the whole card, so its only edges are the card's own.
// That also ends the animation loop each market card used to run, which was half of the platform's lag.

// Names the atlas spells differently from our own country list.
const ATLAS_NAME = {
  'Czech Republic': 'Czechia',
  'United States': 'United States of America',
  'Bosnia and Herzegovina': 'Bosnia and Herz.',
  'North Macedonia': 'North Macedonia',
  'Dominican Republic': 'Dominican Rep.',
}

let thinned = null
function thin(fc) {
  if (thinned) return thinned
  const ring = (r) => (r.length > 12 ? r.filter((_, i) => i % 2 === 0 || i === r.length - 1) : r)
  // See SpinningEarth: a ring wound the other way is the rest of the planet.
  const rewind = (f) => (geoArea(f) > 2 * Math.PI ? {
    ...f,
    geometry: f.geometry.type === 'Polygon'
      ? { ...f.geometry, coordinates: f.geometry.coordinates.map((r) => [...r].reverse()) }
      : { ...f.geometry, coordinates: f.geometry.coordinates.map((p) => p.map((r) => [...r].reverse())) },
  } : f)
  thinned = {
    type: 'FeatureCollection',
    features: (fc?.features || []).map((f) => {
      const g = f.geometry
      if (!g) return f
      if (g.type === 'Polygon') return rewind({ ...f, geometry: { ...g, coordinates: g.coordinates.map(ring) } })
      if (g.type === 'MultiPolygon') return rewind({ ...f, geometry: { ...g, coordinates: g.coordinates.map((p) => p.map(ring)) } })
      return f
    }).filter((f) => !f.geometry || geoArea(f) <= 2 * Math.PI),
  }
  return thinned
}

/** The atlas names for a market's ISO country codes. */
export function atlasNamesFor(codes) {
  const want = new Set((codes || []).map((c) => String(c).toUpperCase()))
  return COUNTRIES.filter((c) => want.has(c.iso2)).map((c) => ATLAS_NAME[c.name] || c.name)
}

/** Where to look and how wide: the centre of the highlighted countries and the half-angle (degrees) the frame covers. */
function frameFor(features) {
  if (!features.length) return { centre: [10, 50], half: 38 }
  // Only the biggest piece of each country sets the frame: Portugal has the Azores, Spain the Canaries, Norway
  // Svalbard, and framing those would zoom the map out across the Atlantic.
  const main = features.map((f) => {
    const g = f.geometry
    if (!g || g.type !== 'MultiPolygon') return f
    let best = g.coordinates[0]
    let bestArea = 0
    for (const poly of g.coordinates) {
      const a = geoArea({ type: 'Polygon', coordinates: poly })
      if (a > bestArea) { bestArea = a; best = poly }
    }
    return { ...f, geometry: { type: 'Polygon', coordinates: best } }
  })
  const fc = { type: 'FeatureCollection', features: main }
  const [lng, lat] = geoCentroid(fc)
  const [[w, s], [e, n]] = geoBounds(fc)
  let lonSpan = e - w
  if (lonSpan < 0) lonSpan += 360
  const span = Math.max(lonSpan * Math.cos((lat * Math.PI) / 180), n - s)
  // A lone small country is shown among its neighbours; a spread of them fills the frame.
  const half = Math.min(62, Math.max(19, span * 1.05 + 11))
  return { centre: [lng, lat], half }
}

export default function MarketMap({ codes, className = '' }) {
  const canvasRef = useRef(null)
  const key = (codes || []).join(',')
  // Decoration waits for a good connection unless the atlas is already here (see SpinningEarth).
  const skip = useSlowNetwork() && !atlasReady()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || skip) return undefined
    const ctx = canvas.getContext('2d')
    if (!ctx) return undefined
    let alive = true
    let land = null
    let lit = null
    let frame = null
    let w = 0
    let h = 0

    const draw = () => {
      const r = canvas.getBoundingClientRect()
      const nw = Math.round(r.width)
      const nh = Math.round(r.height)
      if (!land || !nw || !nh) return
      if (nw === w && nh === h) return
      w = nw; h = nh
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      // Where the country sits: right of the words on a phone, between the words and the leaderboard on a desktop.
      const anchorX = w >= 900 ? 0.6 : 0.76
      const [lng, lat] = frame.centre
      // The frame's height covers about twice `half` degrees of latitude at the country's latitude.
      const k = (h * Math.cos((lat * Math.PI) / 180)) / ((frame.half * 1.2 * Math.PI) / 180)
      const projection = geoMercator().center([lng, lat]).scale(k).translate([w * anchorX, h * 0.5])
      const path = geoPath(projection, ctx)
      const view = [[-40, -40], [w + 40, h + 40]]
      ctx.beginPath()
      for (const f of land.features) {
        if (lit.includes(f)) continue
        const [[x0, y0], [x1, y1]] = path.bounds(f)
        if (x1 < view[0][0] || x0 > view[1][0] || y1 < view[0][1] || y0 > view[1][1]) continue
        path(f)
      }
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.32)'; ctx.lineWidth = 0.7; ctx.stroke()
      if (lit.length) {
        ctx.beginPath()
        for (const f of lit) path(f)
        ctx.fillStyle = 'rgba(255,255,255,0.88)'; ctx.fill()
        ctx.strokeStyle = 'rgba(255,255,255,1)'; ctx.lineWidth = 1.4; ctx.stroke()
      }
    }

    loadMapFeatures().then((fc) => {
      if (!alive) return
      land = thin(fc)
      const names = new Set(atlasNamesFor(codes))
      lit = land.features.filter((f) => names.has(f.properties?.name))
      frame = frameFor(lit)
      draw()
    })

    let t = 0
    const ro = new ResizeObserver(() => { clearTimeout(t); t = setTimeout(draw, 120) })
    ro.observe(canvas)
    return () => { alive = false; clearTimeout(t); ro.disconnect() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, skip])

  return <canvas ref={canvasRef} aria-hidden className={cx('pointer-events-none', className)} />
}
