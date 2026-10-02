import {
  addDays, differenceInCalendarDays, endOfDay, format, startOfDay, startOfMonth, startOfQuarter,
  startOfWeek, startOfYear, subDays, subMonths, subQuarters, subWeeks, subYears,
} from 'date-fns'

// THE ANALYTICS OVERVIEW, OVER A PERIOD (2 Oct 2026).
//
// Ethan: "on the analytics page, for the overview, I want to be able to see data where I can view by current month,
// last month, this week, last 7 days etc ... and obviously I can do for worldwide, everything, or a specific market."
// The market half already existed (lib/analyticsScope); this is the time half, and it is the same shape: a pure
// filter over the datasets the page already holds, so one definition of every number serves every period.
//
// A RANGE IS HALF-OPEN: [start, end). `start` null means "since the beginning", which is how All time is a range
// like any other and every filter below needs no special case for it.
//
// EVERY PERIOD CARRIES THE ONE BEFORE IT, so a tile can say "up 12% on the previous 7 days". For a period still
// running (this week, this month) the comparison is the SAME STRETCH of the previous one - the 1st to the 2nd of
// last month against the 1st to the 2nd of this one - because a whole last month against two days of this one says
// nothing except that two is fewer than thirty.

export const PERIODS = [
  { key: 'all', label: 'All time' },
  { key: 'today', label: 'Today' },
  { key: 'this_week', label: 'This week' },
  { key: 'last_7', label: 'Last 7 days' },
  { key: 'last_week', label: 'Last week' },
  { key: 'this_month', label: 'This month' },
  { key: 'last_month', label: 'Last month' },
  { key: 'last_30', label: 'Last 30 days' },
  { key: 'last_90', label: 'Last 90 days' },
  { key: 'this_quarter', label: 'This quarter' },
  { key: 'this_year', label: 'This year' },
  { key: 'custom', label: 'Custom dates' },
]

const WEEK = { weekStartsOn: 1 }

// The same elapsed stretch of the previous period: from its start, as long as this one has run so far.
function sameStretch(start, now, prevStart) {
  return { start: prevStart, end: new Date(prevStart.getTime() + (now.getTime() - start.getTime())) }
}

/**
 * @param key   one of PERIODS
 * @param now   a Date (passed in, so this stays pure and testable)
 * @param custom { from: 'yyyy-MM-dd', to: 'yyyy-MM-dd' } for 'custom' (both days inclusive)
 * @returns { key, start, end, prev, label, short, days } - start/end are Dates or null
 */
export function periodRange(key, now, custom = null) {
  const today = startOfDay(now)
  const mk = (start, end, prev, label, short) => ({
    key, start, end, prev, label, short: short || label,
    days: start && end ? Math.max(1, Math.round((end - start) / 86400000)) : null,
  })
  switch (key) {
    case 'today':
      return mk(today, now, sameStretch(today, now, subDays(today, 1)), 'Today', 'yesterday')
    case 'this_week': {
      const s = startOfWeek(now, WEEK)
      return mk(s, now, sameStretch(s, now, subWeeks(s, 1)), 'This week', 'the same days last week')
    }
    case 'last_week': {
      const e = startOfWeek(now, WEEK)
      const s = subWeeks(e, 1)
      return mk(s, e, { start: subWeeks(s, 1), end: s }, 'Last week', 'the week before')
    }
    case 'last_7':
    case 'last_30':
    case 'last_90': {
      const n = { last_7: 7, last_30: 30, last_90: 90 }[key]
      const e = addDays(today, 1)
      const s = subDays(e, n)
      return mk(s, e, { start: subDays(s, n), end: s }, `Last ${n} days`, `the ${n} days before`)
    }
    case 'this_month': {
      const s = startOfMonth(now)
      return mk(s, now, sameStretch(s, now, subMonths(s, 1)), format(now, 'MMMM yyyy'), 'the same days last month')
    }
    case 'last_month': {
      const e = startOfMonth(now)
      const s = subMonths(e, 1)
      return mk(s, e, { start: subMonths(s, 1), end: s }, format(s, 'MMMM yyyy'), format(subMonths(s, 1), 'MMMM'))
    }
    case 'this_quarter': {
      const s = startOfQuarter(now)
      return mk(s, now, sameStretch(s, now, subQuarters(s, 1)), 'This quarter', 'the same stretch last quarter')
    }
    case 'this_year': {
      const s = startOfYear(now)
      return mk(s, now, sameStretch(s, now, subYears(s, 1)), format(now, 'yyyy'), 'the same stretch last year')
    }
    case 'custom': {
      const from = parseDay(custom?.from)
      const to = parseDay(custom?.to)
      if (!from || !to || to < from) return periodRange('all', now)
      const e = addDays(to, 1)
      const n = differenceInCalendarDays(e, from)
      const label = `${format(from, 'd MMM yyyy')} to ${format(to, 'd MMM yyyy')}`
      return mk(from, e, { start: subDays(from, n), end: from }, label, `the ${n} days before`)
    }
    default:
      return { key: 'all', start: null, end: null, prev: null, label: 'All time', short: 'All time', days: null }
  }
}

export function parseDay(s) {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const d = new Date(`${s}T00:00:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Is a timestamp inside [start, end)? A null bound is open. A missing timestamp is never inside a real range. */
export function inRange(ts, range) {
  if (!range || (!range.start && !range.end)) return true
  if (ts == null) return false
  const t = ts instanceof Date ? ts.getTime() : new Date(ts).getTime()
  if (Number.isNaN(t)) return false
  if (range.start && t < range.start.getTime()) return false
  if (range.end && t >= range.end.getTime()) return false
  return true
}

/**
 * Did something that RAN from `from` to `to` (dates, the end day inclusive) run at any point in the range? A
 * challenge belongs to every period it was open in, not only the one it started in.
 */
export function overlaps(from, to, range) {
  if (!range || (!range.start && !range.end)) return true
  const s = from ? new Date(from).getTime() : null
  const e = to ? endOfDay(new Date(to)).getTime() : null
  if (range.end && s != null && s >= range.end.getTime()) return false
  if (range.start && e != null && e < range.start.getTime()) return false
  return s != null || e != null
}

/** Percentage change, or null when there is nothing to compare against (never "+Infinity%"). */
export function change(now, before) {
  if (before == null || now == null) return null
  if (before === 0) return now === 0 ? 0 : null
  return Math.round(((now - before) / before) * 100)
}

/**
 * HOW FINE THE TIMELINE CHARTS ARE CUT. A month of bars for "Today" is one bar; a day of bars for "All time" is two
 * hundred. So: days up to a fortnight, weeks up to a quarter, months beyond.
 */
export function bucketFor(range) {
  if (!range?.start || !range?.end) return 'month'
  const days = (range.end - range.start) / 86400000
  if (days <= 15) return 'day'
  if (days <= 100) return 'week'
  return 'month'
}

/** Every bucket in the range, in order, so a quiet day is a zero and not a gap. */
export function buckets(range, unit, firstSeen = null) {
  const startAt = range?.start || (firstSeen ? new Date(firstSeen) : null)
  const endAt = range?.end || new Date()
  if (!startAt) return []
  const keyOf = bucketKey(unit)
  const step = unit === 'day' ? (d) => addDays(d, 1) : unit === 'week' ? (d) => addDays(d, 7) : (d) => startOfMonth(addDays(startOfMonth(d), 32))
  let d = unit === 'day' ? startOfDay(startAt) : unit === 'week' ? startOfWeek(startAt, WEEK) : startOfMonth(startAt)
  const out = []
  for (let i = 0; d < endAt && i < 400; i++) {
    out.push({ key: keyOf(d), label: format(d, unit === 'month' ? 'MMM yy' : 'd MMM') })
    d = step(d)
  }
  return out
}

export function bucketKey(unit) {
  if (unit === 'day') return (d) => format(startOfDay(new Date(d)), 'yyyy-MM-dd')
  if (unit === 'week') return (d) => format(startOfWeek(new Date(d), WEEK), 'yyyy-MM-dd')
  return (d) => format(startOfMonth(new Date(d)), 'yyyy-MM')
}

/**
 * NARROW THE OVERVIEW'S DATASETS TO A PERIOD. Things that HAPPEN (an entry, a message, a payout, a reaction) are kept
 * when they happened inside it; a live challenge is kept when it was OPEN at any point in it; a logged (pre-platform)
 * challenge is counted in the period it FINISHED, so its views and prize are never counted twice across two
 * periods. Profiles are left whole - they are state, and the page needs every name - and the page counts sign-ups
 * off `created_at` itself.
 */
export function applyPeriod(raw, range) {
  if (!raw || !range || (!range.start && !range.end)) return raw
  const inP = (ts) => inRange(ts, range)
  const challenges = (raw.challenges || []).filter((c) => overlaps(c.start_date, c.end_date, range))
  const ids = new Set(challenges.map((c) => c.id))
  const reactionRows = (raw.reactionRows || []).filter((r) => inP(r.created_at))
  const pollRows = (raw.pollRows || []).filter((r) => inP(r.created_at))
  const tripRows = (raw.tripRows || []).filter((r) => inP(r.created_at))
  return {
    ...raw,
    challenges,
    history: (raw.history || []).filter((h) => inP(h.ends_at || h.starts_at)),
    submissions: (raw.submissions || []).filter((s) => inP(s.submitted_at)),
    rewards: (raw.rewards || []).filter((r) => inP(r.distributed_at || r.created_at)),
    messages: (raw.messages || []).filter((m) => inP(m.created_at)),
    results: (raw.results || []).filter((r) => ids.has(r.challenge_id)),
    feedback: (raw.feedback || []).filter((f) => inP(f.created_at)),
    gameScores: (raw.gameScores || []).filter((g) => inP(g.created_at)),
    connections: (raw.connections || []).filter((c) => inP(c.accepted_at || c.created_at)),
    decisions: (raw.decisions || []).filter((d) => inP(d.created_at)),
    voucherCounts: (raw.voucherCounts || []).filter((v) => ids.has(v.challenge_id)),
    reactionRows, pollRows, tripRows,
    reactionCount: reactionRows.length, pollVoteCount: pollRows.length, tripCount: tripRows.length,
  }
}

/**
 * THE EIGHT HEADLINE FIGURES FOR ONE PERIOD, computed the same way for the period and for the one before it so the
 * comparison is like for like. `money(amount, currency)` converts into the reporting currency.
 */
export function periodHeadline(scoped, range, money) {
  const ps = applyPeriod(scoped, range)
  const real = (scoped.profiles || []).filter((p) => !p.is_admin && !p.deletion_requested_at && !p.is_test)
  const hist = ps.history || []
  const histMeasured = hist.filter((h) => h.total_views != null)
  const liveViews = (ps.submissions || []).reduce((n, s) => n + (Number(s.logged_views) || 0), 0)
  const views = liveViews + histMeasured.reduce((n, h) => n + Number(h.total_views || 0), 0)
  const paid = (ps.rewards || []).filter((r) => r.status === 'distributed')
  const cash = paid.filter((r) => r.reward_type !== 'voucher').reduce((n, r) => n + money(r.amount, r.currency), 0)
  const vouchers = paid.filter((r) => r.reward_type === 'voucher').reduce((n, r) => n + money(r.amount, r.currency), 0)
  const histPrize = hist.reduce((n, h) => n + money(h.prize_total, h.prize_currency), 0)
  const histMeasuredPrize = histMeasured.reduce((n, h) => n + money(h.prize_total, h.prize_currency), 0)
  const measuredCash = cash + histMeasuredPrize
  return {
    newCreators: real.filter((p) => inRange(p.created_at, range)).length,
    // Counted as RUNNING by overlap like a live one; their money and views stay in the period they finished in.
    challenges: (ps.challenges || []).length
      + (scoped.history || []).filter((h) => overlaps(h.starts_at, h.ends_at || h.starts_at, range)).length,
    submissions: (ps.submissions || []).length + hist.reduce((n, h) => n + Number(h.posts || 0), 0),
    views,
    cash: cash + histPrize,
    vouchers,
    cashCpm: views > 0 && measuredCash > 0 ? measuredCash / (views / 1000) : null,
    totalCpm: views > 0 && measuredCash + vouchers > 0 ? (measuredCash + vouchers) / (views / 1000) : null,
  }
}
