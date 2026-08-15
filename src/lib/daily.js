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

/**
 * Current daily-play streak from a list of day indexes (game_scores.day_key).
 * Counts the run of consecutive days ending today, with a one-day grace: if
 * today is still unplayed, a run ending yesterday counts, so the streak isn't
 * shown as 0 before they've had a chance to play.
 */
export function dailyStreak(dayKeys, today = ukDayIndex()) {
  const days = new Set(dayKeys)
  const start = days.has(today) ? today : days.has(today - 1) ? today - 1 : null
  if (start == null) return 0
  let n = 0
  while (days.has(start - n)) n++
  return n
}

/**
 * The seven day indexes of the week `today` falls in, Monday first.
 *
 * WHY THIS EXISTS. The streak card's "This week" strip drew `today-6 … today`,
 * which is a ROLLING seven days wearing weekday letters - so on a Thursday the
 * strip started on Friday, the letters ran F S S M T W T, and the same tile
 * meant a different day depending on when you looked. Ethan asked whether it
 * resets weekly; it did not, and the honest answer to "should it" is yes, or the
 * word "week" on the label is not describing anything.
 *
 * The UK day index is days since the epoch and the epoch was a THURSDAY, so
 * `(day + 3) mod 7` is 0 on a Monday. Written down because getting it wrong is
 * silent: the tiles still draw, they are just labelled with the wrong days.
 */
export function weekOf(today = ukDayIndex()) {
  const monday = today - (((today + 3) % 7) + 7) % 7
  return Array.from({ length: 7 }, (_, i) => monday + i)
}

/** "Xh Ym" until the next UK midnight (when the next puzzle lands). */
export function untilNextUkMidnight(now = Date.now()) {
  const parts = timeFmt.formatToParts(now)
  const h = Number(parts.find((p) => p.type === 'hour').value) % 24
  const m = Number(parts.find((p) => p.type === 'minute').value)
  const mins = 24 * 60 - (h * 60 + m)
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}
