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

/** A section that rises into view once, as it scrolls in. */
export function Reveal({ children, delay = 0, className, as = 'div' }) {
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
 */
export function CountUp({ value, duration = 900, className, format = (n) => n }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '0px 0px -10% 0px' })
  const reduced = useReducedMotion()
  const target = Number(value) || 0
  const [shown, setShown] = useState(0)
  // State, not a ref: whether the run-once animation has happened is something
  // render depends on, and reading a ref during render is exactly the bug the
  // lint rule exists to catch.
  const [ran, setRan] = useState(false)

  useEffect(() => {
    if (!inView || ran) return
    setRan(true)
    if (reduced || target === 0) { setShown(target); return }
    let raf = 0
    const start = performance.now()
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration)
      // Same easing as everything else, so a counter and a card that arrive
      // together feel like one movement.
      setShown(Math.round(target * (1 - Math.pow(1 - t, 3))))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [inView, target, duration, reduced, ran])

  // Once the run-once animation is done, later data wins: a refresh that moves
  // 43 to 44 must show 44, not stay on whatever we last animated to.
  useEffect(() => {
    if (ran) setShown(target)
    // Deliberately only when the target changes, not when `shown` does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target])

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
