import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { PageHeader, Skeleton } from '../../components/ui'
import Icon from '../../components/Icon'
import Reveal from '../../components/network/Reveal'
import KpiTargetSheet from '../../components/admin/KpiTargetSheet'
import { confirm } from '../../lib/confirm'
import { cx, formatViews } from '../../lib/utils'
import {
  STANDARD_METRICS, adjacentMonth, adjacentQuarter, currentMonth, currentQuarter, kpiStatus, mergeKpiRows,
  metricIcon, metricLabel, periodLabel,
} from '../../lib/kpiTracker'
import Segmented from '../../components/network/Segmented'
import { useT } from '../../lib/i18n'

// THE KPI TRACKER.
//
// Ethan: "I want a KPI tracker for the admins. This can be in reference to
// the number of challenges run, the number of creators recruited, the
// number of creators who participated, the number of views... I want a
// really clean UI so we can compare them at the end and see the progress.
// Are we on track? Are we off track?... I don't want this built into
// analytics, so maybe create a new page."
//
// WHY ITS OWN PAGE AND NOT A TAB ON ANALYTICS. Analytics answers "how did
// the programme do" in rows of numbers, read after the fact. A KPI is a
// PLAN made in advance and checked against as the quarter runs - the
// question is not "what happened" but "are we still going to hit it" - and
// bolting a plan onto a page built for a retrospective is how the two ideas
// end up looking like one one cluttered idea, which is the exact complaint
// this page exists to avoid repeating.
//
// EVERY NUMBER ON THIS PAGE IS EITHER A PLAN OR A FACT, NEVER BOTH AT ONCE.
// A target is what `kpi_targets` holds. An actual, for the four standard
// metrics, is never stored - it is read live from `kpi_actuals()` (migration
// 254) every time this page opens, the same discipline `results.final_views`
// already taught this codebase: a number that could drift out of sync with
// its own source of truth eventually will. Only a CUSTOM KPI - one nothing on
// the platform can count on its own - keeps a typed-in `current_value`.
//
// WHO CAN SEE WHAT. Every admin reads every scope's KPIs (Ethan: "all the
// admins should have access to all the market KPIs and see everything").
// Only a scope's own manager - or a global admin, who manages all of them -
// can set or change its targets. `my_managed_scopes()` (migration 074) is
// the existing, already-audited answer to "which markets do I lead"; this
// page asks it once rather than re-deriving the rule.
export default function AdminKpis() {
  const tr = useT()
  const { profile } = useAuth()

  const [communities, setCommunities] = useState(null)
  const [managedIds, setManagedIds] = useState(null)
  const [scope, setScope] = useState('')
  // A PERIOD IS A QUARTER OR A MONTH (24 Sep 2026). `month` null = the whole
  // quarter, as every target was before migration 258.
  const [period, setPeriod] = useState(() => ({ ...currentQuarter(), month: null }))
  const { year, quarter, month } = period
  const byMonth = month != null
  const now = currentMonth()
  const isCurrent = byMonth
    ? year === now.year && month === now.month
    : year === now.year && quarter === now.quarter
  const step = (delta) => setPeriod(byMonth ? adjacentMonth(year, month, delta) : { ...adjacentQuarter(year, quarter, delta), month: null })
  const setMode = (m) => setPeriod(m === 'month'
    ? (year === now.year && quarter === now.quarter ? now : { year, quarter, month: (quarter - 1) * 3 + 1 })
    : { year, quarter, month: null })
  const [targets, setTargets] = useState(null)
  const [actuals, setActuals] = useState(null)
  const [err, setErr] = useState('')
  const [editing, setEditing] = useState(null) // a target row, or {} for a new one

  // COMMUNITIES AND MANAGED SCOPES LOAD ONCE. Worldwide first - it is the
  // scope every creator belongs to and the one Ethan named first ("KPIs for
  // the whole worldwide community that I can also create and adjust") -
  // then markets alphabetically.
  useEffect(() => {
    let alive = true
    Promise.all([
      supabase.from('communities').select('id, name, kind').is('retired_at', null),
      supabase.rpc('my_managed_scopes'),
    ]).then(([{ data: c, error: cErr }, { data: m, error: mErr }]) => {
      if (!alive) return
      if (cErr) { setErr(cErr.message); return }
      const sorted = [...(c || [])].sort((a, b) => {
        if (a.kind === 'network') return -1
        if (b.kind === 'network') return 1
        return a.name.localeCompare(b.name)
      })
      setCommunities(sorted)
      setManagedIds(new Set(mErr ? [] : (m || []).map((r) => (typeof r === 'string' ? r : r.my_managed_scopes))))
      setScope((s) => s || sorted[0]?.id || '')
    })
    return () => { alive = false }
  }, [])

  const load = useCallback(async () => {
    if (!scope) return
    setTargets(null)
    setActuals(null)
    let tq = supabase.from('kpi_targets').select('*').eq('community_id', scope).eq('year', year).eq('quarter', quarter)
    tq = byMonth ? tq.eq('month', month) : tq.is('month', null)
    const [t, a] = await Promise.all([
      tq.order('created_at'),
      supabase.rpc('kpi_actuals', { p_community_id: scope, p_year: year, p_quarter: quarter, ...(byMonth ? { p_month: month } : {}) }),
    ])
    if (t.error) { setErr(t.error.message); setTargets([]); return }
    setErr(a.error ? a.error.message : '')
    setTargets(t.data || [])
    setActuals(a.data || [])
  }, [scope, year, quarter, month, byMonth])
  useEffect(() => { load() }, [load])

  const merged = useMemo(() => (targets ? mergeKpiRows(targets, actuals || []) : null), [targets, actuals])
  const canEdit = !!(managedIds && scope && managedIds.has(scope))
  const community = communities?.find((c) => c.id === scope)
  const ready = !!communities && managedIds !== null && merged !== null

  const statuses = useMemo(
    () => (merged || []).map((r) => kpiStatus({ target: r.target_value, actual: r.actual, year, quarter, month })),
    [merged, year, quarter, month],
  )
  const metCount = statuses.filter((s) => s.status === 'met').length
  const onTrackCount = statuses.filter((s) => s.status === 'on_track').length

  async function removeTarget(row) {
    const ok = await confirm(
      tr('Delete this KPI target? The numbers behind it are not affected - only the plan is removed.'),
      { danger: true, confirmLabel: tr('Delete') },
    )
    if (!ok) return
    await supabase.from('kpi_targets').delete().eq('id', row.id)
    load()
  }


  return (
    <div className="page">
      <PageHeader
        back="/admin"
        title={tr('KPI tracker')}
        subtitle={tr('Set a target for a quarter or a month, and watch it against the real numbers as they land.')}
      />

      {err && <p className="mb-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{err}</p>}

      {/* ---------- scope + quarter, EACH NAMED AND EACH ITS OWN ROW (23 Sep
          2026). Ethan: "it should show clearly when the quarter is... I
          notice that card [the market pills] is worldwide, Germany, etc.,
          and the Q3 2026 is too big, they're not aligned." Sharing one row
          meant the quarter control - a bordered box round two 28px buttons -
          sat at a different height and weight than the market pills next to
          it, and wrapped onto its own line at most widths anyway. Two
          labelled rows, both built from the same pill, read as one control
          panel instead of two controls that happen to be near each other. */}
      <div className="mb-6 space-y-3.5 rounded-card border border-gray-100 bg-white p-3.5 shadow-card sm:p-4">
        <div>
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-400">{tr('Market')}</p>
          {!communities ? (
            <Skeleton className="h-9 w-64" />
          ) : (
            <div className="pick-row -mx-1 flex gap-1.5 overflow-x-auto px-1" role="tablist">
              {communities.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="tab"
                  aria-selected={scope === c.id}
                  onClick={() => setScope(c.id)}
                  className={cx(
                    'flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold transition-all duration-200',
                    scope === c.id
                      ? 'bg-brand text-white shadow-card'
                      : 'border border-gray-200 text-smoke hoverable:hover:border-brand/40 hoverable:hover:text-brand',
                  )}
                >
                  {c.kind === 'network' && <Icon name="globe" className="h-3.5 w-3.5" />}
                  {c.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-400">{tr('Period')}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              value={byMonth ? 'month' : 'quarter'}
              onChange={setMode}
              size="sm"
              label={tr('Quarter or month')}
              options={[{ value: 'quarter', label: tr('Quarter') }, { value: 'month', label: tr('Month') }]}
            />
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => step(-1)}
                aria-label={byMonth ? tr('Previous month') : tr('Previous quarter')}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200 text-smoke transition-colors hoverable:hover:border-brand/40 hoverable:hover:text-brand"
              >
                <Icon name="chevronLeft" className="h-4 w-4" />
              </button>
              <span className="flex h-9 min-w-[9.5rem] items-center justify-center rounded-xl bg-brand px-3.5 text-sm font-bold tabular-nums text-white shadow-card">
                {periodLabel(period)}
              </span>
              <button
                type="button"
                onClick={() => step(1)}
                aria-label={byMonth ? tr('Next month') : tr('Next quarter')}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200 text-smoke transition-colors hoverable:hover:border-brand/40 hoverable:hover:text-brand"
              >
                <Icon name="chevronRight" className="h-4 w-4" />
              </button>
            </div>
            {!isCurrent && (
              <button
                type="button"
                onClick={() => setPeriod(byMonth ? now : { ...currentQuarter(), month: null })}
                className="ml-1 text-xs font-semibold text-brand hoverable:hover:underline"
              >
                {byMonth ? tr('Jump to this month') : tr('Jump to this quarter')}
              </button>
            )}
          </div>
        </div>
      </div>

      {!ready ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-40 w-full rounded-card" />)}
        </div>
      ) : (
        <>
          {/* ---------- the quarter at a glance ---------- */}
          {merged.length > 0 && (
            <Reveal from="down" delay={0}>
              <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-card bg-gradient-to-br from-brand to-brand-light px-5 py-4 text-white shadow-card">
                <div>
                  <p className="text-2xl font-bold tabular-nums">{metCount + onTrackCount}<span className="text-white/70">/{merged.length}</span></p>
                  <p className="text-xs font-medium uppercase tracking-wide text-white/80">{tr('On track or met')}</p>
                </div>
                <div className="h-8 w-px bg-white/25" aria-hidden />
                <p className="max-w-md text-sm text-white/90">
                  {metCount === merged.length
                    ? tr('Every target for {scope} is met for {p}.', { scope: community?.name, p: periodLabel(period) })
                    : tr('{n} of {total} targets for {scope} are on track or already met.', { n: metCount + onTrackCount, total: merged.length, scope: community?.name })}
                </p>
              </div>
            </Reveal>
          )}

          {/* ---------- the KPIs ---------- */}
          {merged.length === 0 ? (
            <div className="rounded-card border border-dashed border-gray-200 px-6 py-16 text-center">
              <Icon name="trophy" className="mx-auto h-8 w-8 text-gray-300" />
              <p className="mt-3 text-sm font-semibold text-ink">{tr('No targets set for {q} yet', { q: periodLabel(period) })}</p>
              <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-smoke">
                {canEdit
                  ? tr('Set a target for challenges run, creators recruited, participation, views, or your own KPI.')
                  : tr('The people leading {scope} have not set any targets for {p} yet.', { scope: community?.name, p: periodLabel(period) })}
              </p>
              {canEdit && (
                <button type="button" onClick={() => setEditing({ community_id: scope })} className="btn-primary mx-auto mt-4">
                  <Icon name="plus" className="h-4 w-4" strokeWidth={2.4} />
                  {tr('Set a KPI target')}
                </button>
              )}
            </div>
          ) : (
            <Reveal className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" stagger={0.06}>
              {merged.map((row) => (
                <KpiCard
                  key={row.id}
                  row={row}
                  year={year}
                  quarter={quarter}
                  month={month}
                  canEdit={canEdit}
                  onEdit={() => setEditing(row)}
                  onDelete={() => removeTarget(row)}
                />
              ))}
              {canEdit && (
                /* THE ADD CARD IS A CARD (24 Sep 2026). Ethan: "the add KPI
                   copy doesn't actually fit in it." The dashed box took the
                   grid row's height from the Reveal wrapper, which does not
                   stretch it, so on a short row it was shorter than its own
                   icon and words. It fills its cell now, like the cards. */
                <button
                  type="button"
                  onClick={() => setEditing({ community_id: scope })}
                  className="flex h-full min-h-[9.5rem] w-full flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed border-gray-200 px-4 py-5 text-center text-smoke transition-all duration-200 hoverable:hover:-translate-y-0.5 hoverable:hover:border-brand/40 hoverable:hover:text-brand"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-cloud">
                    <Icon name="plus" className="h-5 w-5" strokeWidth={2.2} />
                  </span>
                  <span className="text-sm font-semibold leading-tight">{tr('Add a KPI')}</span>
                  <span className="text-[11px] leading-snug text-gray-400">{tr('for {p}', { p: periodLabel(period) })}</span>
                </button>
              )}
            </Reveal>
          )}

          {/* ---------- the year, all four quarters at once (23 Sep 2026).
              Ethan: "just work on improving that overall... more overviews,
              like seeing a yearly overview as well." A single quarter answers
              "are we on track right now"; a year answers "is this market
              actually growing", which needs all four numbers side by side,
              not four separate page loads to compare by memory. */}
          <YearOverview scope={scope} year={year} byMonth={byMonth} />
        </>
      )}

      {editing && (
        <KpiTargetSheet
          row={editing}
          communityName={community?.name || ''}
          year={year}
          quarter={quarter}
          month={month}
          profileId={profile?.id}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
        />
      )}
    </div>
  )
}

// ALL FOUR QUARTERS OF ONE YEAR, FOR ONE SCOPE, SIDE BY SIDE.
//
// Reads the same two sources the main view does (kpi_targets + kpi_actuals),
// once per quarter, in parallel - four small queries rather than one large
// one, because the shape of "a year" here is four independent snapshots, not
// a single range a database can answer in one call. A metric that only has a
// target in some quarters still gets a full row; the quarters it has
// nothing for are simply blank, not zero (a market that started setting KPIs
// in Q3 did not "miss" Q1 and Q2 - it was not tracking yet).
// THE YEAR AT A GLANCE: four quarters, or twelve months when the page is on
// months. One query for the year's targets, then the live numbers only for the
// periods that actually have one.
function YearOverview({ scope, year, byMonth }) {
  const tr = useT()
  const [byPeriod, setByPeriod] = useState(null)
  const periods = useMemo(() => (byMonth
    ? Array.from({ length: 12 }, (_, i) => ({ key: i + 1, year, quarter: Math.floor(i / 3) + 1, month: i + 1, short: MONTH_SHORT[i] }))
    : [1, 2, 3, 4].map((q) => ({ key: q, year, quarter: q, month: null, short: `Q${q}` }))), [year, byMonth])

  useEffect(() => {
    if (!scope) return undefined
    let alive = true
    setByPeriod(null)
    ;(async () => {
      let tq = supabase.from('kpi_targets').select('*').eq('community_id', scope).eq('year', year)
      tq = byMonth ? tq.not('month', 'is', null) : tq.is('month', null)
      const { data: all } = await tq
      const results = await Promise.all(periods.map(async (p) => {
        const mine = (all || []).filter((t) => (byMonth ? t.month === p.month : t.quarter === p.quarter))
        if (mine.length === 0) return { key: p.key, rows: [] }
        const { data: a } = await supabase.rpc('kpi_actuals', {
          p_community_id: scope, p_year: year, p_quarter: p.quarter, ...(byMonth ? { p_month: p.month } : {}),
        })
        return { key: p.key, rows: mergeKpiRows(mine, a || []) }
      }))
      if (alive) setByPeriod(results)
    })()
    return () => { alive = false }
  }, [scope, year, byMonth, periods])

  const metrics = useMemo(() => {
    if (!byPeriod) return null
    const order = new Map(STANDARD_METRICS.map((m, i) => [m.key, i]))
    const byKey = new Map()
    for (const { key: pk, rows } of byPeriod) {
      for (const row of rows) {
        const key = `${row.metric}:${row.label}`
        if (!byKey.has(key)) byKey.set(key, { metric: row.metric, label: row.label, periods: {} })
        byKey.get(key).periods[pk] = row
      }
    }
    return [...byKey.values()].sort((a, b) => {
      const ra = order.has(a.metric) ? order.get(a.metric) : 99
      const rb = order.has(b.metric) ? order.get(b.metric) : 99
      return ra !== rb ? ra - rb : a.label.localeCompare(b.label)
    })
  }, [byPeriod])

  return (
    <div className="mt-8">
      <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-gray-400">
        {byMonth ? tr('Month by month · {y}', { y: String(year) }) : tr('Year overview · {y}', { y: String(year) })}
      </p>
      {!metrics ? (
        <Skeleton className="h-40 w-full rounded-card" />
      ) : metrics.length === 0 ? (
        <div className="rounded-card border border-dashed border-gray-200 px-6 py-10 text-center text-sm text-smoke">
          {byMonth
            ? tr('Nothing to compare yet - set a target for at least one month of {y}.', { y: String(year) })
            : tr('Nothing to compare yet - set a target in at least one quarter of {y}.', { y: String(year) })}
        </div>
      ) : (
        <div className="overflow-hidden rounded-card border border-gray-100 bg-white shadow-card">
          {metrics.map((m, i) => (
            <YearRow key={`${m.metric}:${m.label}`} metric={m} periods={periods} last={i === metrics.length - 1} />
          ))}
        </div>
      )}
    </div>
  )
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function YearRow({ metric, periods, last }) {
  const tr = useT()
  const rows = periods.map((p) => metric.periods[p.key])
  const totalTarget = rows.reduce((s, r) => s + (r?.target_value ?? 0), 0)
  const totalActual = rows.reduce((s, r) => s + (r ? r.actual : 0), 0)
  const anyTarget = rows.some(Boolean)
  const isViews = metric.metric === 'views'
  const many = periods.length > 4

  return (
    <div className={cx('flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-5', !last && 'border-b border-gray-100')}>
      <div className="flex items-center gap-2.5 sm:w-48 sm:shrink-0">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
          <Icon name={metric.metric === 'custom' ? 'sparkles' : STANDARD_METRICS.find((st) => st.key === metric.metric)?.icon || 'sparkles'} className="h-4 w-4" />
        </span>
        <span className="truncate text-sm font-semibold text-ink">{metric.label}</span>
      </div>

      <div className={cx('grid flex-1 gap-1.5', many ? 'grid-cols-6 sm:grid-cols-12' : 'grid-cols-4 gap-2')}>
        {periods.map((p) => {
          const row = metric.periods[p.key]
          if (!row) {
            return (
              <div key={p.key} className="flex flex-col items-center gap-1">
                <div className="flex h-14 w-full items-end justify-center rounded-lg bg-cloud/60">
                  <span className="pb-1.5 text-[10px] text-gray-300">-</span>
                </div>
                <span className="text-[10px] font-semibold uppercase text-gray-300">{p.short}</span>
              </div>
            )
          }
          const { status, pct } = kpiStatus({ target: row.target_value, actual: row.actual, year: p.year, quarter: p.quarter, month: p.month })
          const style = STATUS_STYLE[status]
          const fillPct = Math.max(6, Math.min(100, Math.round(pct * 100)))
          return (
            <div key={p.key} className="flex flex-col items-center gap-1">
              <div className="flex h-14 w-full items-end overflow-hidden rounded-lg bg-cloud" title={`${formatMetricValue(row, row.actual)} / ${formatMetricValue(row, row.target_value)}`}>
                <div className={cx('w-full rounded-t-md transition-[height] duration-500 ease-out', style.bar)} style={{ height: `${fillPct}%` }} />
              </div>
              <span className="text-[10px] font-semibold uppercase text-gray-400">{p.short}</span>
            </div>
          )
        })}
      </div>

      <div className="text-right sm:w-32 sm:shrink-0">
        <p className="text-sm font-bold tabular-nums text-ink">
          {anyTarget ? (isViews ? formatViews(totalActual) : totalActual.toLocaleString()) : '-'}
        </p>
        <p className="text-[11px] text-gray-400">
          {anyTarget ? tr('of {t} for the year', { t: isViews ? formatViews(totalTarget) : totalTarget.toLocaleString() }) : tr('no targets yet')}
        </p>
      </div>
    </div>
  )
}

const STATUS_STYLE = {
  met: { ring: 'stroke-emerald-500', bar: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-700', label: 'Target met' },
  on_track: { ring: 'stroke-brand', bar: 'bg-brand', chip: 'bg-brand-tint text-brand', label: 'On track' },
  behind: { ring: 'stroke-amber-500', bar: 'bg-amber-500', chip: 'bg-amber-50 text-amber-700', label: 'Behind pace' },
  missed: { ring: 'stroke-red-500', bar: 'bg-red-500', chip: 'bg-red-50 text-red-600', label: 'Missed' },
}

function formatMetricValue(row, value) {
  if (row.metric === 'views') return formatViews(value)
  return Number(value).toLocaleString()
}

// ONE TARGET.
//
// A PROGRESS BAR, NOT A GAUGE THAT ONLY EVER SHOWS "OUT OF THE TARGET". The
// fill runs to 100% at the target and keeps counting in the LABEL past it -
// a KPI hit at 140% is worth celebrating, not clipping off at a full bar
// that looks identical to one hit at exactly 100%.
function KpiCard({ row, year, quarter, month, canEdit, onEdit, onDelete }) {
  const tr = useT()
  const { status, pct, progress } = kpiStatus({ target: row.target_value, actual: row.actual, year, quarter, month })
  const style = STATUS_STYLE[status]
  const fillPct = Math.min(100, Math.round(pct * 100))

  return (
    <article className="group relative flex flex-col gap-3 rounded-card border border-gray-100 bg-white p-4 shadow-card transition-all duration-300 hoverable:hover:-translate-y-1 hoverable:hover:shadow-lift">
      <div className="flex items-start gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
          <Icon name={metricIcon(row)} className="h-[18px] w-[18px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold leading-snug text-ink">{metricLabel(row)}</span>
          {!row.is_automated && (
            <span className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-gray-400">
              <Icon name="pencil" className="h-3 w-3" />
              {tr('Tracked by hand')}
            </span>
          )}
        </span>
        {canEdit && (
          <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
            <button type="button" onClick={onEdit} aria-label={tr('Edit')} className="flex h-7 w-7 items-center justify-center rounded-full text-smoke hoverable:hover:bg-cloud hoverable:hover:text-ink">
              <Icon name="pencil" className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={onDelete} aria-label={tr('Delete')} className="flex h-7 w-7 items-center justify-center rounded-full text-smoke hoverable:hover:bg-red-50 hoverable:hover:text-red-500">
              <Icon name="trash" className="h-3.5 w-3.5" />
            </button>
          </span>
        )}
      </div>

      <div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-2xl font-bold tabular-nums tracking-tight text-ink">
            {formatMetricValue(row, row.actual)}
          </span>
          <span className="text-sm text-smoke">
            {tr('of')} <strong className="font-semibold text-ink">{formatMetricValue(row, row.target_value)}</strong>
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-cloud">
          <div
            className={cx('h-full rounded-full transition-[width] duration-700 ease-out', style.bar)}
            style={{ width: `${fillPct}%` }}
          />
          {/* Where the quarter itself has got to, as a thin marker against the
              bar - what "on pace" is being judged against, made visible. */}
          {progress > 0 && progress < 1 && (
            <div className="relative -mt-2 h-2" aria-hidden>
              <div className="absolute top-0 h-2 w-px bg-ink/25" style={{ left: `${Math.round(progress * 100)}%` }} />
            </div>
          )}
        </div>
      </div>

      <div className="mt-auto flex items-center justify-between pt-0.5">
        <span className={cx('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', style.chip)}>
          {tr(style.label)}
        </span>
        <span className="text-xs font-semibold tabular-nums text-gray-400">{fillPct}%</span>
      </div>
    </article>
  )
}
