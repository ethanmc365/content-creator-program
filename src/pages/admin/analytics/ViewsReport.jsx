import { useEffect, useMemo, useRef, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { format } from 'date-fns'
import { Avatar, Skeleton } from '../../../components/ui'
import MeetingDeck from './MeetingDeck'
import VideoThumb from '../../../components/VideoThumb'
import Icon from '../../../components/Icon'
import { CountUp } from '../../../components/network/Motion'
import { CHART, axisTick, tooltipStyle } from '../../../components/charts/chartTheme'
import { PERIODS } from '../../../lib/analyticsPeriod'
import { copyToClipboard } from '../../../lib/clipboard'
import { toastSuccess } from '../../../lib/toast'
import { notice } from '../../../lib/confirm'
import { compact, foldWeeks, pctChange, rangeLabel, snapshotText, viewsFor } from '../../../lib/weeklySnapshot'
import { cx, downloadCsv, formatViews } from '../../../lib/utils'
import { useT } from '../../../lib/i18n'
import { teamApi } from '../../../api/team'

// VIEWS GAINED, ANY DAYS, ONE HALF OR BOTH - AND THE WEEKLY SNAPSHOT.
//
// And, for the weekly meeting with the country managers: "a weekly snapshot... and an SVG that I can share on the Meet."
//
// Everything is `admin_views_gained`: views GAINED inside the dates (not lifetime totals), community and VIP side by side. It is read
// when the dates or the Refresh button change and at no other time - no polling - so leaving the tab open costs the database nothing.
// What the picture and the file are called, so a month is not handed round as a "weekly" snapshot.
const SNAP_TITLE = { last_7: 'Weekly snapshot', this_week: 'Weekly snapshot', last_week: 'Weekly snapshot', this_month: 'Monthly snapshot', last_month: 'Monthly snapshot' }
const longDay = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const ymd = (d) => format(d, 'yyyy-MM-dd')

export default function ViewsReport({ market = '', marketName = null, allMarkets = [], periodKey = 'last_7', range, scope = 'both' }) {
  const tr = useT()
  const from = range?.start ? ymd(range.start) : null
  // `end` is half-open and "now" for a running period, so the last whole day is the one before it - except for a running period,
  // where today counts too.
  const to = range?.end ? ymd(new Date(range.end.getTime() - 1)) : null

  const cache = useRef(new Map())
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)
  const [tick, setTick] = useState(0)
  // Which period the numbers on screen belong to. The buttons change at once; the numbers follow when they land, and the
  // heading must name the numbers, not the button (it said "This month" over last week's dates while loading).
  const [shownKey, setShownKey] = useState(periodKey)
  const key = `${from}|${to}|${market}`
  useEffect(() => {
    if (!from || !to) return undefined
    let alive = true
    const hit = cache.current.get(key)
    const pk = periodKey
    if (hit && tick === 0) { setData(hit); setShownKey(pk); setErr('') } else setLoading(true)
    teamApi.adminViewsGained({ p_from: from, p_to: to, p_market: market || null }).then(({ data: d, error }) => {
      if (!alive) return
      if (error) { setErr(error.message); setLoading(false); return }
      cache.current.set(key, d); setData(d); setShownKey(pk); setErr(''); setLoading(false)
    })
    return () => { alive = false }
  }, [key, tick]) // eslint-disable-line react-hooks/exhaustive-deps

  const stale = loading && !!data
  const t = data?.totals
  const prev = data?.prev
  const now = t ? viewsFor(t, scope) : 0
  const before = prev ? viewsFor(prev, scope) : 0
  const move = pctChange(now, before)
  const vipOff = data && data.vip_visible === false
  const weekly = (data?.days || 0) > 21
  const series = useMemo(() => {
    if (!data) return []
    const rows = weekly ? foldWeeks(data.daily) : data.daily
    return rows.map((r) => ({
      label: weekly ? `${rangeLabel(r.d, r.d)}` : new Date(`${r.d}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', timeZone: 'UTC' }),
      community: scope === 'vip' ? 0 : r.community,
      vip: scope === 'community' ? 0 : r.vip,
    }))
  }, [data, weekly, scope])

  const markets = (data?.markets || []).filter((m) => viewsFor(m, scope) > 0 || m.videos > 0 || m.new_members > 0)
  const topMarket = Math.max(1, ...markets.map((m) => viewsFor(m, scope)))

  const topVideos = (data?.top_videos || []).filter((v) => scope === 'both' || (scope === 'vip') === !!v.vip)
  const topCreators = (data?.top_creators || []).filter((c) => scope === 'both' || (scope === 'vip') === !!c.vip).slice(0, 8)
  const scopeLabel = scope === 'community' ? tr('Community') : scope === 'vip' ? tr('VIP creators') : tr('Community + VIP')

  async function copyText() {
    const ok = await copyToClipboard(snapshotText(data, scope))
    if (ok) toastSuccess(tr('Copied. Paste it into the chat or an email.')); else notice(tr('Could not copy. Try again.'))
  }
  const snapTitle = tr(SNAP_TITLE[shownKey] || 'Snapshot')
  const periodName = shownKey === 'custom' ? tr('Custom dates') : tr(PERIODS.find((p) => p.key === shownKey)?.label || '')

  // THE NUMBERS AS A SPREADSHEET: every day (or week), every market and the videos that gained most, one file.
  function downloadData() {
    if (!data) return
    const rows = [
      ...(weekly ? foldWeeks(data.daily) : data.daily).map((r) => ({
        section: weekly ? 'Week starting' : 'Day', name: r.d,
        views: viewsFor(r, scope), community: scope === 'vip' ? '' : r.community, vip: scope === 'community' ? '' : r.vip,
        videos: '', new_creators: '', active_creators: '',
      })),
      ...(data.markets || []).map((m) => ({
        section: 'Market', name: m.name, views: viewsFor(m, scope), community: scope === 'vip' ? '' : m.community,
        vip: scope === 'community' ? '' : m.vip, videos: m.videos, new_creators: m.new_members, active_creators: m.active_creators,
      })),
      ...(data.top_videos || []).filter((v) => scope === 'both' || (scope === 'vip') === v.vip).map((v) => ({
        section: 'Top video', name: `${v.name}${v.vip ? ' (VIP)' : ''} ${v.url}`, views: v.views, community: '', vip: '',
        videos: '', new_creators: '', active_creators: '',
      })),
      { section: 'Total', name: rangeLabel(data.from, data.to), views: now, community: scope === 'vip' ? '' : t.community,
        vip: scope === 'community' ? '' : t.vip, videos: (t.videos || 0) + (scope === 'community' ? 0 : t.vip_videos || 0),
        new_creators: t.new_members || 0, active_creators: t.active_creators || 0 },
    ]
    downloadCsv(`tryp-views-${shownKey}-${data.from}-to-${data.to}.csv`, rows, [
      { key: 'section', label: 'Row' }, { key: 'name', label: 'Day / market / video' }, { key: 'views', label: 'Views gained' },
      { key: 'community', label: 'Community' }, { key: 'vip', label: 'VIP' }, { key: 'videos', label: 'Videos' },
      { key: 'new_creators', label: 'New creators' }, { key: 'active_creators', label: 'Creators gaining views' },
    ])
  }



  return (
    <div className="space-y-5">
      {/* THE ACTIONS. The dates, the market and which views come from the page's own bar above (14 Oct 2026). */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-smoke">{marketName ? tr('{m} only. Pick Worldwide above for every market.', { m: marketName }) : tr('Every market. Pick one above for its own numbers and slides.')}</p>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => setTick((n) => n + 1)} disabled={loading} aria-label={tr('Refresh')} title={tr('Read it again')} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white text-smoke transition-all hoverable:hover:text-brand disabled:opacity-50">
            <Icon name="refresh" className={cx('h-4 w-4', loading && 'animate-spin')} />
          </button>
          <button type="button" disabled={!data} onClick={downloadData} className="btn-secondary !py-1.5 text-xs disabled:opacity-40"><Icon name="download" className="h-3.5 w-3.5" />{tr('Data (CSV)')}</button>
          <button type="button" disabled={!data} onClick={copyText} className="btn-secondary !py-1.5 text-xs disabled:opacity-40"><Icon name="copy" className="h-3.5 w-3.5" />{tr('Copy as text')}</button>
        </div>
      </div>

      {err && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{err}</p>}
      {!data && !err && <div className="space-y-4"><Skeleton className="h-28 w-full rounded-card" /><Skeleton className="h-64 w-full rounded-card" /></div>}

      {data && (
        <div className={cx('space-y-5 transition-opacity duration-300', stale && 'opacity-60')}>
          {/* WHICH DAYS THESE ARE, SAID IN FULL, so "This week" on a Sunday and "Last 7 days" never look like the same thing. */}
          <div key={`${data.from}|${data.to}`} className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1 animate-tab-in">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand">{periodName}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-lg font-bold text-ink">
                <Icon name="calendar" className="h-4 w-4 text-brand" />
                {data.from === data.to ? longDay(data.from) : `${longDay(data.from)} to ${longDay(data.to)}`}
              </p>
            </div>
            <p className="text-xs text-smoke">{tr('{n} days', { n: data.days })} · {tr('Views gained inside these dates, not lifetime totals.')}</p>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="animate-rise rounded-card border border-brand/20 bg-white p-4 shadow-card">
              <p className="text-sm font-medium text-smoke">{scopeLabel}</p>
              <p className="mt-2 text-3xl font-bold tracking-tight text-brand"><CountUp value={now} format={formatViews} /></p>
              <p className={cx('mt-1.5 text-[11px] font-semibold', move == null ? 'text-gray-400' : move >= 0 ? 'text-green-700' : 'text-red-600')}>
                {move == null ? tr('Nothing to compare with') : `${move >= 0 ? '▲' : '▼'} ${Math.abs(move)}% ${tr('on the {n} days before', { n: data.days })}`}
              </p>
            </div>
            <Tile label={tr('Videos posted')} value={(t.videos || 0) + (scope === 'community' ? 0 : t.vip_videos || 0)} sub={`${prev ? (prev.videos || 0) + (scope === 'community' ? 0 : prev.vip_videos || 0) : 0} ${tr('before')}`} delay={60} />
            <Tile label={tr('New creators')} value={t.new_members || 0} sub={`${prev?.new_members ?? 0} ${tr('before')}`} delay={120} />
            <Tile label={tr('Creators gaining views')} value={t.active_creators || 0} sub={scope === 'both' ? `${formatViews(t.community)} + ${formatViews(t.vip)}` : ' '} delay={180} />
          </div>
          {vipOff && scope !== 'community' && <p className="rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-800">{tr('You do not have VIP access, so the VIP numbers are left out.')}</p>}

          <section className="animate-rise rounded-card border border-gray-100 bg-white p-4 shadow-card sm:p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-[15px] font-bold text-ink">{weekly ? tr('Views gained per week') : tr('Views gained per day')}</h3>
              <span className="flex items-center gap-3 text-xs text-smoke">
                {scope !== 'vip' && <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: CHART.brand }} />{tr('Community')}</span>}
                {scope !== 'community' && <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: CHART.ink }} />{tr('VIP')}</span>}
              </span>
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={series} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={CHART.grid} />
                  <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis tick={axisTick} tickLine={false} axisLine={false} tickFormatter={(v) => compact(v)} width={44} />
                  <Tooltip cursor={{ fill: 'rgba(217,68,7,0.06)' }} contentStyle={tooltipStyle} formatter={(v, n) => [formatViews(v), n === 'community' ? tr('Community') : tr('VIP')]} />
                  {scope !== 'vip' && <Bar dataKey="community" stackId="v" fill={CHART.brand} radius={scope === 'community' ? [6, 6, 0, 0] : [0, 0, 0, 0]} animationDuration={700} />}
                  {scope !== 'community' && <Bar dataKey="vip" stackId="v" fill={CHART.ink} radius={[6, 6, 0, 0]} animationDuration={700} />}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="animate-rise overflow-hidden rounded-card border border-gray-100 bg-white shadow-card">
            <h3 className="px-4 pt-4 text-[15px] font-bold text-ink sm:px-5">{tr('By market')}</h3>
            <p className="px-4 text-xs text-smoke sm:px-5">{tr('A creator counts for the market they belong to; a VIP counts for their VIP market.')}</p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[34rem] text-left text-sm">
                <thead><tr className="border-y border-gray-100 text-[10.5px] font-bold uppercase tracking-wide text-gray-400">
                  <th className="px-4 py-2 sm:px-5">{tr('Market')}</th><th className="px-2 py-2">{tr('Views gained')}</th><th className="px-2 py-2">{tr('Change')}</th><th className="px-2 py-2">{tr('Videos')}</th><th className="px-2 py-2">{tr('New')}</th><th className="px-4 py-2 sm:px-5">{tr('Active')}</th>
                </tr></thead>
                <tbody>
                  {markets.length === 0 && <tr><td colSpan={6} className="px-5 py-6 text-center text-smoke">{tr('Nothing in these dates.')}</td></tr>}
                  {markets.map((m) => {
                    const v = viewsFor(m, scope)
                    const mv = scope === 'both' ? pctChange(v, m.prev_combined) : null
                    return (
                      <tr key={m.id} className="border-b border-gray-50 last:border-0">
                        <td className="px-4 py-2.5 font-semibold text-ink sm:px-5">{m.name}</td>
                        <td className="px-2 py-2.5">
                          <span className="font-bold tabular-nums text-ink">{formatViews(v)}</span>
                          <span className="mt-1 block h-1.5 w-28 overflow-hidden rounded-full bg-cloud"><span className="block h-full rounded-full bg-gradient-to-r from-brand to-brand-light transition-[width] duration-700" style={{ width: `${v > 0 ? Math.max(3, (v / topMarket) * 100) : 0}%` }} /></span>
                        </td>
                        <td className={cx('px-2 py-2.5 text-xs font-semibold tabular-nums', mv == null ? 'text-gray-400' : mv >= 0 ? 'text-green-700' : 'text-red-600')}>{mv == null ? '-' : `${mv >= 0 ? '▲' : '▼'} ${Math.abs(mv)}%`}</td>
                        <td className="px-2 py-2.5 tabular-nums text-smoke">{m.videos}</td>
                        <td className="px-2 py-2.5 tabular-nums text-smoke">{m.new_members}</td>
                        <td className="px-4 py-2.5 tabular-nums text-smoke sm:px-5">{m.active_creators}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* WHAT GAINED MOST (14 Oct 2026): twelve videos, scrollable, each saying whose it is, which challenge, what it
              gained here and where it stands in total; and the creators beside them. */}
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <section className="animate-rise rounded-card border border-gray-100 bg-white p-4 shadow-card sm:p-5">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-[15px] font-bold text-ink">{tr('Videos that gained most')}</h3>
                <span className="text-xs text-smoke">{tr('Scroll for more')}</span>
              </div>
              {topVideos.length === 0 ? <p className="py-8 text-center text-sm text-smoke">{tr('Nothing in these dates.')}</p> : (
                <div className="scrollbar-none -mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-1">
                  {topVideos.map((v, i) => (
                    <a key={v.id} href={v.url} target="_blank" rel="noopener noreferrer" className="group relative w-[150px] shrink-0 snap-start overflow-hidden rounded-2xl bg-ink shadow-card transition-transform duration-300 animate-rise hoverable:hover:-translate-y-0.5" style={{ animationDelay: `${i * 40}ms` }}>
                      <VideoThumb url={v.url} platform={v.platform} thumbnailUrl={v.thumb} className="!aspect-[9/14]" mark={false} />
                      <span className="absolute left-2 top-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-white px-1.5 text-[11px] font-extrabold text-brand shadow-card">{i + 1}</span>
                      <span aria-hidden className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black/85 to-transparent" />
                      <span className="absolute inset-x-2 bottom-2 text-white">
                        <span className="block text-base font-bold tabular-nums leading-none">+{formatViews(v.views)}</span>
                        <span className="mt-0.5 block truncate text-[11px] font-semibold">{v.name}{v.vip ? ' · VIP' : ''}</span>
                        <span className="block truncate text-[10px] text-white/70">{v.challenge || (v.vip ? tr('VIP video') : '')}{v.total ? ` · ${formatViews(v.total)} ${tr('in total')}` : ''}</span>
                      </span>
                    </a>
                  ))}
                </div>
              )}
            </section>
            <section className="animate-rise rounded-card border border-gray-100 bg-white p-4 shadow-card sm:p-5" style={{ animationDelay: '60ms' }}>
              <h3 className="mb-3 text-[15px] font-bold text-ink">{tr('Creators who gained most')}</h3>
              {topCreators.length === 0 ? <p className="py-8 text-center text-sm text-smoke">{tr('Nothing in these dates.')}</p> : (
                <ol className="space-y-2.5">
                  {topCreators.map((c, i) => {
                    const max = Math.max(1, ...topCreators.map((x) => Number(x.views) || 0))
                    return (
                      <li key={c.id} className="flex items-center gap-3">
                        <span className={cx('w-5 text-right text-sm font-extrabold tabular-nums', i < 3 ? 'text-brand' : 'text-gray-400')}>{i + 1}</span>
                        <Avatar src={c.photo_url} name={c.name} size="xs" />
                        <span className="min-w-0 flex-1">
                          <span className="flex justify-between gap-2 text-sm"><span className="truncate font-semibold">{c.name}{c.vip ? ' · VIP' : ''}</span><span className="font-bold tabular-nums">+{formatViews(c.views)}</span></span>
                          <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-cloud"><span className="block h-full rounded-full bg-brand transition-[width] duration-700" style={{ width: `${(Number(c.views) / max) * 100}%` }} /></span>
                        </span>
                      </li>
                    )
                  })}
                </ol>
              )}
            </section>
          </div>

          <MeetingDeck data={data} scope={scope} market={market} marketName={marketName} allMarkets={allMarkets} from={from} to={to} title={snapTitle} />

        </div>
      )}
    </div>
  )
}

function Tile({ label, value, sub, delay = 0 }) {
  return (
    <div className="animate-rise rounded-card border border-gray-100 bg-white p-4 shadow-card" style={{ animationDelay: `${delay}ms` }}>
      <p className="text-sm font-medium text-smoke">{label}</p>
      <p className="mt-2 text-3xl font-bold tracking-tight text-ink"><CountUp value={Number(value) || 0} /></p>
      <p className="mt-1.5 text-[11px] text-gray-400">{sub}</p>
    </div>
  )
}
