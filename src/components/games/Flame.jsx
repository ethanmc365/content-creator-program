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
 * @param {object} p
 * @param {string} p.className   size classes; `overflow-visible` is already on
 * @param {boolean} p.sparks     the two embers leaving the tip. Off below about
 *                               20px, where they are one grey pixel each.
 */
export default function Flame({ className = 'h-4 w-4', sparks = false }) {
  const uid = useId()
  const outer = `${uid}-outer`
  const body = `${uid}-body`
  const inner = `${uid}-inner`
  return (
    <svg viewBox="0 0 24 24" className={cx('overflow-visible', className)} aria-hidden>
      <defs>
        {/* The envelope: the coolest, darkest part, at the outside. */}
        <linearGradient id={outer} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#f97316" />
          <stop offset="45%" stopColor="#ea580c" />
          <stop offset="100%" stopColor="#9a3412" />
        </linearGradient>
        {/* The body. This is the one that carries the brand orange. */}
        <linearGradient id={body} x1="0" y1="1" x2="0.15" y2="0">
          <stop offset="0%" stopColor="#fbbf24" />
          <stop offset="38%" stopColor="#f97316" />
          <stop offset="100%" stopColor="#d94407" />
        </linearGradient>
        {/* The inner tongue: yellow through to white at the very bottom. */}
        <linearGradient id={inner} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#fffbeb" />
          <stop offset="35%" stopColor="#fde047" />
          <stop offset="100%" stopColor="#f59e0b" />
        </linearGradient>
      </defs>
      {/* ---- THE ENVELOPE. The whole outline, swaying slowest. ---- */}
      <path
        d="M13.4 1.6c.7 3.1-1 4.7-2.5 6.3C9.1 9.8 7.4 11.6 7.4 14.4A7 7 0 0 0 21 15.1c0-3.4-1.9-5.6-3.6-7.7-.7 1.6-1.7 2.6-2.9 3.2.6-3-.2-5.9-1.1-9Z"
        fill={`url(#${outer})`}
        className="animate-flame-body"
        style={FROM_BASE}
      />
      {/* ---- THE BODY. Inside the envelope, on its own phase, so the edge of
              the fire is never a single hard line. ---- */}
      <path
        d="M13 3.9c.5 2.5-.8 3.9-2 5.2-1.3 1.4-2.7 2.8-2.7 5.1a5.7 5.7 0 0 0 11.4.3c0-2.8-1.5-4.6-2.9-6.3-.6 1.3-1.4 2.1-2.4 2.6.5-2.4-.2-4.7-1.4-6.9Z"
        fill={`url(#${body})`}
        className="animate-flame-inner"
        style={FROM_BASE}
      />
      {/* ---- THE INNER TONGUE. Licks up through the body half again as fast. ---- */}
      <path
        d="M13.1 8.2c.4 1.9-.7 2.9-1.5 3.8-1 1-1.9 1.9-1.9 3.6a4.1 4.1 0 0 0 8.2.2c0-2-1.3-3.3-2.2-4.7-.4.9-.9 1.5-1.6 1.9.3-1.6-.3-3.2-1-4.8Z"
        fill={`url(#${inner})`}
        className="animate-flame-core"
        style={FROM_BASE}
      />
      {/* ---- THE CORE. The white heart at the base, and the hottest thing in
              the picture. It is the smallest layer on purpose: an oversized
              white centre is a lightbulb. ---- */}
      <path
        d="M13.6 13.4c.3.9-.4 1.5-.9 2.2-.3.5-.5 1-.5 1.6a2.1 2.1 0 0 0 4.2.1c0-1.1-.6-1.8-1.3-2.5-.5.6-1.1.3-1-.4.1-.4-.1-.7-.5-1Z"
        fill="#fffdf5"
        className="animate-flame-inner"
        style={{ ...FROM_BASE, animationDuration: '0.72s' }}
      />
      {sparks && (
        <>
          <circle cx="11" cy="4.2" r="0.8" fill="#fed7aa" className="animate-flame-spark" />
          <circle cx="14.6" cy="2.8" r="0.6" fill="#fde68a" className="animate-flame-spark" style={{ animationDelay: '0.9s' }} />
        </>
      )}
    </svg>
  )
}
