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
 *
 * THE THIRD BUG, AND WHY THE CURVE IS GONE ENTIRELY. Smoothstep is symmetric,
 * which fixed the front-loading, but it is still a CURVE: its slope is zero at
 * both ends. On a count to six that is plainly visible, because the readout is
 * an INTEGER - the number of frames each integer is on screen is inversely
 * proportional to the slope, so 0 and 1 sit there for a quarter of a second
 * each while 3 and 4 flick past in two frames. The row does not read as six
 * counters running; it reads as numbers stopping and starting at different
 * moments. Ethan: "they should all start at 0 and never pause, just increase up
 * until the actual number, currently they seem to pause on certain numbers for
 * different amounts of time and it looks bad."
 *
 * A count is not a physical object arriving, it is a TALLY, and a tally has one
 * honest curve: a straight line. Linear means every integer between zero and
 * the total is on screen for exactly the same number of frames, which is the
 * definition of not pausing. It also keeps everything the fixed clock bought -
 * all four still start on one frame and land on one frame.
 *
 * AND IT NO LONGER RE-RENDERS REACT SIXTY TIMES A SECOND. This wrote the value
 * into state on every frame, so four counters in a row meant four component
 * renders per frame, on the same frames the hero card's Reveal is running its
 * own transition. That is the other half of "it looks bad": genuine dropped
 * frames, clustered exactly where the numbers change fastest. The animation
 * writes `textContent` straight onto its own span instead - the DOM is the only
 * thing that has to change, so it is the only thing that does.
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

/** LINEAR, and that is the whole point - see the note above. A constant rate is
 *  the only curve under which every integer on the way is on screen for the
 *  same length of time, and "no number pauses" is the requirement.
 *
 *  It is still a named, exported, tested function rather than an inlined `t`,
 *  because the preview pane freezes rAF and this is the only place the
 *  behaviour can actually be asserted. */
export const countEase = (t) => t

export function CountUp({ value, duration, className, format = (n) => n }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '0px 0px -10% 0px' })
  const reduced = useReducedMotion()
  const target = Number(value) || 0
  // `shown` exists for the FIRST PAINT and for reduced motion only. Every frame
  // after that is written straight to the node (see below), so this state is
  // deliberately not updated during the animation.
  const [shown, setShown] = useState(0)
  // The last value painted, for the effect to animate FROM. A ref because the
  // effect must not restart every time the number ticks, which is what putting
  // it in the dependency array would do.
  const shownRef = useRef(0)
  // `format` is a fresh arrow on every render at almost every call site, so it
  // cannot be a dependency of the animation effect without restarting it on
  // every parent render. The ref is read inside the frame instead - and it is
  // written in an effect rather than during render, because `react-hooks/refs`
  // (correctly) refuses a ref write in the render body.
  const formatRef = useRef(format)
  useEffect(() => { formatRef.current = format })

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
    const node = ref.current
    let raf = 0
    // The caller can still name a duration; nothing does, and the derived one
    // is the point - see countDuration above.
    const ms = duration ?? countDuration()
    const start = performance.now()
    const paint = (v) => {
      shownRef.current = v
      // STRAIGHT TO THE DOM. Not setState: this runs sixty times a second on up
      // to four counters at once, and a React render per counter per frame is
      // work nobody can see the result of, on exactly the frames that have to
      // be smooth. `textContent` is one string assignment.
      if (node) node.textContent = String(formatRef.current(v))
    }
    const tick = (now) => {
      const t = Math.min(1, (now - start) / ms)
      paint(Math.round(from + (target - from) * countEase(t)))
      if (t < 1) raf = requestAnimationFrame(tick)
      // The last frame is committed to state as well, so the number survives
      // the next React render. Without it the node's text would be thrown away
      // the moment the parent re-rendered for any other reason.
      else setShown(target)
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
