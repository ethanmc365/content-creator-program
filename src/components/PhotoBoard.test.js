import { describe, it, expect } from 'vitest'
import { defaultBox } from './PhotoBoard'

// THE ONE RULE THIS HAS TO KEEP: a photo's first appearance on the board is the
// shape it was uploaded at. Ethan: "they should always start by being the aspect
// ratio you posted." Everything else about the board is a drag handler; this is
// arithmetic, so it gets a test.
//
// Cells are 0.82 as tall as they are wide, so a tile's on-screen ratio is
// (w / (h * 0.82)) - which is what these assertions compare against.
const CELL_RATIO = 0.82
const shown = (box) => box.pos_w / (box.pos_h * CELL_RATIO)

describe('defaultBox', () => {
  it('gives a landscape photo a landscape box', () => {
    const box = defaultBox(16 / 9)
    expect(box.pos_w).toBeGreaterThan(box.pos_h)
    expect(shown(box)).toBeGreaterThan(1)
  })

  it('gives a portrait photo a portrait box', () => {
    const box = defaultBox(2 / 3)
    expect(box.pos_h).toBeGreaterThan(box.pos_w)
    expect(shown(box)).toBeLessThan(1)
  })

  it('gives a square photo a roughly square box', () => {
    expect(shown(defaultBox(1))).toBeCloseTo(1, 0)
  })

  it('lands within about 25% of the photo it was given', () => {
    // The box is in whole cells, so it can never match exactly - but it has to
    // be close enough that nothing is visibly letterboxed or sliced.
    for (const a of [16 / 9, 3 / 2, 4 / 3, 1, 3 / 4, 2 / 3, 9 / 16]) {
      const ratio = shown(defaultBox(a))
      expect(Math.abs(ratio - a) / a).toBeLessThan(0.25)
    }
  })

  it('never exceeds the twelve columns it has to fit in', () => {
    for (const a of [0.2, 0.5, 1, 2, 5]) {
      const box = defaultBox(a)
      expect(box.pos_x + box.pos_w).toBeLessThanOrEqual(12)
      expect(box.pos_w).toBeGreaterThanOrEqual(2)
      expect(box.pos_h).toBeGreaterThanOrEqual(2)
    }
  })

  it('flows unarranged photos across the board in rows of three', () => {
    expect(defaultBox(1, 0).pos_x).toBe(0)
    expect(defaultBox(1, 1).pos_x).toBe(4)
    expect(defaultBox(1, 2).pos_x).toBe(8)
    // and wraps rather than running off the right-hand edge
    expect(defaultBox(1, 3).pos_x).toBe(0)
    expect(defaultBox(1, 3).pos_y).toBeGreaterThan(defaultBox(1, 0).pos_y)
  })

  it('survives a missing or nonsense aspect', () => {
    for (const a of [null, undefined, 0, -1, NaN]) {
      const box = defaultBox(a)
      expect(box.pos_w).toBeGreaterThanOrEqual(2)
      expect(box.pos_h).toBeGreaterThanOrEqual(2)
    }
  })
})
