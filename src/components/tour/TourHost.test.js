import { describe, it, expect } from 'vitest'
import { placeCard } from './TourHost'

// WHERE THE WALKTHROUGH CARD LANDS.
//
// This is the one piece of the overlay with judgement in it, and judgement that
// is only ever checked by screenshot is judgement that regresses silently. The
// contract is short: never on top of the thing being pointed at, never off the
// edge of the screen, never under a phone's tab bar, and beside the highlight
// on a wide screen rather than under it.

const overlaps = (a, b) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y

const DESKTOP = { vw: 1440, vh: 900 }
const PHONE = { vw: 390, vh: 844 }

describe('placing the card', () => {
  it('centres it, a little above the middle, when there is nothing to sit beside', () => {
    const p = placeCard({ rect: null, ...DESKTOP, w: 452, h: 300 })
    expect(p.side).toBe('centre')
    expect(p.x).toBeCloseTo((1440 - 452) / 2, 0)
    // Above the true centre: that is where the eye already is.
    expect(p.y).toBeLessThan((900 - 300) / 2)
    expect(p.y).toBeGreaterThan(0)
  })

  // A NAV ITEM IN THE TOP LEFT OF A LAPTOP. The whole page is to the right of
  // it and below it, and a card beside a top-bar item is the least intrusive
  // place it can be.
  it('puts it beside the highlight on a wide screen', () => {
    const rect = { x: 240, y: 14, w: 130, h: 40 }
    const p = placeCard({ rect, ...DESKTOP, w: 384, h: 320 })
    expect(p.side).toBe('right')
    expect(overlaps({ ...p, w: 384, h: 320 }, rect)).toBe(false)
  })

  it('goes above or below on a phone, where there are no margins', () => {
    const rect = { x: 20, y: 400, w: 350, h: 90 }
    const p = placeCard({ rect, ...PHONE, w: 362, h: 300, bottomInset: 62 })
    expect(['above', 'below']).toContain(p.side)
    expect(overlaps({ ...p, w: 362, h: 300 }, rect)).toBe(false)
  })

  // THE MOBILE TAB BAR. The bottom five nav tabs are the anchor for four of the
  // steps, and a sheet pinned to the bottom of the screen would sit exactly on
  // top of them.
  it('never covers the phone tab bar', () => {
    const tab = { x: 150, y: 770, w: 78, h: 58 }
    const p = placeCard({ rect: tab, ...PHONE, w: 362, h: 340, bottomInset: 62 })
    expect(p.side).toBe('above')
    expect(p.y + 340).toBeLessThanOrEqual(tab.y)
  })

  it('keeps everything inside the screen, whatever it is asked to do', () => {
    const cases = [
      { rect: { x: 0, y: 0, w: 60, h: 40 }, w: 452, h: 400 },
      { rect: { x: 1380, y: 860, w: 60, h: 40 }, w: 452, h: 400 },
      { rect: { x: 700, y: 440, w: 40, h: 40 }, w: 452, h: 880 },
      { rect: null, w: 452, h: 2000 },
    ]
    for (const c of cases) {
      const p = placeCard({ rect: c.rect, ...DESKTOP, w: c.w, h: c.h })
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.x + c.w).toBeLessThanOrEqual(DESKTOP.vw)
      expect(p.y).toBeGreaterThanOrEqual(0)
    }
  })

  // A CARD TALLER THAN THE GAP EITHER SIDE OF THE HIGHLIGHT. There is nowhere
  // clean to put it, and the fallback must not then draw a nib pointing across
  // half a screen at nothing.
  it('drops the nib when it has had to give up on a clean side', () => {
    const rect = { x: 180, y: 380, w: 30, h: 30 }
    const p = placeCard({ rect, vw: 360, vh: 500, w: 332, h: 460 })
    expect(p.tight).toBe(true)
    expect(p.side).toBe('centre')
  })

  it('prefers the side with more room when both fit', () => {
    const rect = { x: 1000, y: 400, w: 80, h: 60 }
    const p = placeCard({ rect, ...DESKTOP, w: 328, h: 300 })
    expect(p.side).toBe('left')
  })
})
