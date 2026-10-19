import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { Avatar, Skeleton } from '../ui'
import Icon from '../Icon'
import PeriodPicker from '../PeriodPicker'
import { CountUp, VIP_COUNT_MS } from '../network/Motion'
import { VipBoardList } from './parts'
import SocialMark from '../SocialMark'
import { PERIODS, periodRange } from '../../lib/analyticsPeriod'
import { cx, formatDate, formatViews } from '../../lib/utils'
import { money, vipRpc, useKindT } from '../../lib/vip'

// THE TEAM'S BOARD, OVER ANY DAYS.
//
// The month's board (podium and prizes) is what creators see and stays the first answer. One press on the picker turns
// it into the same people ranked by the views they GAINED in the days picked - read from `vip_range_analytics`, the
// numbers the analytics use - with the change against the stretch before, the videos they posted in it and what the
// views are worth at their rate. Last week's figures are kept while the next stretch loads, so nothing jumps.
const BOARD_PERIODS = ['this_month', 'last_7', 'this_week', 'last_week', 'last_30', 'last_month', 'custom']
const PICKER = BOARD_PERIODS.map((k) => PERIODS.find((p) => p.key === k)).filter(Boolean)
const ymd = (d) => format(d, 'yyyy-MM-dd')
const BRAND = { Instagram: 'instagram', TikTok: 'tiktok', YouTube: 'youtube', Facebook: 'facebook' }
const PLATFORM_ORDER = ['TikTok', 'Instagram', 'Facebook', 'YouTube', 'Other']
const byPlatform = (a, b) => (b.views - a.views) || (b.videos - a.videos) || PLATFORM_ORDER.indexOf(a.platform) - PLATFORM_ORDER.indexOf(b.platform)

// The period's own words went out in English inside a Spanish sentence ("frente a the 7 days before", Marta's
// screenshot, 19 Oct 2026): analyticsPeriod builds them with the number baked in, so they are matched back to keys here.
function periodWords(range, tr) {
  const n = (s) => Number(String(s).match(/\d+/)?.[0])
  const say = (s) => {
    if (!s) return s
    if (/^the \d+ days before$/.test(s)) return tr('the {n} days before', { n: n(s) })
    if (/^Last \d+ days$/.test(s)) return tr('Last {n} days', { n: n(s) })
    return tr(s)
  }
  return { label: range.key === 'custom' ? null : say(range.label), short: say(range.short) }
}

export default function StaffBoard({ programme, monthRows, rules, month, limit = null, onFull }) {
  const tr = useKindT()
  const [periodKey, setPeriodKey] = useState('this_month')
  const [custom, setCustom] = useState({ from: '', to: '' })
  const range = useMemo(() => periodRange(periodKey, new Date(), custom), [periodKey, custom])
  const ranged = periodKey !== 'this_month'
  const from = range.start ? ymd(range.start) : null
  const to = range.end ? ymd(new Date(range.end.getTime() - 1)) : null
  const cache = useRef(new Map())
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const key = `${programme.id}|${from}|${to}`

  useEffect(() => {
    if (!ranged || !from || !to) return undefined
    let alive = true
    const hit = cache.current.get(key)
    if (hit) setData(hit); else setLoading(true)
    vipRpc('vip_range_analytics', { p_programme: programme.id, p_from: from, p_to: to })
      .then((d) => { cache.current.set(key, d); if (alive) { setData(d); setErr('') } })
      .catch((e) => { if (alive) setErr(e.message || String(e)) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [ranged, key]) // eslint-disable-line react-hooks/exhaustive-deps

  // Everybody counts in the total; only the ranked are on the board (a team member who opted out of prizes, 437).
  const counted = useMemo(() => (data?.creators || []).filter((c) => c.status === 'active' || c.views > 0), [data])
  const rows = useMemo(() => counted
    .filter((c) => c.ranked !== false)
    .sort((a, b) => b.views - a.views || a.name.localeCompare(b.name)), [counted])
  const shown = limit ? rows.slice(0, limit) : rows
  const lead = Math.max(1, rows[0]?.views || 0)
  const total = counted.reduce((a, c) => a + Number(c.views || 0), 0)
  const prevTotal = counted.reduce((a, c) => a + Number(c.prev_views || 0), 0)
  const cur = programme.currency || 'EUR'
  const words = periodWords(range, tr)
  const platforms = useMemo(() => [...(data?.platforms || [])].filter((p) => p.videos > 0 || p.views > 0).sort(byPlatform), [data])

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 text-xs text-smoke">
          {ranged && range.start
            ? <>{words.label && <><span className="font-semibold text-ink">{words.label}</span> · </>}<span className={words.label ? undefined : 'font-semibold text-ink'}>{from === to ? formatDate(from) : `${formatDate(from)} - ${formatDate(to)}`}</span></>
            : tr('This month so far, with the prizes')}
          {loading && <span className="ml-2 inline-flex items-center gap-1 text-brand"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand" />{tr('Updating')}</span>}
        </p>
        <PeriodPicker value={periodKey} from={custom.from} to={custom.to} periods={PICKER} width="w-40" translate
          onChange={(k, f, t) => { setPeriodKey(k); if (k === 'custom') setCustom({ from: f, to: t }) }} />
      </div>

      {!ranged ? (
        monthRows === null ? <Skeleton className="h-48 w-full rounded-card" /> : <VipBoardList rows={limit ? monthRows.slice(0, limit) : monthRows} rules={rules || []} currency={cur} month={month} />
      ) : err ? (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{err}</p>
      ) : !data ? (
        <Skeleton className="h-64 w-full rounded-card" />
      ) : (
        <div key={key} className={cx('overflow-hidden rounded-card border border-gray-100 bg-white shadow-card transition-opacity duration-200 animate-tab-in', loading && 'opacity-60')}>
          {/* The stretch in one line: everybody's views together, against the stretch before. */}
          <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 border-b border-gray-50 bg-gradient-to-r from-brand-tint/60 to-white px-4 py-3">
            <span className="text-2xl font-extrabold tabular-nums text-ink"><CountUp duration={VIP_COUNT_MS} value={total} format={formatViews} /></span>
            <span className="text-xs font-semibold text-smoke">{tr('views gained')}</span>
            {range.prev && prevTotal > 0 && <Delta now={total} before={prevTotal} vs={words.short} />}
            {/* EVERY PLATFORM'S SHARE OF THE STRETCH: videos posted in it and the views gained on it. */}
            {platforms.length > 0 && (
              <span className="flex w-full flex-wrap items-center gap-1.5 pt-1.5 sm:ml-auto sm:w-auto sm:pt-0">
                {platforms.map((p, i) => (
                  <span key={p.platform} className="inline-flex items-center gap-1.5 rounded-full border border-gray-100 bg-white px-2.5 py-1 text-xs font-semibold tabular-nums text-ink shadow-sm animate-pop-in" style={{ animationDelay: `${120 + i * 60}ms` }} title={p.platform}>
                    <SocialMark brand={BRAND[p.platform] || 'link'} colored className="h-3.5 w-3.5" />
                    {formatViews(p.views)}
                    <span className="font-medium text-smoke">· {p.videos === 1 ? tr('1 video') : tr('{n} videos', { n: p.videos })}</span>
                  </span>
                ))}
              </span>
            )}
          </div>
          {platforms.length > 0 && shown.length > 0 && (
            <p className="flex items-center gap-1.5 border-b border-gray-50 px-4 py-1.5 text-[11px] text-smoke">
              <Icon name="video" className="h-3.5 w-3.5 text-brand" />{tr('Under each name: videos posted and views gained, per platform')}
            </p>
          )}
          {shown.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-smoke">{tr('Nobody gained views in these days.')}</p>
          ) : (
            <ol>
              {shown.map((c, i) => (
                <li key={c.profile_id} className={cx('flex items-center gap-3 px-4 py-2.5 animate-rise', i > 0 && 'border-t border-gray-50')} style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}>
                  <span className={cx('flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-extrabold tabular-nums', i === 0 && c.views > 0 ? 'bg-gradient-to-br from-brand to-brand-light text-white shadow-card' : 'bg-cloud text-smoke')}>{i + 1}</span>
                  <Link to={`/profile/${c.profile_id}`} className="group flex min-w-0 flex-1 items-center gap-2.5">
                    <Avatar src={c.photo} name={c.name} size="sm" className="transition-transform duration-200 group-hover:scale-105" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink group-hover:text-brand">{c.name}</span>
                      <span className="mt-1 block h-1 max-w-[14rem] overflow-hidden rounded-full bg-gray-100"><span className="block h-full rounded-full bg-gradient-to-r from-brand to-brand-light transition-[width] duration-700" style={{ width: `${Number(c.views) > 0 ? Math.max(2, Math.round((Number(c.views) / lead) * 100)) : 0}%` }} /></span>
                      <PlatformSplit list={c.platforms} />
                    </span>
                  </Link>
                  <span className="hidden w-20 text-right text-[11px] text-smoke sm:block">{c.videos === 1 ? tr('1 video') : tr('{n} videos', { n: c.videos })}</span>
                  <span className="hidden w-20 text-right text-[11px] font-semibold tabular-nums text-smoke sm:block">{money(c.pay, cur, { cents: false })}</span>
                  <span className="w-24 text-right">
                    <span className="block text-sm font-bold tabular-nums text-ink">{formatViews(c.views)}</span>
                    {range.prev && <Delta now={c.views} before={c.prev_views} small />}
                  </span>
                </li>
              ))}
            </ol>
          )}
          {limit && rows.length > limit && onFull && (
            <button type="button" onClick={onFull} className="block w-full border-t border-gray-50 px-4 py-2.5 text-center text-xs font-semibold text-brand transition-colors hoverable:hover:bg-cloud">{tr('All {n}', { n: rows.length })}</button>
          )}
        </div>
      )}
    </div>
  )
}

// ONE CREATOR'S STRETCH, PLATFORM BY PLATFORM (the team, 19 Oct 2026: "how many videos they posted on Instagram, TikTok
// and Facebook, and the views there"). Each chip: the platform's mark, its videos, the views it gained.
function PlatformSplit({ list }) {
  const tr = useKindT()
  const rows = [...(list || [])].sort(byPlatform)
  if (!rows.length) return null
  return (
    <span className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
      {rows.map((p) => (
        <span key={p.platform} className="inline-flex items-center gap-1 text-[11px] tabular-nums text-smoke" title={`${p.platform}: ${p.videos === 1 ? tr('1 video') : tr('{n} videos', { n: p.videos })}, ${formatViews(p.views)} ${tr('views')}`}>
          <SocialMark brand={BRAND[p.platform] || 'link'} colored className="h-3.5 w-3.5" />
          <span className="font-semibold text-ink">{p.videos}</span>
          <span aria-hidden className="text-gray-300">·</span>
          <span>{formatViews(p.views)}</span>
        </span>
      ))}
    </span>
  )
}

function Delta({ now, before, vs, small = false }) {
  const tr = useKindT()
  if (!(Number(before) > 0)) return small ? <span className="block text-[10.5px] text-gray-400">{Number(now) > 0 ? tr('new') : ''}</span> : null
  const pct = Math.round(((Number(now) - Number(before)) / Number(before)) * 100)
  const up = pct >= 0
  return (
    <span className={cx('inline-flex items-center gap-0.5 font-bold tabular-nums', small ? 'text-[10.5px]' : 'text-xs', up ? 'text-emerald-600' : 'text-red-500')}>
      <Icon name={up ? 'chevronUp' : 'chevronDown'} className="h-3 w-3" strokeWidth={2.6} />{Math.abs(pct)}%{vs && !small ? <span className="ml-1 font-semibold text-smoke">{tr('vs {x}', { x: vs })}</span> : null}
    </span>
  )
}
