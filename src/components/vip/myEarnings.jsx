import { useMemo, useState } from 'react'
import { useReducedMotion } from 'motion/react'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Skeleton } from '../ui'
import Icon from '../Icon'
import { CountUp, VIP_COUNT_MS } from '../network/Motion'
import { CHART, FILL, axisTick, tooltipStyle, cursorFill } from '../charts/chartTheme'
import { money, monthLabel, perK, useKindT, useOptionalRpc } from '../../lib/vip'
import { cx, formatViews } from '../../lib/utils'
import { median } from '../../lib/vipEarnings'

// A VIP'S OWN EARNINGS, ALL TIME (migration 430). Every month they have been paid for: the team's records from before
// the platform (only once the team has confirmed the sheet's name is theirs), then every platform month, this one live.
// Tap a month for its detail. Read once when the section opens (`vip_my_earnings`, as the previewed creator in "See as
// a VIP"), nothing on a timer.
export function VipMyEarnings({ onWallet, walletVersion = 0 }) {
  const reducedMotion = useReducedMotion()
  const tr = useKindT()
  const { data, reload } = useOptionalRpc('vip_my_earnings', {}, `my-earnings:${walletVersion}`)
  const [metric, setMetric] = useState('paid')
  const [picked, setPicked] = useState(null)
  const cur = data?.currency || 'EUR'

  const months = useMemo(() => (data?.rows || [])
    .map((r) => {
      const pay = Number(r.pay) || 0
      const extra = Number(r.extra) || 0
      return { key: `${r.year}-${String(r.month).padStart(2, '0')}`, year: r.year, month: r.month, label: monthLabel(r.year, r.month, { short: true }), views: Number(r.views) || 0, pay, extra, paid: pay + extra, rate: r.rate, source: r.source, live: !!r.live }
    })
    .filter((m) => m.views > 0 || m.paid > 0), [data])

  const t = useMemo(() => {
    const done = months.filter((m) => !m.live)
    const paid = months.reduce((s, m) => s + m.paid, 0)
    const pay = months.reduce((s, m) => s + m.pay, 0)
    const views = months.reduce((s, m) => s + m.views, 0)
    const best = months.reduce((b, m) => (m.paid > (b?.paid ?? -1) ? m : b), null)
    return {
      paid, views,
      cpm: views > 0 ? (pay / views) * 1000 : 0,
      avg: done.length ? done.reduce((s, m) => s + m.paid, 0) / done.length : 0,
      median: median(done.map((m) => m.paid)),
      best, live: months.find((m) => m.live) || null,
      first: months[0] || null,
    }
  }, [months])

  if (data === undefined) return <div className="vip-stage space-y-4"><Skeleton className="h-40 w-full rounded-card" /><Skeleton className="h-72 w-full rounded-card" /></div>
  if (data === null) return <div role="alert" className="rounded-card border border-gray-100 bg-white p-6 text-sm text-smoke">{tr('Could not load your earnings.')} <button type="button" onClick={reload} className="min-h-11 px-3 font-semibold text-brand">{tr('Try again')}</button></div>
  if (!months.length && !Number(data?.balance)) {
    return (
      <div className="vip-stage rounded-card border border-dashed border-gray-200 bg-white px-6 py-12 text-center">
        <Icon name="money" className="mx-auto h-8 w-8 text-brand" />
        <p className="mt-3 font-semibold text-ink">{tr('Your earnings will show here')}</p>
        <p className="mt-1 text-sm text-smoke">{tr('Every month you are paid for adds up on this page, with a chart of how it grows.')}</p>
      </div>
    )
  }

  // Opens on the last FINISHED month: a half-counted month beside a whole one reads as a fall that has not happened.
  const sel = months.find((m) => m.key === picked) || [...months].reverse().find((m) => !m.live) || months[months.length - 1]
  const prev = months[months.indexOf(sel) - 1]
  const move = sel && !sel.live && prev && prev.paid > 0 ? Math.round(((sel.paid - prev.paid) / prev.paid) * 100) : null
  const balance = Number(data.balance) || 0
  const live = t.live?.paid || 0
  const threshold = Number(data.cash_threshold) || 0
  const voucherMin = Number(data.voucher_min) || 0

  return (
    <div className="vip-stage space-y-4">
      {/* THE NUMBER THAT MATTERS, BIG: everything they have made with us. */}
      <section className="vip-lifetime-card relative isolate overflow-hidden rounded-card p-5 text-white shadow-lift sm:p-7">
        <span aria-hidden className="vip-lifetime-glow pointer-events-none absolute -right-12 -top-20 h-64 w-64 rounded-full" />
        <span aria-hidden className="pointer-events-none absolute -bottom-24 -left-12 h-48 w-48 rounded-full bg-brand/15 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-white/85"><Icon name="sparkles" className="h-5 w-5" /></span>
          <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/85">{tr('Earned all time')}</p></div>
        </div>
        <p className="relative mt-3 text-[40px] font-extrabold leading-none tracking-tight tabular-nums sm:text-[56px]"><CountUp value={t.paid} duration={VIP_COUNT_MS * 2} format={(n) => money(n, cur)} /></p>
        <p className="relative mt-3 text-xs font-medium text-white/75">
          {t.first ? tr('Since {m}', { m: monthLabel(t.first.year, t.first.month) }) : ''}{' · '}
          {months.length === 1 ? tr('1 month') : tr('{n} months', { n: months.length })}
        </p>
        <div className="relative mt-5 grid grid-cols-2 gap-2 border-t border-white/25 pt-4 sm:max-w-lg sm:gap-3">
          <div className="rounded-2xl border border-white/20 bg-white/15 p-3 backdrop-blur-sm sm:p-4">
            <p className="text-[11px] font-semibold text-white/85">{tr('Available balance')}</p>
            <p className="mt-1 text-xl font-extrabold tabular-nums sm:text-2xl"><CountUp value={balance} duration={VIP_COUNT_MS} format={(n) => money(n, cur)} /></p>
          </div>
          <div className="rounded-2xl border border-white/20 bg-white/15 p-3 backdrop-blur-sm sm:p-4">
            <p className="text-[11px] font-semibold text-white/85">{tr('This month so far')}</p>
            <p className="mt-1 text-xl font-extrabold tabular-nums sm:text-2xl"><CountUp value={live} duration={VIP_COUNT_MS} format={(n) => money(n, cur)} /></p>
          </div>
        </div>
        <div className="relative mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-white/85">{tr('Cash from {a} · travel voucher from {b}', { a: money(threshold, cur, { cents: false }), b: money(voucherMin, cur, { cents: false }) })}</p>
          {onWallet && <button type="button" onClick={onWallet} className="inline-flex min-h-10 items-center gap-1 rounded-full border border-white/30 bg-white/15 px-4 text-xs font-bold text-white transition-all hoverable:hover:bg-white/25 hoverable:hover:-translate-y-0.5">{tr('View payouts')}<Icon name="chevronRight" className="h-4 w-4" /></button>}
        </div>
      </section>

      <div className="relative -mt-1 flex flex-wrap items-center gap-2 px-1 text-xs text-smoke">
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-400" />{tr('Available in your balance')}</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-white ring-1 ring-brand" />{tr('This month is still counting')}</span>
      </div>

      {sel && <section className="rounded-card border border-gray-100 bg-white p-4 shadow-card animate-rise sm:p-5" style={{ animationDelay: '120ms' }}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-[15px] font-bold text-ink">{metric === 'paid' ? tr('Earned each month') : tr('Views each month')}</h3>
            <p className="text-xs text-smoke">{tr('Tap a month to see it.')}</p>
          </div>
          <div className="flex items-center gap-1 rounded-full bg-cloud p-1">
            {[['paid', tr('Earned')], ['views', tr('Views')]].map(([k, l]) => (
              <button key={k} type="button" onClick={() => setMetric(k)} aria-pressed={metric === k} className={cx('min-h-11 rounded-full px-4 py-2 text-xs font-semibold transition-all duration-200', metric === k ? 'bg-brand text-white shadow-card' : 'text-smoke hoverable:hover:text-ink')}>{l}</button>
            ))}
          </div>
        </div>
        <div className="h-48 w-full sm:h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart key={metric} data={months} margin={{ top: 6, right: 2, left: -8, bottom: 0 }} onClick={(e) => { const m = months[Number(e?.activeTooltipIndex)]; if (m) setPicked(m.key) }}>
              <CartesianGrid vertical={false} stroke={CHART.grid} />
              <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis tick={axisTick} tickLine={false} axisLine={false} width={46} tickFormatter={(v) => (metric === 'paid' ? money(v, cur, { cents: false }) : formatViews(v))} />
              <Tooltip cursor={cursorFill} contentStyle={tooltipStyle} formatter={(v) => [metric === 'paid' ? money(v, cur) : formatViews(v), metric === 'paid' ? tr('Earned') : tr('Views')]} />
              <Bar dataKey={metric} radius={[6, 6, 0, 0]} maxBarSize={46} animationDuration={600} isAnimationActive={!reducedMotion} onClick={(entry) => { if (entry?.key) setPicked(entry.key) }} className="cursor-pointer">
                {months.map((m) => <Cell key={m.key} fill={FILL.brand} stroke={m.key === sel?.key ? CHART.ink : 'none'} strokeWidth={m.key === sel?.key ? 2 : 0} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <p className="mt-2 text-xs text-smoke">{metric === 'paid' ? tr('Earnings by month · outlined month selected') : tr('Views by month · outlined month selected')}</p>
        {/* THE MONTH YOU TAPPED. */}
        <div key={sel.key} className="mt-3 grid grid-cols-2 gap-2 rounded-2xl bg-cloud/60 p-3 animate-pop-in sm:grid-cols-4">
          <div className="col-span-2 sm:col-span-1">
            <p className="text-[11px] font-bold uppercase tracking-wide text-brand">{monthLabel(sel.year, sel.month)}</p>
            <p className="text-2xl font-extrabold tabular-nums text-ink">{money(sel.paid, cur)}</p>
            {move != null && <p className={cx('text-[11px] font-semibold', move >= 0 ? 'text-green-700' : 'text-red-600')}>{move >= 0 ? '▲' : '▼'} {Math.abs(move)}% {tr('on the month before')}</p>}
          </div>
          <Fact label={tr('Views')} value={formatViews(sel.views)} />
          <Fact label={tr('Rate')} value={sel.rate ? perK(sel.rate, cur) : '-'} />
          <Fact label={sel.extra > 0 ? tr('Fee and bonuses') : tr('Status')} value={sel.extra > 0 ? money(sel.extra, cur) : sel.live ? tr('Still counting') : sel.source === 'sheet' ? tr('From our records') : tr('Closed')} />
        </div>
      </section>}

      <details className="group rounded-card border border-gray-100 bg-white p-4 shadow-card">
        <summary className="flex min-h-11 cursor-pointer items-center justify-between text-sm font-semibold text-ink">{tr('Views, CPM and monthly averages')}<Icon name="chevronDown" className="h-4 w-4 text-smoke transition-transform group-open:rotate-180" /></summary>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label={tr('Views counted')} value={formatViews(t.views)} delay={60} />
        <Tile label={tr('Your CPM')} value={perK(t.cpm, cur)} hint={tr('Per 1,000 views')} delay={100} />
        <Tile label={tr('Average month')} value={money(t.avg, cur)} hint={tr('Median {a}', { a: money(t.median, cur) })} delay={140} />
        <Tile label={tr('Best month')} value={money(t.best?.paid || 0, cur)} hint={t.best ? monthLabel(t.best.year, t.best.month) : ''} delay={180} />
      </div>

      </details>

      <section className="overflow-hidden rounded-card border border-orange-100 bg-white shadow-card animate-rise" style={{ animationDelay: '160ms' }}>
        <div className="border-b border-orange-100 bg-gradient-to-r from-brand-tint/80 to-white px-4 py-4 sm:px-5">
          <h3 className="text-[15px] font-bold text-ink">{tr('Every month')}</h3>
          <p className="mt-0.5 text-xs text-smoke">{tr('Tap a month to explore its earnings and views.')}</p>
        </div>
        <ul className="mt-2 divide-y divide-gray-50">
          {[...months].reverse().map((m, i) => {
            const top = Math.max(1, ...months.map((x) => x.paid))
            return (
              <li key={m.key}>
                <button type="button" onClick={() => setPicked(m.key)} aria-pressed={m.key === sel?.key} className={cx('flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors duration-200 animate-rise sm:px-5', m.key === sel?.key ? 'bg-brand-tint/70' : 'hoverable:hover:bg-cloud/60')} style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}>
                  <span className="w-20 shrink-0 text-sm font-semibold text-ink">{m.label}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block h-2 overflow-hidden rounded-full bg-cloud"><span className="block h-full rounded-full bg-gradient-to-r from-brand to-brand-light transition-[width] duration-700" style={{ width: `${Math.max(2, (m.paid / top) * 100)}%` }} /></span>
                    <span className="mt-0.5 block text-[11px] tabular-nums text-smoke">{formatViews(m.views)} {tr('views')}{m.live ? ` · ${tr('Still counting')}` : ` · ${tr('Closed')}`}</span>
                  </span>
                  <span className="shrink-0 text-sm font-bold tabular-nums text-ink">{money(m.paid, cur)}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}

function Tile({ label, value, hint, delay = 0 }) {
  return (
    <div className="rounded-card border border-gray-100 bg-white p-4 shadow-card animate-rise" style={{ animationDelay: `${delay}ms` }}>
      <p className="text-xs font-medium text-smoke">{label}</p>
      <p className="mt-1.5 text-xl font-bold tabular-nums text-ink sm:text-2xl">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-smoke">{hint}</p>}
    </div>
  )
}

function Fact({ label, value }) {
  return (
    <div>
      <p className="text-[10.5px] font-bold uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-0.5 text-[15px] font-bold tabular-nums text-ink">{value}</p>
    </div>
  )
}
