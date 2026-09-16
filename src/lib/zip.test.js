import { describe, it, expect } from 'vitest'
import { generateZip, validateZip, zipIndexForDay, layoutSpec, wallKey, ZIP_LAYOUT_COUNT, ZIP_BANDS, interiorEdges } from './zip'

describe('flight path layouts', () => {
  it('every layout in the bank is generated with a valid full-coverage solution', { timeout: 120_000 }, () => {
    expect(ZIP_LAYOUT_COUNT).toBeGreaterThanOrEqual(736)
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

  it('every layout stays inside the envelope its own tier advertises', () => {
    // ZIP_BANDS is the one definition of what "expert" means, and this is what
    // stops a tier drifting away from its label: the generator reads the table,
    // and so does this - so a size or a wall count that no longer matches the
    // word the player is shown fails here rather than in the wild.
    const byDiff = {}
    for (let i = 0; i < ZIP_LAYOUT_COUNT; i++) {
      const spec = layoutSpec(i)
      const band = ZIP_BANDS[spec.difficulty]
      expect(band, `layout ${i} has an unknown difficulty ${spec.difficulty}`).toBeTruthy()
      byDiff[spec.difficulty] = (byDiff[spec.difficulty] || 0) + 1
      expect(band.sizes, `layout ${i} (${spec.difficulty}) size ${spec.size}`).toContain(spec.size)
      const edges = interiorEdges(spec.size)
      expect(spec.walls, `layout ${i} walls`).toBeGreaterThanOrEqual(Math.floor(edges * band.wallFrac[0]))
      expect(spec.walls, `layout ${i} walls`).toBeLessThanOrEqual(Math.ceil(edges * band.wallFrac[1]))
      expect(spec.stops).toBeGreaterThanOrEqual(3)
      // `stopPositions` needs two cells between consecutive stops, so half the
      // grid is the hard ceiling on how many it can place at all.
      expect(spec.stops).toBeLessThanOrEqual(Math.floor((spec.size * spec.size) / 2))
    }
    // Every tier is actually served, and the spread is a real spread: no tier
    // is a rounding error and none of them dominates the year.
    for (const d of Object.keys(ZIP_BANDS)) {
      expect(byDiff[d], `${d} never appears`).toBeGreaterThan(20)
      expect(byDiff[d] / ZIP_LAYOUT_COUNT, `${d} dominates the bank`).toBeLessThan(0.3)
    }
    // ... and harder tiers really are bigger on average than easier ones.
    const avgSize = {}
    for (const d of Object.keys(ZIP_BANDS)) avgSize[d] = 0
    for (let i = 0; i < ZIP_LAYOUT_COUNT; i++) { const s = layoutSpec(i); avgSize[s.difficulty] += s.size }
    const ranked = Object.keys(ZIP_BANDS).sort((a, b) => ZIP_BANDS[a].rank - ZIP_BANDS[b].rank)
    for (let i = 1; i < ranked.length; i++) {
      const lo = avgSize[ranked[i - 1]] / byDiff[ranked[i - 1]]
      const hi = avgSize[ranked[i]] / byDiff[ranked[i]]
      expect(hi, `${ranked[i]} is not bigger than ${ranked[i - 1]}`).toBeGreaterThan(lo)
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

  it('the daily rotation is a real shuffle, not a fixed stride', () => {
    // THE BUG THIS TEST EXISTS FOR. The old mapping was `(day * 48271) % 416`:
    // a linear step, so consecutive days differed by a CONSTANT (15), and the
    // seasonal tier was `index % 6` - fifteen mod six being three, the
    // difficulty could only ever alternate between two tiers for ever. The
    // layouts never repeated; the experience of them repeated inside a week.
    const seen = new Set()
    const tiers = []
    const strides = new Set()
    let prev = null
    // From the START of a cycle: the "every layout exactly once" promise is a
    // promise about one pass through the bank, and a window straddling two
    // cycles is two different shuffles.
    const first = Math.ceil(20000 / ZIP_LAYOUT_COUNT) * ZIP_LAYOUT_COUNT
    for (let d = first; d < first + ZIP_LAYOUT_COUNT; d++) {
      const idx = zipIndexForDay(d)
      expect(idx).toBeGreaterThanOrEqual(0)
      expect(idx).toBeLessThan(ZIP_LAYOUT_COUNT)
      seen.add(idx)
      if (d < first + 120) tiers.push(layoutSpec(idx).difficulty)
      if (prev != null) strides.add(((idx - prev) % ZIP_LAYOUT_COUNT + ZIP_LAYOUT_COUNT) % ZIP_LAYOUT_COUNT)
      prev = idx
    }
    // a full cycle serves every layout exactly once
    expect(seen.size).toBe(ZIP_LAYOUT_COUNT)
    // and it does not walk the bank at a fixed stride
    expect(strides.size).toBeGreaterThan(100)
    // over four months a player meets every tier, not two of them
    expect(new Set(tiers).size).toBe(Object.keys(ZIP_BANDS).length)
  })
})
