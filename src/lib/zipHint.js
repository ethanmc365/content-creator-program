// THE HINT BUTTON: "put me back to the last thing I got right".
//
// Ethan, 16 Sep 2026: "let's say you move the plane a bit trying to complete it
// but think you've gone wrong, clicking the hint button will reset you back to
// the last correct state and have the plane facing in the right direction to go
// next. The hint should never fill in more than they've got already, just go
// back to correct what's wrong, and if they were right then it should stay the
// same."
//
// WHAT "CORRECT" HAS TO MEAN, AND THE OBVIOUS ANSWER IS WRONG
//
// The tempting implementation is to compare the player's route against
// `puzzle.solution` - the Hamiltonian path the generator built the puzzle from -
// and cut back to where they diverge. That is cheap, and on the easy tiers it is
// actively wrong: a 5x5 with no walls has thousands of valid full-coverage
// routes and the generator's is only one of them. A player flying a perfectly
// good alternative would be told they had gone wrong on move two and have most
// of their work deleted. It would break the one promise in the request that
// matters - "if they were right then it should stay the same".
//
// So correct means SOLVABLE-FROM-HERE: a prefix is right if some complete,
// legal route starts with it. That is a Hamiltonian-path completion question,
// and `completeZip` below answers it.
//
// WHY THE SEARCH IS AFFORDABLE
//
// Two things keep a click instant.
//
//   1. Completability is MONOTONE. If the first i moves can be finished then so
//      can the first i-1 (take the same completion and stop a move earlier). So
//      the longest correct prefix can be found by BINARY SEARCH - seven or eight
//      probes on a 120-cell route, not a hundred and twenty.
//   2. The generator's own solution gives a FREE LOWER BOUND. However much of it
//      the player has matched cell-for-cell is completable by definition, so the
//      search never has to look below that.
//
// And the solver itself prunes hard: a bipartite colour count that is checked
// once and then holds for the whole search, a degree test that kills any cell
// the route could enter but not leave, and a connectivity test that kills a
// route which has sealed part of the sky off. Most wrong prefixes are refused
// before the first move is tried.
//
// If the budget ever does run out the hint falls back to the free lower bound,
// which is always a genuinely correct prefix - so the button is never wrong,
// only occasionally less generous than it could have been.

import { wallKey } from './zip'

/** Adjacency lists with the no-fly walls already removed. */
function buildGraph(puzzle) {
  const { size, walls = [] } = puzzle
  const N = size * size
  const blocked = new Set(walls.map(([a, b]) => wallKey(a, b)))
  const nb = new Array(N)
  for (let c = 0; c < N; c++) {
    const r = Math.floor(c / size), col = c % size
    const list = []
    if (r > 0 && !blocked.has(wallKey(c, c - size))) list.push(c - size)
    if (r < size - 1 && !blocked.has(wallKey(c, c + size))) list.push(c + size)
    if (col > 0 && !blocked.has(wallKey(c, c - 1))) list.push(c - 1)
    if (col < size - 1 && !blocked.has(wallKey(c, c + 1))) list.push(c + 1)
    nb[c] = list
  }
  return nb
}

const colourOf = (cell, size) => ((Math.floor(cell / size) + (cell % size)) & 1)

/**
 * Is `prefix` a legal partial route? Returns the number of stops collected so
 * far (so the caller knows what number comes next), or -1 if it is not legal.
 * Same rules the board enforces: adjacency, no wall crossings, no revisits,
 * stops in order, and the final stop only on the last cell of the grid.
 */
function prefixState(puzzle, prefix, nb, visited) {
  const { size, dots } = puzzle
  const N = size * size
  const numberAt = new Map(dots.map((d) => [d.cell, d.n]))
  const lastN = dots.length
  if (!prefix.length || prefix.length > N) return -1
  if (numberAt.get(prefix[0]) !== 1) return -1
  let expect = 1
  for (let i = 0; i < prefix.length; i++) {
    const c = prefix[i]
    if (!(c >= 0 && c < N) || visited[c]) return -1
    if (i > 0 && !nb[prefix[i - 1]].includes(c)) return -1
    const n = numberAt.get(c)
    if (n != null) {
      if (n !== expect) return -1
      if (n === lastN && i !== N - 1) return -1 // land last
      expect++
    }
    visited[c] = 1
  }
  return expect
}

/**
 * A complete legal route that starts with `prefix`, or null when there is none.
 * `budget` caps the number of search nodes; `budget.out` is set to true when the
 * cap was hit, which means "don't know" rather than "no".
 */
export function completeZip(puzzle, prefix, budget = {}) {
  const { size, dots } = puzzle
  const N = size * size
  const nb = buildGraph(puzzle)
  const numberAt = new Map(dots.map((d) => [d.cell, d.n]))
  const lastN = dots.length
  const target = dots[lastN - 1].cell

  const visited = new Uint8Array(N)
  const expect0 = prefixState(puzzle, prefix, nb, visited)
  if (expect0 < 0) return null

  const path = prefix.slice()
  let remaining = N - path.length
  if (remaining === 0) return expect0 === lastN + 1 ? path : null

  // ---- the colour prune, checked ONCE.
  //
  // A grid is bipartite, so any route alternates colours. From the head, the
  // rest of the flight is `remaining + 1` cells long, which fixes exactly how
  // many of each colour must still be unvisited AND what colour the last stop
  // has to be. Both conditions are preserved by every legal move - a step always
  // lands on the opposite colour and takes one off that count - so if they hold
  // here they hold all the way down, and if they fail here nothing below can
  // rescue them.
  const head0 = path[path.length - 1]
  const hc = colourOf(head0, size)
  let sameC = 0, otherC = 0
  for (let c = 0; c < N; c++) {
    if (visited[c]) continue
    if (colourOf(c, size) === hc) sameC++; else otherC++
  }
  const total = remaining + 1
  if (sameC !== Math.ceil(total / 2) - 1) return null
  if (otherC !== Math.floor(total / 2)) return null
  if (colourOf(target, size) !== (hc ^ (remaining & 1))) return null

  // ---- per-node prunes: nothing sealed off, nothing you can fly into but not
  // out of.
  const queue = new Int32Array(N)
  const seen = new Uint8Array(N)
  function feasible(head) {
    // connectivity: every unvisited cell still reachable from the head
    seen.fill(0)
    let qh = 0, qt = 0, reached = 0
    for (const v of nb[head]) if (!visited[v] && !seen[v]) { seen[v] = 1; queue[qt++] = v; reached++ }
    if (!reached) return false
    while (qh < qt) {
      const c = queue[qh++]
      for (const v of nb[c]) if (!visited[v] && !seen[v]) { seen[v] = 1; queue[qt++] = v; reached++ }
    }
    if (reached !== remaining) return false
    // degree: an unvisited cell needs two ways through it, because the route
    // has to enter and leave. The final stop is the one exception - the flight
    // ends there, so one way in is enough.
    for (let c = 0; c < N; c++) {
      if (visited[c]) continue
      let d = 0
      for (const v of nb[c]) if (!visited[v] || v === head) d++
      if (c === target ? d < 1 : d < 2) return false
    }
    return true
  }

  // TWO STOPS, AND THE CLOCK IS THE ONE THAT MATTERS.
  //
  // A node costs O(N) to prune, so the same node budget is worth six times as
  // much work on a 5x5 as on a 13x13 - and a stress run over the whole bank
  // found one wandering route that spent 1.4 SECONDS inside the search. A hint
  // is a button press; anything the eye can see is too slow. The node count
  // keeps a small puzzle from spinning; the deadline is what actually bounds
  // the click, and it is checked every 128 nodes so reading the clock is not
  // itself the cost.
  let nodes = typeof budget.nodes === 'number' ? budget.nodes : 30000
  let tick = 0
  const deadline = budget.deadline || 0
  function dfs(head, expect) {
    if (remaining === 0) return true
    if (nodes-- <= 0) { budget.out = true; return false }
    if (deadline && (++tick & 127) === 0 && Date.now() > deadline) { budget.out = true; return false }
    if (!feasible(head)) return false
    const opts = []
    for (const v of nb[head]) {
      if (visited[v]) continue
      const n = numberAt.get(v)
      if (n != null && n !== expect) continue
      if (v === target && remaining !== 1) continue
      let d = 0
      for (const w of nb[v]) if (!visited[w]) d++
      opts.push([d, v, n])
    }
    // Warnsdorff: the most constrained cell first. On a route that has to cover
    // everything, the cell with fewest ways out is the one most likely to be
    // stranded if it is left for later.
    opts.sort((a, b) => a[0] - b[0] || a[1] - b[1])
    for (const [, v, n] of opts) {
      visited[v] = 1; remaining--; path.push(v)
      if (dfs(v, n != null ? expect + 1 : expect)) return true
      path.pop(); remaining++; visited[v] = 0
      if (budget.out) return false
    }
    return false
  }

  return dfs(head0, expect0) ? path.slice() : null
}

/** How much of `a` matches `b` cell for cell from the start. */
function commonPrefix(a, b) {
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  return i
}

/**
 * The hint.
 *
 * Returns `{ path, nextCell, removed }` where `path` is the longest prefix of
 * what the player has flown that can still be finished, `nextCell` is a cell
 * they could legally fly to from there (so the plane can be pointed at it), and
 * `removed` is how many moves were taken back - zero when they were already
 * right, which is the case the request is most specific about.
 *
 * NEVER ADDS A MOVE. `path` is always a prefix of `playerPath`.
 */
export function hintForPath(puzzle, playerPath, opts = {}) {
  const nodes = opts.nodes ?? 20000
  // ONE DEADLINE FOR THE WHOLE HINT, not one per probe: the binary search makes
  // up to eight calls and it is the click that has to stay under a fifth of a
  // second, not each call inside it.
  const deadline = Date.now() + (opts.ms ?? 200)
  const probe = (pre) => completeZip(puzzle, pre, { nodes, deadline })
  const start = puzzle.dots[0].cell
  const safe = Array.isArray(playerPath) && playerPath.length ? playerPath : [start]
  const solution = puzzle.solution || []

  // The free lower bound: however much of the generator's own route they have
  // matched is completable by definition, and at minimum that is the start cell.
  let lo = Math.max(1, commonPrefix(safe, solution))
  if (lo > safe.length) lo = safe.length
  let best = null
  let bestLen = lo

  // Their whole route is the common case - try it before doing any searching.
  const whole = probe(safe)
  if (whole) {
    best = whole
    bestLen = safe.length
  } else if (safe.length > lo) {
    // BINARY SEARCH, which monotonicity makes valid: if length `mid` can be
    // finished then every shorter prefix can too, so the answer is above it.
    let a = lo, b = safe.length - 1
    while (a <= b) {
      if (Date.now() > deadline) break // out of time: keep the best found so far
      const mid = (a + b) >> 1
      const done = probe(safe.slice(0, mid))
      if (done) { best = done; bestLen = mid; a = mid + 1 }
      else b = mid - 1
    }
  }

  // Nothing above the lower bound worked (or the budget ran out): fall back to
  // the prefix we know is right without searching for it.
  if (!best) {
    // The lower bound is completable by construction, so this is allowed to
    // take as long as it needs - it is the answer of last resort.
    best = completeZip(puzzle, safe.slice(0, lo), { nodes: 400000 })
    bestLen = lo
    if (!best) {
      // Only reachable if the player's path diverges from the solution at cell
      // one, which cannot happen - both start on stop 1 - but a hint must never
      // be the thing that throws.
      return { path: [start], nextCell: solution[1] ?? null, removed: safe.length - 1 }
    }
  }

  return {
    path: best.slice(0, bestLen),
    nextCell: best.length > bestLen ? best[bestLen] : null,
    removed: safe.length - bestLen,
  }
}
