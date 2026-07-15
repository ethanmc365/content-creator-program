// Zip: Flight Path. Draw one continuous flight through the numbered stops in
// order, covering every cell of the grid (LinkedIn-Zip style, reskinned as a
// plane + contrail).
//
// Every layout is generated from a seed: we first build a random Hamiltonian
// path over the grid (so a full-coverage route EXISTS by construction), then
// drop the numbered stops onto that path in order. The generator is fully
// deterministic, so a given layout index is the same puzzle for everyone and
// the vitest suite can verify all layouts are solvable.

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

// Random Hamiltonian path via DFS with the Warnsdorff heuristic (prefer the
// neighbour with fewest onward options, random tiebreak). On grids this small
// (25-49 cells) it almost always succeeds within a few restarts; a serpentine
// fallback keeps it total.
function hamiltonianPath(size, rng) {
  const N = size * size
  for (let attempt = 0; attempt < 40; attempt++) {
    const start = Math.floor(rng() * N)
    const visited = new Array(N).fill(false)
    const path = [start]
    visited[start] = true
    let budget = 120_000 // backtracking step cap so generation stays instant

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

/** Grid size + stop count for a layout index (varied but deterministic). */
export function layoutSpec(index) {
  const size = [5, 6, 6, 6, 7][index % 5]
  const stops = size + 1 + (index % 3 === 0 ? 1 : 0)
  return { size, stops, seed: 0x51f7 + index * 7919 }
}

export const ZIP_LAYOUT_COUNT = 120

/**
 * Build layout `index` (0..ZIP_LAYOUT_COUNT-1): a { size, dots, solution }
 * puzzle where dots is [{ cell, n }] with n = 1..k, and solution is a
 * Hamiltonian path visiting the dots in order (kept for tests, never shown).
 */
export function generateZip(index) {
  const { size, stops, seed } = layoutSpec(index)
  const rng = mulberry32(seed)
  const path = hamiltonianPath(size, rng)
  const positions = stopPositions(path.length, stops, rng)
  const dots = positions.map((p, i) => ({ cell: path[p], n: i + 1 }))
  return { size, index, dots, solution: path }
}

/** Today's Zip layout index (same for everyone, jumps around the set). */
export function zipIndexForDay(day) {
  return (day * 48271) % ZIP_LAYOUT_COUNT
}

/**
 * Is `path` a valid completed solution for `puzzle`? Checks: starts at stop 1,
 * ends at the last stop, every step orthogonally adjacent, every cell covered
 * exactly once, and the numbered stops visited in ascending order.
 */
export function validateZip(puzzle, path) {
  const { size, dots } = puzzle
  const N = size * size
  if (path.length !== N) return false
  if (new Set(path).size !== N) return false
  if (path.some((c) => c < 0 || c >= N)) return false
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i]
    const ra = Math.floor(a / size), ca = a % size
    const rb = Math.floor(b / size), cb = b % size
    if (Math.abs(ra - rb) + Math.abs(ca - cb) !== 1) return false
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
