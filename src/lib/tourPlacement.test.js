import { describe, it, expect } from 'vitest'
import { placeCard, restingPlace, union, overlaps, CARD_W } from './tourPlacement'

// THE ONE RULE: the walkthrough card never covers what it is pointing at, and
// never covers what that thing opened.
//
// Ethan walked the tour twice and reported the same thing both times - "some
// cards are still blocking the pages and instructions, like on the profile drop
// down menu". This is that, as arithmetic, because the placement used to live
// inside a requestAnimationFrame loop where it could only be checked by looking
// at it.

const CARD_H = 260
const boxOf = (p, h = CARD_H) => ({ top: p.top, left: p.left, right: p.left + CARD_W, bottom: p.top + h })

describe('placeCard', () => {
  const desktop = { w: 1440, h: 900 }

  it('goes below the anchor when there is room, which is reading order', () => {
    const avoid = { top: 100, left: 600, right: 700, bottom: 140 }
    const p = placeCard(avoid, desktop, CARD_H)
    expect(p.placement).toBe('below')
    expect(overlaps(boxOf(p), avoid)).toBe(false)
  })

  it('goes above when the anchor is near the bottom', () => {
    const avoid = { top: 780, left: 600, right: 700, bottom: 830 }
    const p = placeCard(avoid, desktop, CARD_H)
    expect(p.placement).toBe('above')
    expect(overlaps(boxOf(p), avoid)).toBe(false)
  })

  // THE BUG, EXACTLY. The avatar is in the top-right corner and the menu it
  // opens runs most of the way down the screen. "Below" does not fit and
  // "above" does not exist, and the old code fell back to the bottom of the
  // viewport - which is squarely on top of the open menu.
  it('goes BESIDE an open account menu rather than on top of it', () => {
    const avatar = { top: 12, left: 1360, width: 40, height: 40 }
    const menu = { top: 60, left: 1180, width: 240, height: 720 }
    const avoid = union([avatar, menu])
    const p = placeCard(avoid, desktop, CARD_H)

    expect(p.placement).toBe('left')
    expect(overlaps(boxOf(p), avoid)).toBe(false)
    // And specifically clear of the menu itself, which is the thing the card
    // has just told them to use.
    expect(overlaps(boxOf(p), { top: 60, left: 1180, right: 1420, bottom: 780 })).toBe(false)
  })


  // THE LIVE CHALLENGE CARD, AT ITS REAL SIZE. 578px tall and 1088 wide in a
  // 900px window: nothing fits above, below or beside it, which is the case
  // Ethan hit as "the card is covering the brief". TourHost now scrolls a tall
  // anchor to the top of the window to create the room; this asserts what
  // happens when even that is not enough.
  it('picks the side with the most room when the anchor fills the window', () => {
    const avoid = { top: 253, left: 176, right: 1264, bottom: 831 }
    const p = placeCard(avoid, desktop, 305)
    // Equal room both sides (150px each) - it takes the left, which on that
    // card is the side without the buttons.
    expect(p.placement).toBe('left')
    expect(p.left).toBe(12)
    expect(p.top).toBeGreaterThanOrEqual(12)
    expect(p.top + 305).toBeLessThanOrEqual(desktop.h - 12)
  })

  it('and once it is scrolled to the top, it fits below with no overlap at all', () => {
    // The same card after `scrollIntoView({ block: "start" })`: 578px starting
    // just under the header, which leaves the whole lower band free.
    const avoid = { top: 64, left: 176, right: 1264, bottom: 500 }
    const p = placeCard(avoid, desktop, 305)
    expect(p.placement).toBe('below')
    expect(overlaps(boxOf(p, 305), avoid)).toBe(false)
  })

  it('stays inside the viewport wherever it ends up', () => {
    for (const avoid of [
      { top: 0, left: 0, right: 40, bottom: 40 },
      { top: 860, left: 1400, right: 1440, bottom: 900 },
      { top: 60, left: 1180, right: 1420, bottom: 860 },
      { top: -50, left: -20, right: 30, bottom: 10 },
    ]) {
      const p = placeCard(avoid, desktop, CARD_H)
      expect(p.left).toBeGreaterThanOrEqual(12)
      expect(p.top).toBeGreaterThanOrEqual(12)
      expect(p.left + CARD_W).toBeLessThanOrEqual(desktop.w - 12)
      expect(p.top + CARD_H).toBeLessThanOrEqual(desktop.h - 12)
    }
  })

  it('does not pretend to fit beside a menu on a narrow window', () => {
    // Nothing fits anywhere. It must still return something on screen rather
    // than a negative coordinate.
    const narrow = { w: 420, h: 500 }
    const avoid = { top: 40, left: 20, right: 400, bottom: 470 }
    const p = placeCard(avoid, narrow, CARD_H)
    expect(p.left).toBeGreaterThanOrEqual(12)
    expect(p.top).toBeGreaterThanOrEqual(12)
  })
})

describe('union', () => {
  it('wraps the anchor and everything it opened', () => {
    expect(union([
      { top: 12, left: 1360, width: 40, height: 40 },
      { top: 60, left: 1180, width: 240, height: 720 },
    ])).toEqual({ top: 12, left: 1180, right: 1420, bottom: 780 })
  })

  it('ignores a keep-out that is not on screen', () => {
    expect(union([
      { top: 100, left: 100, width: 50, height: 50 },
      { top: 0, left: 0, width: 0, height: 0 },
    ])).toEqual({ top: 100, left: 100, right: 150, bottom: 150 })
  })

  it('is null when there is nothing to avoid', () => {
    expect(union([])).toBe(null)
    expect(union([{ top: 0, left: 0, width: 0, height: 0 }])).toBe(null)
  })
})


// THE RESTING PLACE IS ARITHMETIC BECAUSE IT USED TO BE CSS.
//
// An anchorless card was positioned by `top: auto; bottom: 2rem; left: 50%` and
// the rAF loop cleared its inline values to let that rule win - so every move
// into or out of it teleported, `auto` being nothing to interpolate from. These
// assert the numbers that replaced it, because the one place they cannot be
// checked is the preview pane: it does not composite, so no transition there
// ever actually runs.
describe('restingPlace', () => {
  const vp = { w: 1440, h: 900 }
  const card = { w: CARD_W, h: 260 }

  it('sits the card on the bottom edge, horizontally centred', () => {
    const r = restingPlace(vp, card)
    expect(r.top).toBe(900 - 260 - 32)
    expect(r.left).toBe(Math.round(1440 / 2 - CARD_W / 2))
  })

  it('moves out of the centre column when the step needs it kept clear', () => {
    // Every form in this app is a centred column, so a card that says "fill
    // this in" must not be sitting on top of the thing being filled in.
    const r = restingPlace(vp, card, true)
    expect(r.left).toBe(1440 - CARD_W - 32)
    expect(r.left).toBeGreaterThan(restingPlace(vp, card).left)
  })

  it('never leaves the viewport, however short the window', () => {
    // A phone in landscape with the keyboard up is about this tall.
    const r = restingPlace({ w: 380, h: 240 }, { w: CARD_W, h: 320 })
    expect(r.top).toBeGreaterThanOrEqual(0)
    expect(r.left).toBeGreaterThanOrEqual(0)
  })

  it('returns pixels for both axes, which is the whole point', () => {
    // The bug was a position expressed as `auto`. Anything falsy or non-finite
    // here would put the card back at the top-left corner of the screen.
    const r = restingPlace(vp, { w: 0, h: 0 })
    expect(Number.isFinite(r.top)).toBe(true)
    expect(Number.isFinite(r.left)).toBe(true)
  })

  it('follows the card as it changes height, so it stays on the same edge', () => {
    // Steps carry different amounts of text. The card is bottom-aligned, so a
    // shorter card has a LOWER top - and that difference is exactly the height
    // difference, which is what makes the height and the move read as one
    // movement rather than two.
    const short = restingPlace(vp, { w: CARD_W, h: 200 })
    const tall = restingPlace(vp, { w: CARD_W, h: 300 })
    expect(short.top - tall.top).toBe(100)
  })
})
