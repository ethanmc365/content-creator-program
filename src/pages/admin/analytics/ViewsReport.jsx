import { useEffect, useMemo, useRef, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { format } from 'date-fns'
import { supabase } from '../../../lib/supabase'
import { Skeleton } from '../../../components/ui'
import Segmented from '../../../components/network/Segmented'
import PeriodPicker from '../../../components/PeriodPicker'
import VideoThumb from '../../../components/VideoThumb'
import Icon from '../../../components/Icon'
import { CountUp } from '../../../components/network/Motion'
import { CHART, axisTick, tooltipStyle } from '../../../components/charts/chartTheme'
import { PERIODS, periodRange } from '../../../lib/analyticsPeriod'
import { copyToClipboard } from '../../../lib/clipboard'
import { toastSuccess } from '../../../lib/toast'
import { notice } from '../../../lib/confirm'
import { compact, foldWeeks, pctChange, rangeLabel, snapshotSvg, snapshotText, viewsFor } from '../../../lib/weeklySnapshot'
import { cx, formatViews } from '../../../lib/utils'
import { useT } from '../../../lib/i18n'

// VIEWS GAINED, ANY DAYS, ONE HALF OR BOTH - AND THE WEEKLY SNAPSHOT (9 Oct 2026).
//
// Ethan: "under analytics I want to get the views from the general community channel, per week ... I can search for the last 7
// days or whatever, and also the total views, including the VIP. Also, just one or the other." And, for the weekly meeting with the
// country managers: "a weekly snapshot ... and an SVG that I can share on the Meet."
//
// Everything is `admin_views_gained`: views GAINED inside the dates (not lifetime totals), community and VIP side by side. It is read
// when the dates or the Refresh button change and at no other time - no polling - so leaving the tab open costs the database nothing.
const PERIOD_KEYS = ['last_7', 'this_week', 'last_week', 'last_3', 'this_month', 'last_month', 'last_30', 'last_90', 'custom']
const PICKER = PERIOD_KEYS.map((k) => PERIODS.find((p) => p.key === k))
const ymd = (d) => format(d, 'yyyy-MM-dd')

export default function ViewsReport() {
  const tr = useT()
  const [scope, setScope] = useState('both')
  const [periodKey, setPeriodKey] = useState('last_7')
  const [custom, setCustom] = useState({ from: '', to: '' })
  const range = useMemo(() => periodRange(periodKey, new Date(), custom), [periodKey, custom])
  const from = range.start ? ymd(range.start) : null
  // `end` is half-open and "now" for a running period, so the last whole day is the one before it - except for a running period,
  // where today counts too.
  const to = range.end ? ymd(new Date(range.end.getTime() - 1)) : null

  const cache = useRef(new Map())
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)
  const [tick, setTick] = useState(0)
  const key = `${from}|${to}`
  useEffect(() => {
    if (!from || !to) return undefined
    let alive = true
    const hit = cache.current.get(key)
    if (hit && tick === 0) { setData(hit); setErr('') } else setLoading(true)
    supabase.rpc('admin_views_gained', { p_from: from, p_to: to }).then(({ data: d, error }) => {
      if (!alive) return
      if (error) { setErr(error.message); setLoading(false); return }
      cache.current.set(key, d); setData(d); setErr(''); setLoading(false)
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

  const scopeLabel = scope === 'community' ? tr('Community') : scope === 'vip' ? tr('VIP creators') : tr('Community + VIP')

  async function copyText() {
    const ok = await copyToClipboard(snapshotText(data, scope))
    if (ok) toastSuccess(tr('Copied. Paste it into the chat or an email.')); else notice(tr('Could not copy. Try again.'))
  }
  function download(kind) {
    const svg = snapshotSvg(data, scope, tr('Weekly snapshot'))
    const name = `tryp-weekly-snapshot-${data.from}-to-${data.to}`
    const save = (blob, ext) => {
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${name}.${ext}`
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(a.href), 4000)
    }
    if (kind === 'svg') { save(new Blob([svg], { type: 'image/svg+xml' }), 'svg'); return }
    // PNG: the same SVG drawn onto a canvas at twice the size, for the places that will not take an SVG (Meet's chat, WhatsApp).
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = 2560; c.height = 1440
      const ctx = c.getContext('2d')
      ctx.drawImage(img, 0, 0, c.width, c.height)
      c.toBlob((b) => { if (b) save(b, 'png'); else notice(tr('Could not make the picture.')) }, 'image/png')
    }
    img.onerror = () => notice(tr('Could not make the picture.'))
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <Segmented value={scope} onChange={setScope} label={tr('Which views')} options={[
          { value: 'both', label: tr('Community + VIP') }, { value: 'community', label: tr('Community') }, { value: 'vip', label: tr('VIP') },
        ]} />
        <div className="flex items-center gap-2">
          <PeriodPicker value={periodKey} from={custom.from} to={custom.to} periods={PICKER} className="" width="w-44"
            onChange={(k, f, tt) => { setPeriodKey(k); if (k === 'custom') setCustom({ from: f, to: tt }) }} />
          <button type="button" onClick={() => setTick((n) => n + 1)} disabled={loading} aria-label={tr('Refresh')} title={tr('Read it again')} className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-smoke transition-all hoverable:hover:text-brand disabled:opacity-50">
            <Icon name="refresh" className={cx('h-4 w-4', loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {err && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{err}</p>}
      {!data && !err && <div className="space-y-4"><Skeleton className="h-28 w-full rounded-card" /><Skeleton className="h-64 w-full rounded-card" /></div>}

      {data && (
        <div className={cx('space-y-5 transition-opacity duration-300', stale && 'opacity-60')}>
          <p className="flex flex-wrap items-center gap-x-2 text-sm text-smoke">
            <Icon name="calendar" className="h-4 w-4 text-brand" />
            <span className="font-semibold text-ink">{rangeLabel(data.from, data.to)}</span>
            <span>· {tr('{n} days', { n: data.days })}</span>
            <span className="text-gray-300">|</span>
            <span>{tr('Views gained inside these dates, not lifetime totals.')}</span>
          </p>

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

          {(data.top_videos || []).length > 0 && (
            <section className="animate-rise">
              <h3 className="mb-3 text-[15px] font-bold text-ink">{tr('Videos that gained most')}</h3>
              <div className="scrollbar-none -mx-4 flex gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
                {data.top_videos.filter((v) => scope === 'both' || (scope === 'vip') === v.vip).map((v) => (
                  <a key={v.id} href={v.url} target="_blank" rel="noopener noreferrer" className="group relative w-[132px] shrink-0 overflow-hidden rounded-2xl bg-ink shadow-card transition-transform duration-300 hoverable:hover:-translate-y-0.5">
                    <VideoThumb url={v.url} platform={v.platform} thumbnailUrl={v.thumb} className="!aspect-[9/14]" mark={false} />
                    <span aria-hidden className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/80 to-transparent" />
                    <span className="absolute inset-x-2 bottom-2 text-white"><span className="block text-base font-bold tabular-nums leading-none">+{formatViews(v.views)}</span><span className="block truncate text-[10.5px] text-white/80">{v.name}{v.vip ? ' · VIP' : ''}</span></span>
                  </a>
                ))}
              </div>
            </section>
          )}

          {/* THE SNAPSHOT: what goes on the screen in the meeting. Same numbers as above, as one picture and one paragraph. */}
          <section className="animate-rise overflow-hidden rounded-card border border-brand/25 bg-white shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 sm:px-5">
              <div>
                <h3 className="flex items-center gap-2 text-[15px] font-bold text-ink"><Icon name="megaphone" className="h-4 w-4 text-brand" />{tr('Weekly snapshot for the meeting')}</h3>
                <p className="text-xs text-smoke">{tr('One picture for the screen, one paragraph for the chat. It follows the dates and the switch above.')}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => download('png')} className="btn-primary !py-2 text-xs"><Icon name="download" className="h-3.5 w-3.5" />{tr('Picture (PNG)')}</button>
                <button type="button" onClick={() => download('svg')} className="btn-secondary !py-2 text-xs">{tr('SVG')}</button>
                <button type="button" onClick={copyText} className="btn-secondary !py-2 text-xs"><Icon name="copy" className="h-3.5 w-3.5" />{tr('Copy as text')}</button>
              </div>
            </div>
            <div className="p-4 sm:p-5">
              <div className="overflow-hidden rounded-2xl border border-gray-100 shadow-sm" dangerouslySetInnerHTML={{ __html: snapshotSvg(data, scope, tr('Weekly snapshot')).replace(/ width="1280" height="720"/, ' style="width:100%;height:auto;display:block"') }} />
            </div>
          </section>
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
