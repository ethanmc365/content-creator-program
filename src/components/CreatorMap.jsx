import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ComposableMap, Geographies, Geography, ZoomableGroup, Marker } from 'react-simple-maps'
import { geoEqualEarth, geoDistance, geoContains } from 'd3-geo'
import { useSearchParams } from 'react-router-dom'
import { loadMapFeatures, loadMapCentroids } from '../lib/mapCountries'
import { geocodeCity } from '../lib/geocode'
import { cx, formatDate } from '../lib/utils'
import { useIsDark } from '../lib/theme'
import { countryKey, sameCountry } from '../lib/countryFacts'
import CountryPanel, { TownPanel } from './CountryPanel'
import DraggablePanel from './DraggablePanel'
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

// A TOWN THAT HOLDS SEVERAL CREATORS: WHAT ITS PIN LOOKS LIKE.
//
// ONE FACE AND A NUMBER. That is the whole design, and it is the design after
// three attempts at something cleverer.
//
// Creators who typed the same town share one coordinate exactly, so no amount
// of zooming separates them: London is one point with eight people on it. Three
// ways of drawing that have now been tried and rejected, and the reasons are
// worth keeping because each one looked good in the abstract:
//
// 1. FAN THEM INTO A RING (the "spiderfy" every mapping library ships). The
//    radius was in PROJECTION units, so at zoom 10 the offset was about three
//    degrees of longitude - three hundred kilometres. Creators appeared in the
//    North Sea. Even done correctly in screen units it needs a leader line per
//    pin, and eight hairlines through eight faces is a cat's cradle.
//
// 2. A HORIZONTAL CAPSULE OF FACES. Grew sideways with the population: four
//    faces made a bar wider than Belgium over southern England, and it capped at
//    four anyway, so a town of thirty said no more than a town of five.
//
// 3. A STACK OF OVERLAPPING FACES. Compact - the width barely moved with the
//    count - but Ethan's verdict was the one that matters: the faces sit on top
//    of each other, so you cannot actually SEE anybody, and a map whose pins are
//    hard to read is a worse map than one that admits it is showing a summary.
//
// So a town is one pin: the lead creator's photo, at exactly the size a solo
// creator's pin is, with the orange count badge in the corner. The badge is a
// promise, not a summary - tapping the pin opens the roster with every creator
// in that city, their town, and a way to message them. The map stays legible at
// any zoom and at any community size, and the place where you actually read
// names is a list, which is what lists are for.

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
// ONE ALIAS TABLE FOR THE WHOLE APP, IN lib/countryFacts.
//
// There used to be a second one right here, and the two had already drifted:
// this one knew "England" meant the United Kingdom, the other knew "Sudan"
// existed, and neither knew both. `sameCountry` is now the single answer to "is
// what this person typed the same place the map is calling this?" - used for
// tinting a home country, for the "lives here" list and for "been there", so
// all three agree by construction.
const countryNameMatches = sameCountry

// WHO REPRESENTS A CITY ON THE MAP.
//
// The pin can show one face and the badge carries the true count, so the choice
// of face matters: it is the only thing about that city a reader sees before
// deciding whether to tap. Ranked, in this order and for these reasons:
//
//   1. A PHOTO. A pin of grey initials standing for five creators with photos
//      makes the community look emptier than it is. This outranks recency on
//      purpose - the point of the pin is a face.
//   2. HOW RECENTLY THEY WERE HERE. `last_seen_at` where the caller has it (the
//      directory does; the public landing map deliberately does not, because
//      presence is not something to hand an anonymous visitor).
//   3. HOW MUCH THEY HAVE FILLED IN - countries travelled, a bio. A profile
//      worth opening is a better advert for the city than an empty one.
//   4. THEIR NAME, so the order is stable between renders and page loads
//      rather than reshuffling every time the roster comes back.
const seenScore = (c) => {
  const t = c.last_seen_at ? new Date(c.last_seen_at).getTime() : 0
  if (!t) return 0
  const days = (Date.now() - t) / 86400000
  if (days < 1) return 5
  if (days < 7) return 4
  if (days < 30) return 3
  if (days < 90) return 2
  return 1
}

function byPinPriority(a, b) {
  const photo = (!!b.photo_url) - (!!a.photo_url)
  if (photo) return photo
  const seen = seenScore(b) - seenScore(a)
  if (seen) return seen
  const filled = ((b.countries_visited?.length || b.countries || 0) + (b.bio ? 2 : 0))
    - ((a.countries_visited?.length || a.countries || 0) + (a.bio ? 2 : 0))
  if (filled) return filled
  return (a.name || '').localeCompare(b.name || '')
}

// One map pin: a round photo sitting in a classic teardrop, with a small pointer
// tip on the exact coordinate. The avatar is CONCENTRIC with the white disc so
// it's dead-centre in the pin. Counter-scaled against the zoom so it stays a
// calm, readable size (a hair of growth when you zoom in, never a balloon).
function Pin({ group, zoom, active, dim, onSelect, landing = false }) {
  const lead = group.creators[0]
  const count = group.creators.length
  // Counter-scale so pins are small at the default zoom (you can see the
  // countries underneath) but grow noticeably as you zoom in to find people:
  // net on-screen size ~ zoom^0.3.
  const s = Math.pow(1 / Math.max(zoom, 1), 0.7)
  const r = 12 // avatar radius (smaller base than before)
  const cy = -26 // avatar centre above the tip
  const disc = r + 3 // white ring around the photo
  const body = `M${-r * 0.62} ${cy + disc * 0.5} L0 0 L${r * 0.62} ${cy + disc * 0.5} Z`
  return (
    <Marker coordinates={group.coords} onClick={() => onSelect(group)}>
      {/* THE LANDING WRAPPER IS ITS OWN ELEMENT, AND IT HAS TO BE.
          A CSS `transform` OVERRIDES an SVG `transform` attribute on the same
          element, so putting the drop animation on the counter-scaled group
          below would silently throw the counter-scale away for the length of
          the animation and every pin would balloon on arrival. This g carries
          only the animation; the one inside it carries only the scale. */}
      {/* `landing` is a plain flag, not a queue position. It used to carry a
          `--pin-i` the stylesheet turned into a per-pin delay; every pin drops
          on the same frame now, so all this decides is whether the arrival
          plays at all. See `.map-pin-land`. */}
      <g className={landing ? 'map-pin-land' : undefined}>
      <g
        transform={`scale(${s})`}
        style={{ cursor: 'pointer', opacity: dim ? 0.25 : 1, transition: 'opacity 0.2s' }}
      >
        {/* THE SHADOW IS PAINTED, NOT FILTERED.
            THE BUG THIS FIXES: this was `filter: drop-shadow(...)` on every
            pin, which is a separate offscreen render pass per pin per frame.
            With forty-five pins on a map that is survivable inside a 700px
            card and it is not survivable full screen, where the same forty-five
            passes are run at twice the linear size - four times the pixels -
            on every frame of a drag. That is most of Ethan's "when I click on
            full screen now it's really laggy, a lot of glitching".
            The same shape drawn twice, once offset and translucent, is two
            ordinary fills. It reads identically at this size and it composites
            like anything else on the map. */}
        <g fill="rgba(20,20,30,0.22)" transform="translate(0 1.8)">
          <path d={body} />
          <circle cx={0} cy={cy} r={disc} />
        </g>
        <g fill="#ffffff">
          <path d={body} />
          <circle cx={0} cy={cy} r={disc} />
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
      </g>
    </Marker>
  )
}

// An airplane that FLIES along a path (animateMotion), nose pointed the way it
// travels. Used both for the "we're all connected" threads and the travelling-
// now journeys, so every plane on the map moves. `dur` (seconds) is set by the
// caller from path length so all planes share one speed.
function FlyingPlane({ path, dur, zoom, opacity = 1, arriving = false }) {
  const s = 0.85 / Math.max(zoom, 1)
  return (
    // THREE NESTED GROUPS, AND EACH ONE OWNS EXACTLY ONE TRANSFORM.
    //
    // THE TRAP. `<animateMotion>` drives its PARENT element's transform, and a
    // CSS transform on an element overrides the SVG transform on that same
    // element. So putting the arrival animation on this outer g - which is what
    // it used to be, back when the arrival was a bare fade and there was no
    // transform in it to collide - would park every plane at the top-left
    // corner of the map for the length of its entrance. This is the same trap
    // that silently flattened the Flight Path aircraft to scale 1 for weeks.
    //
    //   outer   the flight path (animateMotion)
    //   middle  the arrival (CSS)
    //   inner   the counter-scale and the nose-up rotation (SVG attribute)
    <g style={{ pointerEvents: 'none', opacity }}>
      {/* `arriving` holds the aircraft off until the pins have landed, so the
          arrival reads as land, then threads, then places, then traffic. Once
          the map has settled the class comes off and a plane added later
          simply appears. */}
      <g className={arriving ? 'map-plane-in' : undefined}>
        <g transform={`scale(${s}) rotate(90)`}>
          {/* No drop-shadow filter. It is one offscreen pass per plane per frame
              on an element that MOVES every frame, which is the most expensive
              thing a filter can be attached to. The white outline already lifts
              it off the land, which is what the shadow was for. */}
          <path
            d={PLANE_D}
            fill={BRAND}
            stroke="#ffffff"
            strokeWidth={1.3}
            strokeLinejoin="round"
          />
        </g>
      </g>
      <animateMotion dur={`${dur}s`} repeatCount="indefinite" rotate="auto" path={path} />
    </g>
  )
}

// THE LADDER IS CAPPED, AND THE CAP IS THE POINT.
//
// The threads arrive one after another so the connections read as reaching
// across the map rather than switching on together. Uncapped that is a bug
// waiting for a busy day: forty threads at 55ms each is a two-second entrance,
// which is the exact fault the per-pin ladder was removed for. Eight steps is
// under half a second whether there are nine threads or nine hundred.
const THREAD_STEPS = 8
const threadStep = (i) => ({ '--thread-i': i % THREAD_STEPS })

// The map, drawn but not yet shown, for the two frames between the commit that
// builds it and the frame the entrance starts on. Module scope: a fresh object
// per render would be a new style prop on the biggest group on the page.
const HELD = { opacity: 0 }

// THE LAND IS ITS OWN MEMOISED COMPONENT, AND THAT IS A PERFORMANCE FIX.
//
// THE BUG THIS FIXES. `<Geographies>` takes a render prop, so its 240 country
// paths were rebuilt on EVERY render of CreatorMap - and CreatorMap re-renders
// a lot: `liveZoom` is set from a rAF on every frame of a pinch or a wheel, and
// `tooltip` is set every time the pointer crosses a border. So dragging the map
// meant reconciling 240 <Geography> elements sixty times a second, and simply
// moving the mouse across Europe meant a full pass per country. Inside a 700px
// card that is a warm laptop; full screen, where the same work is being done at
// four times the pixel count, it is Ethan's "really laggy, a lot of glitching".
//
// Nothing about the land depends on the zoom or on the tooltip. Pulled out here
// and wrapped in `memo`, it re-renders only when the atlas, the tinting or the
// open country actually change - so a drag now touches the pins (which do have
// to counter-scale) and nothing else.
//
// Every prop is a primitive, a stable Set or a stable callback, because `memo`
// is a shallow compare and one fresh object literal a render would undo all of
// this silently.
const Countries = memo(function Countries({
  features, homeNames, exploredView, exploredSet, openName,
  landFill, homeFill, exploredFill, hoverFill, separator,
  onSelect, onHover,
}) {
  return (
    <Geographies geography={features || EMPTY_GEO}>
      {({ geographies }) =>
        geographies
          .filter((geo) => geo.properties.name !== 'Antarctica')
          .map((geo) => {
            const name = geo.properties.name
            const isHome = homeNames.has(name)
            const isOpen = openName === name
            // BEEN TOGETHER, painted only while the filter is on. It sits
            // BELOW "home" in the order because somewhere a creator lives is a
            // stronger fact about that country than somewhere the network has
            // filmed, and above plain land for the obvious reason. Its own
            // lighter tint, so the two are still distinguishable when both are
            // showing.
            const isExplored = exploredView && exploredSet.has(countryKey(name))
            const base = isOpen
              ? BRAND_LIGHT
              : isHome ? homeFill
                : isExplored ? exploredFill
                  : landFill
            return (
              <Geography
                key={geo.rsmKey}
                geography={geo}
                // THE LAND IS A BUTTON NOW. Tapping a country asks the
                // community who has been there; see openCountry.
                onClick={() => onSelect(geo)}
                onMouseEnter={() => onHover(name)}
                onMouseLeave={() => onHover('')}
                tabIndex={-1}
                style={{
                  default: { fill: base, stroke: separator, strokeWidth: 0.4, outline: 'none', transition: 'fill 0.18s ease' },
                  hover: { fill: isOpen ? BRAND_LIGHT : isHome ? homeFill : isExplored ? exploredFill : hoverFill, stroke: separator, strokeWidth: 0.4, outline: 'none', cursor: 'pointer' },
                  pressed: { fill: BRAND_LIGHT, outline: 'none', cursor: 'pointer' },
                }}
              />
            )
          })
      }
    </Geographies>
  )
})

// How far ahead a planned trip is worth putting on the map.
//
// Three months. Long enough to plan around - the whole point of showing
// upcoming trips at all is so two creators can find each other before one of
// them books - and short enough that the map is not carrying somebody's
// Christmas flight through the summer. Trips further out still live on the
// collab board, which is a list and can afford to be exhaustive.
const TRIP_HORIZON_DAYS = 90

// A stable empty collection for the frame before the shared atlas resolves. It
// has to be the SAME object every render or `<Geographies>` sees a new source.
const EMPTY_GEO = { type: 'FeatureCollection', features: [] }

function CreatorMap({ creators = [], trips = {}, highlightIds = null, nearMe = false, nearCount = 0, nearMeDisabled = false, onToggleNearMe = null, travelActive = null, onToggleTravel = null, onTravellersChange = null, onCreatorClick = null, connectionsActive = null, onToggleConnections = null, connectionIds = null, travelOnlyView = false, myId = null, maxFitZoom = 6, controls = true,
  // A CAPTION THAT BELONGS TO THE MAP, DRAWN BY THE MAP.
  //
  // The creator directory wants a "45 creators from around the world" bar
  // across the top of its map, and it used to build that itself: its own
  // bordered, brand-tinted strip with `rounded-t-card border-b-0`, sitting on
  // top of a map that draws its OWN full rounded card with its own grey
  // border. Two borders in two colours meeting at two different corner radii,
  // which is precisely the "different colour and it doesn't sit cleanly
  // integrated with the map card" report - the strip was a separate object
  // pretending to be attached to this one.
  //
  // Passing the content in instead means there is one card, one border and one
  // radius, and the hairline between the caption and the map is drawn on the
  // inside where it reads as a divider rather than as a seam. Full screen drops
  // it: the map is the whole window there and a caption bar would be chrome.
  header = null,
  // "Where we have been, together": the set of country names anybody in the
  // network has filmed in, and a toggle to paint them. It replaces the second
  // WorldMap that used to sit at the foot of the directory - see the note on
  // the button in `filterButtons`.
  exploredCountries = null, exploredActive = null, onToggleExplored = null }) {
  const dark = useIsDark()
  // Dark-mode map palette: deep land on near-black sea, so the light-grey map
  // doesn't glare. Home countries keep a muted warm tint.
  const LAND_FILL = dark ? '#2a2c31' : LAND
  // A DESATURATED BROWN IS NOT THE BRAND. The old dark-mode home tint was
  // #5c3a1f, which is what you get by darkening orange: it reads as mud. Using
  // the brand orange itself at partial alpha over the near-black sea keeps the
  // hue and lets the darkness come from the background rather than from the
  // colour, so a tinted country still looks orange.
  const HOME_FILL = dark ? 'rgba(217, 68, 7, 0.55)' : HOME
  // A step lighter than HOME, for the same reason HOME is a step lighter than
  // the brand: a whole continent painted at full strength stops being a
  // highlight and becomes the background.
  const EXPLORED_FILL = dark ? 'rgba(217, 68, 7, 0.3)' : '#fbd9c8'
  // Hovering a country now means something (it is tappable), so it needs a
  // hover state - a step towards the tint rather than the tint itself, so a
  // country somebody LIVES in still reads as different from one under the
  // cursor.
  const HOVER_FILL = dark ? '#3a3d44' : '#dcdce0'
  const SEPARATOR = dark ? '#0c0d10' : '#ffffff'
  const highlighting = highlightIds && highlightIds.size > 0
  const [extraCoords, setExtraCoords] = useState({}) // legacy rows: id -> {lat,lng}
  const [homeNames, setHomeNames] = useState(() => new Set()) // countries to tint
  // The atlas, from the one shared parse. See lib/mapCountries: handing
  // `<Geographies>` the parsed object rather than a URL is what keeps a page
  // with several maps on it from decoding a megabyte of TopoJSON per map.
  const [features, setFeatures] = useState(null)

  useEffect(() => {
    let cancelled = false
    loadMapFeatures().then((fc) => { if (!cancelled) setFeatures(fc) })
    return () => { cancelled = true }
  }, [])

  // THE ENTRANCE DOES NOT START ON THE FRAME THAT DRAWS THE WORLD.
  //
  // THE BUG THIS FIXES. `setFeatures` and the arrival animation used to be the
  // same commit: React inserts two hundred and forty country paths, forty-odd
  // pins and every thread, the browser lays all of that out and paints it, and
  // the CSS animation on the group is running for the whole of that frame. A
  // frame that does that much work is not 16ms, it is well over a hundred - so
  // the first quarter of the entrance is a single held frame and the rest
  // catches up in a jump. Ethan: "when the map loads the page jutters a bit,
  // the animation is not smooth."
  //
  // No amount of tuning the curve fixes a dropped frame. The fix is to let the
  // expensive commit paint first, on its own, and start the animation on the
  // NEXT frame - which is cheap, because everything it animates is already
  // laid out by then. Two nested rAFs: the first is scheduled before the heavy
  // paint, the second after it.
  //
  // The map is held at opacity 0 in between rather than left visible, or the
  // land would flash on at full strength and then fade in from nothing.
  const [painted, setPainted] = useState(false)
  useEffect(() => {
    if (!features || painted) return undefined
    let inner = 0
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setPainted(true))
    })
    return () => { cancelAnimationFrame(outer); cancelAnimationFrame(inner) }
  }, [features, painted])

  // THE ARRIVAL PLAYS ONCE PER MAP, NOT ONCE PER MOUNT.
  //
  // THE BUG THIS FIXES. Going full screen moves the map into a portal, and a
  // portal is a different place in the tree - so React tears the whole SVG down
  // and builds it again. Every arrival animation on it therefore ran a second
  // time: the land scaled in from 1.16 while the container it sits in was
  // itself scaling in from 0.965, the pins dropped again from somewhere above
  // wherever they had just been drawn, and the aircraft restarted their SMIL
  // paths from the beginning. Two nested scales and forty-five pins in flight
  // is exactly Ethan's "everything is jumbled about, it's not smooth at all"
  // and "the pins are not where they should be" - they were mid-drop.
  //
  // The component itself does NOT unmount (only its rendered subtree moves), so
  // a flag here survives the transition and the second mount draws the map in
  // its settled state. The timer has to outlast the WHOLE sequence or the class
  // comes off mid-animation and whatever was still moving snaps to its end
  // state. The last step is the aircraft, at 960ms + 300ms, so 1400ms.
  const [arrived, setArrived] = useState(false)
  useEffect(() => {
    // Off `painted`, not `features`: the clock has to start when the animation
    // does, or the two frames it waits come out of the end of the sequence.
    if (!painted || arrived) return undefined
    const t = setTimeout(() => setArrived(true), 1400)
    return () => clearTimeout(t)
  }, [painted, arrived])

  // THE ONE FLAG EVERY ARRIVAL CLASS IS OFF, and it has to be one flag rather
  // than `!arrived` per element. A CSS animation's clock starts the moment its
  // class lands, so if the pins were classed on the commit that draws the world
  // and the land were classed two frames later, the pins would be two frames
  // (or, on the slow commit this is guarding against, a hundred and fifty
  // milliseconds) further through their sequence than the land beneath them.
  // Everything is classed together or nothing is.
  const entering = painted && !arrived

  const [tooltip, setTooltip] = useState('')
  const [selected, setSelected] = useState(null)
  // FULL SCREEN.
  //
  // A world map inside a card on a page is a map you navigate by squinting: at
  // the default zoom the whole planet is about 400px tall, and finding one
  // creator in northern Spain means four presses of + and a lot of dragging in
  // a letterbox. Full screen is the same map with the page taken away.
  //
  // On a phone it also asks for LANDSCAPE, because a portrait phone is the
  // worst possible frame for an object that is twice as wide as it is tall.
  // `screen.orientation.lock` only works from inside a real Fullscreen API
  // session and only on Chrome/Android - iOS Safari has neither - so the lock
  // is attempted and its failure is expected, not handled. When it fails the
  // reader is simply asked to turn the phone, which is a thing people do
  // without being told anyway.
  const [fullscreen, setFullscreen] = useState(false)
  // Kept up for the length of the exit animation. See `exitFullscreen`.
  const [closing, setClosing] = useState(false)
  const rootRef = useRef(null)
  const fsRef = useRef(null)
  // The country a reader has tapped, if any: { name, lives, visited }.
  const [country, setCountry] = useState(null)

  // WHICH PANEL IS OPEN LIVES IN THE URL, SO BACK BRINGS IT BACK.
  //
  // THE BUG THIS FIXES. Tap the United States, see who has been, open Aliah's
  // profile, decide she is not who you were after, press back - and you landed
  // on a map with nothing open, having lost the list you were reading. The
  // browser had faithfully returned you to /creators; /creators just had no
  // memory of what you had been looking at.
  //
  // `replace: true` on every open and close, deliberately: a panel is not a
  // page, and pressing back eleven times to undo eleven pin taps would be its
  // own bug. It rewrites the CURRENT entry, so the entry you leave behind when
  // you click through to a profile already carries the panel, and coming back
  // restores it.
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

  // THE PLANE LANDS ON THE CITY, NOT IN THE MIDDLE OF THE COUNTRY.
  //
  // Ethan: "as well as the country showing on the map, the actual city they
  // enter should show up on the map as the location the plane is going to."
  //
  // Journeys used to end at the country's CENTROID, which for a trip to Lisbon
  // put the aircraft somewhere in the hills north of Castelo Branco, and for
  // anywhere large (a trip to "United States") put it in Kansas. The centroid
  // is still the fallback - a trip with no city, or a city nothing can resolve,
  // has to land somewhere - but a named city now wins.
  //
  // Geocoded through the same helper and the same cache the creator pins use,
  // so a city that has already been looked up for somebody's home costs
  // nothing here. Keyed by "city|country" rather than by trip id: three
  // creators going to Lisbon is one lookup.
  const [tripCoords, setTripCoords] = useState({})
  useEffect(() => {
    let cancelled = false
    const wanted = new Map()
    for (const list of Object.values(trips || {})) {
      for (const t of (Array.isArray(list) ? list : [list])) {
        if (!t?.city || !t?.country) continue
        const key = `${t.city.trim().toLowerCase()}|${t.country.trim().toLowerCase()}`
        if (!tripCoords[key]) wanted.set(key, t)
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
  }, [trips, tripCoords])

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
  //
  // AND THE FACE ON THE PIN IS THE PERSON MOST WORTH SEEING. A pin over a city
  // with six creators shows one of them, and until now that was whoever the
  // query happened to return first - which regularly meant a grey circle of
  // initials belonging to somebody who last opened the app in March, standing in
  // for five active creators with photos. The pin is the community's face in
  // that city; it should be somebody who is actually in the room.
  //
  // The creators are SORTED, not just peeked at, so the roster in TownPanel
  // opens in the same order. Reading a list whose first row is not the face you
  // tapped is a small confusion that costs nothing to avoid.
  const towns = useMemo(() => {
    const map = new Map()
    for (const c of located) {
      const key = townKey(c._lat, c._lng)
      if (!map.has(key)) map.set(key, { key, coords: [c._lng, c._lat], creators: [] })
      map.get(key).creators.push(c)
    }
    for (const t of map.values()) t.creators.sort(byPinPriority)
    return [...map.values()]
  }, [located])

  // TAPPING A COUNTRY: WHO IN THE COMMUNITY CAN TELL YOU ABOUT IT.
  //
  // Two different questions, answered from two different columns, and the
  // difference matters enough to keep them apart in the panel:
  //
  //   lives here - their home town falls inside this country's own geometry
  //     (point-in-polygon, so it is the map's answer, not a spelling contest),
  //     or the country they typed IS this one. Both, because a coastal or
  //     island town's coordinates can land just offshore and a creator who
  //     typed "England" should still count as living in the United Kingdom.
  //   been there - the country is in their countries_visited, which is stored
  //     using these same world-atlas names, so it is a direct match.
  //
  // Somebody who lives there is never also listed as a visitor: the stronger
  // claim wins and the list stays honest about its own ordering.
  // Opening a town closes the country panel and vice versa: one answer in that
  // corner at a time.
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

  // Re-open whatever the URL says, once there is data to build it from.
  //
  // Guarded by a ref rather than by "is it already open", because a reader who
  // deliberately CLOSES a panel must not have it reinstated on the next render.
  // It runs once per URL value: arrive with ?country=Japan and Japan opens;
  // close it and it stays closed.
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
    loadMapFeatures()
      .then((fc) => {
        if (cancelled) return
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
        const city = cityKey ? tripCoords[cityKey] : null
        const dest = city ? [city.lng, city.lat] : canonToCentroid.get(countryKey(trip.country))
        if (!dest) continue

        // CURRENT VERSUS UPCOMING, and how far ahead is worth drawing.
        //
        // The map used to treat both identically, so it answered "who is away
        // right now" and nothing else - which on a normal Tuesday is two people
        // and an empty map. The useful question for a collab board is "who is
        // going somewhere I could join", and that is answered weeks ahead.
        //
        // The horizon is 60 days. Far enough to plan a trip around, near enough
        // that the map is not carrying somebody's Christmas flight in August.
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
          // Same uniform speed as every other plane on the map.
          dur: flightDur(quadLength(ax, ay, cx2, cy2, bx, by)),
        })
        break
      }
    }
    // In the air first, then soonest to leave. A list sorted by "who is
    // actually gone" reads as news; sorted by creator id it reads as a dump.
    return out.sort((a, b) => (b.current ? 1 : 0) - (a.current ? 1 : 0) || a.daysUntil - b.daysUntil)
  }, [centroids, trips, located, tripCoords])

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
  // WHAT THE FIT HAS TO CONTAIN.
  //
  // Normally: everybody's home town. But on a map whose whole subject is the
  // journeys - the collab board's "where everyone's headed", and the travel
  // view anywhere else - the DESTINATIONS are half the picture, and fitting
  // only the home towns is what left that board framed on Europe with the
  // planes flying off the edge of it. If the answer to "where is everyone
  // headed" is Thailand, Thailand has to be on screen.
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

  // Fit to everyone on first load.
  useEffect(() => {
    if (didInitCenter.current || located.length === 0) return
    didInitCenter.current = true
    setPosition(fitView)
    setLiveZoom(fitView.zoom)
  }, [located, fitView])

  // AND ONE MORE FIT, WHEN THE DESTINATIONS TURN UP - ON THE COLLAB BOARD ONLY.
  //
  // Country centroids are fetched, so on the first paint `journeys` is empty
  // and the fit can only see home towns. The collab board's map IS the
  // journeys, has no filter to press, and would otherwise open framed on
  // Europe with the planes flying off the edge - so it re-frames once, when
  // the destinations arrive.
  //
  // THE INTERACTIVE MAPS DO NOT DO THIS, and that is the fix for the judder.
  // This effect used to fire on `travelView` too, which meant the FIRST press
  // of "On the move" re-framed the camera to fit the journeys - a lurch right
  // and a zoom change - and every press after it did nothing, because the
  // once-only guard had been spent. "It jutters the first time and works the
  // second" is exactly that. A filter changes WHAT IS DRAWN; it has no business
  // moving the camera out from under the reader, and the reset control in the
  // corner is there for anybody who does want the whole map back.
  const refitWithJourneys = useRef(false)
  useEffect(() => {
    if (refitWithJourneys.current) return
    if (journeys.length === 0 || !travelOnlyView) return
    refitWithJourneys.current = true
    setPosition(fitView)
    setLiveZoom(fitView.zoom)
  }, [journeys.length, travelOnlyView, fitView])

  const selectedTown = selected // a town snapshot ({ key, coords, creators })

  // Counter-scaling reads the LIVE zoom, not the settled one. Reading only the
  // post-gesture value made every pin and plane balloon mid-zoom.
  //
  // THE BUG THIS FIXES, AND WHY THE rAF THROTTLE HAD TO GO.
  //
  // `setLiveZoom` used to be deferred into a requestAnimationFrame, on the
  // reasoning that a wheel can fire more often than the screen refreshes and one
  // re-render per frame is enough. It is enough, and it is also the bug: Ethan,
  // "when zooming in the planes temporarily appear way too big and then go to
  // normal size."
  //
  // react-simple-maps' own zoom handler does two things in one synchronous d3
  // event - it sets ITS state (which is what actually scales the group) and then
  // calls this `onMove`. React 18 batches every setState made inside one event
  // into a SINGLE render, so setting the counter-scale here, synchronously, puts
  // the map's new scale and the pins' new counter-scale in the same commit and
  // therefore on the same painted frame. Deferring ours by a frame took it out
  // of that batch: the group scaled up on frame N and everything drawn on it
  // stayed sized for the old zoom until frame N+1. On a fast wheel, several
  // ticks land inside one frame, so the aircraft were briefly drawn at a scale
  // several steps out of date - which is exactly "way too big, then normal".
  //
  // It costs nothing to be synchronous. The land is a memo'd component that does
  // not re-render on zoom at all (see `Countries`), a pan reports the SAME zoom
  // so React bails out of the render entirely, and what is left is the markers,
  // which have to be re-rendered on a zoom change or they are wrong.
  const z = liveZoom
  const handleMove = useCallback((pos) => { setLiveZoom(pos.zoom) }, [])
  const handleMoveEnd = useCallback((pos) => {
    setPosition(pos)
    setLiveZoom(pos.zoom)
  }, [])

  // liveZoom FOLLOWS position.zoom, always.
  //
  // There are four things that can move this map - a wheel/pinch gesture, a
  // drag, the +/- buttons and a programmatic re-fit - and they arrive through
  // three different channels (onMove, onMoveEnd, and our own setPosition). Every
  // one of them has to end with `liveZoom` agreeing with `position.zoom`,
  // because liveZoom is what counter-scales the pins and planes: when the two
  // disagree the map is at one zoom and everything drawn on it is sized for
  // another, which is how a single face ended up covering a third of Europe.
  //
  // Rather than remember to set it in all four places (and get it wrong in the
  // fourth), it is derived here. The handlers still set it eagerly so there is
  // no lag mid-gesture; this only ever catches what they miss.
  useEffect(() => { setLiveZoom(position.zoom) }, [position.zoom])

  // TWO PLAIN SET-STATES, NOT ONE NESTED INSIDE THE OTHER.
  //
  // This used to call setLiveZoom from INSIDE the setPosition updater. An
  // updater has to be a pure function of the previous state - React is free to
  // call it more than once, and to call it during render - so the setLiveZoom
  // in there simply never landed. The map zoomed (the group's own transform
  // comes from `position`) while `liveZoom` stayed at whatever the last real
  // gesture left it at, and since liveZoom is what counter-scales the pins,
  // every press of + left the pins scaled for a zoom the map was no longer at.
  // Four presses of + and one face covered a third of Europe.
  //
  // Programmatic zoom does not fire the group's onMoveEnd either, so nothing
  // downstream was ever going to correct it.
  // AND THE FACTOR IS APPLIED TO THE PREVIOUS STATE, NOT TO THE RENDER'S COPY.
  //
  // It read `position.zoom` from the closure, so three quick presses of + all
  // computed from the SAME starting zoom and two of them were thrown away: the
  // map went one step and stopped, and pressing harder did nothing. The
  // functional updater sees each previous value in turn, and the effect below
  // (liveZoom follows position.zoom) carries the counter-scaling with it, so
  // there is nothing left to keep in sync by hand.
  const zoomBy = (factor) => {
    setPosition((p) => ({ ...p, zoom: Math.min(40, Math.max(1, p.zoom * factor)) }))
  }
  const resetView = () => { setPosition(fitView); setLiveZoom(fitView.zoom) }

  // The three view filters. Rendered twice: as an overlay on desktop, and in a
  // row beneath the map on phones (where an overlay would cover the map).
  //
  // `controls={false}` drops them entirely. A market map is already a filtered
  // view (these creators, this place), so offering "who's travelling" over the
  // top of it would let you filter a filter and land somewhere nobody asked to
  // be.
  // ONE SHAPE FOR EVERY FILTER. They are the same kind of thing - a view of the
  // map you can be in or out of - so they are the same button, and the only
  // difference between them is whether they are on. Mixing a dark pill, a white
  // pill and an orange pill in one corner made three equal choices look like a
  // hierarchy that does not exist.
  // ALL FOUR ARE THE SAME SIZE, and that is a fixed width rather than an
  // accident of the label.
  //
  // THE BUG THIS FIXES. They were `px-4` around whatever the label happened to
  // be, so "My connections" was noticeably wider than "Near me", and turning a
  // filter ON appended a count to its label and made that one grow again -
  // a column of buttons that reflowed every time you pressed one. Ethan: "with
  // these buttons, currently they are different sizes, it would look better if
  // they are all the same size."
  //
  // `w-44` fits the longest of them with the count on, so nothing moves when a
  // filter is switched on, and `justify-start` keeps every icon on the same
  // vertical line - which is what actually makes a stack of buttons read as a
  // set rather than as four unrelated pills.
  const pill = (on) =>
    `inline-flex w-44 items-center justify-start gap-2 rounded-full px-4 py-2 text-xs font-semibold shadow-card backdrop-blur transition-all hover:scale-[1.03] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 ${
      on ? 'bg-brand text-white ring-1 ring-brand' : 'bg-white/95 text-ink ring-1 ring-black/5'
    }`

  const filterButtons = !controls ? null : (
    <>
      {onToggleConnections && (
        <button
          type="button"
          onClick={onToggleConnections}
          className={pill(connectionsView)}
        >
          <Icon name="users" className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">My connections{connectionsView ? ` · ${connSet.size}` : ''}</span>
        </button>
      )}
      {/* WHERE WE HAVE BEEN, TOGETHER - AS A FILTER, NOT A SECOND MAP.
          There used to be an entire extra WorldMap at the bottom of the
          directory showing every country anybody had filmed in. Ethan: "the
          'where we've been together' map at the very bottom should be removed
          from here and instead just be a button on the other map." He is right:
          it was a second world map on a page that already had one, three
          screens below it, answering a question about the same set of people.
          As a toggle it is the same information in the place you are already
          looking, and it costs no extra atlas parse. */}
      {onToggleExplored && (
        <button
          type="button"
          onClick={onToggleExplored}
          className={pill(exploredView)}
        >
          <Icon name="globe" className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">Been together{exploredView ? ` · ${exploredSet.size}` : ''}</span>
        </button>
      )}
      {journeys.length > 0 && (
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
          <span className="truncate">On the move{travelView ? ` · ${journeys.length}` : ''}</span>
        </button>
      )}
      {onToggleNearMe && (
        <button
          type="button"
          onClick={onToggleNearMe}
          disabled={nearMeDisabled}
          title={nearMeDisabled ? 'Add your city in your profile to use this' : undefined}
          className={pill(nearMe)}
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11Z" /><circle cx="12" cy="10" r="2.6" />
          </svg>
          <span className="truncate">Creators near me{nearMe ? ` · ${nearCount}` : ''}</span>
        </button>
      )}
    </>
  )

  // TAPPING NOWHERE CLOSES WHAT IS OPEN.
  //
  // Ethan's report: "tapping elsewhere, blank space on the map or outside the
  // card, should close that popup so it's not stuck open". Both halves are here:
  // the sea inside the map (a transparent rect painted UNDER the land, so the
  // countries still get their own clicks) and anywhere outside the whole
  // component (a pointerdown on the document). Escape too - a panel that can
  // only be dismissed by finding its X is a panel people leave open.
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

  // Entering and leaving full screen. The real Fullscreen API is used where it
  // exists (it is what makes the orientation lock possible and what takes the
  // browser chrome away); where it does not, the fixed overlay alone is still a
  // full-window map, which is the point.
  const enterFullscreen = useCallback(async () => {
    setFullscreen(true)
    const el = fsRef.current
    try {
      if (el?.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' })
      else if (el?.webkitRequestFullscreen) el.webkitRequestFullscreen()
    } catch { /* denied or unsupported: the overlay still fills the window */ }
    try { await window.screen?.orientation?.lock?.('landscape') } catch { /* iOS, and most desktops */ }
  }, [])

  // LEAVING IS AN ANIMATION, SO THE OVERLAY OUTLIVES THE DECISION BY 180ms.
  //
  // Entering can animate on its own - the element mounts and its keyframes run.
  // Leaving cannot: `setFullscreen(false)` unmounts the portal on the next
  // commit and there is nothing left to animate, which is the hard cut Ethan
  // saw. So the button sets `closing`, which swaps the entrance keyframes for
  // the exit ones, and only then does the unmount happen.
  //
  // The browser's own fullscreen is released IMMEDIATELY rather than after the
  // fade: the system transition out of real fullscreen is the browser's to run
  // and waiting for ours would play the two one after the other.
  const exitFullscreen = useCallback(() => {
    try { window.screen?.orientation?.unlock?.() } catch { /* see above */ }
    try { if (document.fullscreenElement) document.exitFullscreen() } catch { /* already out */ }
    setClosing(true)
    setTimeout(() => { setFullscreen(false); setClosing(false) }, 180)
  }, [])

  // Leaving by the browser's own route (Escape, the system gesture, the back
  // swipe) has to put the component back too, or the overlay stays up with no
  // browser chrome around it and no way out.
  useEffect(() => {
    if (!fullscreen) return undefined
    const onChange = () => { if (!document.fullscreenElement) setFullscreen(false) }
    const onKey = (e) => { if (e.key === 'Escape') exitFullscreen() }
    document.addEventListener('fullscreenchange', onChange)
    document.addEventListener('keydown', onKey)
    // The page behind must not scroll while a full-window overlay is up.
    document.documentElement.classList.add('overlay-lock')
    return () => {
      document.removeEventListener('fullscreenchange', onChange)
      document.removeEventListener('keydown', onKey)
      document.documentElement.classList.remove('overlay-lock')
    }
  }, [fullscreen, exitFullscreen])

  // In full screen the panels and filters go OVER the map at every width,
  // because there is no "under the map" any more - the map is the whole screen.
  // Outside it the phone keeps them below, for the reasons in the notes further
  // down.
  const overlayCls = fullscreen ? 'flex' : 'hidden sm:flex'

  // HOW BIG THE CARD IS DEPENDS ON HOW MUCH SCREEN THERE IS.
  //
  //  * In a card on a page it is a 24rem panel in the corner, unchanged.
  //  * Full screen on a desktop it gets to be a real panel: Ethan's "too
  //    crammed into the corner, it could be a bit bigger on full screen". A
  //    24rem card floating in 1400px of map reads as an accident.
  //  * Full screen on a phone it goes the OTHER way and gets smaller. Full
  //    screen there is landscape, so the screen is about 390px TALL, and the
  //    same card that looks lost on a desktop covers half the map. The height
  //    query is the honest test for "this is a phone lying on its side";
  //    `sm:` would call an 844px-wide landscape iPhone a desktop.
  const panelCls = fullscreen
    ? 'max-w-md [--map-panel-max-h:32rem] lg:max-w-lg [@media(max-height:540px)]:max-w-[15.5rem] [@media(max-height:540px)]:[--map-panel-max-h:100%]'
    : 'max-w-sm'

  // THE WIDTH LIVES ON THE DRAGGABLE WRAPPER, NOT ON THE CARD.
  //
  // THE BUG THIS FIXES: the wrapper was `w-full` and the card inside it carried
  // `max-w-md`, so the wrapper spanned the whole frame while the card occupied
  // its left third. The drag clamp measures the WRAPPER against its frame,
  // found zero room either side, and pinned the card horizontally - it would
  // take the grab cursor and then refuse to move. Constraining the wrapper
  // instead makes the box being dragged the same box you can see.
  //
  // `--map-panel-max-h` still reaches the card: it is a custom property and
  // inherits straight through the wrapper.
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

  // THE PANEL MUST NOT REACH THE ROW THE COUNTRY NAME SITS IN.
  //
  // Ethan: "the countries that show up in black at the top are slightly hidden
  // behind the pop-up box". The name pill is centred at top-3; the panel was
  // `inset-3`, so on a narrower map (the hub's left column, or any phone in
  // full screen) a tall card grew up past the halfway point and swallowed the
  // label naming the very country it was describing.
  //
  // Raising the pill's z-index would only trade one problem for another: it
  // would sit ON the card. Giving the panel a floor of `top-14` means it can
  // never get there, and `bottom-3 + top-14` is still the DEFINITE box the card
  // needs to be allowed to shrink inside (a percentage max-height against an
  // auto-height parent silently applies no limit at all).
  const panelFrame = `pointer-events-none absolute inset-x-3 bottom-3 top-14 z-20 flex-col items-start justify-end ${overlayCls}`

  const mapBox = (
    <div
      className={cx(
        fullscreen
          ? 'relative flex h-full w-full flex-1 items-center justify-center overflow-hidden bg-cloud/60'
          : 'relative w-full overflow-hidden bg-cloud/60',
        // The frame belongs to whichever element is the OUTSIDE of the card. With
        // a caption bar that is the wrapper below, and drawing a second border
        // here would put a hairline between the caption and the map it names.
        !fullscreen && !header && 'rounded-card border border-gray-100',
      )}
    >
      {tooltip && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-30 -translate-x-1/2 rounded-full bg-ink px-3 py-1 text-xs font-medium text-white">
          {tooltip}
        </div>
      )}

      {/* THE CORNER OF A PHONE IS NOT WHERE THE SCREEN ENDS. In full screen the
          map is edge to edge, and a landscape phone puts its rounded corners
          and its notch on the SHORT sides - which is exactly where these
          buttons are. The parent already pads for the top and bottom insets;
          the left/right ones are the landscape pair and they were missing, so
          + and the exit button sat under the bezel. A little more inset on top
          of that keeps them clear of the corner radius itself. */}
      <div className={`absolute z-20 flex flex-col gap-1 ${fullscreen ? 'right-4 top-4' : 'right-2 top-2'}`}>
        <button type="button" onClick={() => zoomBy(1.6)} aria-label="Zoom in"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-lg font-semibold text-ink shadow-card transition-transform hover:scale-105 active:scale-95">+</button>
        <button type="button" onClick={() => zoomBy(1 / 1.6)} aria-label="Zoom out"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-lg font-semibold text-ink shadow-card transition-transform hover:scale-105 active:scale-95">−</button>
        <button type="button" onClick={resetView} aria-label="Reset map view"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-smoke shadow-card transition-transform hover:scale-105 active:scale-95">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9 9 0 0 0-6.7 3M3 4v4h4"/></svg>
        </button>
        {/* Under the zoom stack, because it belongs to the same "how am I
            looking at this" group. Not offered on the embedded market maps
            (`controls={false}`), which are a fixed illustration of one place. */}
        {controls && (
          <button
            type="button"
            onClick={fullscreen ? exitFullscreen : enterFullscreen}
            aria-label={fullscreen ? 'Exit full screen' : 'Open the map full screen'}
            title={fullscreen ? 'Exit full screen' : 'Full screen'}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-smoke shadow-card transition-transform hover:scale-105 active:scale-95"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {fullscreen
                ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
                : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}
            </svg>
          </button>
        )}
      </div>

      <ComposableMap
        width={WIDTH}
        height={HEIGHT}
        projectionConfig={{ scale: 160, center: [12, 8] }}
        // In full screen the svg takes the window rather than the card's
        // aspect ratio. `xMidYMid meet` (the default) letterboxes it inside
        // whatever shape the screen is, which on a landscape phone is very
        // nearly the map's own shape and on a desktop is a much bigger map.
        style={fullscreen
          ? { width: '100%', height: '100%', display: 'block' }
          : { width: '100%', height: 'auto', display: 'block' }}
        aria-label="Map of where every creator is based"
      >
        <defs>
          {/* objectBoundingBox → clips each avatar to a perfect circle of its own bounds */}
          <clipPath id="creator-pin-clip" clipPathUnits="objectBoundingBox">
            <circle cx="0.5" cy="0.5" r="0.5" />
          </clipPath>
        </defs>
        {/* THE SEA IS A DISMISS TARGET. Painted first, so every country, pin
            and plane drawn after it sits on top and keeps its own click; what
            is left is the water, and tapping the water closes the card. It has
            to be inside the svg rather than behind it, because the svg's own
            background does not receive pointer events where nothing is drawn. */}
        <rect x={0} y={0} width={WIDTH} height={HEIGHT} fill="transparent" onClick={closePanels} />
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
          {/* NOTHING DRAWS UNTIL THE ATLAS IS IN. See `.map-arrive` in
              index.css: the overlay used to render on the first frame and the
              land a beat later, so the map assembled back to front. Holding
              everything behind `features` costs nothing (the card already draws
              a skeleton in its place) and buys an arrival that happens once, in
              the right order. */}
          {features && (
          <g
            className={entering ? 'map-arrive' : undefined}
            style={painted || arrived ? undefined : HELD}
          >
          <Countries
            features={features}
            homeNames={homeNames}
            exploredView={exploredView}
            exploredSet={exploredSet}
            openName={country?.name ?? null}
            landFill={LAND_FILL}
            homeFill={HOME_FILL}
            exploredFill={EXPLORED_FILL}
            hoverFill={HOVER_FILL}
            separator={SEPARATOR}
            onSelect={openCountry}
            onHover={setTooltip}
          />

          {/* Everything that sits ON the land waits for the land. */}
          <g className={entering ? 'map-arrive-overlay' : undefined}>

          {/* Connection lines (behind the pins). Hidden while focusing on a
              traveller or in the who's-travelling view, to keep it clean. */}
          {!quietMap && (
            <g style={{ pointerEvents: 'none' }}>
              {segments.map((seg, i) => (
                <path
                  key={i}
                  className={entering ? 'map-thread-in' : undefined}
                  style={entering ? threadStep(i) : undefined}
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
                <FlyingPlane key={`p${seg.key}`} path={seg.d} dur={seg.dur} zoom={z} opacity={0.9} arriving={entering} />
              ))}
            </g>
          )}

          {/* Filtered views ("My connections" / "Creators near me"): a handful of
              flights from your town out to them, so the map still feels alive. */}
          {(connectionsView || nearMe) && linkSegments.length > 0 && (
            <g style={{ pointerEvents: 'none' }}>
              {linkSegments.map((seg, i) => (
                <path
                  key={`ls${seg.key}`}
                  className={entering ? 'map-thread-in' : undefined}
                  style={entering ? threadStep(i) : undefined}
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
                <FlyingPlane key={`lp${seg.key}`} path={seg.d} dur={seg.dur} zoom={z} opacity={0.95} arriving={entering} />
              ))}
            </g>
          )}

          {/* Travelling now: an animated plane flying from each traveller's
              home pin to their next collab-trip country, on repeat. Tap a
              plane (or its destination pulse) to focus that trip. */}
          <g>
            {visibleJourneys.map((j, ji) => (
              <g
                key={j.id}
                onClick={() => setFocusId((cur) => (cur === j.id ? null : j.id))}
                style={{ cursor: 'pointer' }}
                aria-label={j.current
                  ? `${j.name} is in ${j.trip.country} now`
                  : `${j.name} leaves for ${j.trip.country} in ${j.daysUntil} days`}
              >
                {/* A trip that has not started yet is drawn QUIETER: thinner
                    thread, dimmer plane, no pulsing arrival marker. Both are on
                    the map because both are useful, but "in the air now" and
                    "leaving in five weeks" are different facts and a map that
                    draws them identically is lying about one of them. */}
                <path
                  className={entering ? 'map-thread-in' : undefined}
                  d={j.d} fill="none" stroke={BRAND}
                  strokeWidth={(j.current ? 1.1 : 0.8) / z}
                  strokeDasharray={`${2.5 / z} ${5 / z}`}
                  strokeLinecap="round"
                  opacity={focusJourney ? 0.85 : j.current ? 0.5 : 0.3}
                  style={entering
                    ? { pointerEvents: 'none', ...threadStep(ji) }
                    : { pointerEvents: 'none' }}
                />
                {j.current ? (
                  <circle cx={j.dest[0]} cy={j.dest[1]} fill={BRAND} opacity="0.8">
                    <animate attributeName="r" values={`${2.5 / z};${6 / z};${2.5 / z}`} dur="2.4s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.8;0.15;0.8" dur="2.4s" repeatCount="indefinite" />
                  </circle>
                ) : (
                  <circle cx={j.dest[0]} cy={j.dest[1]} r={2.6 / z} fill="none" stroke={BRAND} strokeWidth={1.2 / z} opacity="0.55" />
                )}
                {/* WHERE THEY ACTUALLY ARE. A creator mid-trip is not at home,
                    and pinning them there is the map telling a small lie. Their
                    face is drawn at the destination as well, so "in Lisbon now"
                    and "leaving for Lisbon in three weeks" are two different
                    pictures rather than the same one with a different opacity. */}
                {j.current && (
                  <g transform={`translate(${j.dest[0]} ${j.dest[1]}) scale(${Math.pow(1 / Math.max(z, 1), 0.7)})`}>
                    {/* Painted shadow, not a filter - see the note in Pin. */}
                    <circle cy="1.8" r="13" fill="rgba(20,20,30,0.22)" />
                    <circle r="13" fill="#ffffff" />
                    {j.photo_url ? (
                      <image href={j.photo_url} x="-10" y="-10" width="20" height="20"
                        clipPath="url(#creator-pin-clip)" preserveAspectRatio="xMidYMid slice" />
                    ) : (
                      <text x="0" y="0" textAnchor="middle" dominantBaseline="central"
                        fontSize="9" fontWeight="600" fill={BRAND}>{initials(j.name)}</text>
                    )}
                    <circle r="10" fill="none" stroke={BRAND} strokeWidth="2.5" />
                  </g>
                )}
                <g>
                  {/* generous invisible hit-target so the moving plane is easy to tap */}
                  <circle r={14 / Math.max(z, 1)} fill="transparent" />
                  {/* The arrival on its OWN group, between the motion path and
                      the counter-scale. See FlyingPlane for why all three
                      transforms have to live on three different elements. */}
                  <g className={entering ? 'map-plane-in' : undefined}>
                    {/* nose-up plane rotated to face along the motion path */}
                    <g transform={`scale(${0.85 / Math.max(z, 1)}) rotate(90)`} style={{ pointerEvents: 'none' }} opacity={j.current ? 1 : 0.55}>
                      <path
                        d="M0 -11 C1.1 -11 1.8 -9 1.8 -6.2 L1.8 -4.4 L10 1 L10 3.1 L1.8 -0.2 L1.8 5 L4.4 7.6 L4.4 9.2 L0 7.7 L-4.4 9.2 L-4.4 7.6 L-1.8 5 L-1.8 -0.2 L-10 3.1 L-10 1 L-1.8 -4.4 L-1.8 -6.2 C-1.8 -9 -1.1 -11 0 -11 Z"
                        fill={j.current ? BRAND : '#ffffff'} stroke={j.current ? '#ffffff' : BRAND} strokeWidth={1.2} strokeLinejoin="round"
                      />
                    </g>
                  </g>
                  <animateMotion dur={`${j.dur}s`} repeatCount="indefinite" rotate="auto" path={j.d} />
                </g>
              </g>
            ))}
          </g>

          {paintOrder.map((town) => {
            const dimTown = highlighting && !town.creators.some((c) => highlightIds.has(c.id))
            const label = town.creators.length === 1
              ? `${town.creators[0].name} · ${(town.creators[0].city || '').trim()}`.trim()
              : `${(town.creators[0].city || 'This town').trim()} · ${town.creators.length} creators`
            return (
              <g
                key={town.key}
                onMouseEnter={() => setTooltip(label)}
                onMouseLeave={() => setTooltip('')}
              >
                <Pin group={town} zoom={z} active={selected?.key === town.key} dim={dimTown}
                  onSelect={selectTown} landing={entering} />
              </g>
            )
          })}
          </g>
          </g>
          )}
        </ZoomableGroup>
      </ComposableMap>

      {/* The country a reader tapped. Same corner as the town card and mutually
          exclusive with it - two overlapping answers to two different questions
          in one corner is how a map stops being readable. */}
      {/* DESKTOP ONLY. A flex column pinned to all four insets gives the panel a
          DEFINITE height to shrink inside, which is what stops a country with
          thirty visitors drawing a card taller than the map. `pointer-events-
          none` on the frame so only the card itself catches taps.
          On a phone this same overlay was the wrong shape entirely: the map box
          is about 180px tall there, so the panel covered the map it was
          describing and left roughly two rows of creators visible inside a
          scroll box. Phones get the panel UNDER the map instead - see the end
          of the component. */}
      {country && <div className={panelFrame}><DraggablePanel enabled={fullscreen} resetKey={fullscreen} className={panelBox}>{countryPanel}</DraggablePanel></div>}

      {/* The city roster: everybody the pin's orange number is counting. Same
          corner and the same card as the country panel, and mutually exclusive
          with it - two overlapping answers to two different questions in one
          corner is how a map stops being readable. Desktop only; phones get it
          under the map, at the end of the component. */}
      {/* WRAPPED, NOT REPLACED. The frame stays exactly what it was - a
          definite box the card is allowed to shrink inside - and the drag is a
          transform on a wrapper within it, so nothing about the sizing that
          took three attempts to get right is touched. Full screen only: in a
          card on a page there is nowhere useful to drag it to. */}
      {selectedTown && <div className={panelFrame}><DraggablePanel enabled={fullscreen} resetKey={fullscreen} className={panelBox}>{townPanel}</DraggablePanel></div>}

      {/* WHAT THE TWO PLANES MEAN. A solid plane and a hollow one is a
          distinction nobody can be expected to guess, and an unexplained
          symbol is worse than no symbol. Only shown when both kinds are
          actually on the map. */}
      {/* TOP-LEFT, NOT BOTTOM-LEFT. The filter pills live in the bottom-left
          corner, and this sat on top of them at a higher z-index, so turning
          the travel view on hid the controls that turned it off. Top-left is
          the only free corner: the tooltip is top-centre, the zoom stack and
          hint are top-right, and the town card owns the bottom. */}
      {travelView && !focusJourney && journeys.some((j) => j.current) && journeys.some((j) => !j.current) && (
        <div className={`absolute left-3 z-20 flex flex-col gap-1.5 rounded-xl bg-white/95 px-3 py-2 text-[11px] shadow-card ring-1 ring-black/5 backdrop-blur ${fullscreen ? 'top-16' : 'top-3'}`}>
          <span className="flex items-center gap-2">
            <svg viewBox="0 0 24 24" className="h-3 w-3 shrink-0" fill={BRAND} aria-hidden><path d={PLANE_D} transform="translate(12 12) scale(0.9)" /></svg>
            <span className="font-medium text-ink">There now</span>
          </span>
          <span className="flex items-center gap-2">
            <svg viewBox="0 0 24 24" className="h-3 w-3 shrink-0" fill="#ffffff" stroke={BRAND} strokeWidth="2" aria-hidden><path d={PLANE_D} transform="translate(12 12) scale(0.9)" /></svg>
            <span className="text-smoke">Heading there soon</span>
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
      <div className={`absolute bottom-3 left-3 z-10 flex-col items-start gap-2 ${overlayCls} ${travelOnlyView ? '!hidden' : ''}`}>
        {filterButtons}
      </div>

      {/* THE "TAP A PIN FOR WHO'S THERE" HINT IS GONE.
          It was a white pill in the top-right corner of every map explaining
          that pins and countries are tappable and that + and − zoom. Ethan:
          "on the top right of all the maps it says tap a pin for who's... you
          can remove this box as it's not needed and it takes away from the
          aesthetic." He is right on both counts: a pin on a map is a tappable
          pin, and the instruction was competing with the map for the one corner
          that is always visible. */}
    </div>
  )

  // FULL SCREEN IS A PAGE, NOT A BIGGER CARD.
  //
  // Portalled to the body for the same reason ui/Modal is: `position: fixed`
  // resolves against the nearest TRANSFORMED ancestor, and this component is
  // rendered inside pages that carry transforms (the hub's reveal animation,
  // the mobile chat overlay's translateY). A fixed inset-0 inside one of those
  // is not the screen, it is that box.
  if (fullscreen) {
    return createPortal(
      <div
        ref={fsRef}
        className={cx(
          'fixed inset-0 z-[70] flex flex-col bg-white',
          closing ? 'animate-map-out' : 'animate-map-in',
        )}
        // ALL FOUR INSETS, NOT TWO. Full screen on a phone means landscape, and
        // in landscape the dynamic island and the home indicator are on the
        // LEFT and RIGHT edges, not the top and bottom. Padding only the
        // vertical pair is why the + and the exit button came out clipped by
        // the notch and the corner radius: the two controls that get you back
        // were the two under the bezel.
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
            Exit full screen
          </button>

          {/* TURN THE PHONE. Shown only in portrait, and only on a screen small
              enough for it to matter. Where the orientation lock worked this is
              never seen; where it did not (every iPhone) it is the whole
              instruction, and it goes away by itself the moment it is followed. */}
          <p className="pointer-events-none absolute inset-x-0 top-16 z-30 mx-auto w-max rounded-full bg-ink/85 px-4 py-2 text-xs font-medium text-white landscape:hidden sm:hidden">
            Turn your phone sideways for the full map
          </p>

          {mapBox}
        </div>
      </div>,
      document.body,
    )
  }

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
      {/* PHONES GET THE COUNTRY UNDER THE MAP, NOT OVER IT.
          The map box is about 180px tall at 375px wide. An overlay inside it is
          a card covering the thing it describes, with the creator list squeezed
          into a scroll box two rows deep - so the one screen where this feature
          matters most (somebody planning a trip on their phone) was the one
          where it was unusable. Below the map it gets the full width of the
          page and as much height as it needs, and the country stays highlighted
          in orange above it so you can see what you tapped. */}
      {countryPanel && <div className="mt-3 sm:hidden">{countryPanel}</div>}
      {townPanel && <div className="mt-3 sm:hidden">{townPanel}</div>}
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
