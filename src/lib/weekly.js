// VIDEO OF THE WEEK (migration 435). The rounds of a challenge, computed exactly as `weekly_rounds` does in SQL: steps
// of `every_days` from the start; a remainder of half a round or more is a round of its own, a shorter one joins the
// last. Used by the form (how many rounds will this pay?) and the challenge page (which round is running).
export function weeklyRounds(start, end, everyDays = 7) {
  const s = Date.parse(start)
  const e = Date.parse(end)
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return []
  const step = Math.max(1, Math.min(31, Number(everyDays) || 7)) * 86400_000
  let n = Math.max(1, Math.floor((e - s) / step))
  if (s + step * n < e && e - (s + step * n) >= step / 2) n += 1
  return Array.from({ length: n }, (_, i) => ({
    round: i + 1,
    startsAt: new Date(s + step * i).toISOString(),
    endsAt: new Date(i === n - 1 ? e : s + step * (i + 1)).toISOString(),
  }))
}

/** A saved setting, or null when the challenge has none. */
export function cleanWeekly(w) {
  const amount = Number(w?.amount)
  if (!w || !(amount > 0)) return null
  return {
    amount,
    currency: w.currency || 'EUR',
    type: w.type === 'cash' ? 'cash' : 'voucher',
    every_days: Math.max(1, Math.min(31, Number(w.every_days) || 7)),
  }
}
