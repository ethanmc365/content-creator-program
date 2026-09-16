import { describe, it, expect } from 'vitest'
import {
  generateZip, validateZip, zipIndexForDay, layoutSpec, wallKey,
  ZIP_LAYOUT_COUNT, ZIP_BANDS, ZIP_CORRIDOR_START, interiorEdges,
} from './zip'

describe('flight path layouts', () => {
  it('every layout in the bank is generated with a valid full-coverage solution', { timeout: 120_000 }, () => {
    expect(ZIP_LAYOUT_COUNT).toBeGreaterThanOrEqual(1056)
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
      // EVERY WALL SITS BETWEEN TWO CELLS THAT ARE ACTUALLY NEXT TO EACH OTHER.
      // Worth asserting since the corridor pack walks a wall along its own axis
      // by adding `size` or 1 to both cell ids: a horizontal run that is not
      // stopped at the edge of the grid wraps onto the next row, where the two
      // ids are still consecutive and the cells are at opposite ends of the
      // board.
      const pairs = new Set()
      for (const [a, b] of walls) {
        const k = wallKey(a, b)
        expect(pairs.has(k), `layout ${i} lists a wall twice`).toBe(false)
        pairs.add(k)
        const ra = Math.floor(a / size), ca = a % size
        const rb = Math.floor(b / size), cb = b % size
        expect(Math.abs(ra - rb) + Math.abs(ca - cb), `layout ${i} wall ${a}-${b} is not an edge`).toBe(1)
      }
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

  it('grows the corridor pack\'s walls into barriers instead of scattering them', () => {
    // The whole point of the band: a scattered board is solved by probing, a
    // board with barriers on it is solved by looking. Measured as the average
    // length of a run of walls along its own axis - if the two bands came out
    // the same, the pack would be 320 layouts that are not actually different.
    const runLength = (p) => {
      const set = new Set(p.walls.map(([a, b]) => wallKey(a, b)))
      const seen = new Set()
      const runs = []
      for (const [a, b] of p.walls) {
        const k = wallKey(a, b)
        if (seen.has(k)) continue
        seen.add(k)
        const step = b === a + 1 ? p.size : 1
        let len = 1
        for (const dir of [1, -1]) {
          for (let n = 1; ; n++) {
            const kk = wallKey(a + dir * n * step, b + dir * n * step)
            if (!set.has(kk) || seen.has(kk)) break
            seen.add(kk)
            len++
          }
        }
        runs.push(len)
      }
      return runs.length ? runs.reduce((x, y) => x + y, 0) / runs.length : 0
    }
    const mean = (from, to) => {
      let sum = 0, n = 0
      for (let i = from; i < to; i += 3) {
        const p = generateZip(i)
        if (p.walls.length < 4) continue
        sum += runLength(p)
        n++
      }
      return sum / n
    }
    const scattered = mean(416, ZIP_CORRIDOR_START)
    const grown = mean(ZIP_CORRIDOR_START, ZIP_LAYOUT_COUNT)
    expect(scattered).toBeLessThan(1.6)
    expect(grown).toBeGreaterThan(2.2)
  })

  it('tells the board which kind of walls it has', () => {
    expect(generateZip(500).wallStyle).toBe('scatter')
    expect(generateZip(ZIP_CORRIDOR_START + 5).wallStyle).toBe('grown')
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
