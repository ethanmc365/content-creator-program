// "GIVE ME A HOOK": WHICH ONE COMES NEXT (24 Sep 2026).
//
// Ethan: "It should randomly show one, but filtered by the best-performing ones
// first. Don't actually give me any information on how many times it's been
// used." So the order is a ladder of TIERS, best first, and random INSIDE a
// tier: the first presses deal the proven openers in a different order for
// every creator, and only once somebody has seen every proven one does the
// button move down to the validated ones, and so on. Nothing about the tier is
// ever shown; it only decides the order.
//
// `seen` is the ids this person has already been shown (kept in localStorage by
// the button). When every hook has been seen the ladder starts again.

export const HOOK_TIERS = [
  { key: 'proven', label: 'Proven', min: 5 },
  { key: 'validated', label: 'Validated', min: 3 },
  { key: 'promising', label: 'Promising', min: 2 },
  { key: 'fresh', label: 'New', min: 0 },
]

export function hookTier(uses) {
  const n = Number(uses) || 0
  return HOOK_TIERS.find((t) => n >= t.min) || HOOK_TIERS[HOOK_TIERS.length - 1]
}

/**
 * The next hook to show.
 * @param {Array<{id:string, uses:number}>} hooks  the active hooks
 * @param {Set<string>|string[]} seen               ids already shown
 * @param {() => number} rand                        Math.random, injectable
 * @returns {{ hook: object|null, reset: boolean }} `reset` when the ladder
 *   ran out and started again (the caller clears its `seen`).
 */
export function pickHook(hooks, seen = new Set(), rand = Math.random) {
  const list = (hooks || []).filter((h) => h && h.id)
  if (list.length === 0) return { hook: null, reset: false }
  const seenSet = seen instanceof Set ? seen : new Set(seen)
  let reset = false
  let pool = list.filter((h) => !seenSet.has(h.id))
  if (pool.length === 0) { pool = list; reset = true }
  for (const tier of HOOK_TIERS) {
    const inTier = pool.filter((h) => hookTier(h.uses).key === tier.key)
    if (inTier.length === 0) continue
    return { hook: inTier[Math.floor(rand() * inTier.length) % inTier.length], reset }
  }
  return { hook: pool[0], reset }
}
