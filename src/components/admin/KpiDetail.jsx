import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Area, Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { supabase } from '../../lib/supabase'
import { Avatar, Modal, Skeleton } from '../ui'
import Icon from '../Icon'
import KpiProgress from './KpiProgress'
import { cx, formatDate, formatViews } from '../../lib/utils'
import { formatKpiValue, metricDef, metricLabel, periodLabel, rowStatus } from '../../lib/kpiTracker'
import { useT } from '../../lib/i18n'

// ONE KPI, OPENED UP (28 Sep 2026).
//
// Ethan: "whenever I click on it, it shows a graph of how it was met over time,
// this target, who's recruited, and everything else ... maybe more graphs
// below, just something that really makes it easier to understand."
//
// Three answers, top to bottom:
//   1. Where it stands: the number, the target, the pace, in words.
//   2. How it got there: the running total day by day against the straight
//      line to the target, with a marker for today. Where the orange line is
//      above the dashed one, the target is ahead of pace.
//   3. What it is made of: the people (recruited, took part, drove the views)
//      and the challenges behind it, with a per-day bar chart.
// Everything comes from `kpi_detail` (migration 268), which counts exactly the
// way `kpi_actuals` does, so the chart ends on the number on the card. A
// custom KPI is typed in by hand and has no history, so it gets part 1 only.

const BRAND = '#d94407'
const BRAND_LIGHT = '#f5853f'
const tooltipStyle = {
  borderRadius: 12, border: '1px solid #F1F1F2', fontFamily: 'Poppins',
  fontSize: 12, boxShadow: '0 4px 16px rgba(26,26,26,0.08)',
}
const STATUS = {
  met: { label: 'Target met', chip: 'bg-emerald-50 text-emerald-700', bar: 'bg-emerald-500' },
  on_track: { label: 'On track', chip: 'bg-brand-tint text-brand', bar: 'bg-brand' },
  behind: { label: 'Behind pace', chip: 'bg-amber-50 text-amber-700', bar: 'bg-amber-500' },
  missed: { label: 'Missed', chip: 'bg-red-50 text-red-600', bar: 'bg-red-500' },
}

const DATE_METRICS = new Set(['creators_recruited', 'referrals', 'activation_rate', 'creators_total'])
const VIEW_METRICS = new Set(['views', 'avg_views_per_entry', 'avg_views_per_creator', 'top_video_views'])
const DAY = 86400000
const iso = (t) => new Date(t).toISOString().slice(0, 10)

export default function KpiDetail({ row, scope, basis = 'all', currency = 'EUR', scopeName, period, onClose }) {
  const tr = useT()
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [nowMs] = useState(() => Date.now())
  const custom = row?.metric === 'custom'
  const { year, quarter, month } = period

  useEffect(() => {
    if (!row || custom) return undefined
    let alive = true
    setData(null)
    supabase.rpc('kpi_detail', {
      p_community_id: scope, p_year: year, p_quarter: quarter, p_month: month ?? null, p_metric: row.metric, p_basis: basis,
    }).then(({ data: d, error }) => {
      if (!alive) return
      if (error) setErr(error.message)
      else setData(d)
    })
    return () => { alive = false }
  }, [row, custom, scope, basis, year, quarter, month])

  const { status, pct, progress } = row
    ? rowStatus(row, period)
    : { status: 'on_track', pct: 0, progress: 0 }
  const def = row ? metricDef(row) : { kind: 'sum' }
  const isLevel = def.kind === 'level'
  const f = (v) => formatKpiValue(row, v, currency)
  const st = STATUS[status]

  // The running total, one point per day from the start of the period to
  // today (or its end), with the straight-line pace to the target beside it.
  const series = useMemo(() => {
    if (!data || !row) return []
    const start = Date.parse(data.start)
    const end = Date.parse(data.end)
    const last = Math.min(end - 1, nowMs)
    const byDay = new Map((data.series || []).map((p) => [p.d, Number(p.v) || 0]))
    const denByDay = data.series_den ? new Map(data.series_den.map((p) => [p.d, Number(p.v) || 0])) : null
    const denTotal = data.den_total != null ? Number(data.den_total) : null
    const percent = def.unit === 'percent'
    const out = []
    let num = 0
    let den = 0
    let max = 0
    const stockStart = row.metric === 'creators_total'
      ? row.actual - (data.series || []).reduce((sum, p) => sum + (Number(p.v) || 0), 0) : 0
    const totalDays = Math.max(1, Math.round((end - start) / DAY))
    for (let t = start, i = 0; t <= end - 1; t += DAY, i += 1) {
      const k = iso(t)
      const landed = byDay.get(k) || 0
      if (t <= last) { num += landed; den += denByDay?.get(k) || 0; max = Math.max(max, landed) }
      // WHAT THE LINE IS. A running total climbs; a ratio is the running numerator
      // over the running denominator (so it ends on the card's number); the best
      // single video is a running maximum; a headcount starts from who was there
      // before the period.
      let value
      if (row.metric === 'top_video_views') value = max
      else if (row.metric === 'creators_total') value = stockStart + num
      else if (denByDay) value = den > 0 ? (num / den) * (percent ? 100 : 1) : 0
      else if (denTotal != null) value = denTotal > 0 ? (num / denTotal) * 100 : 0
      else value = num
      out.push({
        day: new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
        k,
        landed: t <= last ? landed : null,
        total: t <= last ? value : null,
        // a running total is judged against a straight line; a level against the goal itself
        pace: isLevel ? row.target_value : Math.round((row.target_value * (i + 1)) / totalDays),
      })
    }
    return out
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, row, nowMs])

  const busiest = series.reduce((m, p) => ((p.landed ?? 0) > (m?.landed ?? 0) ? p : m), null)
  const todayKey = iso(nowMs)
  const expectedNow = row ? Math.round(row.target_value * progress) : 0
  const gap = row ? row.actual - expectedNow : 0
  const left = row ? Math.max(0, row.target_value - row.actual) : 0
  const daysLeft = data ? Math.max(0, Math.ceil((Date.parse(data.end) - nowMs) / DAY)) : null

  const peopleTitle = DATE_METRICS.has(row?.metric) ? tr('Who joined')
    : VIEW_METRICS.has(row?.metric) ? tr('Whose videos brought the views') : tr('Who took part')

  return (
    <Modal open={!!row} onClose={onClose} title={row ? metricLabel(row) : ''} wide>
      {row && (
        <div className="space-y-6">
          {/* ---- 1. Where it stands ---- */}
          <div className="relative overflow-hidden rounded-card bg-gradient-to-br from-brand to-brand-light p-5 text-white shadow-card sm:p-6">
            <span aria-hidden className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
            <div className="relative flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-white/80">{scopeName} · {periodLabel(period)}</p>
                <p className="mt-1 text-4xl font-bold tabular-nums tracking-tight">
                  {f(row.actual)}
                  <span className="ml-2 text-lg font-semibold text-white/75">/ {f(row.target_value)}</span>
                </p>
              </div>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-bold uppercase tracking-wide text-brand shadow-card">{tr(st.label)}</span>
            </div>
            {/* THE SAME BAR AS THE CARD (30 Sep 2026). This header used to draw
                its own flat green bar on the orange, so a card that read orange
                opened into a green one. Ethan: "ensure the colours match and
                show the same way." The bar now sits on a white inset - which
                also keeps red and amber readable, neither of which survives on
                an orange background - and is the very component the card uses. */}
            <div className="relative mt-4 rounded-2xl bg-white px-4 py-3 text-ink shadow-card">
              <KpiProgress status={status} pct={pct} progress={progress} isLevel={isLevel} size="lg" />
            </div>
            <p className="relative mt-3 text-sm text-white/90">
              {status === 'met'
                ? tr('Target reached, at {p}% of it.', { p: Math.round(pct * 100) })
                : status === 'missed'
                  ? tr('Finished {n} short of the target.', { n: f(left) })
                  : isLevel
                    ? tr('{left} to go to reach the goal. It is an average, so it is held against the goal all the way through.', { left: f(left) })
                    : gap >= 0
                      ? tr('{n} ahead of where a steady pace would be by today. {left} to go.', { n: f(gap), left: f(left) })
                      : tr('{n} behind a steady pace for today. {left} to go.', { n: f(-gap), left: f(left) })}
              {daysLeft != null && status !== 'met' && status !== 'missed' && ` ${daysLeft === 1 ? tr('1 day left.') : tr('{n} days left.', { n: daysLeft })}`}
            </p>
          </div>

          {custom ? (
            <p className="rounded-card border border-dashed border-gray-200 px-5 py-6 text-center text-sm text-smoke">
              {tr('This KPI is tracked by hand, so there is no history to chart. Edit it to update the number.')}
            </p>
          ) : err ? (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{err}</p>
          ) : !data ? (
            <div className="space-y-3"><Skeleton className="h-64 w-full rounded-card" /><Skeleton className="h-40 w-full rounded-card" /></div>
          ) : (
            <>
              {/* ---- 2. How it got there ---- */}
              <section className="animate-fade-up border-t border-gray-100 pt-5">
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-sm font-semibold">{tr('Over the period')}</h3>
                  <span className="flex items-center gap-3 text-[11px] text-smoke">
                    <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-full bg-brand" />{tr('Actual')}</span>
                    <span className="flex items-center gap-1.5"><span className="h-0 w-4 border-t-2 border-dashed border-gray-400" />{isLevel ? tr('The goal') : tr('Steady pace to target')}</span>
                  </span>
                </div>
                <div className="h-60">
                  <ResponsiveContainer>
                    <ComposedChart data={series} margin={{ top: 6, right: 6, left: -8, bottom: 0 }}>
                      <defs>
                        <linearGradient id="kpiFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={BRAND} stopOpacity={0.28} />
                          <stop offset="100%" stopColor={BRAND} stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F1F1F2" vertical={false} />
                      <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#6B7280' }} interval="preserveStartEnd" minTickGap={28} />
                      <YAxis tick={{ fontSize: 11, fill: '#6B7280' }} tickFormatter={(v) => f(v)} allowDecimals={false} />
                      <Tooltip
                        contentStyle={tooltipStyle}
                        formatter={(v, name) => [f(v), name === 'total' ? tr('So far') : isLevel ? tr('The goal') : tr('Steady pace')]}
                      />
                      <Line type="monotone" dataKey="pace" stroke="#9CA3AF" strokeWidth={1.5} strokeDasharray="5 5" dot={false} isAnimationActive={false} />
                      <Area type="monotone" dataKey="total" stroke={BRAND} strokeWidth={2.5} fill="url(#kpiFill)" connectNulls={false} animationDuration={900} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <p className="mt-2 text-xs text-smoke">
                  {busiest?.landed
                    ? tr('Biggest day: {d}, {n}.', { d: busiest.day, n: f(busiest.landed) })
                    : tr('Nothing has landed in this period yet.')}
                  {series.some((p) => p.k === todayKey) ? ` ${tr('The line stops at today.')}` : ''}
                </p>
              </section>

              {/* Per day, as bars: when things actually happened. */}
              {def.kind === 'sum' && series.some((p) => p.landed) && (
                <section className="animate-fade-up border-t border-gray-100 pt-5 [animation-delay:80ms]">
                  <h3 className="mb-3 text-sm font-semibold">{tr('Day by day')}</h3>
                  <div className="h-40">
                    <ResponsiveContainer>
                      <BarChart data={series} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#F1F1F2" vertical={false} />
                        <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#6B7280' }} interval="preserveStartEnd" minTickGap={28} />
                        <YAxis tick={{ fontSize: 10, fill: '#6B7280' }} tickFormatter={(v) => f(v)} allowDecimals={false} />
                        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(217,68,7,0.06)' }} formatter={(v) => [f(v), tr('That day')]} />
                        <Bar dataKey="landed" fill={BRAND_LIGHT} radius={[4, 4, 0, 0]} maxBarSize={14} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </section>
              )}

              {/* ---- 3. What it is made of ---- */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {/* FULL WIDTH WHEN IT IS ALONE (28 Sep 2026). Ethan: "The one who
                    joined is only half a screen. It should be full screen as
                    well, like the graphs." A recruitment KPI has no challenges
                    beside it, so its list took one column of two and left the
                    other empty. */}
                {row.metric !== 'challenges_run' && (
                  <section className={cx(
                    'animate-fade-up border-t border-gray-100 pt-5 [animation-delay:140ms]',
                    !(data.challenges || []).length && 'lg:col-span-2',
                  )}>
                    <h3 className="flex items-center justify-between border-b border-gray-100 pb-3 text-sm font-semibold">
                      {peopleTitle}
                      <span className="rounded-full bg-cloud px-2 py-0.5 text-[11px] font-bold tabular-nums text-smoke">{(data.people || []).length}</span>
                    </h3>
                    {(data.people || []).length === 0 ? (
                      <p className="px-4 py-6 text-center text-sm text-smoke">{tr('Nobody yet.')}</p>
                    ) : (
                      <ul className={cx(
                        'max-h-72 divide-y divide-gray-50 overflow-y-auto',
                        !(data.challenges || []).length && 'lg:grid lg:max-h-96 lg:grid-cols-2 lg:divide-y-0',
                      )}>
                        {data.people.map((p, i) => (
                          <li key={p.id}>
                            <Link to={`/profile/${p.id}`} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-cloud/60">
                              {VIEW_METRICS.has(row.metric) && <span className="w-5 shrink-0 text-right text-xs font-bold tabular-nums text-smoke">{i + 1}</span>}
                              <Avatar src={p.photo_url} name={p.name} size="xs" />
                              <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.name}</span>
                              <span className="shrink-0 text-right text-xs text-smoke">
                                {DATE_METRICS.has(row.metric)
                                  ? formatDate(p.at)
                                  : VIEW_METRICS.has(row.metric)
                                    ? <span className="font-semibold tabular-nums text-ink">{formatViews(p.views)}</span>
                                    : `${p.entries} ${p.entries === 1 ? tr('entry') : tr('entries')}`}
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                )}
                {(data.challenges || []).length > 0 && (
                  <section className={cx('animate-fade-up border-t border-gray-100 pt-5 [animation-delay:200ms]', row.metric === 'challenges_run' && 'lg:col-span-2')}>
                    <h3 className="flex items-center justify-between border-b border-gray-100 pb-3 text-sm font-semibold">
                      {row.metric === 'challenges_run' ? tr('The challenges') : tr('By challenge')}
                      <span className="rounded-full bg-cloud px-2 py-0.5 text-[11px] font-bold tabular-nums text-smoke">{data.challenges.length}</span>
                    </h3>
                    <ul className="divide-y divide-gray-50">
                      {data.challenges.map((c) => {
                        const maxViews = Math.max(1, ...data.challenges.map((x) => Number(x.views) || 0))
                        return (
                          <li key={c.id}>
                            <Link to={`/admin/analytics/${c.id}`} className="block px-4 py-3 transition-colors hover:bg-cloud/60">
                              <span className="flex items-center justify-between gap-3">
                                <span className="min-w-0 truncate text-sm font-medium">{c.title}</span>
                                <span className="shrink-0 text-xs text-smoke">
                                  {c.entries} {c.entries === 1 ? tr('entry') : tr('entries')} · <span className="font-semibold text-ink">{formatViews(c.views)}</span>
                                </span>
                              </span>
                              <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-cloud">
                                <span className="kpi-fill block h-full rounded-full bg-brand" style={{ width: `${Math.max(3, Math.round(((Number(c.views) || 0) / maxViews) * 100))}%` }} />
                              </span>
                              {c.start_date && <span className="mt-1 block text-[11px] text-smoke">{formatDate(c.start_date)}{c.end_date ? ` → ${formatDate(c.end_date)}` : ''}</span>}
                            </Link>
                          </li>
                        )
                      })}
                    </ul>
                  </section>
                )}
              </div>
            </>
          )}
          <p className="flex items-center gap-1.5 text-[11px] text-gray-400">
            <Icon name="clock" className="h-3 w-3" />
            {tr('Counted live, the same way as the card.')}
          </p>
        </div>
      )}
    </Modal>
  )
}
