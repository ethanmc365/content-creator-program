import { useMemo, useState } from 'react'
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Skeleton } from '../ui'
import Icon from '../Icon'
import { CHART, FILL, axisTickSmall, tooltipStyle } from '../charts/chartTheme'
import {
  STANDARD_METRICS, aggregateScopes, formatKpiValue, metricDef, metricIcon, metricLabel, periodKey, periodLabel,
  rowStatus, windowPeriods,
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
  met: { dot: 'bg-emerald-400', chip: 'bg-emerald-50 text-emerald-600', fill: FILL.green, hex: '#34d399', label: 'Target met' },
  on_track: { dot: 'bg-brand', chip: 'bg-brand-tint text-brand', fill: FILL.brand, hex: '#d94407', label: 'On track' },
  behind: { dot: 'bg-amber-400', chip: 'bg-amber-50 text-amber-700', fill: FILL.amber, hex: '#fbbf24', label: 'Behind pace' },
  missed: { dot: 'bg-red-400', chip: 'bg-red-50 text-red-600', fill: FILL.red, hex: '#f87171', label: 'Missed' },
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
            <PeriodHeader periods={periods} current={periodKey(period)} />
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
                index={i}
              />
            ))}
          </div>
          <MetricChart metric={pick} periods={periods} currency={currency} current={periodKey(period)} />
        </div>
      )}
    </section>
  )
}

// ONE ROW PER METRIC, ONE CELL PER PERIOD (rebuilt again 2 Oct 2026). Ethan: the little columns with
// the orange circle round the current one "I don't really get that. I don't really like the UI."
// The columns encoded a goal as a height and an achievement as a fill, which takes a key to read.
// This is a grid a person can read cold: a metric down the side, the periods across the top, and in
// each cell how much of that period's goal was reached, coloured by how it went. The period on screen
// is named "Now" in the header and its column is tinted - nothing is circled. A period with no goal
// shows a dash; one that has not begun shows its goal in dashed outline.
const CELL = {
  met: 'bg-emerald-50 text-emerald-700',
  on_track: 'bg-brand-tint text-brand',
  behind: 'bg-amber-50 text-amber-700',
  missed: 'bg-red-50 text-red-600',
}

function PeriodHeader({ periods, current }) {
  const tr = useT()
  const many = periods.length > 4
  return (
    <div className="flex items-center gap-3 border-b border-gray-100 bg-cloud/40 px-4 py-2">
      <span className="w-[calc(2rem+0.75rem+8rem)] shrink-0 text-[10.5px] font-bold uppercase tracking-wide text-gray-400 sm:w-[calc(2rem+0.75rem+10rem)]">{tr('Goal reached')}</span>
      <span className={cx('grid flex-1', many ? 'gap-[3px]' : 'gap-1.5')} style={{ gridTemplateColumns: `repeat(${periods.length}, minmax(0, 1fr))` }}>
        {periods.map((p) => {
          const now = p.key === current
          return (
            <span key={p.key} className={cx('truncate text-center text-[10.5px] tabular-nums', now ? 'font-bold text-brand' : 'font-semibold text-smoke')}>
              {many ? String(p.short).slice(0, 3) : p.yearTag ? `${p.short} ’${String(p.year).slice(2)}` : p.short}
            </span>
          )
        })}
      </span>
      <span className="w-4 shrink-0" aria-hidden />
    </div>
  )
}

function MetricStrip({ metric, periods, currency, on, last, onPick, current, index }) {
  const tr = useT()
  const rows = periods.map((p) => metric.periods[p.key] || null)
  const sample = rows.find(Boolean)
  const many = periods.length > 4
  const here = metric.periods[current]
  const hereStatus = here ? rowStatus(here, periods.find((p) => p.key === current)) : null
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={on}
      style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}
      className={cx(
        'animate-fade-up group relative flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-200',
        !last && 'border-b border-gray-100',
        on ? 'bg-cloud/70' : 'hoverable:hover:bg-cloud/40',
      )}
    >
      {/* the picked row is marked with a brand bar on its edge, not a tint */}
      <span aria-hidden className={cx('absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-brand transition-all duration-300', on ? 'opacity-100' : 'scale-y-0 opacity-0')} />
      <span className={cx('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors duration-200', on ? 'bg-brand text-white shadow-card' : 'bg-cloud text-smoke group-hover:text-brand')}>
        <Icon name={metricIcon(metric)} className="h-4 w-4" />
      </span>
      <span className="w-32 shrink-0 sm:w-40">
        <span className="block text-[12.5px] font-semibold leading-tight text-ink line-clamp-2">{tr(metricLabel(metric))}</span>
        <span className="mt-0.5 block truncate text-[11px] tabular-nums text-smoke">
          {!here ? tr('No goal this period')
            : hereStatus.status === 'upcoming' ? tr('Goal {v}', { v: formatKpiValue(sample, here.target_value, currency) })
              : `${formatKpiValue(sample, here.actual, currency)} / ${formatKpiValue(sample, here.target_value, currency)}`}
        </span>
      </span>
      <span className={cx('grid flex-1', many ? 'gap-[3px]' : 'gap-1.5')} style={{ gridTemplateColumns: `repeat(${periods.length}, minmax(0, 1fr))` }}>
        {rows.map((r, i) => {
          const p = periods[i]
          const now = p.key === current
          if (!r) {
            return <span key={p.key} title={`${periodLabel(p)} · ${tr('No goal')}`} className={cx('flex h-8 items-center justify-center rounded-lg text-[11px] text-gray-300', now && 'bg-cloud')}>-</span>
          }
          const s = rowStatus(r, p)
          const upcoming = s.status === 'upcoming'
          return (
            <span
              key={p.key}
              title={`${periodLabel(p)} · ${formatKpiValue(sample, r.actual, currency)} / ${formatKpiValue(sample, r.target_value, currency)}`}
              className={cx(
                'kpi-cell flex h-8 items-center justify-center truncate rounded-lg px-0.5 text-[11px] font-bold tabular-nums',
                upcoming ? 'border border-dashed border-gray-300 font-semibold text-gray-400' : CELL[s.status],
                now && !upcoming && 'shadow-[inset_0_0_0_1.5px_currentColor]',
              )}
              style={{ animationDelay: `${index * 35 + i * 25}ms` }}
            >
              {many ? (upcoming ? '' : `${Math.round(s.pct * 100)}`) : upcoming ? formatKpiValue(sample, r.target_value, currency) : `${Math.round(s.pct * 100)}%`}
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
    if (!r) return { name: label, key: p.key, done: null, rest: null, over: null, ahead: null, target: null, actual: null, top: null }
    const s = rowStatus(r, p)
    const upcoming = s.status === 'upcoming'
    const actual = upcoming ? 0 : Number(r.actual) || 0
    const target = Number(r.target_value) || 0
    return {
      name: label,
      key: p.key,
      done: upcoming ? 0 : Math.min(actual, target),
      over: upcoming ? 0 : Math.max(0, actual - target),
      rest: upcoming ? 0 : Math.max(0, target - actual),
      ahead: upcoming ? target : 0, // a period not started: its goal as a dashed outline
      target,
      actual,
      status: s.status,
      pct: target > 0 ? actual / target : 0,
      top: Math.max(target, actual),
    }
  })
  const hereRow = metric.periods[current]
  const here = data.find((d) => d.key === current)
  const herePeriod = periods.find((p) => p.key === current)
  const started = data.filter((d) => d.target != null && d.status !== 'upcoming')
  const met = started.filter((d) => d.status === 'met').length
  const anyOver = data.some((d) => d.over > 0)
  const anyUpcoming = data.some((d) => d.ahead > 0)
  return (
    <div className="rounded-card border border-gray-100 bg-white p-4 shadow-card sm:p-5">
      <div key={metric.metric} className="animate-chart-in">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-400">
              <Icon name={metricIcon(metric)} className="h-3.5 w-3.5 text-brand" />
              {tr(metricLabel(metric))}
            </p>
            {/* THE PERIOD ON SCREEN, NOT A SUM OF THE WINDOW (1 Oct 2026). Ethan: Germany "shows 0 out
                of 500k views, but there's no KPI set". The headline used to add up every period in
                view, so a quarter with no goal still showed next quarter's. */}
            {hereRow ? (
              <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-ink">
                {here.status === 'upcoming' ? fmt(here.target) : fmt(here.actual)}
                <span className="ml-1.5 text-sm font-semibold text-smoke">
                  {here.status === 'upcoming' ? tr('goal for {p}', { p: periodLabel(herePeriod) }) : `/ ${fmt(here.target)} · ${periodLabel(herePeriod)}`}
                </span>
              </p>
            ) : (
              <p className="mt-1.5 text-sm font-semibold text-smoke">{tr('No goal for {p}', { p: periodLabel(herePeriod || periods[0]) })}</p>
            )}
            {started.length > 1 && (
              <p className="mt-1 text-[11px] font-medium text-smoke">{tr('{n} of {t} periods met', { n: met, t: started.length })}</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold text-smoke">
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-gradient-to-t from-brand to-brand-light" />{tr('Achieved')}</span>
            {anyOver && <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-gradient-to-t from-emerald-500 to-emerald-300" />{tr('Beyond the goal')}</span>}
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#eef0f3]" />{tr('Still to go')}</span>
            {anyUpcoming && <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm border border-dashed border-gray-400" />{tr('Not started')}</span>}
          </div>
        </div>
        <div className="h-60">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 22, right: 4, left: -10, bottom: 0 }} barCategoryGap="24%">
              <CartesianGrid vertical={false} stroke={CHART.grid} />
              <XAxis dataKey="name" tick={<PeriodTick data={data} current={current} />} axisLine={false} tickLine={false} interval={0} />
              <YAxis tick={axisTickSmall} tickFormatter={fmt} axisLine={false} tickLine={false} width={54} allowDecimals={def.unit === 'decimal' || def.unit === 'percent'} />
              <Tooltip
                cursor={{ fill: 'rgba(26,26,26,0.03)', radius: 8 }}
                content={({ active, payload }) => {
                  const d = active && payload?.[0]?.payload
                  if (!d || d.target == null) return null
                  const st = STATUS_STYLE[d.status]
                  return (
                    <div style={tooltipStyle} className="px-3 py-2">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">{periodLabel(periods.find((p) => p.key === d.key))}</p>
                      {d.status === 'upcoming' ? (
                        <p className="text-sm font-bold text-ink">{tr('Goal')} {fmt(d.target)}</p>
                      ) : (
                        <p className="text-sm font-bold text-ink">{fmt(d.actual)} <span className="font-medium text-smoke">/ {fmt(d.target)}</span></p>
                      )}
                      <p className="mt-0.5 flex items-center gap-1.5 text-[11px] font-semibold text-smoke">
                        <span className={cx('h-2 w-2 rounded-full', st.dot)} />{tr(st.label)}{d.status !== 'upcoming' && ` · ${Math.round(d.pct * 100)}%`}
                      </p>
                    </div>
                  )
                }}
              />
              <Bar dataKey="done" stackId="a" fill={FILL.brand} maxBarSize={44} animationDuration={650} animationEasing="ease-out" />
              <Bar dataKey="over" stackId="a" fill={FILL.green} maxBarSize={44} animationDuration={650} animationEasing="ease-out" />
              <Bar dataKey="rest" stackId="a" fill={FILL.rest} maxBarSize={44} animationDuration={650} animationEasing="ease-out" />
              <Bar dataKey="ahead" stackId="a" fill="#ffffff" stroke="#c4c8cf" strokeDasharray="4 3" strokeWidth={1.2} maxBarSize={44} animationDuration={650} radius={[8, 8, 0, 0]} />
              {/* the percentage over each column, or the goal over one not started */}
              <Line dataKey="top" stroke="none" dot={false} activeDot={false} isAnimationActive={false} label={<TopLabel data={data} fmt={fmt} />} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        {def.kind === 'level' && <p className="mt-2 text-[11px] text-smoke">{tr('An average, so each period stands on its own.')}</p>}
      </div>
    </div>
  )
}

// The period on screen is bold and orange on the axis, instead of a ring round its column.
function PeriodTick({ x, y, payload, data, current }) {
  const d = data?.find((r) => r.name === payload?.value)
  const on = d?.key === current
  return (
    <text x={x} y={y + 12} textAnchor="middle" fontSize={11} fontWeight={on ? 700 : 600} fill={on ? CHART.brand : CHART.axis}>
      {payload?.value}
    </text>
  )
}

function TopLabel({ x, y, index, data, fmt }) {
  const d = data?.[index]
  if (!d || d.target == null || x == null || y == null) return null
  const text = d.status === 'upcoming' ? fmt(d.target) : `${Math.round(d.pct * 100)}%`
  const fill = d.status === 'met' ? '#059669' : d.status === 'upcoming' ? CHART.muted : CHART.ink
  return (
    <text x={x} y={y - 8} textAnchor="middle" fontSize={11} fontWeight={700} fill={fill}>{text}</text>
  )
}
