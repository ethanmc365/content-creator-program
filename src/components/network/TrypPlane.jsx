import { cx } from '../../lib/utils'

// The Tryp.com plane as decoration on a brand-orange surface.
//
// WHICH FILE, AND WHY IT MATTERS
//
// `tryp-plane-transparent.png` is a 1-bit cutout taken off white: every edge is
// a staircase and 96% of its boundary pixels are near-white. On a white card
// nobody can tell. On brand orange it wears a bright halo and the edges crawl.
// `tryp-plane-cutout.png` is the cleaned version (halo eroded, colours bled
// outward, alpha feathered) and is the only one that belongs here.
//
// Purely decorative, so aria-hidden and pointer-events-none throughout: it must
// never intercept a click meant for the card it is sitting on, and a screen
// reader announcing "image" over a live challenge helps no one.

// The contrail is one quadratic curve rather than a straight line: a plane that
// has clearly banked reads as travelling somewhere, a straight dash reads as a
// border. Drawn behind the plane and fading out toward the tail.
function Contrail({ className }) {
  return (
    <svg
      viewBox="0 0 200 120"
      fill="none"
      aria-hidden
      className={cx('pointer-events-none absolute', className)}
    >
      <path
        d="M4 108 Q 70 104 108 66 T 190 14"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="9 11"
        className="animate-contrail opacity-50"
      />
    </svg>
  )
}

/**
 * @param {'corner'|'inline'|'badge'} variant
 *   corner - large, top-right of a hero card, with a contrail
 *   inline - medium, sits in flow (empty states)
 *   badge  - small, next to a line of text
 */
export default function TrypPlane({ variant = 'corner', className, trail = true, animate = true }) {
  if (variant === 'badge') {
    return (
      <img
        src="/brand/tryp-plane-cutout.png"
        alt=""
        aria-hidden
        className={cx('pointer-events-none h-4 w-4 shrink-0 object-contain', className)}
      />
    )
  }

  if (variant === 'inline') {
    return (
      <span className={cx('pointer-events-none relative inline-flex h-20 w-28 items-center justify-center', className)}>
        {trail && <Contrail className="inset-0 h-full w-full text-brand/45" />}
        <img
          src="/brand/tryp-plane-cutout.png"
          alt=""
          aria-hidden
          className={cx('relative h-10 w-10 object-contain', animate && 'animate-cruise')}
        />
      </span>
    )
  }

  // corner
  return (
    <span
      aria-hidden
      className={cx(
        'pointer-events-none absolute right-0 top-0 hidden h-40 w-56 select-none sm:block',
        className,
      )}
    >
      {trail && <Contrail className="inset-0 h-full w-full text-white/55" />}
      <img
        src="/brand/tryp-plane-cutout.png"
        alt=""
        className={cx(
          'absolute right-7 top-6 h-14 w-14 object-contain drop-shadow-[0_6px_14px_rgba(0,0,0,0.18)]',
          animate && 'animate-cruise',
        )}
      />
    </span>
  )
}
