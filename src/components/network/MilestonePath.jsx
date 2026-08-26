import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { Link } from 'react-router-dom'
import Icon from '../Icon'
import { Avatar, Modal } from '../ui'
import { cx } from '../../lib/utils'
import { EASE } from '../../lib/motion'
import { playPlaneRise, playRingReached, engineThrust, engineStop } from '../../lib/gameSounds'
import { REWARD_TONE, criterionLabel, milestoneFraction } from '../../lib/milestones'

// The milestone ladder, drawn as a flight path.
//
// WHY A CURVE RATHER THAN A PROGRESS BAR
//
// A bar says "you are 40% of the way through something". A route says "here is
// where you started, here is where you are, here is the next stop and here is
// everything after it" - which is four facts, and the three that are not "40%"
// are the ones that make somebody want to keep going. It is also the one shape
// that suits this brand without being decoration: the product is flights.
//
// HOW THE GEOMETRY WORKS
//
// Nodes alternate left and right down a fixed grid, and consecutive nodes are
// joined by a cubic whose control points sit directly above and below them. That
// guarantees the curve leaves and enters every node VERTICALLY, so the joins are
// smooth without any tangent bookkeeping, and it makes every segment the same
// length - which is what lets progress be measured as a fraction of the whole
// path rather than segment by segment.
//
// Two paths are drawn on top of each other: the whole route, dashed and faint,
// and the travelled part, solid and orange. Motion animates `pathLength` on the
// second one, which is doing the dasharray arithmetic for us and is the reason
// the route draws itself on arrival instead of appearing.
//
// LABELS ARE HTML, NOT SVG
//
// Positioned absolutely over the drawing at the same coordinates. SVG text
// cannot wrap, cannot be a link with a hover state, and does not inherit the
// type scale, and every one of those matters more here than the convenience of
// keeping the label in the same document as the dot it belongs to.

const TOP = 62           // where the first node sits

// WHY THE PHONE LAYOUT IS A LANE AND NOT A SMALLER SERPENTINE.
//
// It used to serpentine on a phone too, in a 150-unit-wide box with nodes at
// x=40 and x=104 and the labels pushed to whatever was left. For the right-hand
// nodes that was `(150 - 104 - 30) / 150` of the width - ELEVEN PER CENT - so
// every other milestone's title wrapped one character per line down the side of
// the screen. That is the "nothing is formatted correctly" report, and it is not
// a tuning problem: alternating labels need width to alternate INTO, and 375px
// does not have it.
//
// So the phone gets one lane down the left and a full-width column of labels to
// its right. The route still snakes - the control points wave even though the
// nodes are in a column - so it reads as a flight path rather than a list.
const LAYOUT = {
  wide: { W: 340, left: 76, right: 264, gap: 150, wave: 0, labelPct: 38 },
  narrow: { W: 320, left: 34, right: 34, gap: 122, wave: 26, labelPct: 74 },
}

function nodeX(i, L) {
  return i % 2 === 0 ? L.left : L.right
}

function nodeY(i, L) {
  return TOP + i * L.gap
}

// The whole route as one path string, plus the control points, so the plane and
// everybody else on the road can be placed on it without asking the DOM where
// anything is.
function buildRoute(count, L) {
  const segs = []
  let d = `M ${nodeX(0, L)} ${nodeY(0, L)}`
  for (let i = 0; i < count - 1; i += 1) {
    const p0 = [nodeX(i, L), nodeY(i, L)]
    const p3 = [nodeX(i + 1, L), nodeY(i + 1, L)]
    // `wave` bends the curve sideways when the nodes themselves are in a
    // straight column, which is the only thing keeping the phone layout from
    // being a vertical line with dots on it.
    const w = L.wave * (i % 2 === 0 ? 1 : -1)
    const c1 = [p0[0] + w, p0[1] + L.gap * 0.55]
    const c2 = [p3[0] + w, p3[1] - L.gap * 0.55]
    d += ` C ${c1[0]} ${c1[1]}, ${c2[0]} ${c2[1]}, ${p3[0]} ${p3[1]}`
    segs.push([p0, c1, c2, p3])
  }
  return { d, segs }
}

function cubicAt(seg, t) {
  const [p0, c1, c2, p3] = seg
  const u = 1 - t
  const x = u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p3[0]
  const y = u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p3[1]
  // The tangent, for pointing the plane where it is going.
  const dx = 3 * u * u * (c1[0] - p0[0]) + 6 * u * t * (c2[0] - c1[0]) + 3 * t * t * (p3[0] - c2[0])
  const dy = 3 * u * u * (c1[1] - p0[1]) + 6 * u * t * (c2[1] - c1[1]) + 3 * t * t * (p3[1] - c2[1])
  return { x, y, angle: (Math.atan2(dy, dx) * 180) / Math.PI }
}

// The aircraft, drawn nose-up at the origin. `rotate="auto"` on animateMotion
// aligns the local +x axis with the direction of travel, so the glyph is turned
// a quarter turn to put its nose there. Module scope: a component defined during
// render is a new type on every render, and this one is inside an SVG that
// re-renders on every resize observation.
const PLANE_D = 'M0 -9 C0.9 -9 1.5 -7.4 1.5 -5.1 L1.5 -3.6 L8.2 0.8 L8.2 2.5 L1.5 -0.2 L1.5 4.1 L3.6 6.2 L3.6 7.5 L0 6.3 L-3.6 7.5 L-3.6 6.2 L-1.5 4.1 L-1.5 -0.2 L-8.2 2.5 L-8.2 0.8 L-1.5 -3.6 L-1.5 -5.1 C-1.5 -7.4 -0.9 -9 0 -9 Z'

function PlaneMark() {
  return (
    <g transform="rotate(90)">
      <path d={PLANE_D} fill="#d94407" stroke="#ffffff" strokeWidth="1.4" strokeLinejoin="round" />
    </g>
  )
}

// WHEN THE PLANE IS AT A GIVEN POINT ON THE ROUTE.
//
// THE BUG THIS FIXES. The rings lit on a LINEAR clock - node i appeared at
// `(i/legs)/progress * flightSeconds` - while the plane flew an EASED one, the
// keySplines curve below. Those two agree at take-off and at landing and
// nowhere in between, so through the middle of the route the aircraft was a
// good half-second ahead of the dot it was supposedly arriving at, and the
// chimes rang against nothing. That is the "animation speed doesn't match the
// milestones appearing" report, and no amount of tuning the duration fixes it
// because the shapes are different, not the lengths.
//
// The easing maps time -> distance. To light a ring exactly as the plane
// touches it we need the other direction: distance -> time. There is no closed
// form for the inverse of a cubic bezier, so it is solved numerically - twenty
// bisections on a monotonic curve is exact to about a millionth, and it runs
// once per node on one render.
const SPLINE = [0.32, 0.18, 0.36, 0.86]

function bezier(t, a, b) {
  const u = 1 - t
  return 3 * u * u * t * a + 3 * u * t * t * b + t * t * t
}

/** The normalised time at which an eased animation has covered fraction `y`. */
function timeAtDistance(y) {
  const target = Math.max(0, Math.min(1, y))
  let lo = 0
  let hi = 1
  for (let i = 0; i < 20; i += 1) {
    const mid = (lo + hi) / 2
    if (bezier(mid, SPLINE[1], SPLINE[3]) < target) lo = mid
    else hi = mid
  }
  return bezier((lo + hi) / 2, SPLINE[0], SPLINE[2])
}

// `preview` draws the whole route as flown, whatever the viewer has actually
// done. It is how an admin checks the animation and the layout end to end
// without waiting to earn a million views.
export default function MilestonePath({ milestones = [], standings = [], preview = false }) {
  // Which stop's detail sheet is open. Null for none.
  const [open, setOpen] = useState(null)

  // THE LAYOUT COMES FROM THIS COMPONENT'S OWN WIDTH, NOT THE WINDOW'S.
  //
  // It used to ask `useIsMobile`, which asks the WINDOW. That is right on the
  // route page, where the drawing gets most of the page, and completely wrong
  // in the admin editor, where the live preview sits in a 22rem rail on a
  // desktop: the window said "not mobile", so the preview drew the wide
  // serpentine - nodes 190 units apart and labels 38% of the width - inside a
  // 340px box. Every label landed on top of the next one and spilled out of
  // the panel. That is the "text is overlapping, not inside the boxes" report.
  //
  // A drawing that has to fit a container should measure the container.
  const [box0, setBox0] = useState(null)   // the element
  const [box, setBox] = useState(null)     // its width
  const narrow = box == null ? false : box < 520
  const L = narrow ? LAYOUT.narrow : LAYOUT.wide
  const isMobile = narrow

  useEffect(() => {
    if (!box0) return undefined
    const ro = new ResizeObserver(([e]) => setBox(e.contentRect.width))
    ro.observe(box0)
    setBox(box0.getBoundingClientRect().width)
    return () => ro.disconnect()
  }, [box0])

  // THE FLIGHT STARTS WHEN YOU LOOK AT IT.
  //
  // THE BUG THIS FIXES. The plane was driven by `animateMotion`, and SMIL
  // begins against the SVG document's own timeline the moment the element
  // exists - not when the element is seen. The orange line underneath it used
  // Motion's `whileInView`, which waits. So on a page you have to scroll to
  // reach, the plane had already flown its whole route and parked (fill=freeze)
  // before you got there, and all you ever saw was the line drawing itself
  // under a stationary aircraft. That is "the animation still isn't what I
  // wanted": the flight was real, it just happened to nobody.
  //
  // `begin="indefinite"` means SMIL will not start on its own. An observer
  // starts it, and starts the line with it, so the two are the same movement.
  const [started, setStarted] = useState(false)
  const [glowAnim, setGlowAnim] = useState(null)
  const [planeAnim, setPlaneAnim] = useState(null)

  useEffect(() => {
    if (!box0 || started) return undefined
    if (typeof IntersectionObserver === 'undefined') { setStarted(true); return undefined }
    const io = new IntersectionObserver(
      (entries) => { if (entries.some((e) => e.isIntersecting)) setStarted(true) },
      { rootMargin: '0px 0px -15% 0px' },
    )
    io.observe(box0)
    return () => io.disconnect()
  }, [box0, started])

  // The same safety net Reveal carries, and for the same reason: if the
  // observer never fires, the plane never takes off AND the orange line never
  // draws, so the route renders as though the creator had flown none of it.
  // A broken animation must never cost the information underneath it. Guarded
  // on the element actually being on screen so a route further down the page
  // still waits for the scroll - and unconditional when the viewport reports
  // zero height, which means we are somewhere that cannot answer the question.
  useEffect(() => {
    if (started || !box0) return undefined
    const t = setTimeout(() => {
      const vh = window.innerHeight || 0
      if (vh === 0 || box0.getBoundingClientRect().top < vh) setStarted(true)
    }, 1200)
    return () => clearTimeout(t)
  }, [started, box0])

  useEffect(() => {
    if (!started) return
    // beginElement is the only way to start an `indefinite` SMIL animation, and
    // it throws in engines that stubbed the element without implementing it.
    // A route that draws without its plane is a degraded route, not a broken
    // page, so a failure here is swallowed.
    try { glowAnim?.beginElement() } catch { /* no SMIL */ }
    try { planeAnim?.beginElement() } catch { /* no SMIL */ }
  }, [started, glowAnim, planeAnim])

  // Node 0 is "you joined". Everything after it is a milestone, so a creator
  // with nothing done yet still sees a road with a start on it rather than an
  // empty state.
  const nodes = [{ start: true }, ...(preview ? milestones.map((m) => ({ ...m, reached: true })) : milestones)]
  const H = TOP + (nodes.length - 1) * L.gap + TOP
  const { d, segs } = buildRoute(nodes.length, L)

  const reached = preview ? milestones.length : milestones.filter((m) => m.reached).length
  const next = milestones[reached] || null
  // How far into the current leg. A stop can now ask for SEVERAL things at
  // once, so this is the mean of its requirements rather than the one metric it
  // used to have - see `milestoneFraction`. A creator who has the views and the
  // videos but none of the referrals is genuinely two-thirds of the way to that
  // stop, and the plane should sit two-thirds of the way along the leg.
  const legFraction = next ? milestoneFraction(next) : 1
  const legs = Math.max(1, nodes.length - 1)
  const progress = Math.min(1, (reached + legFraction) / legs)

  const planeSeg = segs[Math.min(reached, segs.length - 1)]
  const plane = planeSeg ? cubicAt(planeSeg, reached >= segs.length ? 1 : legFraction) : null
  // Where the aeroplane waits before take-off: the first dot, facing the way
  // the route leaves it. Null once the flight has started.
  const start = !started && segs.length ? cubicAt(segs[0], 0) : null

  // HOW LONG THE FLIGHT TAKES.
  //
  // Scaled to the distance actually being flown, not fixed. A creator one stop
  // in and a creator who has finished the whole route were both given 1.4
  // seconds, which made the first look like a twitch and the second look like a
  // fast-forward - and 1.4s over five stops is roughly 250ms per leg, which is
  // below the point at which the eye reads a moving object as travelling rather
  // than teleporting. Per-leg pacing keeps every route feeling like the same
  // aeroplane. The floor stops a two-percent journey being over before it
  // registers; the ceiling stops a long route becoming something you wait for.
  const flightSeconds = Math.max(3.5, Math.min(12, 2 + progress * legs * 1.1))
  // NEARLY CONSTANT SPEED, and that is deliberate.
  //
  // This was `0.42 0 0.16 1`, a proper ease-in-out, and over a long route that
  // curve spends most of its length in the fast middle - so the plane crawled
  // off the first dot, sprinted the body of the journey and glided to a halt.
  // Read as "too fast" even though the total duration was generous, because
  // the part you actually watch is the middle. This one is close to linear with
  // only enough softness at each end to avoid a jerk on take-off and landing,
  // so the aircraft holds one readable pace the whole way down the line.
  const FLIGHT_SPLINE = '0.32 0.18 0.36 0.86'

  // A stop lights up as the plane reaches it, rather than the whole ladder
  // popping in on its own stagger while the aircraft is still on leg one. Nodes
  // beyond where the creator has got to arrive just after the plane parks -
  // they are the route ahead, and the route ahead is part of the picture.
  const arrivalDelay = (i) => {
    const f = i / legs
    if (progress <= 0) return Math.min(i * 0.12, 1)
    // Beyond where the creator has got to: the route ahead, arriving just after
    // the aircraft parks. Still linear, because nothing is flying it.
    if (f >= progress) return flightSeconds + Math.min((f - progress) * legs * 0.12, 0.6)
    // On the flown part: ask the flight when it is HERE, rather than assuming
    // it covers the route at a steady rate. See `timeAtDistance`.
    return timeAtDistance(f / progress) * flightSeconds
  }

  // THE FLIGHT IS AUDIBLE.
  //
  // A short ascending pass as the aircraft leaves the first dot, then the games'
  // coin as it crosses each milestone it has actually reached. The coin already
  // means "you passed a marked point" everywhere else in the product (it is the
  // Flight Path stop sound), so borrowing it here costs nothing to learn.
  //
  // It rides on `arrivalDelay`, which is the same function that lights each
  // node up, so the sound and the light are the same event by construction
  // rather than by two sets of numbers that will drift apart.
  //
  // Only for milestones already REACHED: a coin for a stop you have not earned
  // would be the product congratulating you for nothing.
  useEffect(() => {
    if (!started) return undefined
    playPlaneRise()
    const timers = []
    for (let i = 1; i <= reached; i++) {
      timers.push(setTimeout(playRingReached, Math.round(arrivalDelay(i) * 1000)))
    }

    // THE AIRCRAFT IS AUDIBLE FOR AS LONG AS IT IS MOVING.
    //
    // There was one ascending pass at take-off and then silence under a plane
    // that kept flying for another eight seconds, which is the wrong way round:
    // the take-off is the moment you are least likely to be looking, and the
    // long middle is the part that needed something under it.
    //
    // `engineThrust` is the Flight Path propeller - filtered noise with a blade
    // band on it, already built, already quiet - and it settles itself 420ms
    // after the last call. Re-thrusting on a 300ms tick therefore holds it open
    // for exactly as long as we keep ticking, and one `engineStop` at the end
    // fades it out. Started a beat after the rise so the two do not stack.
    // THE TICKER HAS TO BE STOPPED BEFORE THE ENGINE IS.
    //
    // THE BUG THIS FIXES. The landing timeout called `engineStop` and the
    // 300ms ticker was left running - so 300ms later it thrust again, and the
    // propeller came back and stayed for the rest of the session, on every
    // page, until the tab was closed. That is the "I can constantly hear the
    // airplane background noise" report, and it is why the interval id lives
    // in a variable of its own rather than in the same bag as the chimes: the
    // one thing that must happen at landing is that this stops FIRST.
    let ticker = null
    const takeoff = setTimeout(() => {
      engineThrust()
      ticker = setInterval(engineThrust, 300)
    }, 500)
    const cut = () => {
      if (ticker) { clearInterval(ticker); ticker = null }
      engineStop()
    }
    const landed = setTimeout(cut, Math.round(flightSeconds * 1000) + 400)

    return () => {
      clearTimeout(takeoff)
      clearTimeout(landed)
      timers.forEach(clearTimeout)
      cut()
    }
    // `arrivalDelay` closes over flightSeconds/progress/legs, all derived from
    // props, and is rebuilt every render - depending on it would reschedule the
    // whole run on any unrelated re-render, which is how you get a route that
    // chimes twice. The flight only ever starts once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, reached])

  // THE FACES USED TO BE DRAWN ON THE LINE AS WELL, AND THAT IS GONE.
  //
  // There were two avatar displays: a queue of faces fanned ALONG the route,
  // and a row under each stop's label. The queue placed each creator at
  // `(node - rank * 0.13) / legs` - so eight people who had all reached stop
  // one were smeared across the whole of leg one, at eight visibly different
  // places, none of which was where any of them actually stood. That is the
  // "creator icons seem inaccurate" report, and it was inaccurate by
  // construction: the fan was along the axis that MEANS something.
  //
  // Two displays answering the same question, one of them wrong, is not worth
  // repairing into two displays answering the same question. The row under each
  // stop is the honest one - it is exactly the set of people who reached that
  // stop - so that is the one that survives, and it is now clickable.

  return (
    <div ref={setBox0} className="relative w-full" style={{ aspectRatio: `${L.W} / ${H}` }}>
      <svg viewBox={`0 0 ${L.W} ${H}`} className="absolute inset-0 h-full w-full" aria-hidden>
        <defs>
          <clipPath id="milestone-face" clipPathUnits="objectBoundingBox">
            <circle cx="0.5" cy="0.5" r="0.5" />
          </clipPath>
        </defs>
        {/* The whole route, faint and dashed: everything still ahead. */}
        <path
          d={d}
          fill="none"
          stroke="currentColor"
          className="text-gray-200"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray="1 12"
        />
        {/* The part already flown. `pathLength` is animated rather than the
            dasharray, so Motion owns the arithmetic and the route draws itself
            from the start rather than fading in as a finished line. */}
        {/* Driven by the SAME trigger and the SAME duration as the plane. It
            used to have its own `whileInView` at its own duration, which is how
            the two came apart: the line waited to be seen and the plane did
            not. The line is the plane's contrail; they are one animation. */}
        <motion.path
          d={d}
          fill="none"
          stroke="#d94407"
          strokeWidth="4"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: started ? progress : 0 }}
          transition={{ duration: flightSeconds, ease: [0.32, 0.18, 0.36, 0.86] }}
        />

        {/* THE PLANE FLIES THE ROUTE, IT DOES NOT APPEAR ON IT.
            It used to be placed at the current position and faded in, which
            drew the right dot and told the wrong story: the point of a route is
            the travelling, and a plane that is simply THERE says nothing about
            having got there. It now takes off from the start and flies to
            exactly where the creator has reached, in step with the orange line
            drawing itself underneath, and stops.

            animateMotion with keyPoints rather than a Motion tween, because the
            browser is already solving "where is this point along that cubic"
            for the path we handed it, and doing that arithmetic ourselves means
            keeping two copies of the geometry in sync forever. fill="freeze"
            is what leaves it parked at the creator's position. */}
        {/* Drawn even at zero progress: a creator who has not reached a stop
            yet is AT THE START of the route, which is a place on it, and a
            route with no plane on it looks like a route that is not yours. */}
        {plane && (start
          ? (
            /* PARKED AT THE FIRST DOT UNTIL THE FLIGHT BEGINS.
               An `animateMotion` with `begin="indefinite"` contributes NOTHING
               until it is triggered, so its target sits at the local origin -
               the top-left corner of the viewBox. Rendering the animated group
               before the trigger therefore parks a plane in the corner of the
               card until you scroll to it. This static copy holds the start of
               the route instead, turned to face the way the route leaves it,
               and is swapped for the animated one at take-off. */
            <g transform={`translate(${start.x} ${start.y}) rotate(${start.angle})`}>
              <circle r="15" fill="#d94407" opacity="0.14" />
              <PlaneMark />
            </g>
          )
          : (
            <g>
              <circle r="15" fill="#d94407" opacity="0.14">
                <animateMotion
                  ref={setGlowAnim}
                  begin="indefinite"
                  dur={`${flightSeconds}s`} fill="freeze" path={d}
                  keyPoints={`0;${progress}`} keyTimes="0;1" calcMode="spline" keySplines={FLIGHT_SPLINE}
                />
              </circle>
              <g>
                <PlaneMark />
                {/* `begin="indefinite"` + beginElement, NOT a bare dur. See the
                    note on `started` above: SMIL against the document timeline
                    had already finished by the time anybody scrolled here.
                    keyPoints stops the flight at exactly the creator's own
                    position and fill="freeze" parks it there - somebody one stop
                    in watches the plane fly one stop and land, which is the
                    whole point of drawing a route instead of a bar. */}
                <animateMotion
                  ref={setPlaneAnim}
                  begin="indefinite"
                  dur={`${flightSeconds}s`} fill="freeze" rotate="auto" path={d}
                  keyPoints={`0;${progress}`} keyTimes="0;1" calcMode="spline" keySplines={FLIGHT_SPLINE}
                />
              </g>
            </g>
          )
        )}

        {/* The stops. Drawn after the route so the line never crosses a dot. */}
        {nodes.map((n, i) => {
          const done = n.start || n.reached
          const isNext = !done && i === reached + 1
          const x = nodeX(i, L)
          const y = nodeY(i, L)
          return (
            <motion.g
              key={n.id || 'start'}
              initial={{ scale: 0.4, opacity: 0 }}
              animate={started ? { scale: 1, opacity: 1 } : { scale: 0.4, opacity: 0 }}
              // A stop appears as the plane gets to it, not on its own stagger.
              transition={{ delay: arrivalDelay(i), type: 'spring', stiffness: 320, damping: 22 }}
              style={{ transformOrigin: `${x}px ${y}px` }}
            >
              {isNext && (
                <circle cx={x} cy={y} r="18" fill="none" stroke="#d94407" strokeWidth="2" opacity="0.35">
                  <animate attributeName="r" values="14;22;14" dur="2.6s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.35;0;0.35" dur="2.6s" repeatCount="indefinite" />
                </circle>
              )}
              {/* A stop whose own numbers are met but which is gated behind an
                  earlier one is drawn as an outline in full brand orange with a
                  dashed edge: unmistakably EARNED, unmistakably not yet
                  yours. A plain grey dot said neither. */}
              <circle
                cx={x} cy={y} r="13"
                fill={done ? '#d94407' : '#ffffff'}
                stroke={done || n.blocked ? '#d94407' : isNext ? '#d94407' : '#e2e2e6'}
                strokeWidth={isNext || n.blocked ? 3 : 2}
                strokeDasharray={!done && n.blocked ? '4 3' : undefined}
              />
              {!done && n.blocked && (
                <path
                  d={`M ${x - 4.5} ${y} l 3.2 3.4 L ${x + 4.8} ${y - 3.9}`}
                  fill="none" stroke="#d94407" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                />
              )}
              {done && (
                <path
                  d={`M ${x - 5} ${y} l 3.6 3.8 L ${x + 5.4} ${y - 4.4}`}
                  fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
                />
              )}
            </motion.g>
          )
        })}
      </svg>

      {/* ---------- Stop cards ---------- */}
      {/* THEY ARE CARDS NOW, AND THEY ARE ALWAYS LEFT-ALIGNED.
          The old label was loose text that inherited `text-right` on every
          other stop, so half the route was ragged-left prose wrapping under a
          full-width reward pill - which is the screenshot Ethan sent: squashed,
          off-centre, and with the reward shouting over the title. A card gives
          the block an edge to sit against, one alignment for every stop
          whichever side of the line it is on, and somewhere for the description
          to go. */}
      {nodes.map((n, i) => {
        const done = n.start || n.reached
        const isNext = !done && i === reached + 1
        const x = nodeX(i, L)
        const y = nodeY(i, L)
        // On a phone every card sits to the right of the lane. On desktop they
        // alternate so the curve has room to breathe.
        const rightSide = isMobile ? true : i % 2 === 0
        // Everybody who has got at least this far. Accurate BECAUSE the route
        // is gated: a count of stops reached is now a prefix length, so
        // "reached >= i" really does mean "has passed this stop".
        const atStop = n.start ? [] : standings.filter((p) => p.reached >= i)
        return (
          <motion.div
            key={n.id || 'start-label'}
            initial={{ opacity: 0, x: rightSide ? -14 : 14, scale: 0.96 }}
            animate={started
              ? { opacity: 1, x: 0, scale: 1 }
              : { opacity: 0, x: rightSide ? -14 : 14, scale: 0.96 }}
            transition={{ delay: arrivalDelay(i) + 0.12, duration: 0.5, ease: EASE }}
            className="absolute text-left"
            style={{
              top: `${(y / H) * 100}%`,
              left: rightSide ? `${((x + 22) / L.W) * 100}%` : undefined,
              right: rightSide ? undefined : `${((L.W - x + 22) / L.W) * 100}%`,
              width: `${L.labelPct}%`,
              transform: 'translateY(-50%)',
            }}
          >
            {n.start ? (
              <div className="rounded-2xl border border-brand/20 bg-brand-tint/40 px-3 py-2.5">
                <p className="text-sm font-bold text-brand">You joined</p>
                <p className="text-xs text-smoke">Where every route starts.</p>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setOpen(n)}
                className={cx(
                  'group block w-full rounded-2xl border px-3 py-2.5 text-left transition-all duration-200',
                  'hover:-translate-y-0.5 hover:shadow-card',
                  done
                    ? 'border-brand/25 bg-white hover:border-brand'
                    : isNext
                      ? 'border-brand/40 bg-brand-tint/25 hover:border-brand'
                      : n.blocked
                        ? 'border-amber-200 bg-amber-50/60 hover:border-amber-400'
                        : 'border-gray-100 bg-white/80 hover:border-gray-300',
                )}
              >
                <p className={cx(
                  'text-sm font-bold leading-snug',
                  done ? 'text-ink' : isNext ? 'text-brand' : 'text-smoke',
                )}>
                  {n.title}
                </p>

                {/* THE DESCRIPTION, which the admin has been able to write since
                    the beginning and which appeared nowhere at all. Ethan's
                    report was that he seemed to need to write several and never
                    saw any of them. */}
                {n.description && (
                  <p className="mt-0.5 text-[11px] leading-snug text-smoke">{n.description}</p>
                )}

                {/* THE REWARD WRAPS RATHER THAN TRUNCATING.
                    "You are officially a Tryp.com Creator, welcome to the
                    team!" is a real reward line on the live ladder, and cutting
                    it at the card's edge threw away the half that says what
                    happened. A pill is the wrong shape for a sentence, so a
                    long one becomes a rounded block over two lines and a short
                    one still reads as a chip. */}
                {n.reward && (
                  <span className={cx(
                    'mt-1.5 inline-block max-w-full rounded-xl px-2 py-1 text-[10px] font-semibold leading-snug',
                    done ? REWARD_TONE[n.reward_kind] || REWARD_TONE.other : 'bg-cloud text-smoke',
                  )}>
                    {n.reward}
                  </span>
                )}

                {/* WHAT THIS STOP ACTUALLY ASKS FOR.
                    One line per requirement, ticked or not. A stop can need
                    three things now, and "3 of 10 videos" under a milestone
                    that also wants 500k views and two referrals would be a
                    progress line that lies by omission. */}
                {done ? (
                  <p className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-brand">
                    <Icon name="check" className="h-3 w-3" /> Reached
                  </p>
                ) : (
                  <ul className="mt-1.5 space-y-0.5">
                    {(n.criteria || []).map((c) => (
                      <li key={c.metric} className="flex items-start gap-1 text-[11px] leading-tight">
                        <Icon
                          name={c.done ? 'check' : 'clock'}
                          className={cx('mt-px h-3 w-3 shrink-0', c.done ? 'text-green-600' : 'text-gray-300')}
                        />
                        <span className={c.done ? 'text-smoke line-through decoration-green-600/40' : 'text-smoke'}>
                          {criterionLabel(c)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                {/* EARNED, BUT WAITING ON AN EARLIER STOP.
                    Without this the dot is simply unlit and the creator has no
                    way to tell "you have not done this yet" from "you did this
                    months ago but the route runs in order". */}
                {n.blocked && (
                  <p className="mt-1.5 inline-flex items-start gap-1 rounded-lg bg-amber-100/70 px-1.5 py-1 text-[10px] font-medium leading-tight text-amber-800">
                    <Icon name="alert" className="mt-px h-3 w-3 shrink-0" />
                    Done — waiting on an earlier stop
                  </p>
                )}

                {/* WHO REACHED THIS ONE. Each face lands on its own beat after
                    the card does, so a busy stop arrives as a little run rather
                    than as a block of heads appearing at once. */}
                {atStop.length > 0 && (
                  <div className="mt-2 flex items-center -space-x-1.5">
                    {atStop.slice(0, 4).map((s2, k) => (
                      <motion.span
                        key={s2.id}
                        initial={{ opacity: 0, scale: 0.4, y: 4 }}
                        animate={started ? { opacity: 1, scale: 1, y: 0 } : { opacity: 0, scale: 0.4, y: 4 }}
                        transition={{
                          delay: arrivalDelay(i) + 0.3 + k * 0.07,
                          type: 'spring', stiffness: 460, damping: 24,
                        }}
                        className="transition-transform duration-200 group-hover:translate-y-[-2px]"
                      >
                        <Avatar src={s2.photo_url} name={s2.name} size="xs" className="ring-2 ring-white" />
                      </motion.span>
                    ))}
                    <span className={cx(
                      'flex h-6 items-center rounded-full px-1.5 text-[9px] font-semibold ring-2 ring-white transition-colors',
                      'bg-cloud text-smoke group-hover:bg-brand group-hover:text-white',
                    )}>
                      {atStop.length > 4 ? `+${atStop.length - 4}` : `${atStop.length}`}
                    </span>
                  </div>
                )}
              </button>
            )}
          </motion.div>
        )
      })}

      {/* EVERYTHING ABOUT ONE STOP, INCLUDING EVERY NAME.
          Four faces and a "+5" answers "am I on my own out here" and nothing
          else - you cannot read the five, and there was no way to. The card is
          now a button and this is what it opens. */}
      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.title || ''}>
        {open && (
          <div className="space-y-4">
            {open.description && <p className="text-sm text-smoke">{open.description}</p>}

            <div>
              <p className="label">What it takes</p>
              <ul className="space-y-1.5">
                {(open.criteria || []).map((c) => (
                  <li key={c.metric} className="flex items-start gap-2 text-sm">
                    <Icon
                      name={c.done ? 'check' : 'clock'}
                      className={cx('mt-0.5 h-4 w-4 shrink-0', c.done ? 'text-green-600' : 'text-gray-300')}
                    />
                    <span className={c.done ? 'text-smoke line-through decoration-green-600/40' : 'text-ink'}>
                      {criterionLabel(c)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {open.reward && (
              <div>
                <p className="label">Reward</p>
                <span className={cx(
                  'inline-block rounded-full px-3 py-1 text-xs font-semibold',
                  REWARD_TONE[open.reward_kind] || REWARD_TONE.other,
                )}>
                  {open.reward}
                </span>
              </div>
            )}

            {(() => {
              const idx = nodes.findIndex((z) => z.id === open.id)
              const who = standings.filter((p) => p.reached >= idx)
              return (
                <div>
                  <p className="label">
                    {who.length === 0 ? 'Nobody has reached this yet'
                      : `${who.length} ${who.length === 1 ? 'creator has' : 'creators have'} reached this`}
                  </p>
                  {who.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {who.map((p) => (
                        <Link
                          key={p.id}
                          to={`/profile/${p.id}`}
                          onClick={() => setOpen(null)}
                          className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-white py-0.5 pl-0.5 pr-2.5 transition-all duration-200 hover:scale-105 hover:border-brand"
                        >
                          <Avatar src={p.photo_url} name={p.name} size="xs" />
                          <span className="text-xs font-medium">{p.name}</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )
            })()}
          </div>
        )}
      </Modal>

      {milestones.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="flex items-center gap-2 text-sm text-smoke">
            <Icon name="flag" className="h-4 w-4" /> No milestones set up yet.
          </p>
        </div>
      )}
    </div>
  )
}
