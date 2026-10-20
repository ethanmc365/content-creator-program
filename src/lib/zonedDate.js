// CALENDAR DAYS IN A NAMED TIMEZONE (migration 442, 20 Oct 2026).
//
// A challenge runs on whole days in its own clock: it opens at the start of its start date and closes at the end of its
// end date, in `challenges.timezone` (the form's "Times are London" picker). The browser's own clock is not that clock
// for a creator in Madrid or an admin travelling, so every date here is a 'YYYY-MM-DD' string read in, or turned back
// into a moment in, a named IANA zone. The server does the same with `at time zone` (challenge_days, weekly_rounds).

const fmtCache = new Map()
function parts(ms, tz) {
  let f = fmtCache.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
    fmtCache.set(tz, f)
  }
  const o = {}
  for (const p of f.formatToParts(new Date(ms))) if (p.type !== 'literal') o[p.type] = Number(p.value)
  return o
}

/** The zone's offset from UTC at that moment, in ms (London in summer: +3,600,000). */
function offsetMs(ms, tz) {
  const p = parts(ms, tz)
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000
}

export function validZone(tz) {
  try { new Intl.DateTimeFormat('en-GB', { timeZone: tz }); return !!tz } catch { return false }
}

/** The calendar date of a moment in a zone: '2026-10-24'. */
export function ymdInZone(iso, tz = 'Europe/London') {
  const ms = typeof iso === 'number' ? iso : Date.parse(iso)
  if (!Number.isFinite(ms)) return null
  const p = parts(ms, validZone(tz) ? tz : 'Europe/London')
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

/** Midnight at the start of a calendar date in a zone, as an ISO string. */
export function zonedMidnight(ymd, tz = 'Europe/London') {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || '')
  if (!m) return null
  const zone = validZone(tz) ? tz : 'Europe/London'
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3])
  // Twice: the offset at the guess can differ from the offset at the answer on a clock-change day.
  let t = guess - offsetMs(guess, zone)
  t = guess - offsetMs(t, zone)
  return new Date(t).toISOString()
}

export function addDays(ymd, n) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || '')
  if (!m) return null
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + n)).toISOString().slice(0, 10)
}

/** Whole days from a to b (b - a). */
export function daysBetween(a, b) {
  const x = Date.parse(`${a}T00:00:00Z`)
  const y = Date.parse(`${b}T00:00:00Z`)
  return Number.isFinite(x) && Number.isFinite(y) ? Math.round((y - x) / 86400_000) : null
}

/** "Sat 24 Oct" for a calendar date (no zone needed: it is already a date). */
export function dayLabel(ymd, locale = 'en-GB', opts = { weekday: 'short', day: 'numeric', month: 'short' }) {
  if (!ymd) return ''
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString(locale, { ...opts, timeZone: 'UTC' })
}

// ---- A challenge's own days ------------------------------------------------------------------------------------

/** 'YYYY-MM-DD' from either that or the forms' 'DD/MM/YYYY'. */
export function toYmd(s) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return s
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec((s || '').trim())
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null
}

/** The moment a challenge with this start DATE opens: the start of that day in its zone. */
export function challengeStartIso(date, tz) { return zonedMidnight(toYmd(date), tz) }

/**
 * The end_date stored for a challenge with this end DATE: 23:59 on that day in its zone. Kept on the day itself (not
 * the next midnight) because everything that reads `end_date` as a calendar date (deadline reminders, the calendar,
 * the tracker) means the last day; `closes_at` (the next midnight) is the moment entries stop.
 */
export function challengeEndIso(date, tz) {
  const next = zonedMidnight(addDays(toYmd(date), 1), tz)
  return next ? new Date(Date.parse(next) - 60_000).toISOString() : null
}

/** The moment entries stop: `closes_at` from the server, else the end of the end date in the challenge's zone. */
export function challengeCloses(c) {
  if (!c) return null
  if (c.closes_at) return new Date(c.closes_at)
  if (!c.end_date) return null
  const tz = c.timezone || 'Europe/London'
  return new Date(zonedMidnight(addDays(ymdInZone(c.end_date, tz), 1), tz))
}
