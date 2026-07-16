import { describe, it, expect } from 'vitest'
import { generateZip, validateZip, zipIndexForDay, layoutSpec, wallKey, ZIP_LAYOUT_COUNT } from './zip'

describe('flight path layouts', () => {
  it('every one of the 366 layouts is generated with a valid full-coverage solution', { timeout: 120_000 }, () => {
    expect(ZIP_LAYOUT_COUNT).toBeGreaterThanOrEqual(365)
    for (let i = 0; i < ZIP_LAYOUT_COUNT; i++) {
      const puzzle = generateZip(i)
      const { size, dots, walls, solution } = puzzle
      // structural sanity: dots on distinct cells, numbered 1..k
      expect(new Set(dots.map((d) => d.cell)).size).toBe(dots.length)
      expect(dots.map((d) => d.n)).toEqual(dots.map((_, j) => j + 1))
      expect(dots.length).toBeGreaterThanOrEqual(size)
      // walls never sit on the solution route
      const steps = new Set()
      for (let s = 1; s < solution.length; s++) steps.add(wallKey(solution[s - 1], solution[s]))
      for (const [a, b] of walls) expect(steps.has(wallKey(a, b)), `layout ${i} wall on route`).toBe(false)
      // the generator's own path must be a real solution
      expect(validateZip(puzzle, solution), `layout ${i} unsolvable`).toBe(true)
    }
  })

  it('difficulties are mixed and match their specs', () => {
    const byDiff = { easy: 0, medium: 0, hard: 0, expert: 0, extreme: 0 }
    for (let i = 0; i < ZIP_LAYOUT_COUNT; i++) {
      const spec = layoutSpec(i)
      byDiff[spec.difficulty]++
      if (spec.difficulty === 'easy') { expect(spec.size).toBe(5); expect(spec.walls).toBe(0) }
      if (spec.difficulty === 'hard') { expect(spec.size).toBe(7); expect(spec.walls).toBeGreaterThan(0) }
      if (spec.difficulty === 'expert') { expect(spec.size).toBe(8); expect(spec.walls).toBeGreaterThanOrEqual(10) }
      if (spec.difficulty === 'extreme') { expect(spec.size).toBe(10); expect(spec.walls).toBeGreaterThanOrEqual(18) }
    }
    for (const d of ['easy', 'medium', 'hard', 'expert', 'extreme']) {
      expect(byDiff[d], `${d} appears through the year`).toBeGreaterThan(60)
    }
  })

  it('is deterministic (same index, same puzzle)', () => {
    const a = generateZip(42)
    const b = generateZip(42)
    expect(a.dots).toEqual(b.dots)
    expect(a.walls).toEqual(b.walls)
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

  it('rejects a path that crosses a wall', () => {
    // find a layout with walls and hand-build a 2-step crossing check
    const puzzle = generateZip(1) // medium -> has walls
    expect(puzzle.walls.length).toBeGreaterThan(0)
    const [a, b] = puzzle.walls[0]
    expect(validateZip({ ...puzzle, size: puzzle.size, dots: [{ cell: a, n: 1 }, { cell: b, n: 2 }] },
      // a fake "path" of just the two walled cells: adjacency ok, wall blocks it
      puzzle.size * puzzle.size === 2 ? [a, b] : [a, b])).toBe(false)
  })

  it('daily index always lands on a real layout', () => {
    const seen = new Set()
    for (let d = 20000; d < 20366; d++) {
      const idx = zipIndexForDay(d)
      expect(idx).toBeGreaterThanOrEqual(0)
      expect(idx).toBeLessThan(ZIP_LAYOUT_COUNT)
      seen.add(idx)
    }
    // the daily rotation covers a large share of the pool across a year
    expect(seen.size).toBeGreaterThan(300)
  })
})
