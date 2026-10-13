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

// The pin grouping lives in lib/pinCluster.js: single-linkage clustering over
// the towns' projected points, BOUNDED BY COUNTRY, with the reach and the
// half-octave regroup step. It is pure arithmetic and rehearsed there, because
// the fault it was carrying (the whole of Europe as one pin on the UK) was
// invisible from in here.

function CreatorMap({ creators = NO_CREATORS, trips = NO_TRIPS, highlightIds = null, nearMe = false, nearCount = 0, nearMeDisabled = false, onToggleNearMe = null, travelActive = null, onToggleTravel = null, onTravellersChange = null, onCreatorClick = null, connectionsActive = null, onToggleConnections = null, connectionIds = null, travelOnlyView = false, myId = null, maxFitZoom = 6, controls = true,
  // FULL SCREEN IS NOT ONE OF "THE CONTROLS".
  //
  // `controls={false}` was doing two unrelated jobs: dropping the filter pills
  // (right, for an embedded market map - "creators near me" on a map that is
  // already one country is a filter with nothing to filter) and, incidentally,
  // dropping the full-screen button with them. So every market page had a map
  // you could not open. Ethan: "market pages have no full-screen map button -
  // add for every market." Wanting to see a small map bigger has nothing to do
  // with whether it has filters, so it is its own prop, defaulting to the old
  // behaviour for every caller that does not care.
  allowFullscreen = controls,
  // CAN THIS MAP BE MOVED ABOUT WHERE IT SITS?
  //
  // Ethan: "seems to be no ability to move about or zoom in or out on the map,
  // this functionality should be there too."
  //
  // Off by default, because the maps that sit in the middle of a long page (the
  // landing page, the profile) are the ones the scroll-trap rule was written
  // for and nothing about them should change. On a market map - a boxed card
  // that is the point of the page it is on - it turns on drag-to-pan and draws
  // the +/-/reset stack outside full screen. The WHEEL stays the page's on
  // every map, navigable or not: see `filterZoomEvent`.
  navigable = false,
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
  // the button in `renderFilterButtons`.
  exploredCountries = null, exploredActive = null, onToggleExplored = null,
  // A KEY, IN THE CORNER OF THE MAP THAT IS ACTUALLY EMPTY.
  //
  // Ethan, on the landing page: "in Tryp.com orange we could have the countries
  // that everyone lives in, and then in the lighter orange it could be for all
  // the countries we've travelled to. And maybe a little key on the bottom left
  // to show that."
  //
  // Two tints that mean two different things need saying, and a sentence above
  // the map is not where anybody looks when they are already looking at the
  // map. It is drawn INSIDE the card rather than by the caller so it cannot
  // drift out of step with the fills it names - and bottom-LEFT because the
  // zoom stack, the full-screen button and the tooltip all live on the right
  // and along the top.
  legend = false,
  // THE MAP AS PART OF THE PAGE, NOT AS AN OBJECT ON IT.
  //
  // Ethan, 9 Sep 2026, about the landing page: "expand the Meet the Community
  // map and change the background colour, so that rather than it looking like
  // it's a map just floating in the middle, it looks like it's actually part of
  // the screen. And obviously it's interactive - that same square will be
  // there, but it's white and you'll not even notice it."
  //
  // The card is what makes it float: a grey hairline, a 20px radius and
  // `bg-cloud/60` for the sea, which together say "here is a component". On a
  // page whose whole design is white space that reads as a widget dropped into
  // an article. `flush` removes all three, so the sea becomes whatever the
  // section behind it is painted and the continents sit directly on the page.
  //
  // It is a PRESENTATION change only. The svg, the pins, d3-zoom, the pinch
  // handling and every control are identical - it is exactly as interactive as
  // the framed version, which is the half of the request that was already true
  // and needed to stay true.
  //
  // Ignored in full screen, where the map owns the window and there is no card
  // to remove.
  flush = false }) {

  const tr = useT()
  const dark = useIsDark()
  // Dark-mode map palette: deep land on near-black sea, so the light-grey map
  // doesn't glare. Home countries keep a muted warm tint.
  const LAND_FILL = dark ? '#2a2c31' : LAND
  // A DESATURATED BROWN IS NOT THE BRAND. The old dark-mode home tint was
  // #5c3a1f, which is what you get by darkening orange: it reads as mud. Using
  // the brand orange itself at partial alpha over the near-black sea keeps the
  // hue and lets the darkness come from the background rather than from the
  // colour, so a tinted country still looks orange.
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
  // THE ARRIVAL PLAYS WHEN THE MAP IS SEEN, NOT WHEN THE ATLAS LOADS
  // (10 Sep 2026).
  //
  // Ethan, on the landing page: "I scrolled on and it shows the community map
  // and it's just frozen... occasionally, if I refresh and scroll down quickly,
  // it'll actually show the animation where the icons drop in nice and the
  // planes are immediately going."
  //
  // That is the whole bug in one sentence, and the word that gives it away is
  // "quickly". The arrival started on `painted` - which is when the TopoJSON
  // finishes parsing, on page load, with the map a thousand pixels below the
  // fold. Land, threads and pins were therefore all over within about a second
  // of the page arriving, and what a reader who scrolled at a normal speed met
  // was the finished picture. Racing it was the only way to see it.
  //
  // So the arrival now needs BOTH: the atlas drawn AND the map on screen.
  //
  // THE HEAD START IS DELIBERATELY TINY, which is the opposite of the rule for
  // every other reveal on this page. A card is 24px of travel and wants to have
  // FINISHED as it lands, so it starts a thumb-flick early. This is a
  // 1.1-second sequence that is the whole point of the section, and Ethan asked
  // for it "exactly as I scrolled on, not the delay" - so it has to start as
  // the map comes up, not before. Measured: 25% was 225px on a 900px window and
  // the map's top sits 1064px down, so the observer fired AT SCROLL ZERO and
  // reintroduced the exact bug it was added to fix. 6% is 54px.
  //
  // THE NET IS NOT OPTIONAL, because `HELD` keeps this map at opacity 0 until
  // the arrival begins: no IntersectionObserver at all (an old browser, an
  // in-app webview that stubs it) means `seen` starts true, and an observer
  // that exists but never delivers is caught by the timer. This app's audience
  // arrives through Instagram and TikTok webviews and both failure modes are
  // real there.
  //
  // AND THE NET ASKS "IS THE OBSERVER WORKING", NOT "HAS IT BEEN A WHILE".
  // The first version was a flat 4s and it quietly undid the whole change: a
  // reader who spends five seconds on the hero - which is everybody - had the
  // arrival played to an empty screen before they ever scrolled, which is the
  // bug this is here to fix wearing a timer. A live observer delivers an entry
  // for an observed element on the next frame WHETHER OR NOT it intersects, so
  // "nothing has been delivered at all after a second and a half" is the honest
  // test for a broken one, and it never fires on a browser that works.
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

  // THE ATLAS IS 614KB OF TOPOJSON AND PARSING IT IS A LONG TASK (10 Sep 2026).
  //
  // Ethan, about the phone: "sometimes I don't see the Create Earn Travel
  // animation - after I refresh they just appear. It takes so long to load,
  // it's like I missed the animation."
  //
  // The entrance was released at the right moment; what was eating it was this.
  // `feature()` over 240 countries is a single synchronous block of a few
  // hundred milliseconds on a phone, and this effect fires on MOUNT - which on
  // the landing page is while the hero is animating, a thousand pixels above a
  // map nobody will reach for several seconds. One long task dropped in the
  // middle of a 520ms entrance does not slow it down, it removes most of it.
  //
  // So on a map that is not on screen yet the load waits a beat, and `seen`
  // cancels the wait the moment the reader heads towards it. A map that is
  // already in view (the creator directory, a market page) starts immediately,
  // because `seen` is true on its first effect. `loadMapFeatures` is one shared
  // promise for the session, so the re-run when `seen` flips joins the flight
  // rather than starting a second one.
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
    // AND A TIMER, BECAUSE THE MAP IS HELD AT OPACITY 0 UNTIL THIS FLIPS.
    // requestAnimationFrame does not run in a background tab, so a creator who
    // opens /creators in a new tab and reads something else first would come
    // back to a blank card if this were the only path to `painted`. The frames
    // are the fast path; the timer is the promise that it happens at all.
    const safety = setTimeout(() => setPainted(true), 400)
    return () => {
      cancelAnimationFrame(outer)
      cancelAnimationFrame(inner)
      clearTimeout(safety)
    }
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
  // state. The longest step is now the pins, at 300ms + 700ms, and the aircraft
  // finish at 520ms + 300ms - so 1100ms covers the whole sequence with a frame
  // to spare. (It was 1400ms while the aircraft were held for a second; see
  // `.map-plane-in` in index.css for why they no longer are.)

  const [arrived, setArrived] = useState(false)
  useEffect(() => {
    // Off `painted && seen`, not `features`: the clock has to start when the
    // animation does, or the two frames it waits come out of the end of the
    // sequence.
    if (!painted || !seen || arrived) return undefined
    const t = setTimeout(() => setArrived(true), 1100)
    return () => clearTimeout(t)
  }, [painted, seen, arrived])

  // THE ONE FLAG EVERY ARRIVAL CLASS IS OFF, and it has to be one flag rather
  // than `!arrived` per element. A CSS animation's clock starts the moment its
  // class lands, so if the pins were classed on the commit that draws the world
  // and the land were classed two frames later, the pins would be two frames
  // (or, on the slow commit this is guarding against, a hundred and fifty
  // milliseconds) further through their sequence than the land beneath them.
  // Everything is classed together or nothing is.
  const entering = painted && seen && !arrived

  // AND THE AIRCRAFT ARE PUT BACK TO THE START OF THEIR PATHS - ON AN OLD
  // ENGINE. Everything current animates them with a CSS motion path that is
  // simply held paused at frame zero until `flying` (see `FlyingPlane`), which
  // needs no rewinding because it never started. This is the fallback's version
  // of the same idea, and it is kept for exactly that: `setCurrentTime` cannot
  // start a time container that has not started, which is why it was not enough
  // on its own.
  //
  // The flights are SMIL (`<animateMotion>`), which runs on the SVG's own
  // timeline rather than on any clock React can see - and that timeline has
  // been running since the element existed, which by now is however long the
  // reader spent above the fold. So without this, the arrival's aircraft lift
  // in wherever they happen to be, mid-ocean, often two of them on top of each
  // other. Rewinding to zero at the moment the entrance starts puts every
  // aircraft on the first frame of its own route, which is what makes them read
  // as taking off with everything else.
  //
  // `unpauseAnimations` first: Chrome suspends a time container whose SVG has
  // not been painted, and this map spends its whole life so far off screen.
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
  // HAS THE READER TAKEN THE CAMERA? Set the moment d3-zoom accepts a gesture
  // (see `filterZoomEvent`), cleared by the reset button. It is what stops the
  // auto-fit from pulling the view back out from under somebody who has just
  // dragged to look at something. See the fit effect below for why the fit has
  // to keep running until then rather than firing once.
  const userMoved = useRef(false)

  // ---------------------------------------------------------------------
  // SCROLL TO ZOOM, WITHOUT THE MAP EATING THE PAGE (18 Sep 2026).
  //
  // Ethan: "for the desktop worldwide page, I seem to be unable to scroll to
  // zoom in on the creator network map, only on full screen, please fix this."
  //
  // The rule this replaces was right about the thing it was written for and
  // too broad by one case. The original report - "you reach the map, it starts
  // scrolling the map, and then there's literally no way past it" - is a
  // WHEEL-OVER-A-MOVING-PAGE problem: a reader flicking down the hub crosses
  // the map, d3-zoom claims the wheel mid-flick, and the page stops dead under
  // somebody who never asked to use a control. Refusing the wheel outright
  // fixed that and took scroll-to-zoom with it, which is the report above.
  //
  // What separates the two is not the gesture, it is whether the page was
  // already moving. So:
  //
  //   A WHEEL THAT ARRIVES WHILE THE PAGE IS SCROLLING BELONGS TO THE PAGE.
  //   `scrolledAt` is stamped by a passive window listener, and for a quarter
  //   of a second after any page movement the map will not take a wheel at all.
  //   That is the whole of the original bug: you cannot be trapped by a
  //   control that refuses to engage while you are moving.
  //
  //   AT EITHER LIMIT THE WHEEL STOPS; IT DOES NOT FALL THROUGH TO THE PAGE
  //   (21 Sep 2026). It used to be handed back, as "the way out". Ethan: "if
  //   I'm zooming in a lot and then I zoom out, once it reaches the full zoom
  //   out, it should just stop. Instead, it starts scrolling the page down...
  //   If I'm scrolling on the map, it should just be related to the map." A
  //   wheel the map owns is swallowed by the box's own listener even when
  //   there is no zoom left to do. The way past the map is the rule above: a
  //   page already moving never hands its wheel to the map.
  //
  //   ONCE A ZOOM IS RUNNING IT KEEPS THE WHEEL for 400ms of quiet, so a
  //   trackpad's stream of small deltas is one gesture rather than forty
  //   separate decisions.
  //
  // Full screen is untouched: there the map IS the page and everything works.
  // A phone never reaches any of this - there is no wheel, one finger scrolls
  // and two pinch, exactly as before.
  const scrolledAt = useRef(0)
  const wheelAt = useRef(0)
  // WHERE THE PAGE WAS WHEN THIS MAP LAST SAW A WHEEL.
  //
  // The listener below is the primary signal and the offset is the backstop,
  // because a scroll EVENT is dispatched by the rendering pipeline and a page
  // that is not being painted (a background tab, an embedded pane) moves
  // without ever emitting one. Two readings of the same fact, and the map only
  // takes the wheel when both of them say the page is still.
  //
  // IT IS KEPT CURRENT BY THE LISTENER TOO (21 Sep 2026). It used to be written
  // only by the gate, so the FIRST wheel over the map always found it stale
  // (0 against a page scrolled to the map), read that as "the page moved",
  // and handed the wheel to the page - which scrolled, stamping `scrolledAt`,
  // which refused the next wheel, which scrolled the page again. Once started
  // it never let go. Ethan: "unless I'm hovering over a country, I seem to be
  // unable to zoom in... if I scroll in anywhere there, then it should zoom
  // into the map."
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
    // ONE WRITE PER BEAT, NOT ONE PER LOOKUP (28 Sep 2026). Each answer used to
    // set state on its own, and every one of those rebuilt `located`, which
    // re-ran the country sweep below. That sweep was a second and a quarter of
    // frozen main thread before it was rewritten, so a handful of slow lookups
    // dropped a handful of freezes into whatever the reader was doing - which,
    // as Ethan found, is usually zooming. The sweep is cheap now and this is no
    // longer the difference between working and not; it is still fewer renders
    // for the same pins, and the pins still fill in as the answers arrive
    // rather than all at the end.
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
  // THE TRIP CARRIES ITS OWN COORDINATES NOW (migration 177, 2 Sep 2026).
  //
  // This used to geocode every trip on the board, in the browser, at render
  // time, in a `for` loop with an `await` in it - and cache the answers in that
  // browser's localStorage and nowhere else. So every new browser, every
  // private window and every new team member paid the whole bill again.
  //
  // Measured on production on a clean browser: 89 requests to load the hub, of
  // which 22 were geocode calls, totalling 23.1 SECONDS. Ethan: "it takes a
  // while to load", and worse than that on a slower line, because the profile
  // fetch is competing with two dozen serial lookups for the same connection
  // and the app signs you out if it loses three times.
  //
  // `collab_posts.city_lat/lng` are resolved once, server side, for everybody.
  // The geocoder is still here for a row that somehow has none - a brand new
  // trip posted before the backfill runs again - so the map degrades to slow
  // rather than to blank, but on today's data it makes ZERO calls.
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
        // `in`, NOT a truthiness test (26 Sep 2026). A miss is stored as
        // `null` precisely so it is never asked again - and `!null` is true,
        // so it was asked again, stored as `null` in a NEW object, which re-ran
        // this effect, for ever. That loop re-rendered the Creator Network page
        // ~28 times a second while it sat there idle, and those urgent renders
        // starved every navigation away from it: Ethan's "I try to click on
        // Worldwide, Rooms, Challenges, or Calendar, and none of those buttons
        // work ... Whenever I refresh, it actually ends up going to the page".
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
    for (const t of map.values()) {
      t.creators.sort(byPinPriority)
      // WHICH COUNTRY THIS TOWN IS IN, which is what bounds the pin grouping
      // (see clusterMerges). Taken from the creators standing on it - a town is
      // keyed by its rounded coordinates, so they are all in the same place -
      // and normalised through the app's one alias table, so "England" and
      // "United Kingdom" are the same country here as everywhere else.
      //
      // A TOWN WHOSE CREATORS TYPED NO COUNTRY GETS ITS OWN KEY, not a shared
      // "unknown" bucket: lumping the unknowns together would merge a pin in
      // Chile with a pin in Japan, which is the bug this bounding exists to
      // stop. It leaves those towns as single pins, which is the safe way to be
      // wrong.
      const named = t.creators.find((c) => c.country && countryKey(c.country))
      t.country = named ? countryKey(named.country) : `?${t.key}`
    }
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

  // Tint the countries creators actually live in. Point-in-polygon against the
  // map's own geometry, so it's name-agnostic and always correct.
  //
  // THE ARITHMETIC MOVED OUT (28 Sep 2026), because it was the map's freeze.
  // It ran every country against every creator - 240 x 158 full polygon streams
  // - and `some` only short-circuits on a hit, so the two hundred countries
  // nobody lives in ran all 158 tests each. Measured on the production build:
  // 1,240ms of main thread, twice, in the middle of a zoom. `lib/homeCountries`
  // rejects on a bounding box first and stops at the country that contains the
  // point; see its header for the numbers and eleven rehearsals.
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
          // The PROJECTION length only. The duration is a screen measurement
          // and therefore depends on the zoom, which this memo deliberately
          // does not: see `planeZoom`, where it is applied at render. Putting
          // the zoom in here would give `journeys` a new identity on every
          // gesture, and `journeys` feeds the camera fit.
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
  // SVG has no z-index: whatever is drawn LAST sits on top. Two rules:
  //  1. Draw north-to-south, so a southern pin's body naturally overlaps its
  //     northern neighbour rather than being sliced by it.
  //  2. Float the SELECTED pin to the very end, so tapping a pin always brings
  //     it fully to the front instead of leaving it buried behind others.
  //     Deselecting restores the normal order.
  // PINS THAT WOULD OVERLAP BECOME ONE PIN (26 Sep 2026).
  //
  // Ethan: "For some of the pins, they're all overlapping ... if there are too
  // many close together that are unclickable, they should be grouped.
  // Currently, for some of them, I can just barely see the corner of them."
  // Towns were only merged when two creators typed the SAME town, so Lisbon,
  // Amadora and Sintra were three pins stacked on one spot. Now any towns
  // whose pins would touch AT THE CURRENT ZOOM merge into one, carrying the
  // count; zooming in pulls them apart again. Worked in the map's own units,
  // where a pin's head is ~30 wide and is counter-scaled by zoom^-0.7 (see
  // Pin), and on the SETTLED zoom so a pinch does not re-cluster every frame.
  //
  // AND IT FOLLOWS THE ZOOM AS IT HAPPENS (28 Sep 2026). Ethan: "there is a
  // real delay between me scrolling in and scrolling out ... the pins should
  // separate a bit, but they don't ... slightly delayed." This read the SETTLED
  // zoom, which only moves when the gesture ends. It reads the live one now,
  // rounded to quarter-octave steps (about 19% of zoom each), so pins split
  // and merge while you scroll without re-grouping on every frame.
  //
  // AND IT IS CALM (28 Sep 2026, evening). Ethan: "whenever zooming in and out
  // ... this seems to be happening rapidly so many times ... everything's
  // flying all over." Measured: ONE press of the zoom button fired 16 to 64 pin
  // animations. Two causes, both fixed here:
  //   1. The grouping was GREEDY ("join the first group within reach"), so at
  //      each new zoom step the groups were rebuilt from scratch and pins
  //      swapped between them wholesale. It is a HIERARCHY now (single
  //      linkage, built once per set of towns - see clusterMerges): zooming in
  //      only ever SPLITS a group and zooming out only ever MERGES two, the
  //      fewest pins that can move, and no two pins are left overlapping.
  //   2. It regrouped at every quarter-octave of a live gesture. The steps are
  //      half-octaves now, and taken from the zoom once it has paused for a
  //      beat (`settledCluster`), so a scroll is one regroup, not five.
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
  // THE REGROUP FOLLOWS THE GESTURE CLOSELY (28 Sep 2026, later). Ethan:
  // "whenever I zoom in, they start to spread out a bit, and the animation is
  // quite delayed, which I don't really like. The animation should be much
  // smoother and much quicker."
  //
  // This waited 160ms after the zoom stopped changing before regrouping, ON TOP
  // of a 420ms fly - so the pins started moving well over a fifth of a second
  // after the reader's finger did, which reads as the map lagging behind them.
  // The half-octave step is already coarse enough to stop a pinch thrashing
  // (one regroup per 41% of zoom), so the wait only has to swallow the frames
  // WITHIN a single wheel tick or pinch, not the gesture. 60ms does that and is
  // under the ~100ms that reads as instant.
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

  // Thread the pins into one flowing path (nearest-neighbour from the westmost),
  // so the dashed connection line visits everyone once.
  //
  // IT THREADS THE PINS THAT ARE ACTUALLY THERE (28 Sep 2026, later). This ran
  // over the raw `towns`, which is every town before grouping, so the threads
  // stayed where the ungrouped towns were while the pins merged away from them.
  // Ethan, on the public programme page: "it shows the dotted lines everywhere,
  // even though when the creators are grouped there are actually no curves there
  // any more. It still shows those dotted lines all connected."
  //
  // Threading `clusteredTowns` instead means a line can only ever run between
  // two pins a reader can see, at every zoom, and the web re-threads as pins
  // merge and split. It costs a rebuild per regroup, which is the same event
  // the pins are already animating on.
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

  // PINS MOVE WHEN THEY SPLIT AND MERGE (28 Sep 2026). Ethan: "I would like
  // some animations for this rather than just flashing, appearing, and
  // disappearing ... like them merging together." Each time the grouping
  // changes, this compares it with the last one: a pin that came out of a
  // group starts where the group was and flies to its own place; a group that
  // formed pops in while the pins it swallowed fly into it and fade. Worked out
  // during render from the previous layout held in state (React's documented
  // "adjust state when a prop changes" pattern), so the first frame of the new
  // grouping is already the first frame of the animation.
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

  // THE ZOOM EVERY FLIGHT TIME IS MEASURED AT.
  //
  // Every path in this file is drawn in projection units and then scaled by
  // `ZoomableGroup`, so a screen length is a projection length times the zoom.
  // The SETTLED zoom, never the live one: re-timing a plane on every frame of a
  // pinch restarts its animation sixty times a second, which is the cost the
  // tracking-loop note elsewhere in this file is about. Once per finished
  // gesture is the right granularity, and it is a moment the view is already
  // changing under the reader anyway.
  // THE FITTED ZOOM, NOT THE CURRENT ONE (28 Sep 2026, evening). Ethan: "the
  // aeroplane animations ... keep lagging, freezing, and going again." One of
  // the causes was here: re-timing every flight at the end of every zoom
  // changes each plane's animation-duration, and a running animation whose
  // duration changes jumps to a new point on its path - so every scroll ended
  // with the whole fleet lurching. The fitted zoom only changes when the
  // community on the map changes, so the planes keep their clocks through any
  // amount of zooming (they simply look a little faster zoomed in, as a real
  // one would from closer).
  const planeZoom = Math.max(1, fitView.zoom || 1)

  // Which threads actually carry a plane: the longest ones, capped, so short
  // hops in dense areas don't turn into a swarm. Every thread is still drawn.
  //
  // BOTH THE THRESHOLD AND THE DURATION ARE IN SCREEN UNITS, so a market map
  // zoomed to 22 and a world map at 1.01 fly at the same visible speed and
  // apply the same "is this hop worth an aircraft" rule. See MIN_PLANE_LEN.
  //
  // It reads the SETTLED zoom, not the live one: re-timing the planes on every
  // frame of a pinch would restart the animation sixty times a second, which is
  // the cost the tracking-loop note elsewhere in this file warns about. Once
  // per finished gesture is the right granularity.
  const planeSegments = useMemo(() => {
    const scaled = segments.map((s) => {
      const screen = s.curve * planeZoom
      return { ...s, screen, dur: flightDur(screen) }
    })
    const long = scaled.filter((s) => s.screen >= MIN_PLANE_LEN)
    // Nothing long enough? Fly ONE anyway, so the "we're all connected" idea
    // still reads for a community that is merely clustered - but only if the
    // longest hop is within reach of the threshold. A market whose creators all
    // live in one city gets NO aircraft, which is what Ethan asked for and what
    // the old fallback made impossible: with every hop below the bar, `long`
    // was empty and the pool became the whole list.
    const pool = long.length
      ? long
      : scaled.filter((s) => s.screen >= MIN_PLANE_LEN * 0.5)
    return [...pool].sort((a, b) => b.screen - a.screen).slice(0, MAX_PLANES)
  }, [segments, planeZoom])

  // FIT TO EVERYONE - AND KEEP FITTING UNTIL SOMEBODY TAKES THE CAMERA.
  //
  // Ethan: "it shouldn't be completely zoomed into the country if it's cutting
  // a creator out that's elsewhere. It should be zoomed in depending on where
  // the creators are based - if every creator's pin was in Romania then yes
  // zoom in further there."
  //
  // THE FIT WAS RIGHT AND IT RAN TOO EARLY. This was a once-only effect keyed on
  // `located.length === 0`, so it fired on the first frame that had ANY pin and
  // then refused to run again. But a creator whose town has no stored
  // coordinates is geocoded in the browser, asynchronously, and joins `located`
  // seconds later - by which time the camera had been committed and could not
  // be corrected.
  //
  // That is not hypothetical, it is two of the three small markets. Germany has
  // Munich and Amberg stored and BERLIN geocoded late: the map fitted the two
  // southern pins at zoom 22 and Berlin was off the top of it. Portugal has four
  // Portuguese towns stored and Esménia, who lives in Chambéry in FRANCE,
  // geocoded late: fitted to Portugal, she was off the right-hand edge entirely.
  // Exactly the creator "elsewhere" being cut out.
  //
  // So the rule is ownership rather than timing: the camera belongs to the map
  // until the reader moves it, and to the reader from then on. `userMoved` is
  // set by `filterZoomEvent` - the moment d3-zoom ACCEPTS a gesture - and
  // cleared by the reset button, which is what "reset" should mean. Romania,
  // whose six creators really are all within half a degree of Bucharest, keeps
  // zooming right in, because that is what fitting them says to do.
  //
  // AND IT COMPARES THE FIT BY VALUE BEFORE IT APPLIES IT.
  //
  // An effect that ends in `setState(someObject)` re-renders unconditionally,
  // because no two object literals are ever `Object.is`-equal - so if anything
  // upstream ever hands `fitView` a new identity on every render, this effect is
  // an infinite loop rather than a no-op. That is exactly what the `trips = {}`
  // default did (see NO_TRIPS in CreatorMapParts.jsx), and fixing the default
  // fixes today's cause without doing anything about the shape that turned a
  // wasted memo into a frozen app. A fit that has not MOVED is not a fit worth
  // committing, whatever its identity: the guard makes re-running this effect
  // harmless, so the next accidental dependency churn costs a comparison
  // instead of the route.
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
  const handleMove = useCallback((pos) => { zoomRef.current = pos.zoom; setLiveZoom(pos.zoom) }, [])
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
  useEffect(() => { zoomRef.current = position.zoom; setLiveZoom(position.zoom) }, [position.zoom])

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
  const resetView = () => {
    // Reset hands the camera back: the map resumes re-framing itself as late
    // pins arrive, which is what somebody pressing "reset" is asking for.
    userMoved.current = false
    setPosition(fitView)
    setLiveZoom(fitView.zoom)
  }

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
    `inline-flex w-52 items-center justify-start gap-2 rounded-full px-3.5 py-2 text-xs font-semibold shadow-card backdrop-blur transition-all hover:scale-[1.03] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 ${
      on ? 'bg-brand text-white ring-1 ring-brand' : 'bg-white/95 text-ink ring-1 ring-black/5'
    }`

  // WHY THIS IS A FUNCTION AND NOT A VALUE.
  //
  // The same set of filters renders in two places: overlaid on the map (desktop
  // card, and full screen on any device) and as a wrapping row underneath it on
  // a phone. "On the move" is wanted in the first and not the second - on a
  // phone the row sits under an already-tall map and pushes the rest of the hub
  // down, and the journeys view is a thing you go full screen to read anyway.
  // So the caller says which variant it wants rather than the button guessing.
  // `compact` (12 Oct 2026) is the phone row: Ethan, "this takes up a lot of
  // space... put them all in one line... just say Connections, Near Me, and
  // Travelled". Three equal cells, icon over a one-word label, no counts.
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
  // WHERE THE PAGE WAS WHEN FULL SCREEN OPENED (9 Sep 2026).
  //
  // Ethan: "when exiting full screen it doesn't bring you back to exactly where
  // on the page, it brings you back to the top. Just fix that - it should bring
  // you to where you were."
  //
  // Opening full screen locks the document (`overlay-lock`, which is
  // `position: fixed` on the html element) and closing it unlocks - and a
  // document that becomes `fixed` and then static again has forgotten its
  // offset, so the browser lands it at zero. Same family as the modal scroll
  // lock in lib/scrollLock, and the same fix: remember the number and put it
  // back, INSTANTLY. `behavior: 'instant'` is load-bearing here, not tidiness -
  // `scroll-behavior: smooth` is set platform-wide, so a plain `scrollTo` would
  // animate a thousand pixels up the page from a document that stopped being
  // fixed one line earlier, and the animation loses to the relayout.
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
    // The page behind must not scroll while a full-window overlay is up.
    // NO JUMP ON THE WAY OUT (1 Oct 2026). Ethan: "whenever exiting full screen
    // on the map, there's a bit of lag ... I think that's where the screen's
    // scrolling down." It was `overlay-lock` (overflow hidden, height 100% on
    // the document), which scrolls the page to the top behind the map; leaving
    // drew one frame at the top and then scrolled back down a frame later. The
    // shared scroll lock holds the page where it is (fixed, offset kept) and
    // puts the scroll back in the same moment it lets go.
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
  // IT IS CENTRED NOW, NOT WEDGED INTO THE BOTTOM-LEFT CORNER (9 Sep 2026).
  //
  // Ethan, on the desktop landing page: "whenever you click on a country or a
  // person, the pop up showing the country info or the person is on the left,
  // it's really in the corner. I think it should be centered and actually show
  // up in the very center, like a pop up card in the middle."
  //
  // It was `items-start justify-end` - bottom-left - which was the right answer
  // while the map was a 72rem card with filter pills along its foot. The map is
  // now full-bleed and nearly two thousand pixels wide, so the same corner is
  // no longer "beside the map", it is a long way from wherever you clicked and
  // half off the edge of a wide screen.
  //
  // The `top-14` floor stays, and the reason it was added has not gone away
  // even though the black name pill it was dodging has: `bottom-3 + top-14` is
  // the DEFINITE box the card needs in order to be allowed to shrink inside it
  // (a percentage max-height against an auto-height parent silently applies no
  // limit at all, and this card scrolls).
  const panelFrame = `pointer-events-none absolute inset-x-3 bottom-3 top-14 z-20 flex-col items-center justify-center ${overlayCls}`

  // ONE BUTTON OF THE MAP'S CONTROL GROUP.
  //
  // A GROUP MAGNIFIES ITS GLYPH, NOT ITSELF: `hover:scale-105` on a disc inside
  // a rounded, `overflow-hidden` pill scales it into its own clip and the
  // corners eat the edges, so the feedback is a ground tint - which is the
  // house rule for a control already sitting on white anyway.
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
      // ONE FINGER IS THE PAGE'S. TWO ARE THE MAP'S. (9 Sep 2026)
      //
      // Ethan: "the map, I'm unable to zoom on it at all... and scrolling
      // normally on the map doesn't move anything at all, whereas it should.
      // But I should be able to pinch to zoom with my fingers on the map like
      // normal mobile. I don't know why you really messed up the map on
      // mobile."
      //
      // Both halves are ONE line of CSS. `[data-zoomable]` carries
      // `touch-action: none` (index.css) - a promise to the browser that this
      // element handles every gesture itself. That was true when the map
      // zoomed on a drag. It stopped being true the moment gestures were
      // refused outside full screen to fix the desktop scroll trap
      // (`filterZoomEvent` below): the browser had already been told to keep
      // its hands off, and the only other handler now says no. Between the
      // two, the map became a hole in the page that ate every touch.
      //
      // `pan-y` is the honest version of the same promise: the BROWSER keeps
      // vertical scrolling, so a finger dragged up the map scrolls the page
      // exactly like a finger dragged up a paragraph. Everything else - which
      // on a phone means a pinch, and nothing else - is still delivered to us,
      // so d3-zoom gets it and `preventDefault` still works during the gesture.
      //
      // Full screen keeps `none`: there the map IS the page, there is nothing
      // behind it to scroll, and one-finger panning is what you want.
      // ONE FINGER MOVES THE MAP, TWO ZOOM (12 Oct 2026). Ethan: "whenever I
      // scroll with one finger on the map, it doesn't move at all. I have to
      // use two... Two should always be for zooming in or out, and one should
      // be for moving around." So the map owns every touch on a phone now; the
      // page still scrolls from anywhere around it.
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
      {/* THE BLACK NAME PILL IS GONE (9 Sep 2026). Ethan: "the way it shows up
          whenever clicking on a country, it shows up on the actual map in
          black - Italy, France - or it shows their name. Because we have the
          pop up directly below the map, I would remove that black thing on the
          map because it's not needed."

          Right on both counts. It named the thing you had just tapped, one
          beat before a panel appeared saying the same word and a great deal
          more; and it is the only element in this component that was pure
          chrome over the picture. `tooltip` is still tracked because the hover
          handlers set it and the country hit-testing reads it - it simply is
          not drawn any more. */}

      {/* THE KEY IS NO LONGER ON THE MAP. See `legendStrip` below. */}

      {/* ONE BUTTON OUTSIDE FULL SCREEN, AND THE FULL SET INSIDE IT
          (9 Sep 2026).

          Ethan: "we don't actually need the zoom in on mobile because we can
          easily zoom with our fingers, and I don't need the reset button. All
          we need is a full screen button, in the top right, just as an icon, no
          card or anything." And for the desktop: "get rid of the plus and minus
          zoom button, and the reset button. To zoom in there will be the full
          screen button - not in the very corner, but on the right."

          Both follow from the decision above it: gestures are refused outside
          full screen (see `filterZoomEvent`), so a `+` there would be the only
          way to reach a state nothing else can reach and nothing can undo. A
          control that is the sole route into a mode is not a control, it is a
          trapdoor. Inside full screen the map IS the page, pinch works, and the
          zoom stack earns its place back for anybody on a mouse.

          NO CARD, NO PILL, NO DIVIDERS outside full screen: one 36px glyph on
          a translucent white disc, inset from the corner rather than jammed
          into it. It is the smallest thing that can still be hit with a thumb.

          THE CORNER OF A PHONE IS NOT WHERE THE SCREEN ENDS. In full screen the
          map is edge to edge, and a landscape phone puts its rounded corners
          and its notch on the SHORT sides - which is exactly where these
          buttons are, so they carry their own inset on top of the parent's safe
          -area padding. */}
      {!fullscreen && allowFullscreen && (
        <button
          type="button"
          onClick={enterFullscreen}
          aria-label={tr('Open the map full screen')}
          title={tr('Full screen')}
          // A GLYPH ON A PHONE, A LABELLED BUTTON ON A DESKTOP (9 Sep 2026).
          //
          // Ethan: "we have the full screen button in the top right, but I want
          // actual full screen text beside it - only for the desktop. The
          // mobile should still just be the icon."
          //
          // Which is the right split, and for a reason worth writing down: on a
          // phone this button is a convenience (you can already pinch the map
          // where it sits), so a glyph is enough. On a desktop it is THE ONLY
          // WAY IN - the wheel is the page's now - so it has to say what it is.
          // An unlabelled icon that hides the only door is how the door gets
          // missed.
          // AND ON A FLUSH MAP IT IS INSET FROM THE EDGE, NOT WEDGED INTO THE
          // CORNER (10 Sep 2026).
          //
          // Two rounds on this one. First: "the full screen should actually be
          // on the map, like, to the right of Russia" - so it came down to 19%
          // of the map's height, which is Russia's latitude band. Then: "the
          // full screen icon should be at the very top of the map. Currently
          // it's like below. It should be at the top in the right, just to the
          // right of Russia, but level to the top of it."
          //
          // So the horizontal reading was the part that mattered and the
          // vertical one was not: right of Russia, at the TOP. `right-6` on a
          // desktop clears the far-east coast (x=836 of the 880-wide viewBox,
          // so 5% in from the edge) while staying beside it rather than in the
          // gutter, and a boxed map keeps the tighter corner inset it always
          // had, because there it has a tinted sea to sit on.
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

      {/* THE ZOOM STACK, ON A NAVIGABLE MAP, OUTSIDE FULL SCREEN.
          The note above explains why a `+` used to be a trapdoor: gestures were
          refused, so it was the only way into a state nothing could undo. On a
          navigable map that is no longer true - a drag pans, a pinch zooms, and
          reset is right here - so the stack is a control again rather than a
          one-way door. It sits under the full-screen button, which keeps its
          own place at the top right.

          FULL SCREEN KEEPS ITS OWN COPY, so the exit button stays grouped with
          the zoom it belongs to. */}
      {/* A PHONE DOES NOT GET THE STACK. Ethan, of the embedded maps: "we don't
          actually need the zoom in on mobile because we can easily zoom with
          our fingers, and I don't need the reset button. All we need is a full
          screen button." Two fingers still pinch and one still scrolls the
          page, so on a phone these three discs are 120px of chrome over the
          picture that do nothing a finger cannot. They come back at `sm`, where
          the pointer is a mouse and the wheel gate is the only other way in. */}
      {/* FULL SCREEN IS PART OF THE PILL ON A DESKTOP (21 Sep 2026). Ethan:
          "I would combine the full screen button here, as in a little separate
          button attached to the same UI design as the plus, minus, and reset
          buttons, rather than having a separate button. The icon is all we
          need." So the pill takes the full-screen button's old corner and the
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
      {/* NOT ON A PHONE, unless the map is full screen. The map box is about
          180px tall at 375px and this key is 56 of them - a third of the map
          spent explaining two symbols. Ethan: "on mobile I would remove the key
          from the map because it takes up a lot of space and it's not needed."
          Full screen it costs nothing and still earns its place. */}
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

  // THE KEY SITS UNDER THE MAP, IN ONE LINE (8 Sep 2026).
  //
  // Ethan: "we have the 'where we live' and the 'where we have filmed'. This
  // takes up a lot of the map. I would actually put it as a little key directly
  // below the map, across the bottom of it, rather than taking it up two lines.
  // This way it would fit better and there would be more space for the actual
  // map."
  //
  // It was a floating white card pinned to the map's bottom-left corner with
  // its two entries stacked. On a 375px screen that card is about a third of
  // the width and a fifth of the height of the map it is explaining, and it
  // covers the Atlantic and most of South America - so the key was hiding the
  // very thing it was a key TO.
  //
  // A key is a caption, not an annotation: nothing about it needs to be over
  // the picture. Below and centred it costs one 28px line, takes nothing away
  // from the map, and reads as a row rather than a list because two items side
  // by side are obviously a pair of alternatives.
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
      {/* PHONES GET THE COUNTRY UNDER THE MAP, NOT OVER IT.
          The map box is about 180px tall at 375px wide. An overlay inside it is
          a card covering the thing it describes, with the creator list squeezed
          into a scroll box two rows deep - so the one screen where this feature
          matters most (somebody planning a trip on their phone) was the one
          where it was unusable. Below the map it gets the full width of the
          page and as much height as it needs, and the country stays highlighted
          in orange above it so you can see what you tapped. */}
      {/* AND IT COMES BEFORE THE KEY, NOT AFTER IT (9 Sep 2026). Ethan: "for
          the pop up, I would put it directly below the map, and I would put the
          'where we live' and 'where we have filmed' below the pop up, because I
          think it will look better." He is right, and there is a reason beyond
          taste: the panel is the ANSWER to the tap that produced it, and a key
          sitting between the map and the answer puts a legend in the middle of
          a sentence. With nothing selected the key sits straight under the map
          exactly as before. */}
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
