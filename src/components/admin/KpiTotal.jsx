import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Modal, Skeleton } from '../ui'
import Icon from '../Icon'
import KpiProgress from './KpiProgress'
import { RollingOverview, STATUS_STYLE, useWindowRows } from './KpiOverview'
import { CHART, axisTickSmall, tooltipStyle } from '../charts/chartTheme'
import {
  adjacentMonth, adjacentQuarter, daysUntil, formatKpiValue, metricDef, metricIcon, metricLabel, periodKey, periodLabel, rowStatus, scopeVerdict,
} from '../../lib/kpiTracker'
import { cx } from '../../lib/utils'
import { usePlural, useT } from '../../lib/i18n'

// THE TOTAL (30 Sep 2026).
//
// Ethan: "the total one shouldn't have targets set and instead should be a combination of everything
// from all the KPIs that have been set for all the markets ... Really work on that total page, ensuring
// that you display all the data nicely, have nice graphs, and don't make it too crowded" and "add in
// some cool charts so we can see how each market is performing against their KPIs, like who's on
// track, who's off track, and maybe who I can support".
//
// Four answers, top to bottom, each one line of sight:
//   1. The headline: how many goals, across how many markets, are on track - or when it starts.
//   2. Market by market: a verdict per market (on track / keep an eye / needs support), its goals as
//      a status strip, progress against the pace. Press one to open that market.
//   3. Every goal in every market as one grid, coloured by status.
//   4. The goals added up, each with who contributed what; press one for its chart.
// Then the rolling overview of the same totals.
const VERDICT = {
  good: { label: 'On track', chip: 'bg-emerald-50 text-emerald-700', icon: 'check' },
  watch: { label: 'Keep an eye on', chip: 'bg-amber-50 text-amber-700', icon: 'eye' },
  support: { label: 'Needs support', chip: 'bg-red-50 text-red-600', icon: 'handRaised' },
  upcoming: { label: 'Not started', chip: 'bg-gray-100 text-smoke', icon: 'clock' },
  none: { label: 'No goals yet', chip: 'bg-gray-50 text-gray-400', icon: 'plus' },
}
const ORDER = ['met', 'on_track', 'behind', 'missed', 'upcoming']

export default function KpiTotal({ scopes, period: wanted, byMonth, currency, onPickScope }) {
  const tr = useT()
  const plural = usePlural()
  const windowRows = useWindowRows({ scopes, period: wanted, byMonth })
  // The periods either side are fetched while idle, so stepping through them paints at once.
  const prevP = useMemo(() => (byMonth ? adjacentMonth(wanted.year, wanted.month, -1) : { ...adjacentQuarter(wanted.year, wanted.quarter, -1), month: null }), [wanted, byMonth])
  const nextP = useMemo(() => (byMonth ? adjacentMonth(wanted.year, wanted.month, 1) : { ...adjacentQuarter(wanted.year, wanted.quarter, 1), month: null }), [wanted, byMonth])
  useWindowRows({ scopes, period: prevP, byMonth, enabled: !!windowRows.byPeriod })
  useWindowRows({ scopes, period: nextP, byMonth, enabled: !!windowRows.byPeriod })
  const fresh = windowRows.byPeriod?.get(periodKey(wanted))
  // STEPPING KEEPS THE PAGE (30 Sep 2026): until the new period's numbers are in, the last ones stay
  // on screen, dimmed, instead of the page collapsing to skeletons and growing back.
  const [last, setLast] = useState(null)
  if (fresh && (last?.here !== fresh || last?.byPeriod !== windowRows.byPeriod)) {
    setLast({ here: fresh, period: wanted, byPeriod: windowRows.byPeriod, periods: windowRows.periods })
  }
  const shown = fresh ? { here: fresh, period: wanted } : last
  const here = shown?.here
  const period = shown?.period || wanted
  const stale = !fresh && !!last
  const [open, setOpen] = useState(null)

  const perScope = useMemo(() => {
    if (!here) return null
    const byKey = new Map(here.perScope.map((x) => [x.scope.key, x.rows]))
    return scopes.map((scope) => {
      const rows = byKey.get(scope.key) || []
      return { scope, rows, ...scopeVerdict(rows, period) }
    })
  }, [here, scopes, period])

  if (!here || !perScope) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-36 w-full rounded-card" />
        <Skeleton className="h-64 w-full rounded-card" />
      </div>
    )
  }

  const total = here.rows
  const allRows = perScope.flatMap((s) => s.rows.map((r) => ({ r, s: rowStatus(r, period) })))
  const counts = Object.fromEntries(ORDER.map((k) => [k, allRows.filter((x) => x.s.status === k).length]))
  const active = perScope.filter((s) => s.n > 0)
  const started = allRows.length > 0 && counts.upcoming < allRows.length
  const good = counts.met + counts.on_track
  const support = perScope.filter((s) => s.verdict === 'support')
  const startsIn = daysUntil(period)

  return (
    <div className={cx('space-y-6 transition-opacity duration-200', stale && 'pointer-events-none opacity-60')}>
      {/* ---------- 1. the headline ---------- */}
      <div className="brand-drift animate-fade-up overflow-hidden rounded-card px-5 py-5 text-white shadow-card sm:px-6">
        {allRows.length === 0 ? (
          <div>
            <p className="text-lg font-bold">{tr('No goals set for {p} yet', { p: periodLabel(period) })}</p>
            <p className="mt-1 text-sm text-white/85">{tr('The total adds up every market\'s goals. Once a market sets one, it shows here.')}</p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
              <div>
                {started ? (
                  <p className="text-4xl font-bold tabular-nums leading-none">{good}<span className="text-white/65">/{allRows.length}</span></p>
                ) : (
                  <p className="text-4xl font-bold tabular-nums leading-none">{allRows.length}</p>
                )}
                <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-white/80">
                  {started ? tr('Goals on track or met') : tr('Goals set')}
                </p>
              </div>
              <HeroStat value={active.length} label={plural(active.length, 'Market with goals', 'Markets with goals')} />
              {started && <HeroStat value={perScope.filter((s) => s.verdict === 'good').length} label={tr('On track')} />}
              {started && <HeroStat value={support.length} label={tr('Need support')} />}
              {!started && <HeroStat value={startsIn} label={startsIn === 1 ? tr('Day to go') : tr('Days to go')} />}
            </div>
            <div className="mt-5 flex h-2.5 overflow-hidden rounded-full bg-white/20" role="img" aria-label={tr('How the goals are doing')}>
              {started ? ORDER.filter((k) => counts[k]).map((k) => (
                <span key={k} className="kpi-fill h-full first:rounded-l-full last:rounded-r-full [&+&]:ml-[2px]" style={{ width: `${(counts[k] / allRows.length) * 100}%`, background: HERO_HEX[k] }} />
              )) : <span className="h-full w-full rounded-full border border-dashed border-white/50" />}
            </div>
            <p className="mt-3 text-sm text-white/90">
              {!started
                ? (startsIn <= 1
                  ? tr('{p} starts tomorrow. Every market\'s goals are ready and will be tracked from day one.', { p: periodLabel(period) })
                  : tr('{p} starts in {n} days. Every market\'s goals are ready and will be tracked from day one.', { p: periodLabel(period), n: startsIn }))
                : support.length
                  ? tr('{names} could use a hand - most of their goals are behind pace.', { names: support.map((s) => s.scope.name).join(', ') })
                  : tr('Every market with goals is on track or close to it.')}
            </p>
          </>
        )}
      </div>

      {/* ---------- 2. market by market ---------- */}
      <section className="animate-fade-up [animation-delay:60ms]">
        <SectionTitle>{tr('How each market is doing')}</SectionTitle>
        {active.length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[...active].sort((a, b) => rankVerdict(a) - rankVerdict(b)).map((s) => (
              <MarketTile key={s.scope.key} s={s} period={period} onOpen={() => onPickScope?.(s.scope.key)} />
            ))}
          </div>
        )}
        {/* Markets with nothing set are one quiet line, not a wall of empty cards. */}
        {perScope.some((s) => s.n === 0) && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 rounded-card border border-dashed border-gray-200 px-3 py-2.5">
            <span className="mr-1 text-[12px] font-medium text-smoke">{tr('No goals for {p}:', { p: periodLabel(period) })}</span>
            {perScope.filter((s) => s.n === 0).map((s) => (
              <button key={s.scope.key} type="button" onClick={() => onPickScope?.(s.scope.key)} className="inline-flex items-center gap-1.5 rounded-full bg-cloud px-2.5 py-1 text-[12px] font-semibold text-ink transition-colors hoverable:hover:bg-brand-tint hoverable:hover:text-brand">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.scope.color }} />
                {s.scope.name}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* ---------- 3. every goal, every market ---------- */}
      {total.length > 0 && active.length > 0 && (
        <section className="animate-fade-up [animation-delay:120ms]">
          <SectionTitle>{tr('Every goal, every market')}</SectionTitle>
          <Heatmap total={total} scopes={active} period={period} currency={currency} onPickScope={onPickScope} />
        </section>
      )}

      {/* ---------- 4. the goals added up ---------- */}
      {total.length > 0 && (
        <section className="animate-fade-up [animation-delay:180ms]">
          <SectionTitle>{tr('All markets combined')}</SectionTitle>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {total.map((row, i) => (
              <TotalCard key={row.metric} row={row} period={period} currency={currency} delay={i} onOpen={() => setOpen(row)} />
            ))}
          </div>
        </section>
      )}

      <RollingOverview scopes={scopes} period={period} byMonth={byMonth} currency={currency} windowRows={fresh ? windowRows : { periods: last.periods, byPeriod: last.byPeriod }} title={byMonth ? tr('All markets, month by month') : tr('All markets, quarter by quarter')} />

      <TotalDetail row={open} period={period} currency={currency} onClose={() => setOpen(null)} />
    </div>
  )
}

const HERO_HEX = { met: '#047857', on_track: '#ffffff', behind: '#fde68a', missed: '#7f1d1d', upcoming: 'rgba(255,255,255,0.45)' }
const rankVerdict = (s) => ({ support: 0, watch: 1, good: 2, upcoming: 3, none: 4 }[s.verdict])

function HeroStat({ value, label }) {
  return (
    <div className="border-l border-white/25 pl-4">
      <p className="text-2xl font-bold tabular-nums leading-none">{value}</p>
      <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-white/80">{label}</p>
    </div>
  )
}

function SectionTitle({ children }) {
  return <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wide text-gray-400">{children}</h2>
}

function MarketTile({ s, period, onOpen }) {
  const tr = useT()
  const v = VERDICT[s.verdict]
  const pace = Math.round(s.progress * 100)
  const avg = Math.round(Math.min(1.5, s.avgPct) * 100)
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cx(
        'group flex flex-col gap-3 rounded-card border border-gray-100 bg-white p-4 text-left shadow-card transition-all duration-300 hoverable:hover:-translate-y-1 hoverable:hover:border-brand/30 hoverable:hover:shadow-lift',
        s.verdict === 'none' && 'opacity-70',
      )}
    >
      <span className="flex items-center gap-2.5">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.scope.color }} />
        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink">{s.scope.name}</span>
        <span className={cx('inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', v.chip)}>
          <Icon name={v.icon} className="h-3 w-3" />
          {tr(v.label)}
        </span>
      </span>
      {s.n === 0 ? (
        <span className="text-xs text-smoke">{tr('Nothing set for {p}.', { p: periodLabel(period) })}</span>
      ) : s.verdict === 'upcoming' ? (
        <span className="flex items-center justify-between border-t border-gray-100 pt-2.5 text-[12px] text-smoke">
          <span><strong className="tabular-nums text-ink">{s.n}</strong> {s.n === 1 ? tr('goal ready') : tr('goals ready')}</span>
          <span className="inline-flex items-center gap-0.5 font-semibold text-brand">{tr('Open')} <Icon name="chevronRight" className="h-3 w-3" /></span>
        </span>
      ) : (
        <>
          <span className="flex h-2 gap-[2px] overflow-hidden rounded-full">
            {ORDER.filter((k) => s.counts[k]).map((k) => (
              <span key={k} title={`${tr(STATUS_STYLE[k].label)}: ${s.counts[k]}`} className={cx('kpi-fill h-full', STATUS_STYLE[k].dot)} style={{ width: `${(s.counts[k] / s.n) * 100}%` }} />
            ))}
          </span>
          <span className="flex items-center justify-between gap-2 text-[12px]">
            <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-smoke">
              {ORDER.filter((k) => s.counts[k]).map((k) => (
                <span key={k} className="inline-flex items-center gap-1">
                  <span className={cx('h-1.5 w-1.5 rounded-full', STATUS_STYLE[k].dot)} />
                  <span className="font-semibold tabular-nums text-ink">{s.counts[k]}</span> {tr(STATUS_STYLE[k].label).toLowerCase()}
                </span>
              ))}
            </span>
          </span>
          {(
            <span className="flex items-center justify-between border-t border-gray-100 pt-2.5 text-[12px] text-smoke">
              <span>{tr('Average progress')} <strong className="tabular-nums text-ink">{avg}%</strong></span>
              <span>{tr('Pace')} <strong className="tabular-nums text-ink">{pace}%</strong></span>
            </span>
          )}
        </>
      )}
    </button>
  )
}

function Heatmap({ total, scopes, period, currency, onPickScope }) {
  const tr = useT()
  return (
    <div className="overflow-hidden rounded-card border border-gray-100 bg-white shadow-card">
      <div className="overflow-x-auto overscroll-x-contain">
        <table className="w-full min-w-[34rem] border-separate border-spacing-0 text-left">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-white px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-gray-400">{tr('Goal')}</th>
              {scopes.map((s) => (
                <th key={s.scope.key} className="px-2 py-3 text-center">
                  <button type="button" onClick={() => onPickScope?.(s.scope.key)} className="inline-flex max-w-[7.5rem] items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[12px] font-semibold text-ink transition-colors hoverable:hover:bg-cloud">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.scope.color }} />
                    <span className="truncate">{s.scope.name}</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {total.map((row) => (
              <tr key={row.metric} className="[&>td]:border-t [&>td]:border-gray-100">
                <td className="sticky left-0 z-10 bg-white px-4 py-2.5">
                  <span className="flex items-center gap-2 text-[13px] font-semibold text-ink">
                    <Icon name={metricIcon(row)} className="h-4 w-4 shrink-0 text-brand" />
                    <span className="truncate">{tr(metricLabel(row))}</span>
                  </span>
                </td>
                {scopes.map((s) => {
                  const r = s.rows.find((x) => x.metric === row.metric)
                  if (!r) return <td key={s.scope.key} className="px-2 py-2.5 text-center text-xs text-gray-300">–</td>
                  const st = rowStatus(r, period)
                  const style = STATUS_STYLE[st.status]
                  const pct = Math.round(st.pct * 100)
                  return (
                    <td key={s.scope.key} className="px-1.5 py-1.5 text-center">
                      <span
                        title={`${s.scope.name} · ${formatKpiValue(r, r.actual, currency)} / ${formatKpiValue(r, r.target_value, currency)} · ${tr(style.label)}`}
                        className={cx('mx-auto flex h-9 max-w-[7.5rem] flex-col items-center justify-center rounded-lg', style.chip)}
                      >
                        <span className="text-[13px] font-bold tabular-nums leading-none">{st.status === 'upcoming' ? formatKpiValue(r, r.target_value, currency) : `${pct}%`}</span>
                        <span className="mt-0.5 text-[9.5px] font-semibold uppercase leading-none tracking-wide opacity-80">{st.status === 'upcoming' ? tr('Goal') : tr(style.label)}</span>
                      </span>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function TotalCard({ row, period, currency, delay, onOpen }) {
  const tr = useT()
  const def = metricDef(row)
  const { status, pct, progress } = rowStatus(row, period)
  const fmt = (v) => formatKpiValue(row, v, currency)
  const sumParts = row.parts.reduce((x, p) => x + p.actual, 0) || 1
  return (
    <button
      type="button"
      onClick={onOpen}
      style={{ animationDelay: `${Math.min(delay, 8) * 30}ms` }}
      className="animate-fade-up group flex flex-col gap-3 rounded-card border border-gray-100 bg-white p-4 text-left shadow-card transition-all duration-300 hoverable:hover:-translate-y-1 hoverable:hover:border-brand/30 hoverable:hover:shadow-lift"
    >
      <span className="flex items-center gap-2">
        <Icon name={metricIcon(row)} className="h-4 w-4 shrink-0 text-brand" />
        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink">{tr(metricLabel(row))}</span>
        <span className={cx('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', STATUS_STYLE[status].chip)}>{tr(STATUS_STYLE[status].label)}</span>
      </span>
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-2xl font-bold tabular-nums tracking-tight text-ink">{status === 'upcoming' ? fmt(row.target_value) : fmt(row.actual)}</span>
        <span className="text-sm text-smoke">
          {status === 'upcoming' ? tr('goal') : <>{tr('of')} <strong className="font-semibold text-ink">{fmt(row.target_value)}</strong></>}
          {def.kind === 'level' && <span className="ml-1 text-[11px]">({tr('average')})</span>}
        </span>
      </span>
      <KpiProgress status={status} pct={pct} progress={progress} startsIn={daysUntil(period)} />
      {/* who it came from */}
      <span className="mt-auto">
        <span className="flex h-1.5 gap-[2px] overflow-hidden rounded-full bg-cloud">
          {row.parts.map((p) => (
            <span key={p.scope.key} className="h-full" style={{ width: `${(def.kind === 'level' ? 1 / row.parts.length : (status === 'upcoming' ? p.target / (row.target_value || 1) : p.actual / sumParts)) * 100}%`, background: p.scope.color }} />
          ))}
        </span>
        <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-smoke">
          {row.parts.map((p) => (
            <span key={p.scope.key} className="inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: p.scope.color }} />
              {p.scope.name} <span className="font-semibold tabular-nums text-ink">{status === 'upcoming' ? fmt(p.target) : fmt(p.actual)}</span>
            </span>
          ))}
        </span>
      </span>
    </button>
  )
}

// One combined goal, opened: each market's share against its own goal.
function TotalDetail({ row, period, currency, onClose }) {
  const tr = useT()
  const fmt = (v) => (row ? formatKpiValue(row, v, currency) : '')
  const data = (row?.parts || []).map((p) => {
    const st = rowStatus(p.row, period)
    return { name: p.scope.name, color: p.scope.color, actual: p.actual, target: p.target, pct: p.target > 0 ? p.actual / p.target : 0, status: st.status }
  })
  const st = row ? rowStatus(row, period) : null
  return (
    <Modal open={!!row} onClose={onClose} title={row ? tr(metricLabel(row)) : ''} wide>
      {row && (
        <div className="space-y-6 animate-page-in">
          <div className="rounded-card border border-gray-100 bg-white p-4 shadow-card">
            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">{tr('All markets combined')} · {periodLabel(period)}</p>
            <p className="mt-1 text-3xl font-bold tabular-nums text-ink">{fmt(row.actual)} <span className="text-base font-semibold text-smoke">/ {fmt(row.target_value)}</span></p>
            <KpiProgress className="mt-3" status={st.status} pct={st.pct} progress={st.progress} size="lg" startsIn={daysUntil(period)} />
            {row.averaged && <p className="mt-2 text-xs text-smoke">{tr('An average of each market\'s own figure, not a sum.')}</p>}
          </div>
          <section>
            <h3 className="mb-3 text-sm font-semibold">{tr('Each market against its own goal')}</h3>
            <div style={{ height: Math.max(140, data.length * 52) }}>
              <ResponsiveContainer>
                <BarChart data={data} layout="vertical" margin={{ top: 0, right: 56, left: 0, bottom: 0 }} barCategoryGap="28%">
                  <CartesianGrid horizontal={false} stroke={CHART.grid} />
                  <XAxis type="number" tick={axisTickSmall} tickFormatter={(v) => `${Math.round(v * 100)}%`} domain={[0, (max) => Math.max(1, Math.ceil(max * 10) / 10)]} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={104} tick={{ fontSize: 12, fill: CHART.ink, fontWeight: 600 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    cursor={{ fill: 'rgba(217,68,7,0.05)' }}
                    content={({ active, payload }) => {
                      const d = active && payload?.[0]?.payload
                      if (!d) return null
                      return (
                        <div style={tooltipStyle} className="px-3 py-2">
                          <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">{d.name}</p>
                          <p className="text-sm font-bold text-ink">{fmt(d.actual)} <span className="font-medium text-smoke">/ {fmt(d.target)}</span></p>
                          <p className="text-[11px] font-semibold text-smoke">{tr(STATUS_STYLE[d.status].label)}</p>
                        </div>
                      )
                    }}
                  />
                  <Bar dataKey="pct" radius={[0, 6, 6, 0]} maxBarSize={22} animationDuration={500}>
                    {data.map((d) => <Cell key={d.name} fill={d.color} />)}
                    <LabelList dataKey="pct" position="right" formatter={(v) => `${Math.round(v * 100)}%`} style={{ fontSize: 11, fontWeight: 700, fill: CHART.ink }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
          <div className="overflow-hidden rounded-card border border-gray-100">
            <table className="w-full text-sm">
              <thead className="bg-cloud/60 text-[11px] uppercase tracking-wide text-gray-400">
                <tr><th className="px-4 py-2 text-left">{tr('Market')}</th><th className="px-4 py-2 text-right">{tr('So far')}</th><th className="px-4 py-2 text-right">{tr('Goal')}</th><th className="px-4 py-2 text-right">{tr('Status')}</th></tr>
              </thead>
              <tbody>
                {data.map((d) => (
                  <tr key={d.name} className="border-t border-gray-100">
                    <td className="px-4 py-2.5"><span className="inline-flex items-center gap-2 font-medium"><span className="h-2 w-2 rounded-full" style={{ background: d.color }} />{d.name}</span></td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{fmt(d.actual)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-smoke">{fmt(d.target)}</td>
                    <td className="px-4 py-2.5 text-right"><span className={cx('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase', STATUS_STYLE[d.status].chip)}>{tr(STATUS_STYLE[d.status].label)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  )
}

