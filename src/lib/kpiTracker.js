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

/** The four metrics `kpi_actuals()` (migration 254) can read live, in the
 *  order the page always shows them. A 'custom' row is anything else an
 *  admin typed in by hand - its label IS the metric, so it carries none
 *  here. */
export const STANDARD_METRICS = [
  { key: 'challenges_run', label: 'Challenges run', icon: 'flag' },
  { key: 'creators_recruited', label: 'Creators recruited', icon: 'users' },
  { key: 'creators_participated', label: 'Creators participated', icon: 'check' },
  { key: 'views', label: 'Views', icon: 'eye' },
]

const STANDARD_ORDER = new Map(STANDARD_METRICS.map((m, i) => [m.key, i]))

export function metricLabel(row) {
  if (row.metric === 'custom') return row.label
  return STANDARD_METRICS.find((m) => m.key === row.metric)?.label || row.label
}

export function metricIcon(row) {
  return STANDARD_METRICS.find((m) => m.key === row.metric)?.icon || 'sparkles'
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

/** How far through the quarter `now` sits, clamped to [0, 1]. A quarter that
 *  has not started reads 0 (nothing is late yet); one that has finished
 *  reads 1 (the whole thing has had its chance). */
export function quarterProgress(year, quarter, now = new Date()) {
  const { start, end } = quarterRange(year, quarter)
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
export function kpiStatus({ target, actual, year, quarter, now = new Date() }) {
  const progress = quarterProgress(year, quarter, now)
  const pct = target > 0 ? actual / target : (actual > 0 ? 1 : 0)
  if (actual >= target) return { status: 'met', pct, progress }
  if (progress >= 1) return { status: 'missed', pct, progress }
  const expected = target * progress
  const paceRatio = expected > 0 ? actual / expected : 1
  return { status: paceRatio >= 0.85 ? 'on_track' : 'behind', pct, progress }
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
