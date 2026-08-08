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
// WHY THE PLANE AND ITS TRAIL ARE ONE SVG
//
// They were two things: an absolutely-positioned <img> and a separate SVG whose
// path happened to pass nearby. Nothing tied the end of the path to the back of
// the plane, so the dashes ran straight through the fuselage and out past the
// nose, which reads as a plane flying INTO its own contrail. Putting the image
// inside the SVG means the path can terminate at the tail by construction.
//
// The geometry below is measured from the asset, not guessed. In the 1200x471
// PNG the opaque pixels span x 41..1177, y 38..387; the tail sits at about
// (x 0.045, y 0.66) of the whole image and the nose at (x 0.975, y 0.49), so
// the plane points right and slightly up. TAIL_X / TAIL_Y are those fractions.

const TAIL_X = 0.045
const TAIL_Y = 0.66

// One drawing, scaled by the caller. viewBox units are arbitrary; everything is
// expressed relative to the plane box so changing PLANE_W moves the trail with
// it instead of leaving it behind.
function Drawing({ id, animate }) {
  const VB_W = 460
  const VB_H = 250
  const PLANE_W = 268
  const PLANE_H = PLANE_W * (471 / 1200) // the asset's own aspect ratio
  // Inset from the right so the nose does not kiss the card's edge. The asset's
  // opaque pixels run to 0.975 of its width, so a small margin here is the
  // difference between "flying past" and "clipped".
  const PLANE_X = VB_W - PLANE_W - 26
  // Low in its own box, not centred. The box is anchored to a corner of the
  // card, so where the plane sits INSIDE the box is what decides whether it
  // lands in the free quadrant or across the heading. Sitting low leaves the
  // room the trail needs beneath it and keeps the plane out of the text.
  const PLANE_Y = 88

  const tailX = PLANE_X + TAIL_X * PLANE_W
  const tailY = PLANE_Y + TAIL_Y * PLANE_H

  return (
    <svg viewBox={`0 0 ${VB_W} ${VB_H}`} fill="none" aria-hidden className="h-full w-full">
      <defs>
        {/* The trail fades out the further it gets from the plane, which is
            what stops a dashed line reading as a border. */}
        <linearGradient id={`${id}-fade`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0" />
          <stop offset="45%" stopColor="currentColor" stopOpacity="0.32" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.75" />
        </linearGradient>
      </defs>

      {/* Ends AT the tail. The curve is drawn from far away toward the plane so
          a positive dash offset marches the dashes backwards, away from it,
          which is the direction a real contrail moves. */}
      <path
        d={`M 4 ${VB_H - 14} C ${VB_W * 0.22} ${VB_H - 20}, ${VB_W * 0.33} ${VB_H - 56}, ${tailX} ${tailY}`}
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
        className={animate ? 'animate-cruise' : undefined}
        // transform-box defaults differ across engines for SVG children, so a
        // bare `transform-origin: center` can resolve against the whole viewBox
        // and swing the plane in an arc. fill-box pins it to the image's own
        // box, which is what "rotate slightly about itself" means.
        style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
      />
    </svg>
  )
}

// Where on the card the plane parks. Not a style preference: each card has a
// different free corner, and a plane over a heading is just a heading nobody
// can read.
//   bottom - stats and copy are top/left, the lower right is empty (welcome,
//            explore, the new-market invitation)
//   top    - the live challenge card, whose buttons sit bottom right on desktop
//            and whose badges sit top LEFT
const ANCHOR = {
  bottom: 'bottom-0 right-0',
  top: 'top-0 right-0',
  center: 'top-1/2 right-0 -translate-y-1/2',
}

/**
 * @param {'hero'|'inline'|'badge'} variant
 *   hero   - large, on a brand-orange card
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
        className={cx('pointer-events-none block h-32 w-60 text-brand sm:h-40 sm:w-80', className)}
      >
        <Drawing id={`${id}-inline`} animate={animate} />
      </span>
    )
  }

  // hero. Hidden below `md` because on a phone the card is all text and a plane
  // behind it is noise at best; from `md` up there is a free corner to park in.
  return (
    <span
      aria-hidden
      className={cx(
        'pointer-events-none absolute hidden h-[11rem] w-[20rem] text-white md:block',
        'lg:h-[13.5rem] lg:w-[25rem] xl:h-[15rem] xl:w-[28rem]',
        ANCHOR[anchor] || ANCHOR.bottom,
        className,
      )}
    >
      <Drawing id={`${id}-hero`} animate={animate} />
    </span>
  )
}
