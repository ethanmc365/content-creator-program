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
//
// WHERE THE PLANE SITS IN ITS OWN BOX, and why it moved
//
// It used to sit at x=14 of a 470-wide box, which put a third of the box - pure
// empty space - between the plane and whichever corner it was anchored to. On a
// card anchored top-right that read as a plane parked in the middle of the card
// rather than tucked into the corner, and the copy column had to reserve 24rem
// to stay clear of it, which is what crushed the countdown into 88px tiles and
// stacked the two buttons on top of each other.
//
// THE CONTRAIL RUNS STRAIGHT BACK. Two earlier versions curved it up to the
// corner of the card, which is what a firework does, not an aeroplane: a plane
// in level flight leaves its trail along the line it just flew, which is
// horizontal. The curve also made the plane read as climbing steeply while its
// own fuselage was level, so the two halves of the drawing disagreed.
//
// It is now a straight horizontal line from the tail to the right edge of the
// box, fading out as it goes, so it reads as continuing off the card rather
// than stopping. The plane sits far enough in from that edge to leave the trail
// somewhere to be.
//
// MEETING THE TAIL EXACTLY. The image is rotated by PITCH_FIX about its own
// centre, which MOVES the tail: at 135 units from centre a 2.5 degree rotation
// drops it about 6 units. Drawing the trail at the unrotated tail height left a
// visible step where the two met. `rotateAboutCentre` below does the arithmetic
// rather than leaving the next person to notice the gap and nudge a magic
// number until it closes.
function rotateAboutCentre(px, py, cx, cy, deg) {
  const a = (deg * Math.PI) / 180
  const dx = px - cx
  const dy = py - cy
  return [cx + dx * Math.cos(a) - dy * Math.sin(a), cy + dx * Math.sin(a) + dy * Math.cos(a)]
}

function Drawing({ id, animate }) {
  const VB_W = 400
  const VB_H = 220
  const PLANE_W = 300
  const PLANE_H = PLANE_W * (471 / 1200) // the asset's own aspect ratio
  // Left of where it used to sit, by exactly the length the trail needs.
  const PLANE_X = 40
  const PLANE_Y = 96

  const [tailX, tailY] = rotateAboutCentre(
    PLANE_X + TAIL.x * PLANE_W,
    PLANE_Y + TAIL.y * PLANE_H,
    PLANE_X + PLANE_W / 2,
    PLANE_Y + PLANE_H / 2,
    PITCH_FIX,
  )

  return (
    <svg viewBox={`0 0 ${VB_W} ${VB_H}`} fill="none" aria-hidden className="h-full w-full">
      <defs>
        {/* Strong where it meets the tail, gone by the far end. A dashed line of
            constant opacity reads as a border, not as exhaust. */}
        {/* Left to right, because that is now the direction the trail runs:
            strong where it leaves the tail, gone by the edge of the card. A
            dashed line of constant opacity reads as a border, not as exhaust. */}
        <linearGradient id={`${id}-fade`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.75" />
          <stop offset="55%" stopColor="currentColor" stopOpacity="0.32" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Plane and trail move as ONE group. Animating them separately would
          unglue the trail from the tail on every frame of the bob. */}
      <g
        className={animate ? 'animate-cruise' : undefined}
        style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
      >
        {/* Tail to edge, level. Drawn tail-first so the gradient's 0% lands on
            the end that touches the plane, and so a positive dash offset marches
            the dashes AWAY from it, which is the direction real exhaust goes.
            It starts a few units clear of the tail fin so the first dash is not
            sitting on the artwork. */}
        <path
          d={`M ${tailX + 6} ${tailY} L ${VB_W} ${tailY}`}
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
  // space (see LiveChallengeCard's pr-* on the heading block).
  //
  // The box is sized by width and an explicit aspect ratio rather than by a
  // width/height pair. The svg is `xMidYMid meet`, so a box whose ratio drifts
  // from the viewBox's letterboxes the drawing and floats the plane back off
  // the corner it was just moved into. Tying the two together makes that
  // impossible to get wrong later.
  return (
    <span
      aria-hidden
      className={cx(
        'pointer-events-none absolute hidden aspect-[20/11] w-[23rem] text-white lg:block xl:w-[25rem]',
        ANCHOR[anchor] || ANCHOR.bottom,
        className,
      )}
    >
      <Drawing id={`${id}-hero`} animate={animate} />
    </span>
  )
}
