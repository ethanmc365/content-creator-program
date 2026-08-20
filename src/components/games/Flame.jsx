import { useId } from 'react'
import { cx } from '../../lib/utils'

// A FIRE, AT THE SIZE OF A WORD.
//
// WHAT WAS THERE. Two flat paths - one `#d94407` body, one `#fbbf24` blob -
// swaying on the streak-card's keyframes. At fourteen pixels that is an orange
// leaf with a yellow dot on it. Ethan: "the visible fire constant animation
// icon should be improved, it should look like an actual fiery flame with the
// different orange colours, like a nice animated fire."
//
// WHAT MAKES A DRAWING READ AS FIRE, in the order the eye picks it up:
//
//   TEMPERATURE, AS COLOUR, IN THE RIGHT DIRECTION. A flame is hottest at the
//   BASE and coolest at the tip, so every gradient here runs bottom to top and
//   goes white-hot -> yellow -> orange -> deep red at the edges. The old one
//   had two colours and no direction at all, which is why it read as a shape
//   filled in rather than as something burning.
//
//   FOUR TEMPERATURES, NOT TWO. An outer envelope in the darkest orange, the
//   body, an inner tongue, and a white core. Each one smaller and hotter than
//   the one outside it, which is what gives a flame its depth at any size.
//
//   AND THREE TONGUES, NOT TWO. Ethan: "it doesn't look like an actual flame,
//   it should be more fiery and have 3 points like a flame that actually
//   animates like a flame, not just 2." The old outline had a tall tip and one
//   side notch, which is a leaf with a bite out of it. Every layer now has a
//   tall centre tongue with a SHORTER one either side of it, separated by real
//   valleys - and the side tongues are deliberately uneven in height, because
//   two matching ones read as a fleur-de-lis rather than as fire. The layers
//   run on four different clocks, so the three tips never peak together and
//   the silhouette keeps changing shape.
//
//   FOUR CLOCKS THAT DO NOT DIVIDE INTO ONE ANOTHER. 1.9s, 1.25s, 0.8s and
//   2.1s: the loop never visibly repeats, which is the whole difference
//   between a fire and a looping animation of a fire. Layers moving on ONE
//   clock is a shape wobbling.
//
//   AND EVERY LAYER IS ANCHORED AT ITS BASE. `transform-origin: 50% 92%` - a
//   flame pinned at its middle grows downwards as well as up, which reads as a
//   balloon inflating. This is why the origin is set per element and not on the
//   svg: the layers have different heights.
//
// ONE COMPONENT, EVERY SIZE. The leaderboard chip, the hub's streak pill and
// anything else that needs a lit flame all draw this. There used to be an
// inline copy per surface, and they had already drifted into three different
// fires on three pages of the same product.
//
// NO MOTION IMPORT: this is drawn on the eagerly routed hub.

const FROM_BASE = { transformBox: 'fill-box', transformOrigin: '50% 92%' }

/**
 * EACH FLAME CARRIES ITS OWN GRADIENTS, KEYED BY `useId`.
 *
 * The obvious saving is one shared `<defs>` per page, the way ThumbtackDefs
 * does it, and it is the wrong trade here. A pin is drawn in exactly two
 * places, both of which can mount the defs beside it; a flame is drawn in a
 * shared `StreakChip` that appears on the UK home card, three daily boards, the
 * hub and every row of a leaderboard - so "did somebody remember to mount the
 * defs on this page" becomes a question with dozens of answers, and the failure
 * mode is silent and total: an unresolvable `url(#…)` paints NOTHING, so the
 * flame simply vanishes on whichever surface was forgotten.
 *
 * Three gradient elements per flame is nothing. A component that cannot be
 * dropped anywhere is a real cost.
 *
 * TWO TONES, BECAUSE THE BIG STREAK CARD IS ITSELF BRAND ORANGE.
 *
 * `fire` is the real thing and the default: amber at the base through brand
 * orange to a burnt edge, which is what a fire looks like and what reads on a
 * white page. On the streak card it is invisible - that card is a brand-orange
 * gradient, and an orange flame on it is the exact mistake the week strip made
 * when a played day was `bg-brand`. `warm` is the same fire drawn white through
 * amber, which is the highest contrast available on that surface.
 *
 * THREE STATES, AND ONLY THE FIRST IS ACTUALLY ALIGHT.
 *
 *   lit    today is counted. Every layer, moving, hottest at the base.
 *   ember  the run is alive but today is not counted yet. Envelope only, drawn
 *          hollow and cool, breathing slowly. Unmistakably the SAME object with
 *          the fire out, which is what makes the difference legible without a
 *          key.
 *   cold   no run. Flat, still, an invitation rather than a rebuke.
 *
 * @param {object} p
 * @param {string} p.className   size classes; `overflow-visible` is already on
 * @param {boolean} p.sparks     the two embers leaving the tip. Off below about
 *                               20px, where they are one grey pixel each.
 * @param {'fire'|'warm'} p.tone
 * @param {'lit'|'ember'|'cold'} p.state
 */
export default function Flame({ className = 'h-4 w-4', sparks = false, tone = 'fire', state = 'lit' }) {
  const uid = useId()
  const outer = `${uid}-outer`
  const body = `${uid}-body`
  const inner = `${uid}-inner`
  const warm = tone === 'warm'
  const lit = state === 'lit'
  const ember = state === 'ember'

  // NOT ALIGHT: the envelope as an outline and nothing inside it. Drawing the
  // inner layers unlit would be a lantern - something moving inside a shape
  // that is meant to be out.
  if (!lit) {
    return (
      <svg viewBox="0 0 24 24" className={cx('overflow-visible', className)} aria-hidden>
        <path
          d="M12.6 1.2C14.1 4.6 14.4 7.6 15 10.6c1-1.2 2.4-2.6 3.3-4.2 1.3 2.8 2.5 6 2.5 9 0 4.6-3.9 7.4-8.7 7.4S3.4 20 3.4 15.4c0-2.8.9-5 2.2-7.2 1 1.6 2.1 3 3.2 4 .8-3.6 2.2-7.4 3.8-11Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
          className={cx(warm ? 'text-white/55' : 'text-brand/40', ember && 'animate-flame-body')}
          style={FROM_BASE}
        />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" className={cx('overflow-visible', className)} aria-hidden>
      <defs>
        {/* The envelope: the coolest, darkest part, at the outside. */}
        <linearGradient id={outer} x1="0" y1="1" x2="0" y2="0">
          {warm ? (
            <>
              <stop offset="0%" stopColor="#fef3c7" />
              <stop offset="45%" stopColor="#fcd34d" />
              <stop offset="100%" stopColor="#f59e0b" />
            </>
          ) : (
            <>
              <stop offset="0%" stopColor="#f97316" />
              <stop offset="45%" stopColor="#ea580c" />
              <stop offset="100%" stopColor="#9a3412" />
            </>
          )}
        </linearGradient>
        {/* The body. On `fire` this is the one that carries the brand orange. */}
        <linearGradient id={body} x1="0" y1="1" x2="0.15" y2="0">
          {warm ? (
            <>
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="38%" stopColor="#fde68a" />
              <stop offset="100%" stopColor="#fbbf24" />
            </>
          ) : (
            <>
              <stop offset="0%" stopColor="#fbbf24" />
              <stop offset="38%" stopColor="#f97316" />
              <stop offset="100%" stopColor="#d94407" />
            </>
          )}
        </linearGradient>
        {/* The inner tongue: yellow through to white at the very bottom. */}
        <linearGradient id={inner} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="35%" stopColor={warm ? '#fffbeb' : '#fde047'} />
          <stop offset="100%" stopColor={warm ? '#fde68a' : '#f59e0b'} />
        </linearGradient>
      </defs>
      {/* ---- THE ENVELOPE. The whole outline, swaying slowest. ---- */}
      <path
        d="M12.6 1.2C14.1 4.6 14.4 7.6 15 10.6c1-1.2 2.4-2.6 3.3-4.2 1.3 2.8 2.5 6 2.5 9 0 4.6-3.9 7.4-8.7 7.4S3.4 20 3.4 15.4c0-2.8.9-5 2.2-7.2 1 1.6 2.1 3 3.2 4 .8-3.6 2.2-7.4 3.8-11Z"
        fill={`url(#${outer})`}
        className="animate-flame-body"
        style={FROM_BASE}
      />
      {/* ---- THE BODY. Inside the envelope, on its own phase, so the edge of
              the fire is never a single hard line. ---- */}
      <path
        d="M12.6 4.4C13.8 7.2 14 9.4 14.5 11.6c.8-.9 1.8-2 2.5-3.2 1 2.2 1.9 4.6 1.9 7 0 3.6-3.1 5.8-6.8 5.8s-6.8-2.2-6.8-5.8c0-2.1.7-3.8 1.7-5.5.8 1.2 1.6 2.3 2.4 3.1.7-2.8 1.9-6 3.2-8.6Z"
        fill={`url(#${body})`}
        className="animate-flame-inner"
        style={FROM_BASE}
      />
      {/* ---- THE INNER TONGUE. Licks up through the body half again as fast. ---- */}
      <path
        d="M12.6 9C13.3 10.8 13.4 12.2 13.7 13.6c.5-.6 1.1-1.3 1.5-2 .7 1.4 1.2 2.8 1.2 4.2 0 2.2-1.9 3.6-4.2 3.6S8 18 8 15.8c0-1.3.4-2.4 1-3.5.5.8 1 1.5 1.5 2 .4-1.8 1.2-3.7 2.1-5.3Z"
        fill={`url(#${inner})`}
        className="animate-flame-core"
        style={FROM_BASE}
      />
      {/* ---- THE CORE. The white heart at the base, and the hottest thing in
              the picture. It is the smallest layer on purpose: an oversized
              white centre is a lightbulb. ---- */}
      <path
        d="M12.4 14.4c.5 1.2.4 2 .3 2.9.4-.3.8-.7 1.1-1.1.4.8.7 1.6.7 2.3 0 1.3-1 2.1-2.3 2.1s-2.3-.8-2.3-2.1c0-.8.3-1.5.8-2.2.3.4.6.8.9 1 .1-1 .4-2 .8-2.9Z"
        fill="#fffdf5"
        className="animate-flame-inner"
        style={{ ...FROM_BASE, animationDuration: '0.72s' }}
      />
      {sparks && (
        <>
          <circle cx="11" cy="4.2" r="0.8" fill={warm ? '#fffbeb' : '#fed7aa'} className="animate-flame-spark" />
          <circle cx="14.6" cy="2.8" r="0.6" fill="#fde68a" className="animate-flame-spark" style={{ animationDelay: '0.9s' }} />
        </>
      )}
    </svg>
  )
}
