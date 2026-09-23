import { cx } from '../../lib/utils'

// A LIGHT THAT RUNS CONTINUOUSLY ROUND A CARD'S BORDER, THE THIRD REWRITE
// (23 Sep 2026).
//
// Used on every "this is live and everyone can join" card: the Global
// Challenge strip, the live challenge card on /challenges, and the worldwide
// hub's live-now card. Ethan asked for this to be fixed properly this time -
// third pass - so this file explains WHY the first two were not enough,
// rather than just what changed.
//
// WHY A ROTATING ELEMENT, NOT AN ANIMATED GRADIENT. The first two passes
// animated a conic-gradient's own angle through a registered `@property`,
// which means the browser recomputes and repaints the gradient itself on
// every frame of the animation, FOR AS LONG AS THE CARD IS ON SCREEN - this
// is not an entrance, it runs forever. Doing that behind `filter: blur()` on
// the halo layer doubles the cost: a fresh blur pass every frame too. That is
// the actual shape of "the animation is laggy" - a continuous full repaint,
// not a slow arrival. Rotating a STATIC gradient with `transform: rotate()`
// instead moves the cost onto the compositor: the browser paints the
// gradient (and blurs the halo) once, then only ever repositions the
// resulting layer, which is the same trick every smooth CSS spinner uses and
// is an order of magnitude cheaper - and it is why this can run on several
// cards on one page (the hub's rail card and its phone twin, a market's
// chapter home, /challenges) without ever competing with anything else.
//
// IT ALSO REPLACES `mask-composite: exclude`, WHICH IS WHERE "A WEIRD ORANGE
// SQUARE" CAME FROM. Punching a ring out of a filled square with a composited
// mask is a technique some mobile WebKit/Chromium builds fail to render
// correctly, falling back to the unmasked square - intermittently, which is
// why it read as a glitch rather than a consistent bug. There is no mask
// here at all: the rotating gradient sits BEHIND the real card (z-index -1,
// inside its own `isolation: isolate` stacking context) and the real card's
// own opaque background covers all of it except the few pixels it is inset
// by. A ring made of "what peeks out from behind an opaque shape" cannot
// render as a filled square, because nothing ever asked the browser to
// composite a mask.
//
// TWO TONES. `onOrange` is white/pale, for a card whose surrounding few
// pixels are themselves painted orange (the global challenge strip, the big
// live challenge card - see LiveChallengeCard). `onLight` is warm brand
// orange, for a card that sits directly on the page's white background (the
// worldwide hub's live-now card) - a white light on a white page is
// invisible, which was Ethan's exact report about the old shared ring.
//
// A FAINT CONSTANT EDGE, PLUS A BRIGHTER ARC CHASING ROUND IT. `.glow-ring`
// itself carries a low-opacity solid colour - visible always, so the card
// never looks like it lost its ring between sweeps - and the rotating child
// layers a brighter arc on top of that, which is what actually reads as
// "running round the border". Ethan, about the Challenges page: "it should
// be a bit thicker and more visible" - the ring is 4px now (was 3px) and the
// bright arc's opacity and angular width are both larger.
export default function GlowRing({ tone = 'onOrange' }) {
  return (
    <>
      <span aria-hidden className={cx('glow-ring', `glow-ring--${tone}`)}>
        <span className="glow-spin glow-spin--ring" />
      </span>
      <span aria-hidden className={cx('glow-halo', `glow-halo--${tone}`)}>
        <span className="glow-spin glow-spin--halo" />
      </span>
    </>
  )
}
