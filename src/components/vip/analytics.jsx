import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Area, Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { format } from 'date-fns'
import { Avatar, Select, Skeleton, StatCard } from '../ui'
import Segmented from '../network/Segmented'
import PeriodPicker from '../PeriodPicker'
import VideoThumb from '../VideoThumb'
import Icon from '../Icon'
import { MarketStandings } from './v3'
import VipScopeSwitch from './scope'
import { CopyLinkChip } from './parts'
import { CHART, FILL, axisTick, tooltipStyle } from '../charts/chartTheme'
import { cx, formatDate, formatViews } from '../../lib/utils'
import { PERIODS, periodRange } from '../../lib/analyticsPeriod'
import { money, monthLabel, nf, perK, shortDay, vipRpc } from '../../lib/vip'
import { useT } from '../../lib/i18n'

// VIP ANALYTICS, OVER ANY DATES (6 Oct 2026).
//
// Ethan: "the ability to view analytics for everything, like each community by week, custom date ranged and last 3 days etc ... take
// inspiration and design from the regular community analytics ... community health, see who has notifications enabled, per creator,
// growth ... custom ranges to view data ... everything has clean design, animations and looks good on desktop and mobile."
//
// ONE PAGE, ONE CLOCK. A scope (every VIP market, or one) and a period (the same presets and custom dates as the main analytics, plus
// the last 3 days) drive Overview, Growth, Creators and Health; Months and Month vs Month are about whole months, so the clock is
// dimmed on them rather than removed (the bar never changes shape). Every number comes from `vip_range_analytics`, which reads the
// videos and their readings themselves, so it is true the moment a video is read - not when a month closes.

const VIP_PERIODS = ['last_3', 'last_7', 'this_week', 'last_week', 'this_month', 'last_month', 'last_30', 'last_90', 'this_year', 'custom']
const PICKER_PERIODS = VIP_PERIODS.map((k) => PERIODS.find((p) => p.key === k))
const WHOLE_MONTHS = new Set(['months', 'compare', 'markets'])

const pctMove = (a, b) => (b > 0 ? Math.round(((a - b) / b) * 100) : null)
const ymd = (d) => format(d, 'yyyy-MM-dd')

/** Daily rows folded into weeks or months when there are too many days to read as bars. */
function fold(daily, mode) {
  if (mode === 'day') return daily.map((r) => ({ ...r, label: shortDay(r.d) }))
  const out = new Map()
  for (const r of daily) {
    const dt = new Date(`${r.d}T12:00:00Z`)
    let key
    if (mode === 'week') { const day = (dt.getUTCDay() + 6) % 7; const mon = new Date(dt.getTime() - day * 864e5); key = mon.toISOString().slice(0, 10) } else key = `${r.d.slice(0, 7)}-01`
    const cur = out.get(key) || { d: key, views: 0, videos: 0, joined: 0, creators: 0, label: mode === 'month' ? new Date(`${key}T12:00:00Z`).toLocaleDateString(undefined, { month: 'short', year: '2-digit', timeZone: 'UTC' }) : shortDay(key) }
    cur.views += r.views; cur.videos += r.videos; cur.joined += r.joined; cur.creators = Math.max(cur.creators, r.creators)
    out.set(key, cur)
  }
  return [...out.values()]
}

export function VipAnalyticsTab({ programme, programmes = [], isAdmin }) {
  const tr = useT()
  const mine = programmes.length ? programmes : [programme]
  const canAll = !!isAdmin && mine.length > 1 && programme.kind !== 'official'
  const [scope, setScope] = useState(canAll ? 'all' : programme.id)
  const all = canAll && scope === 'all'
  const shown = all ? null : (mine.find((p) => p.id === scope) || programme)
  const cur = (shown || mine[0] || programme).currency || 'EUR'
  const [view, setView] = useState('overview')
  const [periodKey, setPeriodKey] = useState('last_30')
  const [custom, setCustom] = useState({ from: '', to: '' })
  const range = useMemo(() => periodRange(periodKey, new Date(), custom), [periodKey, custom])
  const from = range.start ? ymd(range.start) : null
  const to = range.end ? ymd(new Date(range.end.getTime() - 1)) : null

  // The page keeps the last numbers on screen (a little faded) until the next stretch arrives, so nothing jumps; every stretch it has
  // seen is kept, so going back to one is instant, and it asks again every minute and whenever the tab comes back into view.
  const cache = useRef(new Map())
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)
  const [tick, setTick] = useState(0)
  const key = `${all ? 'all' : shown.id}|${from}|${to}`
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 60000)
    const vis = () => { if (document.visibilityState === 'visible') setTick((n) => n + 1) }
    document.addEventListener('visibilitychange', vis)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', vis) }
  }, [])
  useEffect(() => {
    if (!from || !to) return undefined
    let alive = true
    const hit = cache.current.get(key)
    if (hit) { setData(hit); setErr('') } else setLoading(true)
    vipRpc('vip_range_analytics', { p_programme: all ? null : shown.id, p_from: from, p_to: to })
      .then((d) => { cache.current.set(key, d); if (alive) { setData(d); setErr('') } })
      .catch((e) => { if (alive) setErr(e.message || String(e)) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [key, tick]) // eslint-disable-line react-hooks/exhaustive-deps

  const stale = loading && !!data
  const whole = WHOLE_MONTHS.has(view)

  return (
    <div className="space-y-5">
      {/* THE BAR: which view, then the clock. One row on a desktop, two on a phone. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <Segmented shape="tabs" id="vip-analytics-view" value={view} onChange={setView} label={tr('Analytics view')} options={[
          { value: 'overview', label: tr('Overview') },
          { value: 'growth', label: tr('Growth') },
          { value: 'creators', label: tr('Creators') },
          { value: 'health', label: tr('Community health') },
          { value: 'months', label: tr('Months') },
          { value: 'compare', label: tr('Month vs Month') },
          { value: 'markets', label: tr('Markets') },
        ]} />
        <PeriodPicker value={periodKey} from={custom.from} to={custom.to} periods={PICKER_PERIODS} disabled={whole} className="" width="w-44"
          onChange={(k, f, t) => { setPeriodKey(k); if (k === 'custom') setCustom({ from: f, to: t }) }} />
      </div>
      {mine.length > 1 && <VipScopeSwitch programmes={mine} value={all ? 'all' : shown.id} onChange={setScope} allowAll={canAll} />}
      {!whole && range.start && (
        <p className="-mt-1 flex flex-wrap items-center gap-x-2 text-xs text-smoke">
          <span className="font-semibold text-ink">{range.label}</span>
          <span>{from === to ? formatDate(from) : `${formatDate(from)} to ${formatDate(to)}`}</span>
          {range.prev && <span className="text-gray-400">{tr('compared with {x}', { x: range.short })}</span>}
          {loading && <span className="inline-flex items-center gap-1 text-brand"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand" />{tr('Updating')}</span>}
        </p>
      )}

      {err && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{err}</p>}

      {view === 'markets' ? <MarketStandings kind={programme.kind || 'vip'} /> : whole ? <MonthViews view={view} scope={all ? null : shown.id} cur={cur} /> : !data ? (
        <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-card" />)}</div><Skeleton className="h-72 w-full rounded-card" /></div>
      ) : (
        <div key={view} className={cx('transition-opacity duration-200 animate-tab-in', stale && 'opacity-60')}>
          {view === 'overview' && <Overview data={data} cur={cur} range={range} />}
          {view === 'growth' && <Growth data={data} range={range} all={all} />}
          {view === 'creators' && <CreatorsTable data={data} cur={cur} all={all} />}
          {view === 'health' && <Health data={data} />}
        </div>
      )}
    </div>
  )
}

// ----------------------------------------------------------------------------------------------------------------- shared bits
function ChartCard({ title, total, children, className }) {
  return (
    <div className={cx('rounded-card border border-gray-100 bg-white p-4 shadow-card animate-rise sm:p-5', className)}>
      <div className="mb-3 flex items-baseline justify-between gap-3"><p className="text-[13.5px] font-bold text-ink">{title}</p>{total && <p className="text-xs font-semibold text-smoke">{total}</p>}</div>
      <div className="h-64"><ResponsiveContainer>{children}</ResponsiveContainer></div>
    </div>
  )
}
const bucketMode = (days) => (days <= 45 ? 'day' : days <= 200 ? 'week' : 'month')
const axisProps = { tick: axisTick, axisLine: false, tickLine: false }

function PersonLink({ id, name, photo, size = 'sm', sub }) {
  return (
    <Link to={`/profile/${id}`} className="group flex min-w-0 items-center gap-2.5" aria-label={name}>
      <Avatar src={photo} name={name} size={size} className="transition-transform duration-200 group-hover:scale-105" />
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-ink group-hover:text-brand">{name}</span>
        {sub && <span className="block truncate text-[11px] text-smoke">{sub}</span>}
      </span>
    </Link>
  )
}

// ----------------------------------------------------------------------------------------------------------------- overview
function Overview({ data, cur, range }) {
  const tr = useT()
  const t = data.totals
  const p = data.prev
  const vs = range.short
  const rate = t.views > 0 ? (Number(t.pay) / t.views) * 1000 : null
  const prate = p.views > 0 ? (Number(p.pay) / p.views) * 1000 : null
  const series = useMemo(() => fold(data.daily, bucketMode(data.days)), [data])
  const best = data.daily.reduce((a, r) => (r.views > (a?.views || 0) ? r : a), null)
  const maxPlat = Math.max(1, ...data.platforms.map((x) => Number(x.views)))
  const creators = [...data.creators].sort((a, b) => b.views - a.views).filter((c) => c.views > 0).slice(0, 5)
  const lead = Math.max(1, creators[0]?.views || 0)
  const d = (a, b, lowerIsBetter = false) => (range.prev && b > 0 ? { pct: pctMove(a, b), vs, lowerIsBetter } : null)
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard accent label={tr('Views gained')} value={formatViews(t.views)} delta={d(t.views, p.views)} hint={best && best.views > 0 ? tr('best day {d}', { d: shortDay(best.d) }) : null} />
        <StatCard label={tr('Videos posted')} value={nf(t.videos)} delta={d(t.videos, p.videos)} />
        <StatCard label={tr('Creators gaining views')} value={nf(t.creators)} delta={d(t.creators, p.creators)} hint={tr('of {n} VIPs', { n: nf(data.members_now) })} />
        <StatCard label={tr('Views pay')} value={money(t.pay, cur, { cents: false })} delta={d(Number(t.pay), Number(p.pay), true)} hint={tr('at the agreed rates')} />
        <StatCard label={tr('Average rate')} value={rate != null ? perK(rate, cur) : '-'} delta={rate != null && prate != null ? d(rate, prate, true) : null} hint={tr('per 1,000 views')} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title={tr('Views gained each day')} total={tr('{n} in all', { n: formatViews(t.views) })}>
          <ComposedChart data={series} margin={{ top: 8, right: 6, left: -12, bottom: 0 }}>
            <defs><linearGradient id="vipRangeViews" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={CHART.brand} stopOpacity={0.35} /><stop offset="100%" stopColor={CHART.brand} stopOpacity={0.02} /></linearGradient></defs>
            <CartesianGrid vertical={false} stroke={CHART.grid} />
            <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={28} />
            <YAxis {...axisProps} width={48} tickFormatter={(v) => formatViews(v)} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v) => [nf(v), tr('Views')]} cursor={{ stroke: CHART.brand, strokeOpacity: 0.25 }} />
            <Area type="monotone" dataKey="views" stroke={CHART.brand} strokeWidth={2.5} fill="url(#vipRangeViews)" dot={false} activeDot={{ r: 4, fill: CHART.brand }} animationDuration={700} />
          </ComposedChart>
        </ChartCard>
        <ChartCard title={tr('Videos posted, and creators gaining views')}>
          <ComposedChart data={series} margin={{ top: 8, right: 6, left: -12, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={CHART.grid} />
            <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={28} />
            <YAxis {...axisProps} width={36} allowDecimals={false} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v, k) => [nf(v), k === 'videos' ? tr('Videos') : tr('Creators')]} cursor={{ fill: 'rgba(217,68,7,0.05)' }} />
            <Bar dataKey="videos" fill={FILL.light} radius={[6, 6, 0, 0]} maxBarSize={32} animationDuration={700} />
            <Line type="monotone" dataKey="creators" stroke={CHART.ink} strokeWidth={2} dot={{ r: 2.5 }} animationDuration={700} />
          </ComposedChart>
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-card border border-gray-100 bg-white p-4 shadow-card animate-rise sm:p-5">
          <h3 className="mb-3 text-[13.5px] font-bold text-ink">{tr('By platform')}</h3>
          {data.platforms.length === 0 ? <p className="py-6 text-center text-sm text-smoke">{tr('No views gained in these days.')}</p> : (
            <div className="space-y-3">
              {data.platforms.map((x) => (
                <div key={x.platform}>
                  <div className="mb-1 flex items-baseline justify-between text-xs"><span className="font-semibold capitalize text-ink">{x.platform}</span><span className="tabular-nums text-smoke">{tr('{n} videos', { n: x.videos })} · {formatViews(x.views)}</span></div>
                  <div className="h-2 overflow-hidden rounded-full bg-cloud"><div className="brand-drift h-full origin-left animate-bar-grow rounded-full" style={{ width: `${Math.max(4, (Number(x.views) / maxPlat) * 100)}%` }} /></div>
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="rounded-card border border-gray-100 bg-white p-4 shadow-card animate-rise sm:p-5">
          <h3 className="mb-3 text-[13.5px] font-bold text-ink">{tr('Who brought the views')}</h3>
          {creators.length === 0 ? <p className="py-6 text-center text-sm text-smoke">{tr('Nobody has gained views in these days.')}</p> : (
            <ul className="space-y-3">
              {creators.map((c, i) => (
                <li key={c.profile_id} className="flex items-center gap-3">
                  <span className={cx('flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-extrabold tabular-nums', i === 0 ? 'bg-gradient-to-br from-brand to-brand-light text-white' : 'bg-cloud text-smoke')}>{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <PersonLink id={c.profile_id} name={c.name} photo={c.photo} size="xs" />
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-cloud"><div className="h-full rounded-full bg-gradient-to-r from-brand to-brand-light transition-[width] duration-700" style={{ width: `${Math.max(4, (c.views / lead) * 100)}%` }} /></div>
                  </div>
                  <span className="shrink-0 text-sm font-bold tabular-nums text-ink">{formatViews(c.views)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {data.top_videos.length > 0 && (
        <section>
          <h3 className="mb-3 text-[13.5px] font-bold text-ink">{tr('The videos that gained the most')}</h3>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {data.top_videos.map((v, i) => (
              <li key={v.id} className="group relative animate-rise transition-transform duration-300 hoverable:hover:-translate-y-1" style={{ animationDelay: `${i * 45}ms` }}>
                <a href={v.url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-card border border-gray-100 bg-white shadow-card transition-shadow duration-300 hoverable:group-hover:shadow-lift" aria-label={tr('Open on the platform')}>
                  <div className="relative"><VideoThumb url={v.url} platform={v.platform} thumbnailUrl={v.thumb} />
                    <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/80 to-transparent px-2.5 pb-2 pt-7 text-white"><span className="block text-lg font-bold tabular-nums leading-none">{formatViews(v.views)}</span><span className="block text-[10px] font-semibold uppercase tracking-wide text-white/80">{tr('gained')}</span></span>
                  </div>
                  <p className="truncate px-2.5 py-2 text-xs font-semibold text-ink">{v.name}</p>
                </a>
                {/* The quick copy sits over the corner of the cover, outside the link, so pressing it never opens the video. */}
                <CopyLinkChip url={v.url} className="absolute right-2 top-2" />
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="text-xs leading-relaxed text-smoke">{tr('Views gained are counted on the day they are read. A video added after it was posted counts the views it had when it was first read across the days since it went up. Views pay is each creator\'s agreed rate on the views they gained, before bonuses, caps and tiers.')}</p>
    </div>
  )
}

// ----------------------------------------------------------------------------------------------------------------- growth
function Growth({ data, range, all }) {
  const tr = useT()
  const t = data.totals
  const p = data.prev
  const mode = bucketMode(data.days)
  const series = useMemo(() => {
    const folded = fold(data.daily, mode)
    return folded.map((r, i) => ({ ...r, total: data.members_before + folded.slice(0, i + 1).reduce((a, x) => a + x.joined, 0) }))
  }, [data, mode])
  const creators = data.creators
  const active = creators.filter((c) => c.views > 0).length
  const posted = creators.filter((c) => c.videos > 0).length
  const d = (a, b) => (range.prev && b > 0 ? { pct: pctMove(a, b), vs: range.short } : null)
  const perMarket = useMemo(() => {
    const m = new Map()
    for (const c of creators) {
      const x = m.get(c.programme_id) || { id: c.programme_id, name: c.programme, members: 0, active: 0, views: 0, videos: 0, joined: 0, pay: 0, currency: c.currency }
      x.members += 1; x.views += c.views; x.videos += c.videos; x.pay += Number(c.pay)
      if (c.views > 0) x.active += 1
      m.set(c.programme_id, x)
    }
    return [...m.values()].sort((a, b) => b.views - a.views)
  }, [creators])
  const steps = [
    { label: tr('VIPs'), n: creators.length },
    { label: tr('Posted in these days'), n: posted },
    { label: tr('Gained views'), n: active },
  ]
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard accent label={tr('New VIPs')} value={nf(t.joined)} delta={d(t.joined, p.joined)} hint={tr('joined in these days')} />
        <StatCard label={tr('VIPs now')} value={nf(data.members_now)} hint={tr('{n} at the start', { n: nf(data.members_before) })} />
        <StatCard label={tr('Posting')} value={creators.length ? `${Math.round((posted / creators.length) * 100)}%` : '-'} hint={tr('{a} of {b} VIPs posted', { a: posted, b: creators.length })} />
        <StatCard label={tr('Videos each')} value={posted ? (t.videos / posted).toFixed(1) : '-'} hint={tr('per VIP who posted')} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title={tr('New VIPs, and how many there are')} total={tr('{n} joined', { n: nf(t.joined) })}>
          <ComposedChart data={series} margin={{ top: 8, right: 6, left: -12, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={CHART.grid} />
            <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={28} />
            <YAxis yAxisId="l" {...axisProps} width={32} allowDecimals={false} />
            <YAxis yAxisId="r" orientation="right" {...axisProps} width={32} allowDecimals={false} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v, k) => [nf(v), k === 'joined' ? tr('Joined') : tr('VIPs in all')]} cursor={{ fill: 'rgba(217,68,7,0.05)' }} />
            <Bar yAxisId="l" dataKey="joined" fill={FILL.brand} radius={[6, 6, 0, 0]} maxBarSize={34} animationDuration={700} />
            <Line yAxisId="r" type="monotone" dataKey="total" stroke={CHART.ink} strokeWidth={2} dot={{ r: 2.5 }} animationDuration={700} />
          </ComposedChart>
        </ChartCard>
        <section className="rounded-card border border-gray-100 bg-white p-4 shadow-card animate-rise sm:p-5">
          <h3 className="mb-4 text-[13.5px] font-bold text-ink">{tr('From joining to gaining views')}</h3>
          <ol className="space-y-3.5">
            {steps.map((s, i) => (
              <li key={s.label}>
                <div className="mb-1 flex items-baseline justify-between text-sm"><span className="font-semibold text-ink">{s.label}</span><span className="font-bold tabular-nums text-ink">{nf(s.n)}<span className="ml-1.5 text-xs font-medium text-smoke">{steps[0].n ? `${Math.round((s.n / steps[0].n) * 100)}%` : ''}</span></span></div>
                <div className="h-3 overflow-hidden rounded-full bg-cloud"><div className={cx('h-full rounded-full transition-[width] duration-700', i === 0 ? 'bg-gray-300' : 'bg-gradient-to-r from-brand to-brand-light')} style={{ width: `${steps[0].n ? Math.max(3, (s.n / steps[0].n) * 100) : 0}%` }} /></div>
              </li>
            ))}
          </ol>
        </section>
      </div>
      {all && perMarket.length > 1 && (
        <section className="overflow-hidden rounded-card border border-gray-100 bg-white shadow-card animate-rise">
          <div className="border-b border-gray-100 px-4 py-3"><h3 className="text-[13.5px] font-bold text-ink">{tr('Every VIP market side by side')}</h3></div>
          <div className="hidden grid-cols-[minmax(0,1fr)_4.5rem_5rem_5rem_5.5rem_6rem] gap-3 bg-cloud/60 px-4 py-2 text-[10.5px] font-bold uppercase tracking-wide text-gray-400 sm:grid">
            <span>{tr('Market')}</span><span className="text-right">{tr('VIPs')}</span><span className="text-right">{tr('Active')}</span><span className="text-right">{tr('Videos')}</span><span className="text-right">{tr('Views')}</span><span className="text-right">{tr('Views pay')}</span>
          </div>
          <ul className="divide-y divide-gray-50">
            {perMarket.map((m) => (
              <li key={m.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_4.5rem_5rem_5rem_5.5rem_6rem]">
                <span className="truncate text-sm font-bold text-ink">{m.name}</span>
                <span className="text-right text-sm font-bold tabular-nums text-ink sm:hidden">{formatViews(m.views)}</span>
                <span className="hidden text-right text-sm tabular-nums text-smoke sm:block">{m.members}</span>
                <span className="hidden text-right text-sm tabular-nums text-smoke sm:block">{m.active}</span>
                <span className="hidden text-right text-sm tabular-nums text-smoke sm:block">{m.videos}</span>
                <span className="hidden text-right text-sm font-bold tabular-nums text-ink sm:block">{formatViews(m.views)}</span>
                <span className="hidden text-right text-sm tabular-nums text-smoke sm:block">{money(m.pay, m.currency, { cents: false })}</span>
                <span className="col-span-2 text-[11px] text-smoke sm:hidden">{tr('{a} of {b} active', { a: m.active, b: m.members })} · {tr('{n} videos', { n: m.videos })}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

// ----------------------------------------------------------------------------------------------------------------- creators
function CreatorsTable({ data, cur, all }) {
  const tr = useT()
  const [sort, setSort] = useState('views')
  const rows = useMemo(() => {
    const list = data.creators.map((c) => ({ ...c, change: pctMove(c.views, c.prev_views) }))
    return list.sort((a, b) => (sort === 'pay' ? b.pay - a.pay : sort === 'videos' ? b.videos - a.videos : sort === 'recent' ? new Date(b.last_post || 0) - new Date(a.last_post || 0) : b.views - a.views))
  }, [data, sort])
  const lead = Math.max(1, ...rows.map((r) => r.views))
  const totalViews = rows.reduce((a, r) => a + r.views, 0)
  return (
    <section className="overflow-hidden rounded-card border border-gray-100 bg-white shadow-card animate-rise">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
        <p className="text-[13.5px] font-bold text-ink">{tr('Every VIP, over these days')}</p>
        <Segmented size="sm" value={sort} onChange={setSort} label={tr('Sort by')} options={[
          { value: 'views', label: tr('Views') }, { value: 'pay', label: tr('Views pay') }, { value: 'videos', label: tr('Videos') }, { value: 'recent', label: tr('Last post') },
        ]} />
      </div>
      <div className="hidden grid-cols-[2rem_minmax(0,1fr)_6.5rem_4rem_5.5rem_6rem] gap-3 bg-cloud/60 px-4 py-2 text-[10.5px] font-bold uppercase tracking-wide text-gray-400 sm:grid">
        <span>#</span><span>{tr('Creator')}</span><span className="text-right">{tr('Views')}</span><span className="text-right">{tr('Videos')}</span><span className="text-right">{tr('Views pay')}</span><span className="text-right">{tr('Last post')}</span>
      </div>
      {rows.length === 0 ? <p className="px-4 py-10 text-center text-sm text-smoke">{tr('No VIPs here yet.')}</p> : (
        <ul className="divide-y divide-gray-50">
          {rows.map((r, i) => (
            <li key={r.profile_id} className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-3 animate-rise sm:grid-cols-[2rem_minmax(0,1fr)_6.5rem_4rem_5.5rem_6rem]" style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}>
              <span className={cx('flex h-7 w-7 items-center justify-center rounded-full text-xs font-extrabold tabular-nums', i === 0 && r.views > 0 ? 'bg-gradient-to-br from-brand to-brand-light text-white' : 'bg-cloud text-smoke')}>{i + 1}</span>
              <div className="min-w-0">
                <PersonLink id={r.profile_id} name={r.name} photo={r.photo} sub={all ? r.programme : r.status === 'paused' ? tr('Paused') : null} />
                <span className="mt-1.5 block h-1 max-w-[12rem] overflow-hidden rounded-full bg-gray-100"><span className="block h-full rounded-full bg-gradient-to-r from-brand to-brand-light" style={{ width: `${r.views > 0 ? Math.max(3, (r.views / lead) * 100) : 0}%` }} /></span>
              </div>
              <div className="text-right sm:hidden">
                <p className="text-sm font-bold tabular-nums text-ink">{formatViews(r.views)}</p>
                <p className="text-[11px] text-smoke">{tr('{n} videos', { n: r.videos })} · {money(r.pay, r.currency || cur, { cents: false })}</p>
              </div>
              <div className="hidden text-right sm:block">
                <p className="text-sm font-bold tabular-nums text-ink">{formatViews(r.views)}</p>
                <p className="text-[11px] tabular-nums text-smoke">{totalViews ? `${Math.round((r.views / totalViews) * 100)}%` : ''}{r.change != null && r.change !== 0 && <span className={cx('ml-1 font-bold', r.change > 0 ? 'text-emerald-600' : 'text-red-500')}>{r.change > 0 ? '+' : ''}{r.change}%</span>}</p>
              </div>
              <span className="hidden text-right text-sm tabular-nums text-smoke sm:block">{r.videos}</span>
              <span className="hidden text-right text-sm tabular-nums text-ink sm:block">{money(r.pay, r.currency || cur, { cents: false })}</span>
              <span className="hidden text-right text-xs text-smoke sm:block">{r.last_post ? formatDate(r.last_post) : tr('Never')}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// ----------------------------------------------------------------------------------------------------------------- community health
function Ring({ pct, label, hint, tone = 'brand' }) {
  const r = 26
  const c = 2 * Math.PI * r
  return (
    <div className="flex items-center gap-3.5 rounded-card border border-gray-100 bg-white p-4 shadow-card animate-rise">
      <svg viewBox="0 0 64 64" className="h-16 w-16 shrink-0 -rotate-90" aria-hidden>
        <circle cx="32" cy="32" r={r} fill="none" stroke="#F1F1F2" strokeWidth="7" />
        <circle cx="32" cy="32" r={r} fill="none" stroke={tone === 'brand' ? CHART.brand : CHART.ink} strokeWidth="7" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(100, Math.max(0, pct)) / 100)} style={{ transition: 'stroke-dashoffset 800ms ease-out' }} />
      </svg>
      <div className="min-w-0">
        <p className="text-2xl font-bold tabular-nums leading-none text-ink">{Math.round(pct)}%</p>
        <p className="mt-1 text-[13px] font-semibold text-ink">{label}</p>
        <p className="text-[11px] text-smoke">{hint}</p>
      </div>
    </div>
  )
}

function Chip({ ok, children, warn }) {
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', ok ? 'bg-emerald-50 text-emerald-700' : warn ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-600')}><Icon name={ok ? 'check' : 'close'} className="h-3 w-3" strokeWidth={2.6} />{children}</span>
}

function Health({ data }) {
  const tr = useT()
  const list = data.creators
  const n = list.length
  const [filter, setFilter] = useState('all')
  const [now] = useState(() => Date.now())
  const day = 864e5
  const st = (c) => ({
    push: c.push_devices > 0,
    chat: c.chat_push_on,
    pay: !!c.payment_ready,
    terms: !!c.terms_ok,
    seen: c.last_seen_at && now - new Date(c.last_seen_at) < 7 * day,
    posting: c.last_post && now - new Date(c.last_post) < 14 * day,
  })
  const count = (f) => list.filter((c) => f(st(c))).length
  const pct = (k) => (n ? (count((s) => s[k]) / n) * 100 : 0)
  const filters = [
    ['all', tr('Everyone'), () => true],
    ['nopush', tr('No notifications'), (c) => !st(c).push],
    ['nopay', tr('No payment details'), (c) => !st(c).pay],
    ['noterms', tr('Terms not accepted'), (c) => !st(c).terms],
    ['quiet', tr('Not posting for 14 days'), (c) => !st(c).posting],
    ['away', tr('Not seen for 7 days'), (c) => !st(c).seen],
  ]
  const f = filters.find((x) => x[0] === filter) || filters[0]
  const shown = list.filter(f[2]).sort((a, b) => a.name.localeCompare(b.name))
  const score = (c) => Object.values(st(c)).filter(Boolean).length
  return (
    <div className="space-y-5">
      {n === 0 ? <p className="rounded-card border border-dashed border-gray-200 px-6 py-12 text-center text-sm text-smoke">{tr('No VIPs here yet.')}</p> : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Ring pct={pct('push')} label={tr('Notifications on')} hint={tr('{a} of {b} have push on a device', { a: count((s) => s.push), b: n })} />
            <Ring pct={pct('pay')} label={tr('Payment details')} hint={tr('{a} of {b} can be paid', { a: count((s) => s.pay), b: n })} />
            <Ring pct={pct('terms')} label={tr('Accepted the terms')} hint={tr('{a} of {b}', { a: count((s) => s.terms), b: n })} />
            <Ring pct={pct('posting')} label={tr('Posted in 14 days')} hint={tr('{a} of {b}', { a: count((s) => s.posting), b: n })} tone="ink" />
            <Ring pct={pct('seen')} label={tr('Seen in 7 days')} hint={tr('{a} of {b} opened the app', { a: count((s) => s.seen), b: n })} tone="ink" />
            <Ring pct={pct('chat')} label={tr('Chat alerts on')} hint={tr('{a} of {b}', { a: count((s) => s.chat), b: n })} tone="ink" />
          </div>
          <section className="overflow-hidden rounded-card border border-gray-100 bg-white shadow-card animate-rise">
            <div className="border-b border-gray-100 px-4 py-3">
              <p className="mb-2.5 text-[13.5px] font-bold text-ink">{tr('Each creator')}</p>
              <div className="scrollbar-none -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
                {filters.map(([k, label, fn]) => (
                  <button key={k} type="button" onClick={() => setFilter(k)} aria-pressed={filter === k}
                    className={cx('shrink-0 rounded-full border px-3 py-1 text-xs font-semibold transition-all duration-200', filter === k ? 'border-brand bg-brand text-white shadow-card' : 'border-gray-200 bg-white text-ink hoverable:hover:-translate-y-px hoverable:hover:border-brand')}>
                    {label} <span className={cx('tabular-nums', filter === k ? 'text-white/80' : 'text-smoke')}>{list.filter(fn).length}</span>
                  </button>
                ))}
              </div>
            </div>
            {shown.length === 0 ? <p className="px-4 py-10 text-center text-sm text-smoke">{tr('Nobody here. Good news.')}</p> : (
              <ul className="divide-y divide-gray-50">
                {shown.map((c, i) => {
                  const s = st(c)
                  return (
                    <li key={c.profile_id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 animate-rise" style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}>
                      <div className="min-w-[11rem] flex-1"><PersonLink id={c.profile_id} name={c.name} photo={c.photo} sub={c.last_seen_at ? tr('Seen {d}', { d: formatDate(c.last_seen_at) }) : tr('Never seen')} /></div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Chip ok={s.push}>{s.push ? (c.push_devices === 1 ? tr('Push on') : tr('Push on, {n} devices', { n: c.push_devices })) : tr('No push')}</Chip>
                        {s.push && !s.chat && <Chip ok={false} warn>{tr('Chat alerts off')}</Chip>}
                        <Chip ok={s.pay}>{s.pay ? tr('Can be paid') : tr('No payment details')}</Chip>
                        <Chip ok={s.terms}>{s.terms ? tr('Terms accepted') : tr('Terms not accepted')}</Chip>
                        <Chip ok={!!s.posting} warn={!!c.last_post}>{c.last_post ? tr('Posted {d}', { d: formatDate(c.last_post) }) : tr('Never posted')}</Chip>
                      </div>
                      <span className="w-12 shrink-0 text-right text-xs font-bold tabular-nums text-smoke" title={tr('Health score')}>{score(c)}/6</span>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  )
}

// ----------------------------------------------------------------------------------------------------------------- months
function MonthViews({ view, scope, cur }) {
  const tr = useT()
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    let alive = true
    setData(null)
    const load = () => vipRpc('vip_analytics', { p_programme: scope }).then((d) => { if (alive) { setData(d); setErr('') } }).catch((e) => { if (alive) setErr(e.message || String(e)) })
    load()
    const id = setInterval(load, 60000)
    return () => { alive = false; clearInterval(id) }
  }, [scope])
  const series = useMemo(() => (data?.months || []).map((m) => ({
    key: `${m.year}-${m.month}`, year: m.year, month: m.month, live: !!m.live,
    label: monthLabel(m.year, m.month, { short: true }), views: Number(m.views) || 0, cost: Number(m.cost) || 0,
    cpm: m.cpm == null ? null : Number(m.cpm), rate: m.rate == null ? null : Number(m.rate), members: Number(m.members) || 0, videos: Number(m.videos) || 0,
    base: Number(m.base) || 0, bonus: Number(m.bonus) || 0, fresh: Number(m.new_members) || 0, top: m.top || null,
  })), [data])
  if (err) return <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{err}</p>
  if (!data) return <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-card" />)}</div><Skeleton className="h-72 w-full rounded-card" /></div>
  if (series.length === 0) return <p className="rounded-card border border-dashed border-gray-200 px-6 py-12 text-center text-sm text-smoke">{tr('Nothing to chart yet. The first month appears once a VIP posts.')}</p>
  return <div key={view} className="animate-tab-in">{view === 'months' ? <MonthCharts series={series} data={data} cur={cur} /> : <MonthCompare series={series} cur={cur} />}</div>
}

function MonthCharts({ series, data, cur }) {
  const tr = useT()
  const last = series[series.length - 1]
  const prev = series[series.length - 2]
  const prevLabel = prev ? monthLabel(prev.year, prev.month) : null
  const d = (a, b, lowerIsBetter = false) => (prev && b > 0 ? { pct: pctMove(a, b), vs: prevLabel, lowerIsBetter } : null)
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard accent label={tr('Views, {m}', { m: monthLabel(last.year, last.month, { short: true }) })} value={formatViews(last.views)} delta={d(last.views, prev?.views)} hint={last.live ? tr('so far this month') : null} />
        <StatCard label={tr('Paid, {m}', { m: monthLabel(last.year, last.month, { short: true }) })} value={money(last.cost, cur, { cents: false })} delta={d(last.cost, prev?.cost, true)} hint={last.live ? tr('views pay so far, bonuses at month end') : null} />
        <StatCard label={tr('Views pay per 1,000')} value={last.rate != null ? perK(last.rate, cur) : '-'} delta={last.rate != null && prev?.rate ? d(last.rate, prev.rate, true) : null} hint={tr('the rate before bonuses')} />
        <StatCard label={tr('All-in per 1,000')} value={last.cpm != null ? perK(last.cpm, cur) : '-'} delta={last.cpm != null && prev?.cpm ? d(last.cpm, prev.cpm, true) : null} hint={tr('with bonuses and fees')} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title={tr('Views counted, month by month')} total={tr('{n} in all', { n: formatViews(series.reduce((a, m) => a + m.views, 0)) })}>
          <ComposedChart data={series} margin={{ top: 8, right: 6, left: -10, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={CHART.grid} />
            <XAxis dataKey="label" {...axisProps} />
            <YAxis {...axisProps} width={52} tickFormatter={(v) => formatViews(v)} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v) => [nf(v), tr('Views')]} cursor={{ fill: 'rgba(217,68,7,0.05)' }} />
            <Bar dataKey="views" fill={FILL.brand} radius={[8, 8, 0, 0]} maxBarSize={44} animationDuration={800} />
          </ComposedChart>
        </ChartCard>
        <ChartCard title={tr('What it cost, and the cost per 1,000 views')} total={tr('{a} in all', { a: money(series.reduce((a, m) => a + m.cost, 0), cur, { cents: false }) })}>
          <ComposedChart data={series} margin={{ top: 8, right: 6, left: -10, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={CHART.grid} />
            <XAxis dataKey="label" {...axisProps} />
            <YAxis yAxisId="l" {...axisProps} width={52} tickFormatter={(v) => money(v, cur, { cents: false })} />
            <YAxis yAxisId="r" orientation="right" {...axisProps} width={44} tickFormatter={(v) => Number(v).toFixed(2)} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v, k) => [k === 'cost' ? money(v, cur) : perK(v, cur), k === 'cost' ? tr('Cost') : k === 'rate' ? tr('Views pay per 1,000') : tr('All-in per 1,000')]} cursor={{ fill: 'rgba(217,68,7,0.05)' }} />
            <Bar yAxisId="l" dataKey="cost" fill={FILL.light} radius={[8, 8, 0, 0]} maxBarSize={44} animationDuration={800} />
            <Line yAxisId="r" type="monotone" dataKey="rate" stroke={CHART.brand} strokeWidth={2.5} dot={{ r: 3.5, fill: '#fff', stroke: CHART.brand, strokeWidth: 2 }} activeDot={{ r: 5 }} animationDuration={800} connectNulls />
            <Line yAxisId="r" type="monotone" dataKey="cpm" stroke={CHART.ink} strokeWidth={2} strokeDasharray="4 3" dot={false} animationDuration={800} connectNulls />
          </ComposedChart>
        </ChartCard>
      </div>
      <ChartCard title={tr('VIPs and videos, month by month')}>
        <ComposedChart data={series} margin={{ top: 8, right: 6, left: -10, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={CHART.grid} />
          <XAxis dataKey="label" {...axisProps} />
          <YAxis {...axisProps} width={40} allowDecimals={false} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v, k) => [nf(v), k === 'videos' ? tr('Videos') : tr('VIPs')]} cursor={{ fill: 'rgba(217,68,7,0.05)' }} />
          <Bar dataKey="videos" fill={FILL.pale} radius={[8, 8, 0, 0]} maxBarSize={44} animationDuration={800} />
          <Line type="monotone" dataKey="members" stroke={CHART.ink} strokeWidth={2} dot={{ r: 3 }} animationDuration={800} />
        </ComposedChart>
      </ChartCard>
      <p className="text-xs leading-relaxed text-smoke">{tr('The month still running is worked out live from the videos, so it is never empty while you wait for it to close. Bonuses are added when the month closes. The solid line is the views rate before bonuses; the dashed line is everything paid per 1,000 views.')}</p>
      <TopPaid rows={data.top || []} cur={cur} />
    </div>
  )
}

function TopPaid({ rows, cur }) {
  const tr = useT()
  if (!rows.length) return null
  return (
    <section className="overflow-hidden rounded-card border border-gray-100 bg-white shadow-card">
      <div className="border-b border-gray-100 px-4 py-3"><h3 className="text-[13.5px] font-bold text-ink">{tr('What each creator has cost, all time')}</h3></div>
      <ul className="divide-y divide-gray-50">
        {rows.slice(0, 12).map((t) => {
          const v = Number(t.views) || 0
          const cost = Number(t.earned) || 0
          return (
            <li key={t.profile_id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1"><PersonLink id={t.profile_id} name={t.name} photo={t.photo} sub={tr('{n} videos', { n: nf(t.videos) })} /></div>
              <div className="text-right"><p className="text-sm font-bold tabular-nums text-ink">{formatViews(v)}</p><p className="text-[11px] tabular-nums text-smoke">{money(cost, cur, { cents: false })}{v > 0 ? ` · ${perK((cost / v) * 1000, cur)}` : ''}</p></div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

// ANY TWO MONTHS, SIDE BY SIDE (redrawn 4 Oct 2026). Two month cards on top (what each cost and brought in, and who led), then every
// figure as a pair of bars you can compare by eye, with how it moved.
function MonthCompare({ series, cur }) {
  const tr = useT()
  const opts = series.map((m) => ({ value: m.key, label: monthLabel(m.year, m.month) })).reverse()
  const [a, setA] = useState(series[series.length - 1]?.key)
  const [b, setB] = useState(series[series.length - 2]?.key || series[series.length - 1]?.key)
  const A = series.find((m) => m.key === a)
  const B = series.find((m) => m.key === b)
  if (!A || !B) return null
  const per = (n, d) => (d ? n / d : 0)
  const rows = [
    { label: tr('Views counted'), a: A.views, b: B.views, f: nf },
    { label: tr('Total paid'), a: A.cost, b: B.cost, f: (n) => money(n, cur, { cents: false }), low: true },
    { label: tr('Views pay'), a: A.base, b: B.base, f: (n) => money(n, cur, { cents: false }), low: true },
    { label: tr('Bonuses'), a: A.bonus, b: B.bonus, f: (n) => money(n, cur, { cents: false }), low: true },
    { label: tr('Views pay per 1,000'), a: A.rate ?? 0, b: B.rate ?? 0, f: (n) => perK(n, cur), low: true },
    { label: tr('All-in per 1,000'), a: A.cpm ?? 0, b: B.cpm ?? 0, f: (n) => perK(n, cur), low: true },
    { label: tr('Active VIPs'), a: A.members, b: B.members, f: nf },
    { label: tr('New VIPs'), a: A.fresh, b: B.fresh, f: nf },
    { label: tr('Videos'), a: A.videos, b: B.videos, f: nf },
    { label: tr('Views per VIP'), a: per(A.views, A.members), b: per(B.views, B.members), f: (n) => nf(Math.round(n)) },
    { label: tr('Views per video'), a: per(A.views, A.videos), b: per(B.views, B.videos), f: (n) => nf(Math.round(n)) },
    { label: tr('Cost per VIP'), a: per(A.cost, A.members), b: per(B.cost, B.members), f: (n) => money(n, cur, { cents: false }), low: true },
  ]
  const head = (M, first) => (
    <div className={cx('rounded-card p-4 shadow-card', first ? 'brand-drift text-white' : 'border border-gray-100 bg-white')}>
      <p className={cx('flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide', first ? 'text-white/85' : 'text-gray-400')}>{monthLabel(M.year, M.month)}{M.live && <span className={cx('rounded-full px-2 py-0.5 text-[9px]', first ? 'bg-white/20 text-white' : 'bg-brand-tint text-brand')}>{tr('so far')}</span>}</p>
      <p className={cx('mt-1 text-3xl font-bold tabular-nums', first ? 'text-white' : 'text-ink')}>{formatViews(M.views)}<span className={cx('ml-1.5 text-sm font-semibold', first ? 'text-white/80' : 'text-smoke')}>{tr('views')}</span></p>
      <p className={cx('mt-0.5 text-sm', first ? 'text-white/90' : 'text-smoke')}>{tr('{a} paid', { a: money(M.cost, cur, { cents: false }) })}{M.cpm != null ? ` · ${perK(M.cpm, cur)}` : ''}</p>
      {M.top && Number(M.top.views) > 0 && <p className={cx('mt-2 flex items-center gap-1.5 text-xs font-semibold', first ? 'text-white' : 'text-ink')}><Icon name="trophy" className={cx('h-3.5 w-3.5', first ? 'text-white' : 'text-brand')} />{tr('Led by {n}, {v} views', { n: M.top.name, v: formatViews(M.top.views) })}</p>}
    </div>
  )
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select variant="chip" value={a} onChange={setA} options={opts} ariaLabel={tr('Month')} search={false} className="w-44" />
        <span className="text-xs font-bold uppercase tracking-wide text-gray-400">{tr('against')}</span>
        <Select variant="chip" value={b} onChange={setB} options={opts} ariaLabel={tr('Month to compare with')} search={false} className="w-44" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">{head(A, true)}{head(B, false)}</div>
      <section className="overflow-hidden rounded-card border border-gray-100 bg-white shadow-card">
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 bg-cloud/60 px-4 py-2.5 text-[10.5px] font-bold uppercase tracking-wide text-gray-400">
          <span>{tr('Figure')}</span>
          <span className="flex items-center gap-4">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-brand" />{monthLabel(A.year, A.month, { short: true })}</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-gray-300" />{monthLabel(B.year, B.month, { short: true })}</span>
          </span>
        </div>
        <ul className="divide-y divide-gray-50">
          {rows.map((r) => {
            const pct = pctMove(r.a, r.b)
            const top = Math.max(r.a, r.b, 1e-9)
            const good = pct == null || pct === 0 ? null : (pct > 0) !== !!r.low
            return (
              <li key={r.label} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-ink">{r.label}</span>
                  {pct == null ? <span className="text-xs text-gray-300">-</span> : <span className={cx('inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums', good == null ? 'bg-cloud text-smoke' : good ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600')}>{pct > 0 ? '+' : ''}{pct}%</span>}
                </div>
                <div className="mt-2 space-y-1.5">
                  {[[r.a, 'bg-gradient-to-r from-brand to-brand-light', 'text-ink font-bold'], [r.b, 'bg-gray-300', 'text-smoke']].map(([v, bar, text], i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-cloud"><div className={cx('h-full rounded-full transition-[width] duration-700 ease-out', bar)} style={{ width: `${v > 0 ? Math.max(2, (v / top) * 100) : 0}%` }} /></div>
                      <span className={cx('w-24 shrink-0 text-right text-sm tabular-nums', text)}>{r.f(v)}</span>
                    </div>
                  ))}
                </div>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
