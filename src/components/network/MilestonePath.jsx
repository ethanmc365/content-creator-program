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

const GAP = 150          // vertical distance between nodes
const TOP = 62           // where the first node sits

// Desktop serpentines across the full width; a phone keeps the route in a
// narrow lane on the left and stacks every label in a column to its right,
// because alternating 120px-wide labels at 375px is unreadable.
const LAYOUT = {
  wide: { W: 340, left: 76, right: 264 },
  narrow: { W: 150, left: 40, right: 104 },
}

function nodeX(i, L) {
  return i % 2 === 0 ? L.left : L.right
}

function nodeY(i) {
  return TOP + i * GAP
}

// The whole route as one path string, plus the control points, so the plane can
// be placed on it without asking the DOM where anything is.
function buildRoute(count, L) {
  const segs = []
  let d = `M ${nodeX(0, L)} ${nodeY(0)}`
  for (let i = 0; i < count - 1; i += 1) {
    const p0 = [nodeX(i, L), nodeY(i)]
    const p3 = [nodeX(i + 1, L), nodeY(i + 1)]
    const c1 = [p0[0], p0[1] + GAP * 0.55]
    const c2 = [p3[0], p3[1] - GAP * 0.55]
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

export default function MilestonePath({ milestones = [], standings = [], showPeople = false }) {
  const isMobile = useIsMobile()
  const L = isMobile ? LAYOUT.narrow : LAYOUT.wide

  // Node 0 is "you joined". Everything after it is a milestone, so a creator
  // with nothing done yet still sees a road with a start on it rather than an
  // empty state.
  const nodes = [{ start: true }, ...milestones]
  const H = TOP + (nodes.length - 1) * GAP + TOP
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

  return (
    <div className="relative w-full" style={{ aspectRatio: `${L.W} / ${H}` }}>
      <svg viewBox={`0 0 ${L.W} ${H}`} className="absolute inset-0 h-full w-full" aria-hidden>
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

        {/* The plane, where the creator has actually got to. */}
        {plane && (
          <motion.g
            initial={{ opacity: 0, scale: 0.6 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 1.1, duration: 0.5, ease: EASE }}
            style={{ transformOrigin: `${plane.x}px ${plane.y}px` }}
          >
            <circle cx={plane.x} cy={plane.y} r="15" fill="#d94407" opacity="0.14" />
            <g transform={`translate(${plane.x} ${plane.y}) rotate(${plane.angle - 90})`}>
              <path
                d="M0 -9 C0.9 -9 1.5 -7.4 1.5 -5.1 L1.5 -3.6 L8.2 0.8 L8.2 2.5 L1.5 -0.2 L1.5 4.1 L3.6 6.2 L3.6 7.5 L0 6.3 L-3.6 7.5 L-3.6 6.2 L-1.5 4.1 L-1.5 -0.2 L-8.2 2.5 L-8.2 0.8 L-1.5 -3.6 L-1.5 -5.1 C-1.5 -7.4 -0.9 -9 0 -9 Z"
                fill="#d94407"
                stroke="#ffffff"
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
            </g>
          </motion.g>
        )}

        {/* The stops. Drawn after the route so the line never crosses a dot. */}
        {nodes.map((n, i) => {
          const done = n.start || n.reached
          const isNext = !done && i === reached + 1
          const x = nodeX(i, L)
          const y = nodeY(i)
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
        const y = nodeY(i)
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
              width: isMobile ? `${((L.W - x - 30) / L.W) * 100}%` : '38%',
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
