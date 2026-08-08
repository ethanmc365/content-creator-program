import { cx } from '../../lib/utils'

// The Tryp.com plane as decoration.
//
// WHICH FILE, AND WHY IT MATTERS
//
// `tryp-plane-transparent.png` is a 1-bit cutout taken off white: every edge is
// a staircase and 96% of its boundary pixels are near-white. On a white card
// nobody can tell. On brand orange it wears a bright halo and the edges crawl.
// `tryp-plane-cutout.png` is the cleaned version and is the only one that
// belongs here.
//
// WHICH WAY THE PLANE FACES, measured rather than assumed
//
// The first version of this got it backwards, which is why the contrail came
// out of the nose and the plane looked like it was diving. Profiling the alpha
// channel of the 1200x471 asset column by column settles it:
//
//   x=42    height 4px    <- a fine point: the NOSE
//   x=609   height 155px  <- fuselage plus wing root
//   x=1050  height 237px  <- the tallest structure on the plane: the TAIL FIN
//   x=1176  height 2px    <- the tip of the horizontal stabiliser
//
// So the plane flies LEFT. The fuselage centreline runs from y≈309 at the nose
// to y≈248 near the tail, which means the nose sits about 2 degrees BELOW the
// tail: the artwork is pitched slightly nose-down on its own. PITCH_FIX cancels
// that, and the cruise animation oscillates around level instead of adding to
// the dive (the old keyframe rotated to -4deg, which with a left-facing nose
// pushed it down another four degrees).
// Only the tail is used (it is where the contrail attaches); the nose is
// recorded because it is what the numbers above are evidence FOR, and the next
// person to touch this will want the measurement, not the conclusion.
// NOSE = { x: 0.035, y: 0.656 }
const TAIL = { x: 0.95, y: 0.505 }
// Clockwise, in degrees. With the nose on the left, a positive rotation lifts
// it. Enough to read as level, not so much that it looks like it is climbing.
const PITCH_FIX = 2.5

// One drawing, scaled by the caller. Everything is expressed relative to the
// plane's own box, so changing PLANE_W moves the contrail with it rather than
// leaving it behind.
function Drawing({ id, animate }) {
  const VB_W = 470
  const VB_H = 250
  const PLANE_W = 300
  const PLANE_H = PLANE_W * (471 / 1200) // the asset's own aspect ratio
  // Left of centre, because the trail extends to the RIGHT (the plane is
  // flying left, so what it leaves behind is behind it, which is to its right).
  const PLANE_X = 14
  const PLANE_Y = 84

  const tailX = PLANE_X + TAIL.x * PLANE_W
  const tailY = PLANE_Y + TAIL.y * PLANE_H

  return (
    <svg viewBox={`0 0 ${VB_W} ${VB_H}`} fill="none" aria-hidden className="h-full w-full">
      <defs>
        {/* Strong where it meets the tail, gone by the far end. A dashed line of
            constant opacity reads as a border, not as exhaust. */}
        <linearGradient id={`${id}-fade`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.7" />
          <stop offset="55%" stopColor="currentColor" stopOpacity="0.3" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Plane and trail move as ONE group. Animating them separately would
          unglue the trail from the tail on every frame of the bob. */}
      <g
        className={animate ? 'animate-cruise' : undefined}
        style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
      >
        {/* Drawn from the far end TO the tail, so a positive dash offset marches
            the dashes away from the plane, which is the direction real exhaust
            goes. The path never crosses the fuselage: it starts beyond the tail
            and stops at it. */}
        <path
          d={`M ${VB_W - 8} 14 C ${VB_W * 0.82} 60, ${tailX + 56} 118, ${tailX} ${tailY}`}
          stroke={`url(#${id}-fade)`}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray="11 13"
          className={animate ? 'animate-contrail' : undefined}
        />

        <image
          href="/brand/tryp-plane-cutout.png"
          x={PLANE_X}
          y={PLANE_Y}
          width={PLANE_W}
          height={PLANE_H}
          // transform-box defaults differ across engines for SVG children, so a
          // bare `transform-origin: center` can resolve against the whole
          // viewBox and swing the plane in an arc. fill-box pins it to the
          // image's own box.
          style={{
            transformBox: 'fill-box',
            transformOrigin: 'center',
            transform: `rotate(${PITCH_FIX}deg)`,
          }}
        />
      </g>
    </svg>
  )
}

// Where on the card the plane parks. Not a style preference: each card has a
// different free corner, and a plane over a heading is just a heading nobody
// can read.
const ANCHOR = {
  bottom: 'bottom-0 right-0',
  top: 'top-0 right-0',
  center: 'top-1/2 right-0 -translate-y-1/2',
}

/**
 * @param {'hero'|'inline'|'badge'} variant
 *   hero   - large, on a brand-orange card. Needs a card at least `lg` wide and
 *            text that has been told to keep clear of it.
 *   inline - large, centred, for empty states
 *   badge  - small mark next to a line of text
 * @param {'bottom'|'top'|'center'} anchor  which corner it parks in
 */
export default function TrypPlane({ variant = 'hero', anchor = 'bottom', className, animate = true, id = 'plane' }) {
  if (variant === 'badge') {
    return (
      <img
        src="/brand/tryp-plane-cutout.png"
        alt=""
        aria-hidden
        className={cx('pointer-events-none h-4 w-7 shrink-0 object-contain', className)}
      />
    )
  }

  if (variant === 'inline') {
    return (
      <span
        aria-hidden
        className={cx('pointer-events-none block h-28 w-56 text-brand sm:h-36 sm:w-80', className)}
      >
        <Drawing id={`${id}-inline`} animate={animate} />
      </span>
    )
  }

  // hero. Hidden below `lg`, not `md`: at tablet widths the card's copy still
  // runs the full width and the plane ends up behind the description, which is
  // exactly what it looked like before. Cards that show it also reserve the
  // space (see LiveChallengeCard's pr-* on the copy column).
  return (
    <span
      aria-hidden
      className={cx(
        'pointer-events-none absolute hidden h-[13rem] w-[24rem] text-white lg:block',
        'xl:h-[15rem] xl:w-[27rem]',
        ANCHOR[anchor] || ANCHOR.bottom,
        className,
      )}
    >
      <Drawing id={`${id}-hero`} animate={animate} />
    </span>
  )
}
