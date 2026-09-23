import { cx } from '../../lib/utils'

// A QUIET RING OF LIGHT, REWRITTEN A FOURTH TIME AND MADE SMALLER ON PURPOSE
// (23 Sep 2026). Used on the "this is live and everyone can join" cards: the
// Global Challenge strip and the worldwide hub's live-now card.
//
// Three rewrites tried to make this more elaborate - a rotating conic
// gradient, a separate blurred halo breathing behind it - and each one made
// the actual complaint worse. Ethan, after the third pass shipped: "the
// whole page seems laggy because of whatever you've done with all the
// animations... if there are too many animations, go for fewer and just
// more simple ones." He is right about the mechanism, not just the feeling:
// a conic gradient whose angle is driven by an animated custom property
// repaints itself from scratch every frame, forever, and a `filter: blur()`
// layer sitting in its own `isolation: isolate` stacking context is exactly
// the combination that some mobile browsers composite incorrectly - which is
// where the "weird orange square" kept coming back from no matter how the
// masking was rewritten, because the mask was never the only moving part.
//
// SO THERE IS NOW ONE LAYER, AND IT ANIMATES ONE PROPERTY. A single static
// gradient sits behind the card (z-index -1, same technique as before: the
// card's own opaque background covers all of it except the few pixels it is
// inset by, so it reads as a ring with no masking trick to fail) and its
// opacity breathes slowly. Opacity is the cheapest thing a browser can
// animate - the layer is painted once and every frame after that is the
// compositor blending it, which is why this can sit on several cards at
// once without being the thing that makes the page feel slow.
export default function GlowRing({ tone = 'onOrange' }) {
  return <span aria-hidden className={cx('glow-ring', `glow-ring--${tone}`)} />
}
