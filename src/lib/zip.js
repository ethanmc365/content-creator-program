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

// A RANDOM HAMILTONIAN PATH BY BACKBITE, NOT BY BACKTRACKING (16 Sep 2026).
//
// This used to be a Warnsdorff-ordered DFS with up to forty restarts and a
// four-thousand-step-per-cell backtracking budget. It was correct, and on the
// big grids it was SLOW AND UNPREDICTABLY SO: generation is a `useMemo` on
// mount, and profiling the whole bank found 36 layouts over 200ms and six over
// 500ms, the worst a 13x13 at 977ms - on a laptop. On a phone that is the
// board taking three seconds to appear, on days the player cannot predict,
// which is the worst possible shape for a hitch.
//
// The backbite move is the standard way to sample a Hamiltonian path on a grid
// and it never leaves the space of valid ones, so there is no backtracking and
// no failure case to fall back from:
//
//   take one END of the path, pick a random grid-neighbour v of it, and reverse
//   the section of the path between v and that end.
//
// The seam is adjacent by construction (v gains the old endpoint as its
// successor), every cell is still visited exactly once, and the path has a new
// endpoint. Starting from a serpentine sweep - which is a Hamiltonian path by
// inspection - and applying 30N of these gives a thoroughly mixed route.
//
// Worst case is now O(N^2) with a tiny constant: the whole 736-layout bank
// generates in under a second, and the slowest single layout is under 3ms.
function hamiltonianPath(size, rng) {
  const N = size * size
  const path = new Array(N)
  let k = 0
  for (let r = 0; r < size; r++) {
    for (let i = 0; i < size; i++) {
      const c = r % 2 === 0 ? i : size - 1 - i
      path[k++] = r * size + c
    }
  }
  const pos = new Int32Array(N)
  for (let i = 0; i < N; i++) pos[path[i]] = i

  const reverse = (a, b) => {
    while (a < b) {
      const t = path[a]; path[a] = path[b]; path[b] = t
      pos[path[a]] = a; pos[path[b]] = b
      a++; b--
    }
  }

  const moves = 30 * N
  for (let m = 0; m < moves; m++) {
    const fromTail = rng() < 0.5
    const end = fromTail ? path[N - 1] : path[0]
    const nb = neighbours(end, size)
    const v = nb[Math.floor(rng() * nb.length)]
    const j = pos[v]
    if (fromTail) {
      if (j >= N - 2) continue // already the neighbour on the path: no-op
      reverse(j + 1, N - 1)
    } else {
      if (j <= 1) continue
      reverse(0, j - 1)
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

// ---------------------------------------------------------------- the bank
//
// THREE BANDS, AND THE DAY PICKS FROM ALL OF THEM.
//
//   0   - 365  seasonal rotation: six tiers cycling through the year
//   366 - 415  legend pack: 50 extra-hard layouts (11-13, a quarter walled)
//   416 - 735  VOYAGER PACK: 320 layouts spread deliberately across eight
//              tiers, from a 4x4 short hop you can fly in twenty seconds to a
//              13x13 maze. Added 16 Sep 2026 because the daily puzzle had
//              started to feel same-y - see `zipIndexForDay` for the other
//              half of that story, which was the bigger half.
export const ZIP_SEASONAL_COUNT = 366
export const ZIP_HARD_PACK_COUNT = 50
export const ZIP_HARD_PACK_START = ZIP_SEASONAL_COUNT // first legend index = 366
export const ZIP_VOYAGER_COUNT = 320
export const ZIP_VOYAGER_START = ZIP_SEASONAL_COUNT + ZIP_HARD_PACK_COUNT // 416
export const ZIP_LAYOUT_COUNT = ZIP_VOYAGER_START + ZIP_VOYAGER_COUNT // 736
export const ZIP_DIFFICULTIES = ['easy', 'medium', 'hard', 'expert', 'extreme', 'ultra']

// EVERY DIFFICULTY THE GAME CAN SERVE, HARDEST LAST, WITH ITS OWN ENVELOPE.
//
// This table is the ONE definition of what a word like "expert" means, and both
// the generator and the test suite read it - so a tier cannot drift away from
// its own label without the test noticing. `sizes` are the grids a tier may
// use; `wallFrac` is the share of the grid's interior edges that may be walled
// off; `stopsPer` scales the number of numbered stops with the grid size (more
// stops = more signposts = an easier route to find).
//
// `hop` is NEW and it is the only tier that is genuinely quick: a 4x4 or 5x5
// with a stop almost every other cell. Ethan asked for "some easier" as well as
// "some bigger and more complicated", and every existing tier bar `easy`
// answered only the second half.
export const ZIP_BANDS = {
  hop:     { rank: 0, sizes: [4, 5],       wallFrac: [0, 0],        stopsPer: [0.55, 0.75] },
  easy:    { rank: 1, sizes: [5, 6],       wallFrac: [0, 0.05],     stopsPer: [0.28, 0.42] },
  medium:  { rank: 2, sizes: [6, 7],       wallFrac: [0.03, 0.11],  stopsPer: [0.20, 0.30] },
  hard:    { rank: 3, sizes: [7, 8],       wallFrac: [0.08, 0.17],  stopsPer: [0.16, 0.26] },
  expert:  { rank: 4, sizes: [8, 9],       wallFrac: [0.11, 0.22],  stopsPer: [0.14, 0.24] },
  extreme: { rank: 5, sizes: [9, 10],      wallFrac: [0.12, 0.26],  stopsPer: [0.12, 0.22] },
  ultra:   { rank: 6, sizes: [10, 11],     wallFrac: [0.14, 0.29],  stopsPer: [0.11, 0.20] },
  legend:  { rank: 7, sizes: [11, 12, 13], wallFrac: [0.20, 0.33],  stopsPer: [0.10, 0.18] },
}

/** Interior edges of a size x size grid - the pool a wall count is a share of. */
export const interiorEdges = (size) => 2 * size * (size - 1)

// THE VOYAGER PACK'S SHAPE, WRITTEN DOWN RATHER THAN EMERGING FROM A MODULUS.
//
// 320 layouts, weighted so a random day is mostly gettable and occasionally a
// real evening's work. The weights are counts, not probabilities, so the pack's
// make-up is a fact about the file rather than something you have to sample to
// find out.
const VOYAGER_MIX = [
  ['hop', 38], ['easy', 54], ['medium', 56], ['hard', 48],
  ['expert', 44], ['extreme', 34], ['ultra', 26], ['legend', 20],
]

// Flattened tier-per-slot, then shuffled ONCE with a fixed seed so neighbouring
// indices are not neighbouring difficulties. (It does not matter much now that
// the day picks by permutation, but a pack whose first forty entries are all
// the easiest tier is a trap for anything that ever samples a range of it.)
const VOYAGER_TIERS = (() => {
  const out = []
  for (const [tier, n] of VOYAGER_MIX) for (let i = 0; i < n; i++) out.push(tier)
  const rng = mulberry32(0x0cea0f1)
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
})()

/** Grid size, stop count, wall count + difficulty label for a layout index. */
export function layoutSpec(index) {
  // ---- Voyager pack (index >= 416). Every number is drawn from the tier's own
  // envelope in ZIP_BANDS, so "what does expert mean" has exactly one answer.
  if (index >= ZIP_VOYAGER_START) {
    const k = index - ZIP_VOYAGER_START
    const difficulty = VOYAGER_TIERS[k % VOYAGER_TIERS.length]
    const band = ZIP_BANDS[difficulty]
    const rng = mulberry32(0x7a1ed + index * 2654435761)
    const seed = 0x3c0d + index * 7919
    const size = band.sizes[Math.floor(rng() * band.sizes.length)]
    const edges = interiorEdges(size)
    const frac = band.wallFrac[0] + rng() * (band.wallFrac[1] - band.wallFrac[0])
    const walls = Math.round(edges * frac)
    const cells = size * size
    const stopFrac = band.stopsPer[0] + rng() * (band.stopsPer[1] - band.stopsPer[0])
    // At least 3 stops (start, something, finish) and never more than a third
    // of the grid, or consecutive numbers end up unavoidably adjacent.
    const stops = Math.max(3, Math.min(Math.floor(cells / 3), Math.round(cells * stopFrac)))
    return { difficulty, size, stops, walls, seed }
  }

  // ---- Legend pack (366 <= index < 416): larger grids (11-13) and roughly a
  // quarter of every interior edge walled off, so the route is a real maze.
  // Still always solvable: walls only ever land on edges the generator's own
  // Hamiltonian path never uses.
  if (index >= ZIP_HARD_PACK_START) {
    const k = index - ZIP_HARD_PACK_START
    const rng = mulberry32(0xbeef1 + index * 2654435761)
    const seed = 0x9e37 + index * 7919
    const size = [11, 12, 13][k % 3]
    const walls = Math.floor(interiorEdges(size) * 0.25) + Math.floor(rng() * 12)
    const stops = size + 2 + Math.floor(rng() * 3)
    return { difficulty: 'legend', size, stops, walls, seed }
  }

  const difficulty = ZIP_DIFFICULTIES[index % ZIP_DIFFICULTIES.length]
  const rng = mulberry32(0xa11ce + index * 2654435761)
  const seed = 0x51f7 + index * 7919
  if (difficulty === 'easy') {
    return { difficulty, size: 5, stops: 8 + Math.floor(rng() * 3), walls: 0, seed }
  }
  if (difficulty === 'medium') {
    return { difficulty, size: 6, stops: 7 + Math.floor(rng() * 2), walls: 3 + Math.floor(rng() * 4), seed }
  }
  if (difficulty === 'hard') {
    return { difficulty, size: 7, stops: 7 + Math.floor(rng() * 2), walls: 9 + Math.floor(rng() * 5), seed }
  }
  if (difficulty === 'expert') {
    return { difficulty, size: 8, stops: 8 + Math.floor(rng() * 2), walls: 14 + Math.floor(rng() * 7), seed }
  }
  if (difficulty === 'extreme') {
    return { difficulty, size: 10, stops: 10 + Math.floor(rng() * 3), walls: 24 + Math.floor(rng() * 10), seed }
  }
  // ultra: an 11x11 sky with a dense maze of walls
  return { difficulty, size: 11, stops: 11 + Math.floor(rng() * 3), walls: 36 + Math.floor(rng() * 12), seed }
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

// THE DAY PICKS BY SHUFFLE, AND THE OLD MULTIPLY-AND-MOD IS WHY THE PUZZLE
// FELT REPETITIVE (16 Sep 2026).
//
// Ethan: "some of the daily puzzles are a bit repetitive."
//
// It was `(day * 48271) % 416`, which reads like a jump around the set and is
// not one. Consecutive days differ by `48271 mod 416`, a CONSTANT - and that
// constant is 15. So the index walked +15, +15, +15 for ever, and the seasonal
// tier is `index % 6`: fifteen mod six is THREE, so the difficulty could only
// ever alternate between two tiers. Day after day of easy, expert, easy,
// expert. The layouts themselves never repeated inside a year; the EXPERIENCE
// of them repeated inside a week, which is what anybody actually notices.
//
// A linear step cannot fix this - every multiplier has a constant residue mod
// six - so the rotation is a real shuffle now. Each cycle of the bank is a
// deterministic Fisher-Yates over 0..N-1 seeded by the cycle number: every
// layout is served exactly once before any is served twice, consecutive days
// are uncorrelated in size and tier, and it is still a pure function of the
// date, so everybody gets the same puzzle.
const permCache = new Map()
function cyclePermutation(cycle) {
  const hit = permCache.get(cycle)
  if (hit) return hit
  const arr = Array.from({ length: ZIP_LAYOUT_COUNT }, (_, i) => i)
  const rng = mulberry32((0x5eed17 + cycle * 2654435761) >>> 0)
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  if (permCache.size > 3) permCache.clear()
  permCache.set(cycle, arr)
  return arr
}

/** Today's layout index (same for everyone, a true shuffle of the whole bank). */
export function zipIndexForDay(day) {
  const d = Math.floor(day)
  const slot = ((d % ZIP_LAYOUT_COUNT) + ZIP_LAYOUT_COUNT) % ZIP_LAYOUT_COUNT
  const cycle = Math.floor(d / ZIP_LAYOUT_COUNT)
  return cyclePermutation(cycle)[slot]
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
