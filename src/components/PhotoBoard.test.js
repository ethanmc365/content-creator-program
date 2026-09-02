import { describe, it, expect } from 'vitest'
import { packBoard, dropIndex, spanOf, colsFor, variantFor, orderOf, sizeOf, isPlaced, nextSize, SIZES, SIZE_LEVEL, MIN_PLACED_MILLE } from './PhotoBoard'

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
    for (const cols of [2, 3, 4, 6]) {
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
    for (const cols of [2, 3, 4, 6]) {
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

  // THE DEAD BAND. A finger resting on a tile's centre line used to flip the
  // answer every frame, and every flip re-packed the whole board - which is
  // what "all the other ones were moving around" was.
  it('holds the previous answer while the pointer sits on a centre line', () => {
    const b = boxes[1]
    const cx = b.x + b.w / 2
    const cy = b.y + b.h / 2
    expect(dropIndex(boxes, cx + b.w * 0.02, cy, 1)).toBe(1)
    expect(dropIndex(boxes, cx - b.w * 0.02, cy, 2)).toBe(2)
  })

  it('still changes its mind once the pointer clears the band', () => {
    const b = boxes[1]
    const cx = b.x + b.w / 2
    const cy = b.y + b.h / 2
    expect(dropIndex(boxes, cx + b.w * 0.4, cy, 1)).toBe(2)
    expect(dropIndex(boxes, cx - b.w * 0.4, cy, 2)).toBe(1)
  })

  it('answers without a previous index, as the first move of a drag does', () => {
    const b = boxes[1]
    expect(dropIndex(boxes, b.x + b.w / 2 - 0.001, b.y + b.h / 2)).toBe(1)
  })
})

describe('spanOf', () => {
  // The width derivation only runs for a row with no usable `size`, which is
  // why every case here passes one that is missing or nonsense.
  const placed = (w) => ({ size: 'unknown', pos_x: 0, pos_y: 0, pos_w: w, pos_h: 300 })

  it('reads one column back out of a one-column width', () => {
    const [b] = packBoard([item(1, 1)], 6)
    expect(spanOf(placed(Math.round(b.w * 1000)), 6)).toBe(1)
  })

  it('reads two columns back out of a two-column width', () => {
    const [b] = packBoard([item(1, 2)], 6)
    expect(spanOf(placed(Math.round(b.w * 1000)), 6)).toBe(2)
  })

  it('a photo nobody has arranged spans one column', () => {
    expect(spanOf({ size: null, pos_x: null, pos_y: null, pos_w: null, pos_h: null }, 6)).toBe(1)
  })

  // A board widened on a desktop has to be readable on a phone, where there
  // are fewer columns to span.
  it('never returns more columns than the board has', () => {
    expect(spanOf(placed(1000), 4)).toBeLessThanOrEqual(4)
    expect(spanOf({ size: 'large' }, 4)).toBeLessThanOrEqual(4)
    expect(spanOf({ size: 'large' }, 6)).toBeLessThanOrEqual(6)
  })

  // The whole point of the finer grid: large is two thirds of a desktop board
  // rather than the whole of it, and there is a size under the old smallest.
  it('large is the widest thing on the board, at every width', () => {
    for (const cols of [4, 6]) {
      expect(spanOf({ size: 'large' }, cols))
        .toBeGreaterThanOrEqual(spanOf({ size: 'medium' }, cols))
      expect(spanOf({ size: 'medium' }, cols))
        .toBeGreaterThan(spanOf({ size: 'small' }, cols))
    }
  })

  it('large no longer fills a desktop board edge to edge', () => {
    expect(spanOf({ size: 'large' }, 6)).toBeLessThan(6)
  })
})

describe('colsFor', () => {
  // The grid got FINER so the three sizes could all step down a notch and a
  // genuinely smaller one could exist under them. See the note on colsFor.
  it('is four columns on a phone and six above it', () => {
    expect(colsFor(375)).toBe(4)
    expect(colsFor(519)).toBe(4)
    expect(colsFor(520)).toBe(6)
    expect(colsFor(1200)).toBe(6)
  })
})

// TWO ARRANGEMENTS, ONE TABLE (migration 164). A phone and a desktop pack the
// same photographs into genuinely different collages, so each width reads and
// writes its own running order and its own size ladder - and a board nobody has
// ever arranged on a phone falls through to the desktop one rather than
// starting empty.
describe('the two arrangements', () => {
  it('reads the phone variant below 520 and the desktop one above', () => {
    expect(variantFor(375)).toBe('mobile')
    expect(variantFor(519)).toBe('mobile')
    expect(variantFor(520)).toBe('desktop')
    expect(variantFor(0)).toBe('desktop')
  })

  it('falls through to the desktop order and size when the phone has none', () => {
    const p = { sort_order: 3, size: 'large' }
    expect(orderOf(p, 'mobile')).toBe(3)
    expect(sizeOf(p, 'mobile')).toBe('large')
  })

  it('prefers the phone values once they exist, and never the other way round', () => {
    const p = { sort_order: 3, size: 'large', sort_order_mobile: 0, size_mobile: 'small' }
    expect(orderOf(p, 'mobile')).toBe(0)
    expect(sizeOf(p, 'mobile')).toBe('small')
    expect(orderOf(p, 'desktop')).toBe(3)
    expect(sizeOf(p, 'desktop')).toBe('large')
  })

  it('a photo with nothing stored at all is first and small', () => {
    expect(orderOf({}, 'mobile')).toBe(0)
    expect(sizeOf({}, 'desktop')).toBe('small')
  })

  it('spans the size the variant asks for', () => {
    const p = { size: 'large', size_mobile: 'small' }
    expect(spanOf(p, 6, 'desktop')).toBe(SIZE_LEVEL.large)
    expect(spanOf(p, 4, 'mobile')).toBe(1)
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
