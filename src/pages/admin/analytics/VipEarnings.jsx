import { Fragment, useEffect, useMemo, useState } from 'react'
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Avatar, Skeleton } from '../../../components/ui'
import Icon from '../../../components/Icon'
import { CountUp } from '../../../components/network/Motion'
import { CHART, axisTick, stackShape, tooltipStyle } from '../../../components/charts/chartTheme'
import { teamApi } from '../../../api/team'
import { money, perK } from '../../../lib/vip'
import { cx, downloadCsv, formatViews, formatViewsTotal } from '../../../lib/utils'
import { earningsByCreator, earningsByMonth, earningsTotals, monthKey } from '../../../lib/vipEarnings'

// VIP EARNINGS, ALL TIME (16 Oct 2026). What every paid creator has made, month by month, since the programme began:
// the team's sheet (December 2025 to September 2026, "CPM VIP ES") joined to every platform month after it, so it
// keeps itself up to date. One read of `admin_vip_earnings` when the tab opens or the market changes, nothing on a timer.
const SORTS = [
  { key: 'paid', label: 'Total paid' },
  { key: 'views', label: 'Views' },
  { key: 'cpm', label: 'CPM' },
  { key: 'avg', label: 'Avg / month' },
  { key: 'months', label: 'Months' },
]
const STACK = ['pay', 'extra']
const eur = (n, cents = false) => money(n, 'EUR', { cents })

export default function VipEarnings({ market = '', marketName = null }) {
  const [state, setState] = useState({ key: null, rows: null, error: '' })
  const [tick, setTick] = useState(0)
  const [sort, setSort] = useState('paid')
  const [open, setOpen] = useState(null)
  const [metric, setMetric] = useState('paid')
  const key = `${market}|${tick}`
  useEffect(() => {
    let alive = true
    Promise.resolve(teamApi.adminVipEarnings({ p_market: market || null })).then(({ data, error }) => {
      if (!alive) return
      if (error) setState({ key, rows: null, error: error.message || 'The earnings could not be loaded.' })
      else setState({ key, rows: data?.rows || [], error: '' })
    })
    return () => { alive = false }
  }, [key, market])
  const loading = state.key !== key
  const rows = state.rows

  const creators = useMemo(() => (rows ? earningsByCreator(rows) : []), [rows])
  const months = useMemo(() => (rows ? earningsByMonth(rows) : []), [rows])
  const totals = useMemo(() => earningsTotals(creators, months), [creators, months])
  const sorted = useMemo(() => {
    const by = { paid: (c) => c.paid, views: (c) => c.views, cpm: (c) => c.cpm, avg: (c) => c.avg, months: (c) => c.active }
    return [...creators].sort((a, b) => by[sort](b) - by[sort](a) || b.paid - a.paid)
  }, [creators, sort])
  const topPaid = Math.max(1, ...creators.map((c) => c.paid))

  function downloadData() {
    if (!rows) return
    downloadCsv(`tryp-vip-earnings${marketName ? `-${marketName.toLowerCase()}` : ''}.csv`, [
      ...rows.map((r) => ({
        creator: r.name, month: monthKey(r), views: r.views, pay: Number(r.pay).toFixed(2), extra: Number(r.extra).toFixed(2),
        total: (Number(r.pay) + Number(r.extra)).toFixed(2), rate: r.rate ?? '', source: r.live ? 'platform (this month, live)' : r.source,
      })),
    ], [
      { key: 'creator', label: 'Creator' }, { key: 'month', label: 'Month' }, { key: 'views', label: 'Views' },
      { key: 'pay', label: 'Views pay (EUR)' }, { key: 'extra', label: 'Fees and bonuses (EUR)' }, { key: 'total', label: 'Total (EUR)' },
      { key: 'rate', label: 'Rate per 1,000 views' }, { key: 'source', label: 'Source' },
    ])
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-smoke">
          {marketName ? `${marketName} only. Pick Worldwide above for every market.` : 'Every VIP and official programme.'}
          {' '}Up to September 2026 from the team's sheet, then live from the platform. Sheet names join a creator once the market's team confirms them in VIP tools &gt; Money &gt; Past earnings.
        </p>
        <div className="flex gap-1.5">
          <button type="button" onClick={() => setTick((n) => n + 1)} disabled={loading} aria-label="Refresh" title="Read it again" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white text-smoke transition-all hoverable:hover:text-brand disabled:opacity-50">
            <Icon name="refresh" className={cx('h-4 w-4', loading && 'animate-spin')} />
          </button>
          <button type="button" disabled={!rows} onClick={downloadData} className="btn-secondary !py-1.5 text-xs disabled:opacity-40"><Icon name="download" className="h-3.5 w-3.5" />Data (CSV)</button>
        </div>
      </div>

      {state.error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{state.error}</p>}
      {!rows && !state.error && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-card" />)}</div>
          <Skeleton className="h-72 w-full rounded-card" /><Skeleton className="h-96 w-full rounded-card" />
        </div>
      )}
      {rows && rows.length === 0 && <p className="rounded-card border border-dashed border-gray-200 px-6 py-12 text-center text-sm text-smoke">No VIP earnings in this market yet.</p>}

      {rows && rows.length > 0 && (
        <div className={cx('space-y-5 transition-opacity duration-300', loading && 'opacity-60')}>
          {/* THE HEADLINE: the brand card is the money; the three beside it say what the money bought. */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="relative col-span-2 animate-rise overflow-hidden rounded-card bg-gradient-to-br from-brand to-brand-light p-5 text-white shadow-lift lg:col-span-1">
              <span aria-hidden className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full bg-white/15 blur-2xl" />
              <p className="relative text-sm font-semibold text-white/85">Paid to creators, all time</p>
              <p className="relative mt-2 text-4xl font-extrabold tracking-tight tabular-nums"><CountUp value={totals.paid} format={(n) => eur(n)} /></p>
              <p className="relative mt-1.5 text-xs font-medium text-white/85">
                {totals.firstLabel} to {totals.lastLabel} · {months.length} months
              </p>
            </div>
            <Kpi label="Views paid for" value={totals.views} format={formatViewsTotal} sub={`${formatViews(totals.views / Math.max(1, totals.creatorMonths))} per creator a month`} delay={60} />
            <Kpi label="Average CPM" value={totals.cpm} format={(n) => perK(n)} sub="Views pay per 1,000 views" delay={120} />
            <Kpi label="Creators paid" value={totals.creators} sub={`${totals.onPlatform} on the platform`} delay={180} className="col-span-2 lg:col-span-1" />
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Mini label={totals.live ? `${totals.live.label} so far` : 'Last month'} value={eur(totals.live ? totals.live.paid : totals.lastPaid)} hint={totals.live ? 'Live, counting' : totals.lastLabel} live={!!totals.live} delay={60} />
            <Mini label="Average a creator a month" value={eur(totals.avgCreatorMonth, true)} hint={`Across ${totals.creatorMonths} paid months`} delay={100} />
            <Mini label="Median a creator a month" value={eur(totals.medianCreatorMonth, true)} hint="Half earn more, half less" delay={140} />
            <Mini label="Biggest month" value={eur(totals.best?.paid || 0)} hint={totals.best ? totals.best.label : '-'} delay={180} />
          </div>

          {/* PER MONTH: paid (views pay + fees and bonuses), or views, with the number of creators paid as the line. */}
          <section className="animate-rise rounded-card border border-gray-100 bg-white p-4 shadow-card sm:p-5" style={{ animationDelay: '120ms' }}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-[15px] font-bold text-ink">{metric === 'paid' ? 'Paid per month' : 'Views per month'}</h3>
              <div className="flex items-center gap-1 rounded-full bg-cloud p-1">
                {[['paid', 'Paid'], ['views', 'Views']].map(([k, l]) => (
                  <button key={k} type="button" onClick={() => setMetric(k)} aria-pressed={metric === k} className={cx('rounded-full px-3 py-1 text-xs font-semibold transition-all duration-200', metric === k ? 'bg-brand text-white shadow-card' : 'text-smoke hoverable:hover:text-ink')}>{l}</button>
                ))}
              </div>
            </div>
            <div className="h-64 w-full sm:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={months} margin={{ top: 6, right: 4, left: -6, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={CHART.grid} />
                  <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis yAxisId="l" tick={axisTick} tickLine={false} axisLine={false} width={48} tickFormatter={(v) => (metric === 'paid' ? `€${formatViews(v)}` : formatViews(v))} />
                  <YAxis yAxisId="r" orientation="right" hide domain={[0, (max) => Math.max(4, max * 1.6)]} />
                  <Tooltip cursor={{ fill: 'rgba(217,68,7,0.06)' }} contentStyle={tooltipStyle} formatter={(v, n) => (
                    n === 'creators' ? [v, 'Creators paid'] : n === 'views' ? [formatViewsTotal(v), 'Views'] : [eur(v, true), n === 'pay' ? 'Views pay' : 'Fees and bonuses']
                  )} />
                  {metric === 'paid' ? (
                    <>
                      <Bar yAxisId="l" dataKey="pay" stackId="m" fill={CHART.brand} shape={stackShape(STACK, 'pay')} maxBarSize={44} animationDuration={700} />
                      <Bar yAxisId="l" dataKey="extra" stackId="m" fill={CHART.ink} shape={stackShape(STACK, 'extra')} maxBarSize={44} animationDuration={700} />
                    </>
                  ) : (
                    <Bar yAxisId="l" dataKey="views" fill={CHART.brand} radius={[6, 6, 0, 0]} maxBarSize={44} animationDuration={700} />
                  )}
                  <Line yAxisId="r" dataKey="creators" type="monotone" stroke="#f5853f" strokeWidth={2} dot={{ r: 3, fill: '#f5853f', strokeWidth: 0 }} animationDuration={900} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-smoke">
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: CHART.brand }} />{metric === 'paid' ? 'Views pay' : 'Views'}</span>
              {metric === 'paid' && <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: CHART.ink }} />Fees and bonuses</span>}
              <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-3 rounded-full bg-brand-light" />Creators paid</span>
            </p>
          </section>

          {/* EVERY CREATOR, RANKED. A row opens into their months. Phones get cards, wider screens a table. */}
          <section className="animate-rise overflow-hidden rounded-card border border-gray-100 bg-white shadow-card" style={{ animationDelay: '160ms' }}>
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 sm:px-5">
              <h3 className="text-[15px] font-bold text-ink">Every creator, all time</h3>
              <div className="scrollbar-none -mx-1 flex max-w-full gap-1 overflow-x-auto px-1">
                {SORTS.map((s) => (
                  <button key={s.key} type="button" onClick={() => setSort(s.key)} aria-pressed={sort === s.key} className={cx('shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition-all duration-200', sort === s.key ? 'bg-brand text-white shadow-card' : 'bg-cloud text-smoke hoverable:hover:text-ink')}>{s.label}</button>
                ))}
              </div>
            </div>
            <p className="px-4 pt-1 text-xs text-smoke sm:px-5">CPM is what one thousand views paid them. Average and median are per month they were paid.</p>

            <ul className="mt-3 divide-y divide-gray-50 sm:hidden">
              {sorted.map((c, i) => (
                <li key={c.key} className="animate-rise" style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}>
                  <button type="button" onClick={() => setOpen(open === c.key ? null : c.key)} aria-expanded={open === c.key} className="flex w-full items-center gap-3 px-4 py-3 text-left">
                    <span className={cx('w-5 text-right text-sm font-extrabold tabular-nums', i < 3 ? 'text-brand' : 'text-gray-400')}>{i + 1}</span>
                    <Who c={c} />
                    <span className="text-right">
                      <span className="block text-[15px] font-bold tabular-nums text-ink">{eur(c.paid)}</span>
                      <span className="block text-[11px] tabular-nums text-smoke">{formatViews(c.views)} views</span>
                    </span>
                  </button>
                  <div className="grid grid-cols-3 gap-2 px-4 pb-3 pl-12">
                    <Stat label="CPM" value={perK(c.cpm)} />
                    <Stat label="Average" value={eur(c.avg)} />
                    <Stat label="Median" value={eur(c.median)} />
                  </div>
                  {open === c.key && <MonthStrip c={c} />}
                </li>
              ))}
            </ul>

            <div className="mt-3 hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[46rem] text-left text-sm">
                <thead>
                  <tr className="border-y border-gray-100 text-[10.5px] font-bold uppercase tracking-wide text-gray-400">
                    <th className="w-10 py-2 pl-5" /><th className="px-2 py-2">Creator</th><th className="px-2 py-2">Total paid</th>
                    <th className="px-2 py-2">Views</th><th className="px-2 py-2">CPM</th><th className="px-2 py-2">Avg / month</th>
                    <th className="px-2 py-2">Median</th><th className="px-2 py-2">Best month</th><th className="px-2 py-2">Months</th><th className="py-2 pr-5">Trend</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((c, i) => (
                    <Fragment key={c.key}>
                      <tr onClick={() => setOpen(open === c.key ? null : c.key)} className={cx('cursor-pointer border-b border-gray-50 transition-colors animate-rise hoverable:hover:bg-cloud/60', open === c.key && 'bg-brand-tint/40')} style={{ animationDelay: `${Math.min(i, 14) * 25}ms` }}>
                        <td className={cx('py-2.5 pl-5 text-right text-sm font-extrabold tabular-nums', i < 3 ? 'text-brand' : 'text-gray-400')}>{i + 1}</td>
                        <td className="px-2 py-2.5"><Who c={c} /></td>
                        <td className="px-2 py-2.5">
                          <span className="font-bold tabular-nums text-ink">{eur(c.paid, true)}</span>
                          <span className="mt-1 block h-1.5 w-28 overflow-hidden rounded-full bg-cloud"><span className="block h-full rounded-full bg-gradient-to-r from-brand to-brand-light transition-[width] duration-700" style={{ width: `${Math.max(3, (c.paid / topPaid) * 100)}%` }} /></span>
                        </td>
                        <td className="px-2 py-2.5 tabular-nums text-ink">{formatViewsTotal(c.views)}</td>
                        <td className="px-2 py-2.5 tabular-nums text-ink">{perK(c.cpm)}</td>
                        <td className="px-2 py-2.5 tabular-nums text-smoke">{eur(c.avg, true)}</td>
                        <td className="px-2 py-2.5 tabular-nums text-smoke">{eur(c.median, true)}</td>
                        <td className="px-2 py-2.5 text-xs text-smoke"><span className="font-semibold tabular-nums text-ink">{eur(c.best.paid)}</span> {c.best.label}</td>
                        <td className="px-2 py-2.5 tabular-nums text-smoke">{c.active}</td>
                        <td className="py-2.5 pr-5"><Spark values={months.map((m) => c.byMonth[m.key]?.paid || 0)} /></td>
                      </tr>
                      {open === c.key && <tr className="bg-brand-tint/20"><td colSpan={10}><MonthStrip c={c} /></td></tr>}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* THE SHEET, REDRAWN: creators along the top, months down the side, the totals underneath. */}
          <section className="animate-rise overflow-hidden rounded-card border border-gray-100 bg-white shadow-card" style={{ animationDelay: '200ms' }}>
            <h3 className="px-4 pt-4 text-[15px] font-bold text-ink sm:px-5">Month by month</h3>
            <p className="px-4 text-xs text-smoke sm:px-5">Paid, with views underneath. The deeper the colour, the bigger the month. Scroll sideways for everyone.</p>
            <div className="scroll-edge-fade mt-3 overflow-x-auto pb-1">
              <table className="w-max min-w-full border-separate border-spacing-0 text-left text-xs">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 border-b border-gray-100 bg-white px-4 py-2 text-[10.5px] font-bold uppercase tracking-wide text-gray-400 sm:px-5">Month</th>
                    {sorted.map((c) => (
                      <th key={c.key} className="border-b border-gray-100 px-2 py-2 text-center">
                        <span className="flex flex-col items-center gap-1">
                          <Avatar src={c.photo} name={c.name} size="xs" />
                          <span className="max-w-[5.5rem] truncate text-[11px] font-semibold text-ink">{c.short}</span>
                        </span>
                      </th>
                    ))}
                    <th className="border-b border-l border-gray-100 bg-cloud/50 px-3 py-2 text-[10.5px] font-bold uppercase tracking-wide text-gray-500">Month total</th>
                  </tr>
                </thead>
                <tbody>
                  {months.map((m) => (
                    <tr key={m.key}>
                      <td className="sticky left-0 z-10 whitespace-nowrap border-b border-gray-50 bg-white px-4 py-2 font-semibold text-ink sm:px-5">
                        {m.label}{m.live && <span className="ml-1.5 rounded-full bg-brand px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">Live</span>}
                      </td>
                      {sorted.map((c) => {
                        const cell = c.byMonth[m.key]
                        const heat = cell ? Math.min(1, cell.paid / Math.max(1, totals.bestCell)) : 0
                        return (
                          <td key={c.key} className="border-b border-gray-50 px-1 py-1 text-center">
                            {cell ? (
                              <span className="block rounded-lg px-2 py-1 transition-transform duration-200 hoverable:hover:scale-105" style={{ background: `rgba(217,68,7,${0.05 + heat * 0.5})`, color: heat > 0.55 ? '#fff' : undefined }} title={`${c.name}, ${m.label}: ${eur(cell.paid, true)} for ${cell.views.toLocaleString()} views`}>
                                <span className="block font-bold tabular-nums">{eur(cell.paid)}</span>
                                <span className={cx('block text-[10px] tabular-nums', heat > 0.55 ? 'text-white/85' : 'text-smoke')}>{formatViews(cell.views)}</span>
                              </span>
                            ) : <span className="text-gray-300">-</span>}
                          </td>
                        )
                      })}
                      <td className="border-b border-l border-gray-50 bg-cloud/50 px-3 py-2 text-right">
                        <span className="block font-bold tabular-nums text-ink">{eur(m.paid)}</span>
                        <span className="block text-[10px] tabular-nums text-smoke">{formatViews(m.views)}</span>
                      </td>
                    </tr>
                  ))}
                  {[
                    ['Total', (c) => eur(c.paid), (c) => formatViews(c.views), eur(totals.paid), formatViews(totals.views)],
                    ['Average', (c) => eur(c.avg), (c) => formatViews(c.avgViews), eur(totals.avgMonth), formatViews(totals.views / Math.max(1, months.length))],
                    ['Median', (c) => eur(c.median), (c) => formatViews(c.medianViews), eur(totals.medianMonth), ''],
                  ].map(([label, paid, views, all, allViews]) => (
                    <tr key={label} className="bg-cloud/50">
                      <td className="sticky left-0 z-10 whitespace-nowrap border-b border-gray-100 bg-cloud px-4 py-2 text-[10.5px] font-bold uppercase tracking-wide text-gray-500 sm:px-5">{label}</td>
                      {sorted.map((c) => (
                        <td key={c.key} className="border-b border-gray-100 px-2 py-2 text-center">
                          <span className="block font-bold tabular-nums text-ink">{paid(c)}</span>
                          <span className="block text-[10px] tabular-nums text-smoke">{views(c)}</span>
                        </td>
                      ))}
                      <td className="border-b border-l border-gray-100 px-3 py-2 text-right">
                        <span className="block font-extrabold tabular-nums text-brand">{all}</span>
                        <span className="block text-[10px] tabular-nums text-smoke">{allViews}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

function Who({ c }) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2.5">
      <Avatar src={c.photo} name={c.name} size="sm" />
      <span className="min-w-0">
        <span className="block truncate font-semibold text-ink">{c.name}</span>
        <span className="flex flex-wrap items-center gap-1 text-[11px] text-smoke">
          {c.kind === 'official' ? <span className="font-semibold text-brand">Official</span> : <span>VIP</span>}
          <span>· {perK(c.rate)} rate</span>
          {!c.onPlatform && (
            <span className={cx('rounded-full px-1.5 py-px text-[10px] font-semibold', c.match === 'former' ? 'bg-cloud' : 'bg-amber-50 text-amber-700')}>
              {c.match === 'former' ? 'No longer with us' : c.match === 'suggested' ? 'Sheet name, match not confirmed' : 'Sheet name, not matched'}
            </span>
          )}
        </span>
      </span>
    </span>
  )
}

function Kpi({ label, value, format, sub, delay = 0, className }) {
  return (
    <div className={cx('animate-rise rounded-card border border-gray-100 bg-white p-4 shadow-card', className)} style={{ animationDelay: `${delay}ms` }}>
      <p className="text-sm font-medium text-smoke">{label}</p>
      <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums text-ink sm:text-3xl"><CountUp value={Number(value) || 0} format={format} /></p>
      <p className="mt-1.5 text-[11px] text-gray-400">{sub}</p>
    </div>
  )
}

function Mini({ label, value, hint, live = false, delay = 0 }) {
  return (
    <div className="animate-rise rounded-2xl border border-gray-100 bg-white px-4 py-3 shadow-card" style={{ animationDelay: `${delay}ms` }}>
      <p className="flex items-center gap-1.5 text-xs font-medium text-smoke">
        {live && <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand/60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-brand" /></span>}
        {label}
      </p>
      <p className="mt-1 text-lg font-bold tabular-nums text-ink">{value}</p>
      <p className="truncate text-[11px] text-gray-400">{hint}</p>
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <span className="rounded-xl bg-cloud/70 px-2.5 py-1.5">
      <span className="block text-[10px] font-semibold uppercase tracking-wide text-gray-400">{label}</span>
      <span className="block text-[13px] font-bold tabular-nums text-ink">{value}</span>
    </span>
  )
}

// Their months as chips, newest first: what each paid, the views behind it, and the rate it worked out at.
function MonthStrip({ c }) {
  const list = [...c.list].reverse()
  return (
    <div className="scrollbar-none flex gap-2 overflow-x-auto px-4 pb-3 pt-1 sm:px-5 sm:py-3">
      {list.map((m, i) => (
        <span key={m.key} className="shrink-0 animate-pop-in rounded-xl border border-gray-100 bg-white px-3 py-2 shadow-card" style={{ animationDelay: `${i * 30}ms` }}>
          <span className="flex items-center gap-1.5 text-[11px] font-semibold text-smoke">
            {m.label}
            {m.live && <span className="rounded-full bg-brand px-1.5 py-px text-[9px] font-bold uppercase text-white">Live</span>}
          </span>
          <span className="block text-sm font-bold tabular-nums text-ink">{eur(m.paid, true)}</span>
          <span className="block text-[11px] tabular-nums text-smoke">{formatViews(m.views)} views{m.extra > 0 ? ` · ${eur(m.extra)} fee/bonus` : ''}</span>
        </span>
      ))}
    </div>
  )
}

function Spark({ values }) {
  const w = 84
  const h = 24
  const max = Math.max(1, ...values)
  const step = values.length > 1 ? w / (values.length - 1) : w
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(h - 2 - (v / max) * (h - 4)).toFixed(1)}`).join(' ')
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden className="overflow-visible">
      <polyline points={pts} fill="none" stroke="#d94407" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

