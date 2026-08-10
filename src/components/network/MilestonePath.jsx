import { motion } from 'motion/react'
import { Link } from 'react-router-dom'
import Icon from '../Icon'
import { Avatar } from '../ui'
import { useIsMobile } from '../../lib/useKeyboardInset'
import { cx, formatViews } from '../../lib/utils'
import { EASE } from '../../lib/motion'

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

// A point at a fraction of the whole route. Every segment is the same length by
// construction (see the geometry note above), so the fraction maps onto segments
// linearly and no arc-length integration is needed.
function pointAtFraction(segs, f) {
  if (!segs.length) return null
  const t = Math.max(0, Math.min(1, f)) * segs.length
  const i = Math.min(segs.length - 1, Math.floor(t))
  return cubicAt(segs[i], t - i)
}

const REWARD_TONE = {
  merch: 'bg-brand text-white',
  voucher: 'bg-green-600 text-white',
  role: 'bg-ink text-white',
  access: 'bg-brand-light text-white',
  status: 'bg-brand-tint text-brand',
  other: 'bg-cloud text-smoke',
}

function metricLabel(metric, value, threshold) {
  const v = Number(value || 0)
  const t = Number(threshold || 0)
  if (metric === 'views') return `${formatViews(v)} of ${formatViews(t)} views`
  if (metric === 'videos') return `${Math.floor(v)} of ${t} videos`
  if (metric === 'referrals') return `${Math.floor(v)} of ${t} brought in`
  if (metric === 'challenges') return `${Math.floor(v)} of ${t} challenges`
  if (metric === 'days') return `${Math.floor(v)} of ${t} days`
  return `${Math.floor(v)} / ${t}`
}

export default function MilestonePath({ milestones = [], standings = [], showPeople = false, showCrowd = false }) {
  const isMobile = useIsMobile()
  const L = isMobile ? LAYOUT.narrow : LAYOUT.wide

  // Node 0 is "you joined". Everything after it is a milestone, so a creator
  // with nothing done yet still sees a road with a start on it rather than an
  // empty state.
  const nodes = [{ start: true }, ...milestones]
  const H = TOP + (nodes.length - 1) * L.gap + TOP
  const { d, segs } = buildRoute(nodes.length, L)

  const reached = milestones.filter((m) => m.reached).length
  const next = milestones[reached] || null
  // How far into the current leg. Measured against the NEXT milestone's own
  // metric, which is the only number that answers "how close am I".
  const legFraction = next
    ? Math.max(0, Math.min(1, Number(next.value || 0) / Number(next.threshold || 1)))
    : 1
  const legs = Math.max(1, nodes.length - 1)
  const progress = Math.min(1, (reached + legFraction) / legs)

  const planeSeg = segs[Math.min(reached, segs.length - 1)]
  const plane = planeSeg ? cubicAt(planeSeg, reached >= segs.length ? 1 : legFraction) : null

  // WHERE EVERYBODY ELSE IS.
  //
  // Not stacked at the stop they last passed - queued ALONG the route just
  // behind it, each one a little further back than the last. Two creators on
  // the same stop are two faces on the line rather than one face with another
  // hidden underneath it, and the shape of the queue is itself the answer to
  // "how is the community doing": a bunch near the start and a straggler out
  // front looks completely different from an even spread.
  const crowd = !showCrowd ? [] : (() => {
    const seen = new Map()
    return standings.map((s) => {
      const node = Math.min(Number(s.reached) || 0, legs)
      const rank = seen.get(node) || 0
      seen.set(node, rank + 1)
      const f = Math.max(0, (node - rank * 0.13) / legs)
      const p = pointAtFraction(segs, f)
      return p ? { ...s, x: p.x, y: p.y } : null
    }).filter(Boolean)
  })()

  return (
    <div className="relative w-full" style={{ aspectRatio: `${L.W} / ${H}` }}>
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
        <motion.path
          d={d}
          fill="none"
          stroke="#d94407"
          strokeWidth="4"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          whileInView={{ pathLength: progress }}
          viewport={{ once: true, margin: '0px 0px -20% 0px' }}
          transition={{ duration: 1.4, ease: EASE }}
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
        {plane && (
          <g>
            <circle r="15" fill="#d94407" opacity="0.14">
              <animateMotion
                dur="1.4s" fill="freeze" path={d}
                keyPoints={`0;${progress}`} keyTimes="0;1" calcMode="spline" keySplines="0.22 1 0.36 1"
              />
            </circle>
            <g>
              <g transform="rotate(90)">
                <path
                  d="M0 -9 C0.9 -9 1.5 -7.4 1.5 -5.1 L1.5 -3.6 L8.2 0.8 L8.2 2.5 L1.5 -0.2 L1.5 4.1 L3.6 6.2 L3.6 7.5 L0 6.3 L-3.6 7.5 L-3.6 6.2 L-1.5 4.1 L-1.5 -0.2 L-8.2 2.5 L-8.2 0.8 L-1.5 -3.6 L-1.5 -5.1 C-1.5 -7.4 -0.9 -9 0 -9 Z"
                  fill="#d94407"
                  stroke="#ffffff"
                  strokeWidth="1.4"
                  strokeLinejoin="round"
                />
              </g>
              <animateMotion
                dur="1.4s" fill="freeze" rotate="auto" path={d}
                keyPoints={`0;${progress}`} keyTimes="0;1" calcMode="spline" keySplines="0.22 1 0.36 1"
              />
            </g>
          </g>
        )}

        {/* EVERYONE ELSE ON THE ROAD, WHERE THEY ACTUALLY ARE.
            Admin-only for now. The page already stacked faces AT each stop,
            which answers "who has passed this point" and not "where is everybody
            up to" - and with one creator ahead of the pack it looked like the
            route only had one person on it. Each creator gets a dot at their own
            fraction of the route, fanned sideways so a cluster at the same stop
            is still countable. */}
        {showCrowd && crowd.map((c) => (
          <g key={c.id} transform={`translate(${c.x} ${c.y})`}>
            <circle r="9" fill="#ffffff" stroke="#d94407" strokeWidth="1.5"
              style={{ filter: 'drop-shadow(0 1px 2px rgba(20,20,30,0.25))' }} />
            {c.photo_url ? (
              <image href={c.photo_url} x="-7.5" y="-7.5" width="15" height="15"
                clipPath="url(#milestone-face)" preserveAspectRatio="xMidYMid slice" />
            ) : (
              <text x="0" y="0.5" textAnchor="middle" dominantBaseline="central"
                fontSize="7" fontWeight="700" fill="#d94407">{(c.name || '?').slice(0, 1)}</text>
            )}
            <title>{`${c.name} · ${c.reached} ${c.reached === 1 ? 'stop' : 'stops'}`}</title>
          </g>
        ))}

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
              whileInView={{ scale: 1, opacity: 1 }}
              viewport={{ once: true, margin: '0px 0px -15% 0px' }}
              transition={{ delay: Math.min(i * 0.08, 0.8), type: 'spring', stiffness: 320, damping: 22 }}
              style={{ transformOrigin: `${x}px ${y}px` }}
            >
              {isNext && (
                <circle cx={x} cy={y} r="18" fill="none" stroke="#d94407" strokeWidth="2" opacity="0.35">
                  <animate attributeName="r" values="14;22;14" dur="2.6s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.35;0;0.35" dur="2.6s" repeatCount="indefinite" />
                </circle>
              )}
              <circle
                cx={x} cy={y} r="13"
                fill={done ? '#d94407' : '#ffffff'}
                stroke={done ? '#d94407' : isNext ? '#d94407' : '#e2e2e6'}
                strokeWidth={isNext ? 3 : 2}
              />
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

      {/* ---------- Labels ---------- */}
      {nodes.map((n, i) => {
        const done = n.start || n.reached
        const isNext = !done && i === reached + 1
        const x = nodeX(i, L)
        const y = nodeY(i, L)
        // On a phone every label sits to the right of the lane. On desktop they
        // alternate so the curve has room to breathe.
        const rightSide = isMobile ? true : i % 2 === 0
        return (
          <motion.div
            key={n.id || 'start-label'}
            initial={{ opacity: 0, x: rightSide ? -10 : 10 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '0px 0px -15% 0px' }}
            transition={{ delay: Math.min(i * 0.08 + 0.1, 0.9), duration: 0.45, ease: EASE }}
            className={cx('absolute', rightSide ? 'text-left' : 'text-right')}
            style={{
              top: `${(y / H) * 100}%`,
              left: rightSide ? `${((x + 24) / L.W) * 100}%` : undefined,
              right: rightSide ? undefined : `${((L.W - x + 24) / L.W) * 100}%`,
              width: `${L.labelPct}%`,
              transform: 'translateY(-50%)',
            }}
          >
            {n.start ? (
              <>
                <p className="text-sm font-bold text-brand">You joined</p>
                <p className="text-xs text-smoke">Where every route starts.</p>
              </>
            ) : (
              <>
                <p className={cx('text-sm font-bold leading-tight', done ? 'text-ink' : isNext ? 'text-brand' : 'text-smoke')}>
                  {n.title}
                </p>
                {n.reward && (
                  <span className={cx(
                    'mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold',
                    done ? REWARD_TONE[n.reward_kind] || REWARD_TONE.other : 'bg-cloud text-smoke',
                  )}>
                    {n.reward}
                  </span>
                )}
                <p className="mt-1 text-[11px] text-smoke">
                  {done ? 'Reached' : metricLabel(n.metric, n.value, n.threshold)}
                </p>
                {/* Everyone else who has got at least this far. Seeing four
                    faces at the stop ahead of you is the single most motivating
                    thing this page can show, and it costs one extra query. */}
                {showPeople && (
                  <div className="mt-1.5 flex -space-x-1.5">
                    {standings.filter((s) => s.reached >= i).slice(0, 5).map((s) => (
                      <Link key={s.id} to={`/profile/${s.id}`} title={s.name} className="transition-transform hover:scale-110 hover:z-10">
                        <Avatar src={s.photo_url} name={s.name} size="xs" className="ring-2 ring-white" />
                      </Link>
                    ))}
                    {standings.filter((s) => s.reached >= i).length > 5 && (
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-cloud text-[9px] font-semibold text-smoke ring-2 ring-white">
                        +{standings.filter((s) => s.reached >= i).length - 5}
                      </span>
                    )}
                  </div>
                )}
              </>
            )}
          </motion.div>
        )
      })}

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
