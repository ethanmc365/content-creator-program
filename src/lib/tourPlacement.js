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

/** Do these two rectangles overlap at all? Used by the tests, and by nothing else. */
export function overlaps(a, b) {
  return !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top)
}
