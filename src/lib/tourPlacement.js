// WHERE THE WALKTHROUGH CARD GOES, AS ARITHMETIC.
//
// This lived inside TourHost's requestAnimationFrame loop, which means it could
// only ever be checked by looking at it - and rAF does not run in a hidden
// preview pane, so "looking at it" was not available either. It is a pure
// function of four rectangles now, so the one rule that matters can be asserted
// instead of eyeballed.
//
// THE RULE: the card never covers the thing it is talking about, and never
// covers anything that thing opened.
//
// Ethan: "some cards are still blocking the pages and instructions, like on the
// profile drop down menu." That was a direct consequence of a step OPENING that
// menu: the card is placed under its anchor, the anchor is the avatar in the
// top-right corner, and what opens under the avatar is the menu the card has
// just told you to use. So the instruction covered the only control that could
// satisfy it.
//
// A dropdown is not the anchor, so nothing knew it was there. `keepOuts` is how
// it finds out - see `data-tour-keepout` in AppLayout.

export const CARD_W = 372
const GAP = 14
const EDGE = 12
// The breathing room a resting card keeps from the edge it sits against. It was
// `2rem` in CSS; it is a number here so the arithmetic and the look cannot drift.
const RESTING_GAP = 32

/** The smallest rectangle containing all of them. */
export function union(rects) {
  const live = rects.filter((r) => r && r.width > 0 && r.height > 0)
  if (live.length === 0) return null
  return live.reduce((a, r) => ({
    top: Math.min(a.top, r.top),
    left: Math.min(a.left, r.left),
    right: Math.max(a.right, r.left + r.width),
    bottom: Math.max(a.bottom, r.top + r.height),
  }), { top: live[0].top, left: live[0].left, right: live[0].left + live[0].width, bottom: live[0].top + live[0].height })
}

/**
 * Place the card so it clears `avoid` entirely.
 *
 * Preference order, and each one is a judgement rather than a fallback:
 *   BELOW   reading order. The thing, then what to do about it.
 *   ABOVE   when the thing is near the bottom of the screen.
 *   BESIDE  when it is tall enough that neither fits - the account menu on a
 *           short window runs most of the height of the screen, and the only
 *           free space is next to it.
 *
 * @param {{top,left,right,bottom}} avoid   what must stay uncovered
 * @param {{w,h}} viewport
 * @param {number} cardH
 * @returns {{top:number,left:number,placement:'below'|'above'|'left'|'right'}}
 */
export function placeCard(avoid, viewport, cardH) {
  const { w: vw, h: vh } = viewport
  const clampTop = (t) => Math.max(EDGE, Math.min(t, vh - cardH - EDGE))
  const clampLeft = (l) => Math.max(EDGE, Math.min(l, vw - CARD_W - EDGE))
  const centred = avoid.left + (avoid.right - avoid.left) / 2 - CARD_W / 2

  const below = avoid.bottom + GAP
  if (below + cardH <= vh - EDGE) {
    return { top: clampTop(below), left: clampLeft(centred), placement: 'below' }
  }

  const above = avoid.top - GAP - cardH
  if (above >= EDGE) {
    return { top: clampTop(above), left: clampLeft(centred), placement: 'above' }
  }

  // Beside. Prefer whichever side has room; if neither does, the left edge -
  // a card jammed against an edge is still better than one on top of the menu.
  const roomLeft = avoid.left - GAP - EDGE
  const roomRight = vw - avoid.right - GAP - EDGE
  if (roomLeft >= CARD_W) {
    return { top: clampTop(avoid.top), left: clampLeft(avoid.left - GAP - CARD_W), placement: 'left' }
  }
  if (roomRight >= CARD_W) {
    return { top: clampTop(avoid.top), left: clampLeft(avoid.right + GAP), placement: 'right' }
  }

  // NOTHING FITS. This is a genuinely unsolvable rectangle - an anchor taller
  // and wider than the free space around it - and the honest thing is to say so
  // rather than pretend. TourHost avoids reaching here by scrolling a tall
  // anchor to the top of the window instead of centring it, which creates the
  // room; this is the case where even that is not enough.
  //
  // It goes to whichever side has MORE room, because that is the side where the
  // overlap is smallest, and it clamps into the viewport. On the live challenge
  // card that is the left, which is also where the least is lost: that card's
  // buttons are on its right.
  return {
    top: clampTop(avoid.top),
    left: roomRight > roomLeft ? clampLeft(vw - CARD_W - EDGE) : EDGE,
    placement: roomRight > roomLeft ? 'right' : 'left',
  }
}

/**
 * WHERE A CARD WITH NOTHING TO POINT AT SITS - AS ARITHMETIC, NOT AS CSS.
 *
 * THE BUG THIS FIXES (7 Sep 2026). Ethan, walking the whole tutorial: "tapping
 * rooms, it then suddenly appears down in the bottom right corner rather than
 * smoothly animating there... and then it suddenly jumps to the middle of the
 * screen for notifications rather than smoothly animating. The card should
 * always be smoothly animating anywhere it's moving."
 *
 * Every one of those jumps is the same thing. An anchorless card used to be
 * positioned by a CSS rule - `top: auto; bottom: 2rem; left: 50%` - and the loop
 * CLEARED its inline `top`/`left` to let that rule win. A transition needs a
 * from-value and `auto` is not one, so the browser applied the new position on
 * the spot. Fixing the anchored direction earlier only fixed half of it: the
 * steps that move TO the resting place still teleported, and those are the
 * payment step and the notifications step, which is exactly the pair he
 * describes.
 *
 * So there is now ONE mechanism. Every position the card ever takes is computed
 * here or in `placeCard` and written as pixels, and CSS positions it never. Two
 * mechanisms moving one element is the fault this whole file exists to remove.
 *
 * BOTTOM CENTRE, or bottom RIGHT when the step needs the middle of the screen
 * kept clear: every form in this app is a centred column, so a card that says
 * "fill this in" must not sit on top of the thing being filled in.
 *
 * @param {{w,h}} viewport
 * @param {{w,h}} card
 * @param {boolean} keepClear  the step needs the centre column free
 */
export function restingPlace(viewport, card, keepClear = false) {
  const { w: vw, h: vh } = viewport
  const cw = card.w || CARD_W
  const ch = card.h || 260
  // IT SITS ABOVE THE FOOT OF THE SCREEN, NOT ON IT (9 Sep 2026).
  //
  // Ethan, on the first step: "the card should start slightly higher up, not at
  // the very bottom but more up in the middle - slightly higher up. And when I
  // click show me around the card gets bigger saying nice one, and it just
  // hides a bit."
  //
  // Both are the same measurement. `vh - ch - 32` put the card's bottom edge
  // 32px off the floor, so a card that then GROWS - which is exactly what the
  // "Nice one" acknowledgement does - had nowhere to grow into and pushed
  // itself off the bottom of the window. Lifting the resting place by an eighth
  // of the viewport leaves ~100px of clearance on a laptop and ~90px on a
  // phone, which is more than the tick has ever added, and it also puts the
  // opening card where the eye is rather than where the taskbar is.
  //
  // THE LIFT IS A CONSTANT, NOT A CLAMP, and that matters: the card is still
  // BOTTOM-ALIGNED, so two cards of different heights still differ in `top` by
  // exactly their height difference. That is the property that lets the height
  // transition and the position transition run on the same curve and read as
  // one movement (see `[data-centre][data-travel='no']` in index.css). A
  // `Math.min(vh / 2, ...)` was tried here first and broke it - both heights
  // clamped to the same number and the card stopped following its own box.
  const lift = Math.min(vh * 0.125, 120)
  const top = Math.max(EDGE, vh - ch - RESTING_GAP - lift)
  // AND OUT OF THE CORNER, NOT WEDGED INTO IT (9 Sep 2026). Ethan, on the
  // payment step: "it animates nicely down to the bottom right corner. I would
  // still bring it out of the corner ever so slightly."
  //
  // `RESTING_GAP` is 32px, which is right for the distance from the bottom edge
  // - that edge has a whole viewport above it - and mean against the right one,
  // where the card is already the last thing before the screen ends. Doubling
  // it costs nothing (the centre column it is keeping clear is 672px wide on a
  // 1440px window, so there is 380px of slack) and stops the card reading as
  // something that fell down the side of the page.
  const left = keepClear
    ? Math.max(EDGE, vw - cw - RESTING_GAP * 2)
    : Math.max(EDGE, Math.round(vw / 2 - cw / 2))
  return { top, left, placement: keepClear ? 'resting-right' : 'resting-centre' }
}

/** Do these two rectangles overlap at all? Used by the tests, and by nothing else. */
export function overlaps(a, b) {
  return !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top)
}
