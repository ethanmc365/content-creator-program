import { geoEqualEarth } from 'd3-geo'
import { thumbUrl } from '../lib/avatarUrl'
import { sameCountry } from '../lib/countryFacts'

// The creator map directory: every creator pinned on a world map at their home
// town (photo + name), the countries they live in tinted orange, and a curved
// dashed "we're all connected" line threading the whole community together with
// a little plane on the long over-water hops.
//
// Built on the same react-simple-maps + world-atlas stack as WorldMap (no API
// keys, no tile servers, CSP-clean, deep zoom). Everything derives from the
// `creators` prop, so it updates automatically as members join or move.
export const BRAND = '#d94407'

export const BRAND_LIGHT = '#f5853f'

export const LAND = '#ECECEE'

// TWO TINTS THAT HAVE TO BE TELLABLE APART.
//
// They were #f9c9a7 and #fbd9c8 - two steps of cream about four percent of
// lightness apart. On a screen, next to each other, over a grey continent, that
// is one colour with a rendering artefact. A key naming two tints nobody can
// distinguish is worse than no key, because it asserts a difference the map
// does not show.
//
// So the ladder is widened: HOME is the brand's light orange knocked back 30%
// towards white - unmistakably the Tryp orange - and EXPLORED is the same hue
// at 75% towards white. Same hue, two clearly different steps, and neither is
// the full #d94407: a whole continent at full strength stops being a highlight
// and becomes the background.
export const HOME = '#f7a069'

 // countries creators LIVE in
export const EXPLORED = '#fce1d0'

 // countries the community has FILMED in

// Every plane flies at EXACTLY the same speed. Duration = true curve length /
// speed, with NO clamping - clamping was what made short hops crawl and long
// hops race. Speed is in projection units per second.
//
// 10 -> 24. Half of that was the arrival being over before he arrived (see `seen` below) and half of it was arithmetic:
// the viewBox is 880 units across a 1440px map, so a unit is about 1.6 pixels and 10 units a second is SIXTEEN PIXELS A
// SECOND. A transatlantic hop took 33 seconds. Watch that for two seconds - which is what anybody scrolling past does -
// and the aircraft has moved 32px, which is indistinguishable from stopped. At 24 the same hop is 14 seconds and the
// movement reads as flight without turning the map into a screensaver.
export const PLANE_SPEED = 24

// SPEED IS A SCREEN SPEED, SO THE LENGTH HAS TO BE A SCREEN LENGTH.
//
// Every length in this file comes out of `projection(...)`, which is the map at
// zoom 1. `ZoomableGroup` then applies `scale(zoom)` to the whole group, so at
// the zoom a single-country market opens at - measured: Romania fits at 22,
// because all six of its creators are within half a degree of Bucharest - a
// path that is two projection units long is FORTY-FOUR units long on the
// screen. The duration was computed from the two, so the aircraft crossed a
// visible gap in under a tenth of a second. Twenty-two times too fast, and the
// "really fast" is arithmetic rather than easing.
//
// The world map is unaffected by the correction, which is the tell that it is
// the right one: with creators from -121 to +116 longitude it fits at zoom
// 1.01, so a screen unit and a projection unit have been the same thing
// everywhere this constant has ever been looked at.
export const flightDur = (screenLen) => screenLen / PLANE_SPEED

// Arc length of the quadratic curve we draw (M a Q c b), sampled. Using the
// straight-line chord instead would make curved (bulged) routes run fast, so we
// measure the path the plane actually flies.
export function quadLength(ax, ay, cx, cy, bx, by, steps = 24) {
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
//
// ON SCREEN, NOT IN PROJECTION UNITS, for the reason above.
//
// Measured in projection units this threshold could never express that: six
// creators around Bucharest are one or two units apart, which is under 90 - so
// `long` came out EMPTY, the "fly one anyway" fallback below handed the pool
// every short hop in the market, and the map drew seven aircraft sprinting
// between adjacent suburbs. Measured on screen the same six are 22 to 44 units
// apart and get no plane at all, while Porto to Chambéry - the Portuguese
// market's creator who lives in France - is about five hundred and gets one at
// twenty seconds, which is the world map's own pace.
//
// The number is unchanged because the world map fits at zoom 1.01: this is the
// same rule it has always followed, finally applied in the units it was written
// in.
export const MIN_PLANE_LEN = 90

 // SCREEN units; shorter hops get the line but no plane
export const MAX_PLANES = 7

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
//    count - but the team's verdict was the one that matters: the faces sit on top
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
export const PLANE_D = 'M0 -11 C1.1 -11 1.8 -9 1.8 -6.2 L1.8 -4.4 L10 1 L10 3.1 L1.8 -0.2 L1.8 5 L4.4 7.6 L4.4 9.2 L0 7.7 L-4.4 9.2 L-4.4 7.6 L-1.8 5 L-1.8 -0.2 L-10 3.1 L-10 1 L-1.8 -4.4 L-1.8 -6.2 C-1.8 -9 -1.1 -11 0 -11 Z'

// The map frame + projection. These MUST match the <ComposableMap> props below
// so our hand-drawn connection lines line up exactly with the pins/geography.
export const WIDTH = 880

export const HEIGHT = 480

export const projection = geoEqualEarth()
  .translate([WIDTH / 2, HEIGHT / 2])
  .center([12, 8])
  .scale(160)

export function townKey(lat, lng) {
  return `${lat.toFixed(3)},${lng.toFixed(3)}`
}

export function initials(name = '') {
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
export const countryNameMatches = sameCountry

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
export const seenScore = (c) => {
  const t = c.last_seen_at ? new Date(c.last_seen_at).getTime() : 0
  if (!t) return 0
  const days = (Date.now() - t) / 86400000
  if (days < 1) return 5
  if (days < 7) return 4
  if (days < 30) return 3
  if (days < 90) return 2
  return 1
}

export function byPinPriority(a, b) {
  const photo = (!!b.photo_url) - (!!a.photo_url)
  if (photo) return photo
  const seen = seenScore(b) - seenScore(a)
  if (seen) return seen
  const filled = ((b.countries_visited?.length || b.countries || 0) + (b.bio ? 2 : 0))
    - ((a.countries_visited?.length || a.countries || 0) + (a.bio ? 2 : 0))
  if (filled) return filled
  return (a.name || '').localeCompare(b.name || '')
}

// CAN THIS ENGINE PUT AN ELEMENT ON A PATH WITHOUT SMIL?
//
// Chrome 55+, Safari 16+, Firefox 72+. Everything this programme's creators
// use, and the check costs one call at module load - but it is here so that
// anything older keeps the `<animateMotion>` it has always had rather than
// getting a row of aircraft parked at the origin.
export const CAN_MOTION_PATH = typeof CSS !== 'undefined'
  && typeof CSS.supports === 'function'
  && CSS.supports('offset-path', 'path("M 0 0 L 1 1")')

// THE LADDER IS CAPPED, AND THE CAP IS THE POINT.
//
// The threads arrive one after another so the connections read as reaching
// across the map rather than switching on together. Uncapped that is a bug
// waiting for a busy day: forty threads at 55ms each is a two-second entrance,
// which is the exact fault the per-pin ladder was removed for. Eight steps is
// under half a second whether there are nine threads or nine hundred.
export const THREAD_STEPS = 8

export const threadStep = (i) => ({ '--thread-i': i % THREAD_STEPS })

// The map, drawn but not yet shown, for the two frames between the commit that
// builds it and the frame the entrance starts on. Module scope: a fresh object
// per render would be a new style prop on the biggest group on the page.
export const HELD = { opacity: 0 }

// How far ahead a planned trip is worth putting on the map.
//
// Three months. Long enough to plan around - the whole point of showing
// upcoming trips at all is so two creators can find each other before one of
// them books - and short enough that the map is not carrying somebody's
// Christmas flight through the summer. Trips further out still live on the
// collab board, which is a list and can afford to be exhaustive.
export const TRIP_HORIZON_DAYS = 90

// AND STABLE DEFAULTS FOR THE COLLECTION PROPS, FOR THE SAME REASON ONE LINE UP
// - except that getting this wrong did not cost a re-parse, it froze the app.
//
// THE BUG.
//
// `trips = {}` in the parameter list is a fresh object on EVERY render, and
// MarketMap is the one caller that does not pass `trips` - the market page has
// no travel layer. That new identity walked the whole memo chain that hangs off
// it: `storedTripCoords` -> `journeys` -> `fitPoints` -> `fitView`, each of
// which had a correct dependency array and each of which therefore recomputed
// and handed on a NEW object. At the end of that chain sits the auto-fit effect,
// which depends on `fitView` and calls `setPosition(fitView)` - a new object, so
// never an equal state, so always another render, which made another `{}`, which
// made another `fitView`. React gave up at fifty nested updates with "Maximum
// update depth exceeded" and tore the route down: a blank market page, and a
// main thread busy enough that the header and the tab bar stopped answering.
// That is the whole reported "you are stuck there".
//
// Every other caller (the hub, the directory, the collab board, the landing
// page) passes a real `trips` from state, which is why this only ever showed up
// on market pages.
export const NO_TRIPS = {}

export const NO_CREATORS = []

// Behind the slow-signal gate (components/SlowMapGate).
// THE PIN PHOTOS START DOWNLOADING WITH THE LIST, NOT WITH THE PINS. The pins wait for the atlas, and only then did
// their <image> elements ask for the photos - so every pin showed initials for a beat. Warming the same 64px thumbnails
// into the browser cache the moment the creators arrive means most are already there when the pins draw.
export const warmed = new Set()

export function warmPinPhotos(list) {
  if (typeof Image === 'undefined') return
  for (const c of list || []) {
    const url = c?.photo_url && thumbUrl(c.photo_url, 64)
    if (!url || warmed.has(url)) continue
    warmed.add(url)
    const img = new Image()
    img.decoding = 'async'
    img.src = url
  }
}
