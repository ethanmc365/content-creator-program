import { describe, it, expect } from 'vitest'
import { packBoard, dropIndex, spanOf, colsFor, isPlaced, nextSize, SIZES, MIN_PLACED_MILLE } from './PhotoBoard'

// THE BOARD IS ONE PACKED LAYOUT, AND THESE ARE THE PROPERTIES IT HAS TO HAVE.
//
// The whole point of the rewrite is that overlap is impossible by construction
// rather than prevented by clamping, and that the layout is a pure function of
// (order, spans, aspects) so a drag preview is honest and the board never moves
// on its own. Both of those are properties, so they are tested as properties
// over a lot of boards rather than as one example each.

const overlaps = (a, b) => (
  a.x < b.x + b.w - 1e-9 && b.x < a.x + a.w - 1e-9
  && a.y < b.y + b.h - 1e-9 && b.y < a.y + a.h - 1e-9
)

const item = (aspect, span = 1) => ({ aspect, span })

describe('packBoard', () => {
  it('keeps every photo inside the board horizontally', () => {
    for (const cols of [2, 3]) {
      const boxes = packBoard(new Array(10).fill(item(16 / 9)), cols)
      for (const b of boxes) {
        expect(b.x).toBeGreaterThanOrEqual(0)
        expect(b.x + b.w).toBeLessThanOrEqual(1 + 1e-9)
      }
    }
  })

  it('gives a photo the shape it was uploaded at', () => {
    const [portrait] = packBoard([item(3 / 4)], 3)
    expect(portrait.w / portrait.h).toBeCloseTo(3 / 4, 6)
    const [landscape] = packBoard([item(16 / 9)], 3)
    expect(landscape.w / landscape.h).toBeCloseTo(16 / 9, 6)
  })

  // The fault that sank the first two boards, asserted directly.
  it('never overlaps, at any mix of spans and shapes', () => {
    const aspects = [16 / 9, 3 / 4, 1, 4 / 5, 2, 9 / 16, 1.5, 0.7]
    for (const cols of [2, 3]) {
      for (let seed = 0; seed < 40; seed += 1) {
        const items = Array.from({ length: 9 }, (_, i) => item(
          aspects[(i * 7 + seed) % aspects.length],
          ((i + seed) % cols) + 1,
        ))
        const boxes = packBoard(items, cols)
        for (let i = 0; i < boxes.length; i += 1) {
          for (let j = i + 1; j < boxes.length; j += 1) {
            expect(overlaps(boxes[i], boxes[j])).toBe(false)
          }
        }
      }
    }
  })

  it('is pure: the same board packs the same way every time', () => {
    const items = [item(16 / 9, 2), item(3 / 4), item(1), item(2, 3)]
    expect(packBoard(items, 3)).toEqual(packBoard(items, 3))
  })

  it('starts a new row rather than running off the right edge', () => {
    const boxes = packBoard(new Array(4).fill(item(1)), 3)
    expect(boxes[3].y).toBeGreaterThan(0)
  })

  it('fills the shortest column, so the board stays as short as it can', () => {
    // A tall portrait first, then two landscapes: the third must go under the
    // SECOND one (the short column), not under the tall one.
    const boxes = packBoard([item(0.5), item(2), item(2)], 2)
    expect(boxes[2].x).toBeCloseTo(boxes[1].x, 6)
    expect(boxes[2].y).toBeGreaterThan(boxes[1].y)
  })

  it('a wider span really is wider, and still fits', () => {
    const [one] = packBoard([item(1, 1)], 3)
    const [two] = packBoard([item(1, 2)], 3)
    const [three] = packBoard([item(1, 3)], 3)
    expect(two.w).toBeGreaterThan(one.w)
    expect(three.w).toBeCloseTo(1, 6)
  })

  it('clamps a nonsense span rather than drawing off the board', () => {
    const [wild] = packBoard([{ aspect: 1, span: 99 }], 3)
    expect(wild.x + wild.w).toBeLessThanOrEqual(1 + 1e-9)
    const [none] = packBoard([{ aspect: 1 }], 3)
    expect(none.w).toBeGreaterThan(0)
  })

  it('survives a missing or nonsense aspect', () => {
    for (const a of [undefined, null, 0, -3, NaN, 'wide']) {
      const [b] = packBoard([{ aspect: a, span: 1 }], 3)
      expect(Number.isFinite(b.w)).toBe(true)
      expect(Number.isFinite(b.h)).toBe(true)
      expect(b.h).toBeGreaterThan(0)
    }
  })
})

describe('dropIndex', () => {
  const boxes = packBoard(new Array(4).fill(item(1)), 2)

  it('drops before a tile when the pointer is on its left', () => {
    const b = boxes[1]
    expect(dropIndex(boxes, b.x + 0.01, b.y + b.h / 2)).toBe(1)
  })

  it('drops after a tile when the pointer is on its right', () => {
    const b = boxes[1]
    expect(dropIndex(boxes, b.x + b.w - 0.01, b.y + b.h / 2)).toBe(2)
  })

  it('drops at the end for a pointer past the last tile', () => {
    const last = boxes[boxes.length - 1]
    expect(dropIndex(boxes, last.x + last.w + 0.2, last.y + last.h + 0.2)).toBe(boxes.length)
  })

  it('an empty board takes the first photo', () => {
    expect(dropIndex([], 0.5, 0.5)).toBe(0)
  })
})

describe('spanOf', () => {
  const placed = (w) => ({ pos_x: 0, pos_y: 0, pos_w: w, pos_h: 300 })

  it('reads one column back out of a one-column width', () => {
    const [b] = packBoard([item(1, 1)], 3)
    expect(spanOf(placed(Math.round(b.w * 1000)), 3)).toBe(1)
  })

  it('reads two columns back out of a two-column width', () => {
    const [b] = packBoard([item(1, 2)], 3)
    expect(spanOf(placed(Math.round(b.w * 1000)), 3)).toBe(2)
  })

  it('a photo nobody has arranged spans one column', () => {
    expect(spanOf({ pos_x: null, pos_y: null, pos_w: null, pos_h: null }, 3)).toBe(1)
  })

  // A board widened on a desktop has to be readable on a phone, where there
  // are only two columns to span.
  it('never returns more columns than the board has', () => {
    expect(spanOf(placed(1000), 2)).toBeLessThanOrEqual(2)
    expect(spanOf(placed(1000), 3)).toBeLessThanOrEqual(3)
  })
})

describe('colsFor', () => {
  it('is two columns on a phone and three above it', () => {
    expect(colsFor(375)).toBe(2)
    expect(colsFor(519)).toBe(2)
    expect(colsFor(520)).toBe(3)
    expect(colsFor(1200)).toBe(3)
  })
})

describe('isPlaced', () => {
  const row = (over) => ({ pos_x: 100, pos_y: 200, pos_w: 300, pos_h: 220, ...over })

  it('accepts a real per-mille arrangement', () => {
    expect(isPlaced(row())).toBe(true)
  })

  it('rejects leftover grid cells from the old board', () => {
    expect(isPlaced(row({ pos_w: 4, pos_h: 3 }))).toBe(false)
    expect(isPlaced(row({ pos_w: MIN_PLACED_MILLE - 1 }))).toBe(false)
  })

  it('rejects a row that was never arranged', () => {
    expect(isPlaced(row({ pos_x: null }))).toBe(false)
    expect(isPlaced(null)).toBe(false)
  })

  it('allows a photo placed at the origin', () => {
    expect(isPlaced(row({ pos_x: 0, pos_y: 0 }))).toBe(true)
  })
})

// THE SIZE LADDER (1 Sep 2026). Drag-to-resize is gone; a photo carries a
// stored level and a button in its corner steps up it. The two properties that
// matter are that the cycle always comes back round (so a creator can never get
// a photo stuck at a size) and that `large` is genuinely the widest thing on
// the board at EVERY width - which is the whole reason the level is stored
// rather than the column count.
describe('the size ladder', () => {
  it('cycles small -> medium -> large -> small', () => {
    expect(nextSize('small')).toBe('medium')
    expect(nextSize('medium')).toBe('large')
    expect(nextSize('large')).toBe('small')
  })

  it('treats an unknown or missing size as small', () => {
    expect(nextSize(undefined)).toBe('medium')
    expect(nextSize('enormous')).toBe('medium')
  })

  it('never leaves the three sizes', () => {
    let size = 'small'
    for (let i = 0; i < 20; i += 1) {
      size = nextSize(size)
      expect(SIZES).toContain(size)
    }
  })

  it('spans wider for a bigger size, at any column count', () => {
    for (const cols of [2, 3]) {
      const small = spanOf({ size: 'small' }, cols)
      const medium = spanOf({ size: 'medium' }, cols)
      const large = spanOf({ size: 'large' }, cols)
      expect(small).toBe(1)
      expect(medium).toBeGreaterThanOrEqual(small)
      expect(large).toBeGreaterThanOrEqual(medium)
      expect(large).toBeLessThanOrEqual(cols)
    }
  })

  // A phone has two columns, so large and medium both fill the row there - but
  // large must still be the widest, never narrower than medium.
  it('large fills the board on a phone', () => {
    expect(spanOf({ size: 'large' }, 2)).toBe(2)
  })

  // The 285 rows that predate the stored level have to keep the width they were
  // arranged at, which is derived from pos_w. Migration 162 backfills `size`,
  // but a row that somehow misses it must still not collapse to one column.
  it('falls back to the stored width when there is no size', () => {
    const [b] = packBoard([{ aspect: 1, span: 2 }], 3)
    expect(spanOf({ pos_x: 0, pos_y: 0, pos_h: 300, pos_w: Math.round(b.w * 1000) }, 3)).toBe(2)
  })
})
