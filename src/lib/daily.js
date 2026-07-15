// Shared clock for the daily puzzles. A new puzzle launches at midnight UK
// time (Europe/London) for everyone, regardless of the viewer's timezone.

const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }) // YYYY-MM-DD
const timeFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false,
})

/** Days since the epoch, rolling over at midnight UK time. */
export function ukDayIndex(now = Date.now()) {
  const [y, m, d] = dayFmt.format(now).split('-').map(Number)
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000)
}

/** ISO timestamp of the moment the current UK day began (for score queries). */
export function ukDayStartIso(now = Date.now()) {
  const idx = ukDayIndex(now)
  let lo = now - 26 * 3_600_000, hi = now
  while (hi - lo > 1000) {
    const mid = (lo + hi) / 2
    if (ukDayIndex(mid) === idx) hi = mid
    else lo = mid
  }
  return new Date(Math.round(hi)).toISOString()
}

/** "Xh Ym" until the next UK midnight (when the next puzzle lands). */
export function untilNextUkMidnight(now = Date.now()) {
  const parts = timeFmt.formatToParts(now)
  const h = Number(parts.find((p) => p.type === 'hour').value) % 24
  const m = Number(parts.find((p) => p.type === 'minute').value)
  const mins = 24 * 60 - (h * 60 + m)
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}
