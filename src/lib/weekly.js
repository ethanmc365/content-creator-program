import { addDays, daysBetween, ymdInZone, zonedMidnight } from './zonedDate'

// VIDEO OF THE WEEK (migrations 435, 442). The rounds of a challenge, computed exactly as `weekly_rounds` does in SQL.
//
// Since 442 a round is made of WHOLE DAYS in the challenge's clock: the challenge runs from the start of its start date
// to the end of its end date, and a "week" is 7 calendar days, so a round always ends at midnight (it used to be 7 x 24h
// from the start timestamp, so after the clocks went back a week ended at 23:00).
//
//   default   steps of `every_days`; a remainder of half a round or more is a round of its own, a shorter one joins the
//             last round (30 days = 7 + 7 + 7 + 9).
//   custom    `roundEnds`: the last day of every round but the final one ('YYYY-MM-DD'). Ethan: "have the ability to
//             adjust how it is". Days outside the challenge are ignored.

/** The challenge's days: first date, number of days (end date inclusive) and its zone. */
export function challengeSpan(start, end, tz = 'Europe/London') {
  const d0 = ymdInZone(start, tz)
  const last = ymdInZone(end, tz)
  if (!d0 || !last) return null
  const days = daysBetween(d0, last) + 1
  return days > 0 ? { d0, last, days, tz } : null
}

export function weeklyRounds(start, end, everyDays = 7, { tz = 'Europe/London', roundEnds = null } = {}) {
  const span = challengeSpan(start, end, tz)
  if (!span) return []
  const { d0, days } = span
  const mk = (i, from, to) => ({
    round: i,
    startDay: from,
    lastDay: addDays(to, -1),
    days: daysBetween(from, to),
    startsAt: zonedMidnight(from, tz),
    endsAt: zonedMidnight(to, tz),
  })
  const endDay = addDays(d0, days)
  const custom = cleanRoundEnds(roundEnds, span)
  if (custom.length) {
    const out = []
    let from = d0
    custom.forEach((e, i) => { const to = addDays(e, 1); out.push(mk(i + 1, from, to)); from = to })
    out.push(mk(custom.length + 1, from, endDay))
    return out
  }
  const step = Math.max(1, Math.min(31, Number(everyDays) || 7))
  let n = Math.max(1, Math.floor(days / step))
  if (days >= step && (days % step) * 2 >= step) n += 1
  return Array.from({ length: n }, (_, i) => mk(i + 1, addDays(d0, step * i), i === n - 1 ? endDay : addDays(d0, step * (i + 1))))
}

/** The custom round ends that mean something: valid dates inside the challenge, before its last day, sorted, distinct. */
export function cleanRoundEnds(roundEnds, span) {
  if (!Array.isArray(roundEnds) || !span) return []
  const lastAllowed = addDays(span.d0, span.days - 2)
  return [...new Set(roundEnds.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '') && d >= span.d0 && d <= lastAllowed))].sort()
}

/** A saved setting, or null when the challenge has none. */
export function cleanWeekly(w) {
  const amount = Number(w?.amount)
  if (!w || !(amount > 0)) return null
  const out = {
    amount,
    currency: w.currency || 'EUR',
    type: w.type === 'cash' ? 'cash' : 'voucher',
    every_days: Math.max(1, Math.min(31, Number(w.every_days) || 7)),
    // Created by itself when a round is frozen, owed on Rewards & Payouts (442). Off = the team presses Award.
    auto_award: w.auto_award !== false,
  }
  const ends = Array.isArray(w.round_ends) ? w.round_ends.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '')) : []
  if (ends.length) out.round_ends = [...new Set(ends)].sort()
  return out
}
