import { BRAND, BRAND_LIGHT, flightDur, WIDTH, HEIGHT, initials, CAN_MOTION_PATH, threadStep, HELD } from './CreatorMapParts'
import { ComposableMap, ZoomableGroup } from 'react-simple-maps'
import { Countries } from './CreatorMapCountries'
import { FlyingPlane } from './CreatorMapFlyingPlane'
import { thumbUrl } from '../lib/avatarUrl'
import { PinMorph } from './CreatorMapPinMorph'
import { Pin } from './CreatorMapPin'

// Part of CreatorMap.jsx: every value it shows comes in as a prop from the page.
export default function CreatorMapCanvas({
  EXPLORED_FILL,
  HOME_FILL,
  HOVER_FILL,
  LAND_FILL,
  SEPARATOR,
  arrived,
  closePanels,
  connectionsView,
  country,
  entering,
  exploredSet,
  exploredView,
  features,
  focusJourney,
  fullscreen,
  handleMove,
  handleMoveEnd,
  highlightIds,
  highlighting,
  homeNames,
  linkSegments,
  morph,
  navigable,
  nearMe,
  openCountry,
  paintOrder,
  painted,
  planeSegments,
  planeZoom,
  position,
  quietMap,
  seen,
  segments,
  selectTown,
  selected,
  setFocusId,
  tr,
  userMoved: userMovedRef,
  visibleJourneys,
  wheelIsOurs,
  z,
}) {
  return (
    <ComposableMap
      width={WIDTH}
      height={HEIGHT}
      onClick={(e) => { if (e.target?.tagName === 'rect') closePanels() }}
      projectionConfig={{ scale: 160, center: [12, 8] }}
      // In full screen the svg takes the window rather than the card's
      // aspect ratio. `xMidYMid meet` (the default) letterboxes it inside
      // whatever shape the screen is, which on a landscape phone is very
      // nearly the map's own shape and on a desktop is a much bigger map.
      style={fullscreen
        ? { width: '100%', height: '100%', display: 'block' }
        : { width: '100%', height: 'auto', display: 'block' }}
      aria-label={tr("Map of where every creator is based")}
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
      {/* ...EXCEPT THAT RECT NEVER GOT A CLICK (2 Oct 2026). Ethan: clicking the sea did not close a country's
          card, only the X did. react-simple-maps' ZoomableGroup draws ITS OWN transparent full-size rect (the
          surface d3-zoom drags on) above ours, so every press on the water landed on that one. The map draws no
          other rect, so a click whose target is a rect is a click on the water, whichever layer took it. A drag
          does not count: d3-zoom swallows the click that ends a pan. */}
      <ZoomableGroup
        zoom={position.zoom}
        center={position.coordinates}
        minZoom={1}
        maxZoom={40}
        // THE MAP DOES NOT TAKE THE PAGE'S SCROLL ANY MORE (9 Sep 2026).
        //
        // Ethan: "whenever you're scrolling down through the website and you
        // reach the map, it starts scrolling the map, and then there's
        // literally no way past it unless you go up and scroll down again...
        // scrolling up is where it just starts zooming into the map."
        //
        // A full-width map across the middle of a marketing page is a
        // scroll trap: d3-zoom claims the wheel over its whole area, the page
        // stops moving, and the reader is stuck in a control they never asked
        // to use. Every fix that keeps wheel-zoom is a heuristic - require a
        // modifier, require a second of hovering, only zoom over land - and
        // every one of them is a rule the reader has to learn.
        //
        // Ethan reached the simpler answer himself: "we're not going to be
        // able to zoom in on the map at all while normally scrolling. It'll
        // just be the full map stretching from side to side. To zoom in there
        // will be the full screen button." So gestures are refused entirely
        // outside full screen, and inside it - where the map IS the page and
        // there is nothing behind it to steal from - everything works.
        //
        // `filterZoomEvent` is d3-zoom's own filter, so this rejects the
        // gesture at source rather than fighting it afterwards. Clicking a
        // country or a creator is untouched: a click is not a zoom event.
        //
        // EXCEPT A PINCH, WHICH IS NEVER AMBIGUOUS (9 Sep 2026). The rule
        // above was written about the WHEEL, where the ambiguity is real: one
        // wheel gesture has to mean either "read on" or "zoom", and on a page
        // it has to mean "read on". Two fingers deliberately placed on a map
        // have never meant anything but zoom, on any phone, ever - so there
        // is nothing to steal and no rule to learn.
        //
        // d3-zoom only consults this filter on `touchstart` (and on wheel,
        // mousedown, dblclick), so counting the touches here is the whole
        // gate: one finger never starts a gesture, which is what leaves the
        // scroll to the browser, and the `touch-action: pan-y` above is what
        // lets the browser take it. See the note on the container.
        // AND A `navigable` MAP CAN BE DRAGGED WITHOUT BEING FULL SCREEN
        // (12 Sep 2026).
        //
        // Ethan, of the market maps: "seems to be no ability to move about or
        // zoom in or out on the map, this functionality should be there too."
        //
        // The rule above stands and is not being reversed: a WHEEL over a map
        // in the middle of a page has to mean "read on", or the page becomes
        // a trap you cannot scroll past. That was a real report and the fix
        // was right. But "no wheel zoom" and "no panning at all" are two
        // different things, and only the first one was ever argued for - a
        // market map is a boxed card a few hundred pixels tall, and dragging
        // inside it steals nothing from anybody.
        //
        // So on a navigable map: a mouse DRAG pans (mousedown, which is never
        // ambiguous - you do not press and hold a map to scroll a page), a
        // double click zooms, and the wheel is still the page's. On a phone
        // one finger still scrolls the page and two still pinch, exactly as
        // before. Zooming without a wheel is the +/- stack, which navigable
        // maps now draw outside full screen.
        //
        // ACCEPTING A GESTURE IS WHAT MARKS THE CAMERA AS THE READER'S. This
        // filter is the only place that knows a real gesture has started, so
        // it is where `userMoved` is set - see the fit effect.
        filterZoomEvent={(event) => {
          const allowed = fullscreen
            || event?.type === 'touchstart'
            || (navigable && (event?.type === 'mousedown' || event?.type === 'dblclick'))
            || (navigable && event?.type === 'wheel' && wheelIsOurs(event))
          if (allowed) userMovedRef.current = true
          return allowed
        }}
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
          // Held until the ARRIVAL can begin, which needs the atlas drawn AND
          // the map on screen. This is what makes the map its own reveal -
          // see `seen` above - and it is why the landing page no longer wraps
          // it in a `Reveal` as well.
          style={(painted && seen) || arrived ? undefined : HELD}
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
              <FlyingPlane key={`p${seg.key}`} path={seg.d} dur={seg.dur} zoom={z} opacity={0.9} arriving={entering} flying={painted && seen} />
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
              <FlyingPlane key={`lp${seg.key}`} path={seg.d} dur={flightDur(seg.curve * planeZoom)} zoom={z} opacity={0.95} arriving={entering} flying={painted && seen} />
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
              // ONE SENTENCE EACH, WITH THE PARTS NAMED. A template literal
              // cannot be a translation key - the whole point of the
              // placeholder API is that the sentence is not assembled at the
              // call site, because Spanish puts these pieces in a different
              // order.
              aria-label={j.current
                ? tr('{name} is in {place} now', { name: j.name, place: j.trip.country })
                : tr('{name} leaves for {place} in {days} days', { name: j.name, place: j.trip.country, days: j.daysUntil })}
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
                    <image href={thumbUrl(j.photo_url, 48)} x="-10" y="-10" width="20" height="20"
                      clipPath="url(#creator-pin-clip)" preserveAspectRatio="xMidYMid slice" />
                  ) : (
                    <text x="0" y="0" textAnchor="middle" dominantBaseline="central"
                      fontSize="9" fontWeight="600" fill={BRAND}>{initials(j.name)}</text>
                  )}
                  <circle r="10" fill="none" stroke={BRAND} strokeWidth="2.5" />
                </g>
              )}
              {/* THE SAME MOTION PATH THE THREAD AIRCRAFT USE, and it has to
                  be: this is the other half of "the plane animation is frozen
                  and then jumps". A journey aircraft carries a face and a tap
                  target, so it is written out here rather than through
                  `FlyingPlane`, but the mechanism is that component's - see
                  the note there. */}
              <g
                style={CAN_MOTION_PATH
                  ? {
                    offsetPath: `path("${j.d}")`,
                    offsetRotate: 'auto',
                    animationName: 'map-fly', animationDuration: `${flightDur(j.curve * planeZoom)}s`, animationTimingFunction: 'linear', animationIterationCount: 'infinite',
                    animationPlayState: painted && seen ? 'running' : 'paused',
                  }
                  : undefined}
              >
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
                {!CAN_MOTION_PATH && (
                  <animateMotion dur={`${flightDur(j.curve * planeZoom)}s`} repeatCount="indefinite" rotate="auto" path={j.d} />
                )}
              </g>
            </g>
          ))}
        </g>

        {morph.ghosts.map((g) => (
          <PinMorph key={`ghost:${g.gid}`} x={g.x} y={g.y} dx={g.dx} dy={g.dy} leaving>
            <Pin group={g.group} zoom={z} active={false} dim={false} onSelect={() => {}} />
          </PinMorph>
        ))}
        {paintOrder.map((town, ti) => {
          const dimTown = highlighting && !town.creators.some((c) => highlightIds.has(c.id))
          const f = morph.from.get(town.key)
          return (
            <PinMorph key={town.key} x={f?.x} y={f?.y} dx={f?.dx} dy={f?.dy} pop={f?.pop} arriving={!!f}>
              <Pin group={town} zoom={z} active={selected?.key === town.key} dim={dimTown}
                onSelect={selectTown} landing={entering} queue={ti} />
            </PinMorph>
          )
        })}
        </g>
        </g>
        )}
      </ZoomableGroup>
    </ComposableMap>
  )
}
