import { useMemo, useState } from 'react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Skeleton } from '../ui'
import { CHART, axisTick, tooltipStyle } from '../charts/chartTheme'
import { cx, formatViews } from '../../lib/utils'
import { nf, shortDay, useOptionalRpc } from '../../lib/vip'
import { useT } from '../../lib/i18n'

// THE VIP TREND CHART, IN A FILE OF ITS OWN (30 Sep 2026). It is the only part of the VIP screens that needs the
// charting library, and it is used by BOTH the creator's page and the team's. A module shared by two lazy routes is
// hoisted by the bundler into the entry chunk - which put the whole charting library on every creator's first load
// (the bundle-graph test caught it). adminC now loads this on demand instead, so it stays out of the entry.

const RANGES = [[7, '7 days'], [30, '30 days'], [90, '90 days']]

/** Views gained per day, a platform split and the best videos. `mine` swaps the team's numbers for the creator's own. */
export default function TrendCard({ programmeId, mine = false, title }) {
  const tr = useT()
  const [days, setDays] = useState(30)
  const { data, missing } = useOptionalRpc(mine ? 'vip_my_trends' : 'vip_trends', mine ? { p_days: days } : { p_programme: programmeId, p_days: days }, `${programmeId}:${days}`)
  const series = useMemo(() => (data?.daily || []).map((r) => ({ d: r.d, label: shortDay(r.d), views: Number(r.views) })), [data])
  const total = series.reduce((a, r) => a + r.views, 0)
  const best = series.reduce((a, r) => (r.views > (a?.views || 0) ? r : a), null)
  if (missing) return null
  const platforms = data?.platforms || []
  const maxPlat = Math.max(1, ...platforms.map((p) => Number(p.views)))
  const gid = `vipTrend${mine ? 'Mine' : 'All'}`

  return (
    <section className="rounded-card border border-gray-100 bg-white p-4 shadow-card animate-fade-up sm:p-5">
      <div className="mb-1 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-bold text-ink">{title || tr('Views gained each day')}</h2>
          <p className="mt-0.5 text-xs text-smoke">
            {data ? tr('{n} views in the last {d} days', { n: nf(total), d: days }) : ' '}
            {best && best.views > 0 ? ` · ${tr('best day {d}', { d: best.label })}` : ''}
          </p>
        </div>
        <div className="inline-flex gap-1 rounded-xl bg-cloud p-1 text-xs font-semibold" role="tablist" aria-label={tr('Time range')}>
          {RANGES.map(([n, label]) => (
            <button key={n} type="button" role="tab" aria-selected={days === n} onClick={() => setDays(n)}
              className={cx('rounded-lg px-3 py-1.5 transition-all duration-200', days === n ? 'bg-white text-ink shadow-card' : 'text-smoke hoverable:hover:text-ink')}>{tr(label)}</button>
          ))}
        </div>
      </div>
      {data === undefined ? <Skeleton className="mt-3 h-56 w-full rounded-xl" /> : (
        <div className="mt-3 h-56 sm:h-60">
          <ResponsiveContainer>
            <AreaChart data={series} margin={{ top: 8, right: 6, left: -12, bottom: 0 }}>
              <defs>
                <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={CHART.brand} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={CHART.brand} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke={CHART.grid} />
              <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={28} />
              <YAxis tick={axisTick} axisLine={false} tickLine={false} width={48} tickFormatter={(v) => formatViews(v)} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => [nf(v), tr('Views')]} cursor={{ stroke: CHART.brand, strokeOpacity: 0.25 }} />
              <Area type="monotone" dataKey="views" stroke={CHART.brand} strokeWidth={2.5} fill={`url(#${gid})`} isAnimationActive={false} dot={false} activeDot={{ r: 4, fill: CHART.brand }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
      {platforms.length > 0 && (
        <div className="mt-4 grid gap-x-8 gap-y-2.5 border-t border-gray-50 pt-4 sm:grid-cols-2">
          {platforms.map((p) => (
            <div key={p.platform}>
              <div className="mb-1 flex items-baseline justify-between text-xs">
                <span className="font-semibold capitalize text-ink">{p.platform}</span>
                <span className="tabular-nums text-smoke">{tr('{n} videos', { n: p.videos })} · {formatViews(p.views)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-cloud">
                <div className="brand-drift h-full origin-left animate-bar-grow rounded-full" style={{ width: `${Math.max(4, (Number(p.views) / maxPlat) * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

