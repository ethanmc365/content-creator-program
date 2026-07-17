// Flight Path: draw one continuous flight through the numbered stops in
// order, covering every cell of the grid.
//
// Every layout is generated from a seed: we build a random Hamiltonian path
// over the grid (so a full-coverage route EXISTS by construction), drop the
// numbered stops onto it in order, then optionally add WALLS between
// grid-adjacent cells the solution never crosses (harder puzzles, still
// guaranteed solvable). Generation is fully deterministic: a layout index is
// the same puzzle for everyone, and the vitest suite verifies all 366.
//
// Difficulty rotates through the year:
//   easy    - 5x5, plenty of stops, no walls
//   medium  - 6x6, fewer stops, a few walls
//   hard    - 7x7, sparse stops, more walls
//   expert  - 8x8, sparse stops, lots of walls
//   extreme - 10x10, the full long-haul: a big sky and a maze of walls
//   ultra   - 11x11, the hardest tier: a huge sky and a dense wall maze

/** Small fast deterministic PRNG (mulberry32). */
export function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function neighbours(cell, size) {
  const r = Math.floor(cell / size), c = cell % size
  const out = []
  if (r > 0) out.push(cell - size)
  if (r < size - 1) out.push(cell + size)
  if (c > 0) out.push(cell - 1)
  if (c < size - 1) out.push(cell + 1)
  return out
}

/** Canonical key for the wall between two adjacent cells. */
export function wallKey(a, b) {
  return a < b ? `${a}-${b}` : `${b}-${a}`
}

// Random Hamiltonian path via DFS with the Warnsdorff heuristic (prefer the
// neighbour with fewest onward options, random tiebreak). On grids this size
// (25-100 cells) it almost always succeeds within a few restarts; a serpentine
// fallback keeps it total.
function hamiltonianPath(size, rng) {
  const N = size * size
  for (let attempt = 0; attempt < 40; attempt++) {
    const start = Math.floor(rng() * N)
    const visited = new Array(N).fill(false)
    const path = [start]
    visited[start] = true
    let budget = 4000 * N // backtracking step cap so generation stays instant

    const step = () => {
      if (path.length === N) return true
      if (budget-- <= 0) return false
      const head = path[path.length - 1]
      const options = neighbours(head, size)
        .filter((n) => !visited[n])
        .map((n) => ({
          n,
          degree: neighbours(n, size).filter((m) => !visited[m]).length,
          tie: rng(),
        }))
        .sort((a, b) => a.degree - b.degree || a.tie - b.tie)
      for (const { n } of options) {
        visited[n] = true
        path.push(n)
        if (step()) return true
        visited[n] = false
        path.pop()
      }
      return false
    }

    if (step()) return path
  }
  // Fallback: serpentine sweep, randomly transposed/flipped for variety.
  const flip = rng() < 0.5, transpose = rng() < 0.5
  const path = []
  for (let r = 0; r < size; r++) {
    for (let i = 0; i < size; i++) {
      const c = r % 2 === 0 ? i : size - 1 - i
      let rr = flip ? size - 1 - r : r, cc = c
      if (transpose) [rr, cc] = [cc, rr]
      path.push(rr * size + cc)
    }
  }
  return path
}

// Stop positions along the path: always the first and last cell, with the rest
// spread one per segment (jittered) so consecutive numbers are never trivially
// adjacent and always appear in path order.
function stopPositions(N, count, rng) {
  const positions = [0]
  const seg = (N - 1) / (count - 1)
  for (let j = 1; j < count - 1; j++) {
    const jitter = (rng() - 0.5) * seg * 0.55
    let p = Math.round(j * seg + jitter)
    p = Math.max(positions[positions.length - 1] + 2, Math.min(N - 3, p))
    positions.push(p)
  }
  positions.push(N - 1)
  return positions
}

// Walls between grid-adjacent cells that are NOT consecutive on the solution
// path. The generator's route never crosses them, so the puzzle stays solvable
// while alternative routes get pruned away.
function buildWalls(size, path, count, rng) {
  const onPath = new Set()
  for (let i = 1; i < path.length; i++) onPath.add(wallKey(path[i - 1], path[i]))
  const candidates = []
  for (let cell = 0; cell < size * size; cell++) {
    const r = Math.floor(cell / size), c = cell % size
    if (c < size - 1 && !onPath.has(wallKey(cell, cell + 1))) candidates.push([cell, cell + 1])
    if (r < size - 1 && !onPath.has(wallKey(cell, cell + size))) candidates.push([cell, cell + size])
  }
  // deterministic shuffle
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[candidates[i], candidates[j]] = [candidates[j], candidates[i]]
  }
  return candidates.slice(0, Math.min(count, candidates.length))
}

export const ZIP_LAYOUT_COUNT = 366
export const ZIP_DIFFICULTIES = ['easy', 'medium', 'hard', 'expert', 'extreme', 'ultra']

/** Grid size, stop count, wall count + difficulty label for a layout index. */
export function layoutSpec(index) {
  const difficulty = ZIP_DIFFICULTIES[index % ZIP_DIFFICULTIES.length]
  const rng = mulberry32(0xa11ce + index * 2654435761)
  const seed = 0x51f7 + index * 7919
  if (difficulty === 'easy') {
    return { difficulty, size: 5, stops: 8 + Math.floor(rng() * 3), walls: 0, seed }
  }
  if (difficulty === 'medium') {
    return { difficulty, size: 6, stops: 7 + Math.floor(rng() * 2), walls: 2 + Math.floor(rng() * 3), seed }
  }
  if (difficulty === 'hard') {
    return { difficulty, size: 7, stops: 7 + Math.floor(rng() * 2), walls: 6 + Math.floor(rng() * 5), seed }
  }
  if (difficulty === 'expert') {
    return { difficulty, size: 8, stops: 8 + Math.floor(rng() * 2), walls: 10 + Math.floor(rng() * 6), seed }
  }
  if (difficulty === 'extreme') {
    return { difficulty, size: 10, stops: 10 + Math.floor(rng() * 3), walls: 18 + Math.floor(rng() * 8), seed }
  }
  // ultra: the hardest tier - an 11x11 sky with a dense maze of walls
  return { difficulty, size: 11, stops: 11 + Math.floor(rng() * 3), walls: 30 + Math.floor(rng() * 10), seed }
}

/**
 * Build layout `index` (0..365): { size, difficulty, dots, walls, solution }.
 * dots is [{ cell, n }] (n = 1..k); walls is [[a,b], ...] cell pairs; solution
 * is a Hamiltonian path visiting the dots in order without crossing a wall
 * (kept for the tests, never shown to the player).
 */
export function generateZip(index) {
  const { size, stops, walls: wallCount, seed, difficulty } = layoutSpec(index)
  const rng = mulberry32(seed)
  const path = hamiltonianPath(size, rng)
  const positions = stopPositions(path.length, stops, rng)
  const dots = positions.map((p, i) => ({ cell: path[p], n: i + 1 }))
  const walls = buildWalls(size, path, wallCount, rng)
  return { size, index, difficulty, dots, walls, solution: path }
}

/** Today's layout index (same for everyone, jumps around the set). */
export function zipIndexForDay(day) {
  return (day * 48271) % ZIP_LAYOUT_COUNT
}

/**
 * Is `path` a valid completed solution for `puzzle`? Checks: starts at stop 1,
 * ends at the last stop, every step orthogonally adjacent and not through a
 * wall, every cell covered exactly once, and stops visited in order.
 */
export function validateZip(puzzle, path) {
  const { size, dots, walls = [] } = puzzle
  const N = size * size
  if (path.length !== N) return false
  if (new Set(path).size !== N) return false
  if (path.some((c) => c < 0 || c >= N)) return false
  const blocked = new Set(walls.map(([a, b]) => wallKey(a, b)))
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i]
    const ra = Math.floor(a / size), ca = a % size
    const rb = Math.floor(b / size), cb = b % size
    if (Math.abs(ra - rb) + Math.abs(ca - cb) !== 1) return false
    if (blocked.has(wallKey(a, b))) return false
  }
  const numberAt = new Map(dots.map((d) => [d.cell, d.n]))
  if (numberAt.get(path[0]) !== 1) return false
  if (numberAt.get(path[N - 1]) !== dots.length) return false
  let expected = 1
  for (const cell of path) {
    const n = numberAt.get(cell)
    if (n != null) {
      if (n !== expected) return false
      expected++
    }
  }
  return expected === dots.length + 1
}
