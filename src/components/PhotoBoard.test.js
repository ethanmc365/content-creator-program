import { describe, it, expect } from 'vitest'
import { defaultLayout } from './PhotoBoard'

// The board is FREE placement stored in fractions of its own width, so the one
// piece of arithmetic worth pinning down is where an un-arranged photo starts:
// it has to be inside the board, at the photo's own shape, and it has to tile
// without two photos landing on the same spot.
const box = (aspect, index, cols, all = null) =>
  defaultLayout(all || new Array(index + 1).fill(aspect), cols)[index]

describe('defaultLayout', () => {
  it('keeps every photo inside the board horizontally', () => {
    for (const cols of [2, 3]) {
      for (let i = 0; i < 10; i += 1) {
        const b = box(16 / 9, i, cols)
        expect(b.x).toBeGreaterThanOrEqual(0)
        expect(b.x + b.w).toBeLessThanOrEqual(1.0001)
      }
    }
  })

  it('gives a photo the shape it was uploaded at', () => {
    const wide = box(16 / 9, 0, 3)
    const tall = box(9 / 16, 0, 3)
    expect(wide.w).toBeCloseTo(tall.w)          // same column width
    expect(wide.h).toBeLessThan(tall.h)          // landscape is shorter
    expect(wide.w / wide.h).toBeCloseTo(16 / 9, 5)
    expect(tall.w / tall.h).toBeCloseTo(9 / 16, 5)
  })

  it('starts a new row rather than running off the right edge', () => {
    const cols = 3
    const laid = defaultLayout(new Array(4).fill(1), cols)
    expect(laid[0].y).toBe(0)
    expect(laid[2].y).toBe(0)
    expect(laid[3].y).toBeGreaterThan(0)
    expect(laid[3].x).toBe(0)
  })

  it('packs into the shortest column so nothing overlaps', () => {
    // A tall portrait first, then landscapes: the portrait's column must not be
    // reused until the others have caught up with it.
    const laid = defaultLayout([9 / 16, 16 / 9, 16 / 9, 16 / 9], 3)
    const overlaps = (a, b) =>
      a.x < b.x + b.w - 1e-9 && b.x < a.x + a.w - 1e-9 &&
      a.y < b.y + b.h - 1e-9 && b.y < a.y + a.h - 1e-9
    for (let i = 0; i < laid.length; i += 1) {
      for (let j = i + 1; j < laid.length; j += 1) {
        expect(overlaps(laid[i], laid[j])).toBe(false)
      }
    }
  })

  it('never puts two photos in the same place', () => {
    const seen = new Set()
    for (let i = 0; i < 12; i += 1) {
      const b = defaultLayout(new Array(12).fill(1), 3)[i]
      const key = `${b.x.toFixed(4)}:${b.y.toFixed(4)}`
      expect(seen.has(key)).toBe(false)
      seen.add(key)
    }
  })

  it('survives a missing or nonsense aspect', () => {
    for (const a of [null, undefined, 0, -1, NaN, Infinity]) {
      const b = box(a, 0, 3)
      expect(Number.isFinite(b.w)).toBe(true)
      expect(Number.isFinite(b.h)).toBe(true)
      expect(b.h).toBeGreaterThan(0)
    }
  })
})
