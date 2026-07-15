import { describe, it, expect } from 'vitest'
import { generateZip, validateZip, zipIndexForDay, ZIP_LAYOUT_COUNT } from './zip'

describe('zip flight-path layouts', () => {
  it('every layout is generated with a valid full-coverage solution', () => {
    for (let i = 0; i < ZIP_LAYOUT_COUNT; i++) {
      const puzzle = generateZip(i)
      const { size, dots, solution } = puzzle
      // structural sanity: dots on distinct cells, numbered 1..k
      expect(new Set(dots.map((d) => d.cell)).size).toBe(dots.length)
      expect(dots.map((d) => d.n)).toEqual(dots.map((_, j) => j + 1))
      expect(dots.length).toBeGreaterThanOrEqual(size)
      // the generator's own path must be a real solution
      expect(validateZip(puzzle, solution), `layout ${i} unsolvable`).toBe(true)
    }
  })

  it('is deterministic (same index, same puzzle)', () => {
    const a = generateZip(42)
    const b = generateZip(42)
    expect(a.dots).toEqual(b.dots)
    expect(a.solution).toEqual(b.solution)
  })

  it('rejects invalid paths', () => {
    const puzzle = generateZip(0)
    const good = puzzle.solution
    expect(validateZip(puzzle, good.slice(0, -1))).toBe(false) // incomplete
    expect(validateZip(puzzle, [...good].reverse())).toBe(false) // wrong direction
    const swapped = [...good]
    ;[swapped[3], swapped[4]] = [swapped[4], swapped[3]]
    expect(validateZip(puzzle, swapped)).toBe(false) // broken adjacency
  })

  it('daily index always lands on a real layout', () => {
    for (let d = 20000; d < 20400; d++) {
      const idx = zipIndexForDay(d)
      expect(idx).toBeGreaterThanOrEqual(0)
      expect(idx).toBeLessThan(ZIP_LAYOUT_COUNT)
    }
  })
})
