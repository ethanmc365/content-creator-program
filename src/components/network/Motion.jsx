import { useEffect, useRef, useState } from 'react'
import { motion, useInView, useReducedMotion } from 'motion/react'
import { reveal, EASE } from '../../lib/motion'
import { cx } from '../../lib/utils'

// Small motion pieces used across the network pages.
//
// They live together because they share one rule: MOTION IS A UNIT OF MEANING,
// not decoration. A section rising as it enters says "this is new to you". A
// number counting up says "this is a quantity that moves". A ring filling says
// "you are partway through something". If a component here cannot answer what
// its animation is telling the reader, it should not be animated.
//
// Everything respects `prefers-reduced-motion` through Motion's own
// `useReducedMotion`, which reads the same signal as the global MotionConfig in
// main.jsx. Reduced motion gets the end state instantly, never a broken layout.

/** A section that rises into view once, as it scrolls in.
 *
 * NAMED RiseIn, not Reveal. There is a `Reveal` in this folder already - the
 * staggered grid one - and having two exports called Reveal that do different
 * things has now caused two separate mistakes, because an import line does not
 * say which you got. This one animates ONE element; that one animates a list.
 */
export function RiseIn({ children, delay = 0, className, as = 'div' }) {
  const reduced = useReducedMotion()
  const Tag = motion[as] || motion.div
  if (reduced) return <div className={className}>{children}</div>
  return (
    <Tag
      {...reveal}
      transition={{ ...reveal.transition, delay }}
      className={className}
    >
      {children}
    </Tag>
  )
}

/**
 * A number that counts to its value the first time it is seen.
 *
 * Counting from zero on every render would be a lie about what changed, so it
 * animates once per mount and then simply shows the number. Uses rAF rather
 * than a spring because a count is a discrete readout: it should land exactly
 * on the value, not overshoot to 44 and settle back to 43.
 *
 * EVERY COUNTER TAKES THE SAME TIME, WHATEVER IT IS COUNTING TO, and the curve
 * is not the one the rest of the app uses.
 *
 * THE FIRST BUG. Every counter ran for a flat 900ms on a cubic ease-out, and a
 * cubic ease-out is violently front-loaded: a fifth of the way through the time
 * it is already halfway through the distance. On a six-figure kilometre total
 * that is invisible, because the digits keep moving for the whole second
 * regardless. On "44 creators" it means the counter reads 24 on the second
 * frame and 41 a moment later, so the big number animated and the small ones
 * next to it appeared to snap. SMOOTHSTEP fixed that: `t*t*(3-2t)` is
 * symmetric, so a count to 44 passes through roughly every number on the way.
 *
 * THE SECOND BUG, AND WHY THE DURATION IS NOW A CONSTANT. The fix for the first
 * one made the duration follow the magnitude logarithmically, which is
 * defensible on its own and wrong in the place these counters actually live: a
 * ROW of four figures, read as one thing. A count to 6 finished in 800ms while
 * the kilometre total beside it ran for 1.5s, so the row landed in four
 * instalments and the small numbers looked like they had given up early -
 * Ethan: "it just shows a number like 6 and then suddenly jumps to the total".
 *
 * So the time is fixed and the RATE is what varies: everything starts at zero
 * on the same frame and everything arrives on the same frame, which makes the
 * kilometres blur, the creator count tick briskly and the six markets climb one
 * at a time. That is the reading the row wants, and it is only available if the
 * clock is shared.
 */
// 1.6s: long enough that a count to six is unmistakably a count and not a
// flicker, short enough that nobody is waiting on the card.
export const COUNT_MS = 1600

// Exported so it can be tested without a component. The preview browser freezes
// requestAnimationFrame (document.hidden is true), so a counter cannot be
// watched there at all - which means the only honest way to check what was
// wrong with it is to check the arithmetic directly.
export function countDuration() {
  return COUNT_MS
}

/** Smoothstep. Eases in and out, and is at the halfway VALUE at the halfway
 *  TIME - which the cubic ease-out this replaced was nowhere near. */
export const countEase = (t) => t * t * (3 - 2 * t)

export function CountUp({ value, duration, className, format = (n) => n }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '0px 0px -10% 0px' })
  const reduced = useReducedMotion()
  const target = Number(value) || 0
  const [shown, setShown] = useState(0)
  // The last value painted, for the effect to animate FROM. A ref because the
  // effect must not restart every time the number ticks, which is what putting
  // it in the dependency array would do.
  const shownRef = useRef(0)

  // THE BUG THIS FIXES: THE COUNTER CANCELLED ITS OWN ANIMATION AND STUCK ON
  // ZERO.
  //
  // There used to be a `ran` state flag, set inside this effect and also listed
  // in its dependency array. Setting it re-rendered, the changed dependency
  // re-ran the effect, and React runs the PREVIOUS run's cleanup first - so
  // `cancelAnimationFrame` fired on the frame after the animation started,
  // every time. `shown` was left at whatever the first tick produced, which is
  // zero, and a second effect only pushed the real number through when `target`
  // itself changed afterwards.
  //
  // On a page where the data is already loaded before the counter mounts -
  // which is every stats page, because they render a skeleton until the rows
  // land - `target` never changes again, so the number simply never arrived.
  // That is Ethan's "the km wasn't updating on the cards at the top": the
  // figures were not stale, they had never been drawn.
  //
  // No flag now. The effect animates from wherever the number currently is to
  // wherever it should be, and re-runs when the target moves - which also makes
  // an update after adding a flight animate to the new total instead of
  // snapping to it.
  useEffect(() => {
    if (!inView) return undefined
    if (reduced) { shownRef.current = target; setShown(target); return undefined }
    const from = shownRef.current
    if (from === target) return undefined
    let raf = 0
    // The caller can still name a duration; nothing does, and the derived one
    // is the point - see countDuration above.
    const ms = duration ?? countDuration()
    const start = performance.now()
    const tick = (now) => {
      const t = Math.min(1, (now - start) / ms)
      // Smoothstep, not the app's ease-out: a count has to pass THROUGH its
      // range, and an ease-out skips most of a small one on the first frame.
      const v = Math.round(from + (target - from) * countEase(t))
      shownRef.current = v
      setShown(v)
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [inView, target, duration, reduced])

  return (
    <span ref={ref} className={cx('tabular-nums', className)}>
      {format(shown)}
    </span>
  )
}

/**
 * A progress ring. Used for "how complete is your profile", where a bar would
 * read as loading and a percentage alone reads as a grade.
 */
export function ProgressRing({ value = 0, size = 44, stroke = 4, className, children }) {
  const reduced = useReducedMotion()
  const r = (size - stroke) / 2
  const circumference = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(100, value))
  return (
    <span className={cx('relative inline-flex shrink-0 items-center justify-center', className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-gray-200" />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round"
          className="stroke-brand"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: reduced ? circumference * (1 - pct / 100) : circumference }}
          animate={{ strokeDashoffset: circumference * (1 - pct / 100) }}
          transition={{ duration: reduced ? 0 : 1, ease: EASE }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold tabular-nums">
        {children ?? `${Math.round(pct)}%`}
      </span>
    </span>
  )
}

/**
 * A live dot. Three sizes of the same idea used in five places, so it is one
 * component rather than five copies of a nested absolute span.
 */
export function LiveDot({ size = 'sm', tone = 'brand', className }) {
  const px = size === 'lg' ? 'h-2.5 w-2.5' : size === 'md' ? 'h-2 w-2' : 'h-1.5 w-1.5'
  const colour = tone === 'white' ? 'bg-white' : tone === 'green' ? 'bg-green-500' : 'bg-brand'
  return (
    <span className={cx('relative flex', px, className)}>
      <span className={cx('absolute inline-flex h-full w-full animate-ping rounded-full opacity-70', colour)} />
      <span className={cx('relative inline-flex rounded-full', px, colour)} />
    </span>
  )
}
