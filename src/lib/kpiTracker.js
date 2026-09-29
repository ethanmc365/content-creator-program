// THE KPI TRACKER'S ARITHMETIC, AWAY FROM ITS PAINT.
//
// Ethan: "for each quarter, the admins will set KPIs... I want a really clean
// UI so we can compare them at the end and see the progress. Are we on
// track? Are we off track?"
//
// Three questions this page has to answer, and all three are pure functions
// of a date and some numbers - which is the whole reason this lives here
// rather than inside the page component, the rule this codebase learned from
// `lib/tourPlacement`: arithmetic inside a component can only ever be
// checked by opening the page and squinting at it.
//
//   1. What quarter is it, and how far through is it? (quarterProgress)
//   2. Given a target and how far we actually are, is that GOOD? (kpiStatus)
//   3. A quarter's targets plus this quarter's live numbers - one list to
//      render. (mergeKpiRows)

/** EVERY METRIC THE PLATFORM MEASURES BY ITSELF (migration 281, `kpi_compute`).
 *
 *  unit   number | decimal | percent | views  - how the figure is printed.
 *  kind   'sum'   a running total that builds up through the period, so PACE
 *                 matters (100 videos by the end; 40 halfway is on track).
 *         'level' an average, a rate or a headcount. It is a state, not a
 *                 total: 8 videos per creator is 8 whether it is day 3 or day
 *                 80, so it is compared with the goal directly, never with a
 *                 straight-line pace.
 *  people  the metric is about people on the platform rather than about
 *          challenges, so it has no separate meaning for "global challenges
 *          only" and is not offered there.
 *  how     one sentence saying exactly how it is counted - shown in the picker
 *          and in the detail, because a KPI nobody can define gets argued about.
 *
 *  The order here is the order the picker and the page show them in. */
export const METRIC_GROUPS = [
  { key: 'output', label: 'Output' },
  { key: 'reach', label: 'Reach' },
  { key: 'participation', label: 'Participation' },
  { key: 'recruitment', label: 'Recruitment' },
  { key: 'community', label: 'Community' },
]

export const STANDARD_METRICS = [
  { key: 'challenges_run', label: 'Challenges run', icon: 'flag', group: 'output', unit: 'number', kind: 'sum',
    how: 'Challenges that start in the period.' },
  { key: 'entries', label: 'Videos entered', icon: 'video', group: 'output', unit: 'number', kind: 'sum',
    how: 'Every entry submitted to a challenge in the period.' },
  { key: 'avg_entries_per_creator', label: 'Average entries per creator', icon: 'squares', group: 'output', unit: 'decimal', kind: 'level',
    how: 'Entries divided by the creators who entered. A goal of 8 means the typical entrant posts 8 videos.' },
  { key: 'entries_per_challenge', label: 'Average entries per challenge', icon: 'stack', group: 'output', unit: 'decimal', kind: 'level',
    how: 'Entries divided by the challenges that received any.' },
  { key: 'videos_10k', label: 'Videos over 10k views', icon: 'fire', group: 'output', unit: 'number', kind: 'sum',
    how: 'Entries submitted in the period with 10,000 views or more.' },

  { key: 'views', label: 'Views', icon: 'eye', group: 'reach', unit: 'views', kind: 'sum',
    how: 'Views on entries submitted in the period.' },
  { key: 'avg_views_per_entry', label: 'Average views per video', icon: 'playCircle', group: 'reach', unit: 'views', kind: 'level',
    how: 'Views divided by entries.' },
  { key: 'avg_views_per_creator', label: 'Average views per creator', icon: 'trendUp', group: 'reach', unit: 'views', kind: 'level',
    how: 'Views divided by the creators who entered.' },
  { key: 'creators_participated', label: 'Creators participated', icon: 'handRaised', group: 'participation', unit: 'number', kind: 'sum',
    how: 'Distinct creators with at least one entry in the period.' },
  { key: 'participation_rate', label: 'Participation rate', icon: 'chartPie', group: 'participation', unit: 'percent', kind: 'level', people: true,
    how: 'Creators who entered, as a share of every active creator in the scope.' },
  { key: 'avg_creators_per_challenge', label: 'Average creators per challenge', icon: 'userGroup', group: 'participation', unit: 'decimal', kind: 'level',
    how: 'Distinct creators per challenge that received entries.' },
  { key: 'creators_recruited', label: 'Creators recruited', icon: 'userPlus', group: 'recruitment', unit: 'number', kind: 'sum', people: true,
    how: 'People who joined the scope in the period.' },
  { key: 'referrals', label: 'Referred creators', icon: 'share', group: 'recruitment', unit: 'number', kind: 'sum', people: true,
    how: 'Recruits in the period who came in through a creator\'s referral link.' },

]

export const CUSTOM_UNITS = [
  { value: 'number', label: 'A number' },
  { value: 'decimal', label: 'A decimal (like 2.5)' },
  { value: 'percent', label: 'A percentage' },
  { value: 'views', label: 'Views' },
  { value: 'currency', label: 'Money' },
]

// KPIs THAT WERE OFFERED AND ARE NOT ANY MORE (30 Sep 2026). Ethan: best single video, first-time
// entrants, repeat entrants, creators on the platform, new creators who entered, community
// messages, puzzle players and connections made are "not needed". The SQL still computes them
// (harmless), but a goal somebody already saved for one is hidden rather than left orphaned
// on the page with no definition.
export const REMOVED_METRICS = new Set([
  'top_video_views', 'first_time_creators', 'return_rate', 'creators_total',
  'activation_rate', 'chat_messages', 'game_players', 'connections_made',
])

const STANDARD_ORDER = new Map(STANDARD_METRICS.map((m, i) => [m.key, i]))
const STANDARD_BY_KEY = new Map(STANDARD_METRICS.map((m) => [m.key, m]))

export function metricDef(row) {
  const std = STANDARD_BY_KEY.get(row.metric)
  if (std) return { ...std, higherIsBetter: true }
  return {
    key: 'custom',
    label: row.label,
    unit: row.unit || 'number',
    kind: row.cumulative === false ? 'level' : 'sum',
    higherIsBetter: row.higher_is_better !== false,
    icon: 'sparkles',
  }
}

export function metricLabel(row) {
  if (row.metric === 'custom') return row.label
  return STANDARD_BY_KEY.get(row.metric)?.label || row.label
}

export function metricIcon(row) {
  return STANDARD_BY_KEY.get(row.metric)?.icon || 'sparkles'
}

/** A figure, printed the way its unit wants it. `currency` is only read for
 *  money KPIs (the scope's own currency symbol). */
export function formatKpiValue(row, value, currency = 'EUR') {
  const def = metricDef(row)
  const n = Number(value) || 0
  switch (def.unit) {
    case 'percent': return `${Math.round(n * 10) / 10}%`
    case 'decimal': return (Math.round(n * 100) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })
    case 'views': return n >= 10000 ? compact(n) : Math.round(n).toLocaleString()
    case 'currency': return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: n % 1 ? 2 : 0 }).format(n)
    default: return Math.round(n).toLocaleString()
  }
}

function compact(n) {
  if (n >= 1e6) return `${Math.round(n / 1e5) / 10}M`
  return `${Math.round(n / 100) / 10}K`
}

/** Today's calendar quarter, London-style (Jan-Mar = Q1). Takes `now` rather
 *  than reading the clock itself - see react-hooks/purity, and it is the
 *  only way `quarterProgress` below can be tested at all. */
export function currentQuarter(now = new Date()) {
  return { year: now.getFullYear(), quarter: Math.floor(now.getMonth() / 3) + 1 }
}

export function quarterLabel(year, quarter) {
  return `Q${quarter} ${year}`
}

/** The quarter after this one, wrapping the year. Exported so the page's
 *  prev/next controls and its tests share one definition of "next". */
export function adjacentQuarter(year, quarter, delta) {
  const zeroBased = (year * 4 + (quarter - 1)) + delta
  return { year: Math.floor(zeroBased / 4), quarter: (((zeroBased % 4) + 4) % 4) + 1 }
}

/** [start, end) of a calendar quarter, as real Dates in the reader's own
 *  local time - a KPI is a quarter as everyone on the call means it, not a
 *  UTC accounting period. */
export function quarterRange(year, quarter) {
  const start = new Date(year, (quarter - 1) * 3, 1)
  const end = new Date(year, quarter * 3, 1)
  return { start, end }
}

// ---- MONTHS (24 Sep 2026) -------------------------------------------------
// Ethan: "you can also build in tracking for each month, like KPIs for
// September, October, or the quarter." A PERIOD is `{ year, quarter, month }`;
// `month` null means the whole quarter, exactly as every row was before.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

export function currentMonth(now = new Date()) {
  const month = now.getMonth() + 1
  return { year: now.getFullYear(), quarter: Math.floor((month - 1) / 3) + 1, month }
}

export function monthLabel(year, month) {
  return `${MONTHS[month - 1]} ${year}`
}

/** The month `delta` months away, carrying its quarter. */
export function adjacentMonth(year, month, delta) {
  const zeroBased = year * 12 + (month - 1) + delta
  const y = Math.floor(zeroBased / 12)
  const m = (((zeroBased % 12) + 12) % 12) + 1
  return { year: y, quarter: Math.floor((m - 1) / 3) + 1, month: m }
}

export function periodLabel({ year, quarter, month }) {
  return month ? monthLabel(year, month) : quarterLabel(year, quarter)
}

/** [start, end) of a period: a month when `month` is set, else the quarter. */
export function periodRange({ year, quarter, month }) {
  if (month) return { start: new Date(year, month - 1, 1), end: new Date(year, month, 1) }
  return quarterRange(year, quarter)
}

/** How far through the quarter `now` sits, clamped to [0, 1]. A quarter that
 *  has not started reads 0 (nothing is late yet); one that has finished
 *  reads 1 (the whole thing has had its chance). */
export function quarterProgress(year, quarter, now = new Date(), month = null) {
  const { start, end } = periodRange({ year, quarter, month })
  const total = end - start
  if (total <= 0) return 1
  return Math.min(1, Math.max(0, (now - start) / total))
}

/**
 * Is a target being met, on the way to being met, or falling behind?
 *
 * THE PACE, NOT JUST THE TOTAL. A target of 100 sitting at 40 is not one
 * fact, it is a different fact on day 10 of the quarter than on day 80 - the
 * first is ahead of pace, the second is in real trouble. `kpiStatus` compares
 * the actual against what pace WOULD have produced by now, not against the
 * finish line, until the finish line has actually arrived.
 *
 * A 15% cushion under pace still reads 'on_track' - a KPI that dings amber
 * the moment it is one submission behind a straight-line pace is a KPI
 * nobody trusts by the second week, and real progress is never perfectly
 * linear through a quarter (a challenge that launches mid-quarter moves the
 * numbers in a clump, not a trickle).
 */
export function kpiStatus({ target, actual, year, quarter, month = null, now = new Date(), kind = 'sum', higherIsBetter = true }) {
  const progress = quarterProgress(year, quarter, now, month)
  const over = progress >= 1

  // LOWER IS BETTER (a cost, a delay): met at or under the goal. How close a
  // figure is reads as goal / actual, capped, so 100% still means "there".
  if (!higherIsBetter) {
    const pct = actual > 0 ? Math.min(1.5, target / actual) : 1
    if (actual <= target) return { status: 'met', pct, progress }
    if (over) return { status: 'missed', pct, progress }
    return { status: pct >= 0.85 ? 'on_track' : 'behind', pct, progress }
  }

  const pct = target > 0 ? actual / target : (actual > 0 ? 1 : 0)
  if (actual >= target) return { status: 'met', pct, progress }
  if (over) return { status: 'missed', pct, progress }

  // A LEVEL (an average, a rate, a headcount) IS NOT A RUNNING TOTAL. 8 videos
  // per creator is 8 on day 3 and on day 80, so it is held against the goal
  // itself rather than against a straight line that starts at zero. The one
  // kindness: with nothing measured yet in the first stretch of a period it
  // reads on track, because "0 of 8" on day 2 is no data, not bad news.
  if (kind === 'level') {
    if (actual === 0 && progress < 0.15) return { status: 'on_track', pct, progress }
    return { status: pct >= 0.85 ? 'on_track' : 'behind', pct, progress }
  }

  const expected = target * progress
  const paceRatio = expected > 0 ? actual / expected : 1
  return { status: paceRatio >= 0.85 ? 'on_track' : 'behind', pct, progress }
}

/** kpiStatus for a merged row: reads its kind and direction off the metric. */
export function rowStatus(row, period, now = new Date()) {
  const def = metricDef(row)
  return kpiStatus({
    target: row.target_value, actual: row.actual, year: period.year, quarter: period.quarter, month: period.month ?? null,
    now, kind: def.kind, higherIsBetter: def.higherIsBetter,
  })
}

/**
 * One row per target, for one scope and one quarter - the standard metrics
 * first, in `STANDARD_METRICS` order, then any custom ones alphabetically by
 * label. `actuals` is what `kpi_actuals()` returned, keyed by metric; a
 * standard row's `actual` comes from there, never from the row's own
 * (unused) `current_value`. A custom row's `actual` is its own
 * `current_value`, because nothing else on the platform can supply one.
 */
export function mergeKpiRows(targets, actuals) {
  const actualByMetric = new Map((actuals || []).map((a) => [a.metric, Number(a.value) || 0]))
  return [...(targets || [])]
    // Custom ("my own") KPIs were retired on 1 Oct 2026: every goal is measured by the platform.
    .filter((t) => !REMOVED_METRICS.has(t.metric) && t.metric !== 'custom')
    .map((t) => ({
      ...t,
      actual: t.metric === 'custom' ? (Number(t.current_value) || 0) : (actualByMetric.get(t.metric) ?? 0),
    }))
    .sort((a, b) => {
      const ra = STANDARD_ORDER.has(a.metric) ? STANDARD_ORDER.get(a.metric) : 99
      const rb = STANDARD_ORDER.has(b.metric) ? STANDARD_ORDER.get(b.metric) : 99
      if (ra !== rb) return ra - rb
      return metricLabel(a).localeCompare(metricLabel(b))
    })
}


// ---- QUARTERS AND MONTHS ARE ONE PLAN (29 Sep 2026) -------------------------
// Ethan: "if someone sets KPIs for October, November and December then they
// should show, but also show for the quarter combined ... quarterly KPIs could
// show per month split with a bit of a ratio so improving over time, but not
// drastic."
//
// Two derivations, both PURE and both only ever fill a gap - a target somebody
// actually set always beats one worked out from another period:
//
//   ROLL UP   a quarter with monthly targets and no quarterly one shows the
//             months combined: a running total is the SUM of its months, a level
//             (an average, a rate) is the AVERAGE of them.
//   SPLIT     a month with no target of its own, inside a quarter that has one,
//             shows its share. A running total is divided by a gentle ramp
//             (30 / 33 / 37 %), so the plan improves through the quarter without
//             a cliff. A level rises around the goal (0.94x, 1x, 1.06x), which
//             averages back to exactly the quarterly goal.
export const MONTH_RAMP = [0.30, 0.33, 0.37]
export const LEVEL_RAMP = [0.94, 1, 1.06]

const isWhole = (def) => def.unit === 'number' || def.unit === 'views' || (def.unit === 'currency')
const round2 = (n) => Math.round(n * 100) / 100

/** A quarter's target as its three months. Totals split by MONTH_RAMP and sum back to
 *  the goal exactly (whole-number metrics use largest remainder); levels ramp
 *  around the goal and a percentage never exceeds 100. */
export function splitQuarterTarget(row, quarterTarget = row.target_value) {
  const def = metricDef(row)
  if (def.kind === 'level') {
    return LEVEL_RAMP.map((f) => {
      const v = quarterTarget * f
      if (def.unit === 'percent') return Math.min(100, round2(v))
      return def.unit === 'views' || def.unit === 'number' ? Math.round(v) : round2(v)
    })
  }
  if (!isWhole(def)) {
    const parts = MONTH_RAMP.map((w) => round2(quarterTarget * w))
    parts[2] = round2(quarterTarget - parts[0] - parts[1])
    return parts
  }
  const raw = MONTH_RAMP.map((w) => quarterTarget * w)
  const floors = raw.map(Math.floor)
  let left = Math.round(quarterTarget) - floors.reduce((a, b) => a + b, 0)
  const order = raw.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0])
  for (const [, i] of order) { if (left <= 0) break; floors[i] += 1; left -= 1 }
  return floors
}

/** Monthly targets combined into a quarter's: a sum, or an average for a level. */
export function rollUpTargets(row, values) {
  const def = metricDef(row)
  const vals = values.filter((v) => v != null)
  if (vals.length === 0) return 0
  const sum = vals.reduce((a, b) => a + b, 0)
  if (def.kind === 'level') return def.unit === 'number' || def.unit === 'views' ? Math.round(sum / vals.length) : round2(sum / vals.length)
  return sum
}

const rowKey = (r) => `${r.metric}:${r.metric === 'custom' ? r.label : ''}`

/**
 * The rows to show for one period: the targets somebody set there, plus a derived
 * row for every metric that only exists in the OTHER granularity.
 *   period      { year, quarter, month }  (month null = the quarter)
 *   own         targets set for exactly this period
 *   monthsOfQuarter  (quarter view)  the quarter's monthly targets
 *   quarterTarget    (month view)    the containing quarter's targets
 * Derived rows carry `derived: 'rollup' | 'split'` and `from`, and no id.
 */
export function withDerivedTargets({ period, own, monthsOfQuarter = [], quarterTargets = [] }) {
  const have = new Set((own || []).map(rowKey))
  const out = [...(own || [])]

  if (period.month == null) {
    const groups = new Map()
    for (const t of monthsOfQuarter) {
      const k = rowKey(t)
      if (have.has(k)) continue
      if (!groups.has(k)) groups.set(k, [])
      groups.get(k).push(t)
    }
    for (const rows of groups.values()) {
      const first = rows[0]
      const months = rows.map((r) => r.month).sort((a, b) => a - b)
      out.push({
        ...first,
        id: null,
        derived: 'rollup',
        from: months.map((m) => MONTHS[m - 1].slice(0, 3)).join(', '),
        month: null,
        target_value: rollUpTargets(first, rows.map((r) => Number(r.target_value))),
        current_value: first.metric === 'custom'
          ? rollUpTargets(first, rows.map((r) => Number(r.current_value) || 0))
          : null,
        notes: null,
        creator: null,
        monthsCovered: months.length,
      })
    }
  } else {
    const idx = (period.month - 1) % 3
    for (const q of quarterTargets) {
      if (have.has(rowKey(q))) continue
      out.push({
        ...q,
        id: null,
        derived: 'split',
        from: quarterLabel(period.year, period.quarter),
        month: period.month,
        target_value: splitQuarterTarget(q)[idx],
        current_value: q.metric === 'custom' ? 0 : null,
        notes: null,
        creator: null,
      })
    }
  }
  return out
}
