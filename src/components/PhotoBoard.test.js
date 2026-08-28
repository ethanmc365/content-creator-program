import { describe, it, expect } from 'vitest'
import { spanFor, colsFor } from './PhotoBoard'

// The board is a masonry grid: a photo's height comes from its own aspect, so
// `spanFor` is the one piece of arithmetic that decides whether a photo keeps
// the shape it was uploaded at. The old `defaultBox` tests went with the free
// 2-D placement they described - see the note at the top of PhotoBoard.
describe('spanFor', () => {
  const COL = 300
  const ROW = 8
  const GAP = 10

  it('gives a landscape photo a shorter box than a portrait one', () => {
    expect(spanFor(16 / 9, COL)).toBeLessThan(spanFor(9 / 16, COL))
  })

  it('matches the photo aspect within a row unit', () => {
    for (const a of [16 / 9, 4 / 3, 1, 3 / 4, 9 / 16]) {
      const spans = spanFor(a, COL)
      const drawn = spans * ROW - GAP
      const wanted = COL / a
      // Half a row unit of rounding either way is the most a span can be out.
      expect(Math.abs(drawn - wanted)).toBeLessThanOrEqual(ROW / 2 + 0.5)
    }
  })

  it('a two column photo is taller than the same photo in one column', () => {
    expect(spanFor(1, COL, 2)).toBeGreaterThan(spanFor(1, COL, 1))
  })

  it('survives a missing or nonsense aspect', () => {
    for (const a of [null, undefined, 0, -1, NaN, Infinity]) {
      expect(spanFor(a, COL)).toBeGreaterThanOrEqual(4)
      expect(Number.isFinite(spanFor(a, COL))).toBe(true)
    }
  })

  it('never returns a span so small the photo has no height', () => {
    expect(spanFor(20, COL)).toBeGreaterThanOrEqual(4)
  })
})

describe('colsFor', () => {
  it('is two on a phone and three above it', () => {
    expect(colsFor(375)).toBe(2)
    expect(colsFor(414)).toBe(2)
    expect(colsFor(768)).toBe(3)
    expect(colsFor(1440)).toBe(3)
  })
})
