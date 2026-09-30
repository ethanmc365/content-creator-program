import { useMemo, useState } from 'react'
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Skeleton } from '../ui'
import Icon from '../Icon'
import { CHART, FILL, axisTick, axisTickSmall, tooltipStyle } from '../charts/chartTheme'
import {
  STANDARD_METRICS, aggregateScopes, formatKpiValue, metricDef, metricIcon, metricLabel, periodKey, periodLabel,
  rowStatus, scaledHeights, windowPeriods,
} from '../../lib/kpiTracker'
import { useKpiPlan } from '../../lib/useKpiPlan'
import { cx } from '../../lib/utils'
import { useT } from '../../lib/i18n'

// THE OVERVIEW UNDER THE CARDS (rebuilt 30 Sep 2026).
//
// Ethan: "The year overview says 2026, but in 2027 it's still compared to the last quarter, which
// would be in 2026" - so it is a ROLLING window round the period on screen, not a calendar year
// (`windowPeriods`). "We have the other bar charts below ... I want to click on something that shows
// the graphs" - every metric row opens its chart. And "even though these differences are small, I
// still want you to visually show that there's a little bit of a difference" - a column's HEIGHT is
// its goal, scaled across the window from a floor, so 300k / 330k / 370k are three visibly different
// columns rather than three identical ones; how much of it is filled is what was achieved.
//
// It serves one scope or many: for the Total it is handed every scope and adds them up per period.

export const STATUS_STYLE = {
  met: { dot: 'bg-emerald-600', chip: 'bg-emerald-50 text-emerald-700', fill: FILL.green, hex: '#059669', label: 'Target met' },
  on_track: { dot: 'bg-brand', chip: 'bg-brand-tint text-brand', fill: FILL.brand, hex: '#d94407', label: 'On track' },
  behind: { dot: 'bg-amber-500', chip: 'bg-amber-50 text-amber-700', fill: FILL.amber, hex: '#f59e0b', label: 'Behind pace' },
  missed: { dot: 'bg-red-500', chip: 'bg-red-50 text-red-600', fill: FILL.red, hex: '#ef4444', label: 'Missed' },
  upcoming: { dot: 'bg-gray-300', chip: 'bg-gray-100 text-smoke', fill: FILL.gray, hex: '#d1d5db', label: 'Not started' },
}

/** Per-period rows for the window: one scope's own rows, or several scopes added up. */
export function useWindowRows({ scopes, period, byMonth, enabled = true }) {
  const periods = useMemo(() => windowPeriods(period, byMonth), [period, byMonth])
  const { data, error } = useKpiPlan({ scopes, periods, enabled })
  const byPeriod = useMemo(() => {
    if (!data) return null
    const out = new Map()
    for (const p of periods) {
      const perScope = data.get(p.key) || []
      out.set(p.key, { perScope, rows: aggregateScopes(perScope) })
    }
    return out
  }, [data, periods])
  return { periods, byPeriod, error }
}


export function RollingOverview({ scopes, period, byMonth, currency, windowRows, title }) {
  const tr = useT()
  const own = useWindowRows({ scopes, period, byMonth, enabled: !windowRows })
  const src = windowRows || own
  // The last window stays on screen, dimmed, while the next one loads (no skeleton flash).
  const [last, setLast] = useState(null)
  if (src.byPeriod && last?.byPeriod !== src.byPeriod) setLast({ periods: src.periods, byPeriod: src.byPeriod })
  const stale = !src.byPeriod && !!last
  const { periods, byPeriod } = src.byPeriod ? src : (last || src)
  const [open, setOpen] = useState(null)

  const metrics = useMemo(() => {
    if (!byPeriod) return null
    const order = new Map(STANDARD_METRICS.map((m, i) => [m.key, i]))
    const byKey = new Map()
    for (const p of periods) {
      for (const row of byPeriod.get(p.key)?.rows || []) {
        if (!byKey.has(row.metric)) byKey.set(row.metric, { metric: row.metric, label: row.label, periods: {} })
        byKey.get(row.metric).periods[p.key] = row
      }
    }
    return [...byKey.values()].sort((a, b) => (order.get(a.metric) ?? 99) - (order.get(b.metric) ?? 99))
  }, [byPeriod, periods])

  const first = periods[0]
  const final = periods[periods.length - 1]
  const range = `${periodLabel(first)} – ${periodLabel(final)}`
  const pick = metrics?.find((m) => m.metric === open) || metrics?.[0]

  return (
    <section className={cx('mt-8 transition-opacity duration-200', stale && 'opacity-60')}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[11px] font-bold uppercase tracking-wide text-gray-400">
          {title || (byMonth ? tr('Month by month') : tr('Quarter by quarter'))}
        </h2>
        <span className="text-[11px] font-semibold tabular-nums text-gray-400">{range}</span>
      </div>
      {!metrics ? (
        <Skeleton className="h-72 w-full rounded-card" />
      ) : metrics.length === 0 ? (
        <div className="rounded-card border border-dashed border-gray-200 px-6 py-10 text-center text-sm text-smoke">
          {tr('Nothing to compare yet - set a goal in any period from {a} to {b}.', { a: periodLabel(first), b: periodLabel(final) })}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* every metric, one line each; press one to chart it */}
          <div className="overflow-hidden rounded-card border border-gray-100 bg-white shadow-card">
            {metrics.map((m, i) => (
              <MetricStrip
                key={m.metric}
                metric={m}
                periods={periods}
                currency={currency}
                on={pick?.metric === m.metric}
                last={i === metrics.length - 1}
                onPick={() => setOpen(m.metric)}
                current={periodKey(period)}
              />
            ))}
          </div>
          <MetricChart metric={pick} periods={periods} currency={currency} current={periodKey(period)} />
        </div>
      )}
    </section>
  )
}

function MetricStrip({ metric, periods, currency, on, last, onPick, current }) {
  const tr = useT()
  const rows = periods.map((p) => metric.periods[p.key] || null)
  const heights = scaledHeights(rows.map((r) => (r ? Number(r.target_value) : null)))
  const sample = rows.find(Boolean)
  const many = periods.length > 4
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={on}
      className={cx(
        'group flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-200',
        !last && 'border-b border-gray-100',
        on ? 'bg-brand-tint/60' : 'hoverable:hover:bg-cloud/60',
      )}
    >
      <Icon name={metricIcon(metric)} className={cx('h-4 w-4 shrink-0 transition-colors', on ? 'text-brand' : 'text-gray-400 group-hover:text-brand')} />
      <span className="w-32 shrink-0 text-[12.5px] font-semibold leading-tight text-ink line-clamp-2 sm:w-40">{tr(metricLabel(metric))}</span>
      <span className={cx('grid h-10 flex-1 items-end', many ? 'grid-cols-12 gap-[3px]' : 'grid-cols-4 gap-1.5')}>
        {rows.map((r, i) => {
          const p = periods[i]
          if (!r) return <span key={p.key} className="h-1 rounded-full bg-gray-100" />
          const s = rowStatus(r, p)
          const done = Math.max(0, Math.min(1, s.pct))
          return (
            <span
              key={p.key}
              title={`${periodLabel(p)} · ${formatKpiValue(sample, r.actual, currency)} / ${formatKpiValue(sample, r.target_value, currency)}`}
              className={cx('relative w-full overflow-hidden rounded-[4px] bg-[#fdeee4] transition-[height] duration-500 ease-out', p.key === current && 'ring-2 ring-brand/40 ring-offset-1')}
              style={{ height: `${Math.round(heights[i] * 100)}%` }}
            >
              <span className="absolute inset-x-0 bottom-0 rounded-[4px]" style={{ height: `${done * 100}%`, background: s.status === 'upcoming' ? '#e5e7eb' : 'linear-gradient(to top,#d94407,#f5853f)' }} />
            </span>
          )
        })}
      </span>
      <Icon name="chevronRight" className={cx('h-4 w-4 shrink-0 transition-all duration-200', on ? 'translate-x-0.5 text-brand' : 'text-gray-300')} />
    </button>
  )
}

function MetricChart({ metric, periods, currency, current }) {
  const tr = useT()
  if (!metric) return null
  const sample = Object.values(metric.periods)[0]
  const def = metricDef(sample || metric)
  const fmt = (v) => (v == null ? '-' : formatKpiValue(sample, v, currency))
  const data = periods.map((p) => {
    const r = metric.periods[p.key]
    const label = p.yearTag ? `${p.short} ’${String(p.year).slice(2)}` : p.short
    if (!r) return { name: label, key: p.key, done: null, rest: null, target: null, actual: null }
    const s = rowStatus(r, p)
    const actual = s.status === 'upcoming' ? 0 : Number(r.actual) || 0
    const target = Number(r.target_value) || 0
    return { name: label, key: p.key, done: Math.min(actual, target), over: Math.max(0, actual - target), rest: Math.max(0, target - actual), target, actual, status: s.status }
  })
  const withGoal = data.filter((d) => d.target != null)
  const tA = withGoal.reduce((x, d) => x + d.actual, 0)
  const tT = withGoal.reduce((x, d) => x + d.target, 0)
  const met = withGoal.filter((d) => d.status === 'met').length
  return (
    <div key={metric.metric} className="animate-fade-up rounded-card border border-gray-100 bg-white p-4 shadow-card sm:p-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-400">
            <Icon name={metricIcon(metric)} className="h-3.5 w-3.5 text-brand" />
            {tr(metricLabel(metric))}
          </p>
          {def.kind === 'sum' ? (
            <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-ink">
              {fmt(tA)}<span className="ml-1.5 text-sm font-semibold text-smoke">/ {fmt(tT)}</span>
            </p>
          ) : (
            <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-ink">
              {met}<span className="ml-1.5 text-sm font-semibold text-smoke">/ {withGoal.length} {tr('periods met')}</span>
            </p>
          )}
        </div>
        <div className="flex items-center gap-3 text-[11px] font-semibold text-smoke">
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-gradient-to-t from-brand to-brand-light" />{tr('Achieved')}</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#fdeee4] ring-1 ring-[#fcd9c2]" />{tr('Still to go')}</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-3 rounded-full bg-gray-700/80" />{tr('Goal')}</span>
        </div>
      </div>
      <div className="h-60">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 4, left: -10, bottom: 0 }} barCategoryGap="22%">
            <CartesianGrid vertical={false} stroke={CHART.grid} />
            <XAxis dataKey="name" tick={{ ...axisTick, fontWeight: 600 }} axisLine={false} tickLine={false} interval={0} fontSize={10} />
            <YAxis tick={axisTickSmall} tickFormatter={fmt} axisLine={false} tickLine={false} width={54} allowDecimals={def.unit === 'decimal' || def.unit === 'percent'} />
            <Tooltip
              cursor={{ fill: 'rgba(217,68,7,0.05)', radius: 8 }}
              content={({ active, payload }) => {
                const d = active && payload?.[0]?.payload
                if (!d || d.target == null) return null
                const pct = d.target > 0 ? Math.round((d.actual / d.target) * 100) : 0
                const st = STATUS_STYLE[d.status]
                return (
                  <div style={tooltipStyle} className="px-3 py-2">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">{periodLabel(periods.find((p) => p.key === d.key))}</p>
                    <p className="text-sm font-bold text-ink">{fmt(d.actual)} <span className="font-medium text-smoke">/ {fmt(d.target)}</span></p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-[11px] font-semibold text-smoke">
                      <span className={cx('h-2 w-2 rounded-full', st.dot)} />{tr(st.label)} · {pct}%
                    </p>
                  </div>
                )
              }}
            />
            <Bar dataKey="done" stackId="a" fill={FILL.brand} maxBarSize={40} animationDuration={500} radius={[0, 0, 4, 4]} />
            <Bar dataKey="over" stackId="a" fill={FILL.green} maxBarSize={40} animationDuration={500} />
            <Bar dataKey="rest" stackId="a" fill={FILL.pale} maxBarSize={40} animationDuration={500} radius={[6, 6, 0, 0]} />
            <Line type="linear" dataKey="target" stroke="#374151" strokeOpacity={0.8} strokeWidth={0} dot={<GoalTick />} activeDot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-[11px] text-smoke">
        {data.some((d) => d.key === current) && tr('The ringed column is the period on screen.')} {def.kind === 'level' && tr('An average, so each period stands on its own.')}
      </p>
    </div>
  )
}

// A short dark tick across each column at its goal - the same mark as the pace line on the bars.
function GoalTick({ cx: x, cy: y, payload }) {
  if (payload?.target == null || x == null || y == null) return null
  return <rect x={x - 14} y={y - 1} width={28} height={2} rx={1} fill="#374151" fillOpacity={0.8} />
}
