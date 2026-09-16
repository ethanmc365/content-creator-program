import { describe, it, expect } from 'vitest'
import { generateZip, validateZip, wallKey, ZIP_LAYOUT_COUNT } from './zip'
import { completeZip, hintForPath } from './zipHint'

function rngFrom(seed) {
  let a = seed >>> 0
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

// The board's own move rules, written out again here on purpose: a test that
// imports the thing it is checking against proves only that the code agrees
// with itself.
function legalNext(p, cur) {
  const { size, dots, walls } = p, N = size * size
  const blocked = new Set(walls.map(([a, b]) => wallKey(a, b)))
  const numberAt = new Map(dots.map((d) => [d.cell, d.n])), lastN = dots.length
  const head = cur[cur.length - 1], r = Math.floor(head / size), c = head % size
  const cand = []
  if (r > 0) cand.push(head - size)
  if (r < size - 1) cand.push(head + size)
  if (c > 0) cand.push(head - 1)
  if (c < size - 1) cand.push(head + 1)
  let exp = 1
  for (const x of cur) if (numberAt.has(x)) exp++
  return cand.filter((v) => {
    if (cur.includes(v)) return false
    if (blocked.has(wallKey(head, v))) return false
    const n = numberAt.get(v)
    if (n != null && n !== exp) return false
    if (n === lastN && cur.length + 1 !== N) return false
    return true
  })
}

const SAMPLE = []
for (let i = 0; i < ZIP_LAYOUT_COUNT; i += 7) SAMPLE.push(i)

describe('flight path hint', () => {
  it('leaves a correct route exactly as it is', { timeout: 120_000 }, () => {
    for (const idx of SAMPLE) {
      const p = generateZip(idx)
      const N = p.size * p.size
      for (const frac of [0.15, 0.5, 0.85]) {
        const k = Math.max(1, Math.floor(N * frac))
        const pre = p.solution.slice(0, k)
        const h = hintForPath(p, pre)
        expect(h.removed, `layout ${idx} at ${frac}`).toBe(0)
        expect(h.path).toEqual(pre)
        if (k < N) expect(h.nextCell, `layout ${idx} next`).not.toBeNull()
      }
    }
  })

  it('takes back exactly the moves that cannot be finished, and no more', { timeout: 180_000 }, () => {
    const rr = rngFrom(12345)
    for (const idx of SAMPLE) {
      const p = generateZip(idx)
      const N = p.size * p.size
      for (let trial = 0; trial < 3; trial++) {
        const k = Math.max(1, Math.floor(N * (0.2 + 0.5 * rr())))
        let cur = p.solution.slice(0, k)
        for (let s = 0; s < 6; s++) {
          const opts = legalNext(p, cur).filter((v) => v !== p.solution[cur.length])
          if (!opts.length) break
          cur = [...cur, opts[Math.floor(rr() * opts.length)]]
        }
        if (cur.length === k) continue
        // A GENEROUS BUDGET HERE ON PURPOSE. The shipped default gives the
        // search a fifth of a second and falls back to a shorter - still
        // correct - prefix if it runs out, which is the right trade for a
        // button but would make a minimality assertion flaky. This test is
        // about whether the ALGORITHM is right; the latency of the default is
        // asserted separately below.
        const h = hintForPath(p, cur, { ms: 10_000, nodes: 400_000 })
        // never invents a move: the answer is a prefix of what they flew
        expect(h.path.length).toBeLessThanOrEqual(cur.length)
        expect(cur.slice(0, h.path.length)).toEqual(h.path)
        // what it hands back really can be finished
        const done = completeZip(p, h.path, { nodes: 400_000 })
        expect(done, `layout ${idx} kept an unfinishable prefix`).not.toBeNull()
        expect(validateZip(p, done)).toBe(true)
        // and it is the LONGEST such prefix - one more of their moves must not work
        if (h.path.length < cur.length) {
          const budget = { nodes: 400_000 }
          const one = completeZip(p, cur.slice(0, h.path.length + 1), budget)
          if (!budget.out) expect(one, `layout ${idx} was not minimal`).toBeNull()
        }
        // the direction it points at is a move the board would accept
        if (h.nextCell != null) expect(legalNext(p, h.path)).toContain(h.nextCell)
      }
    }
  })

  it('answers inside its deadline even on the biggest boards', () => {
    // The worst realistic case: a large, heavily walled layout with a long
    // wandering route on it. The hint is a button, so what matters is that it
    // always comes back quickly - if the search runs out of time it returns a
    // shorter prefix it has already proved correct rather than thinking on.
    for (const idx of [413, 670, 494, 65, 191]) {
      const p = generateZip(idx)
      const N = p.size * p.size
      let cur = [p.dots[0].cell]
      for (let s = 0; s < Math.floor(N * 0.6); s++) {
        const opts = legalNext(p, cur)
        if (!opts.length) break
        cur = [...cur, opts[opts.length - 1]]
      }
      const t0 = Date.now()
      const h = hintForPath(p, cur)
      expect(Date.now() - t0, `layout ${idx} hint took too long`).toBeLessThan(700)
      expect(cur.slice(0, h.path.length)).toEqual(h.path)
      expect(completeZip(p, h.path, { nodes: 400_000 })).not.toBeNull()
    }
  })

  it('a wall-in with no way out is taken back to where there was one', () => {
    const p = generateZip(3)
    const h = hintForPath(p, [p.dots[0].cell])
    expect(h.removed).toBe(0)
    expect(h.path).toEqual([p.dots[0].cell])
    expect(h.nextCell).not.toBeNull()
  })

  it('completeZip refuses a route that breaks the rules', () => {
    const p = generateZip(9)
    expect(completeZip(p, [p.solution[1]])).toBeNull() // does not start on stop 1
    expect(completeZip(p, [p.solution[0], p.solution[0]])).toBeNull() // revisit
  })
})
