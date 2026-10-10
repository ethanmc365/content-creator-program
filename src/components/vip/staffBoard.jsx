import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { Avatar, Skeleton } from '../ui'
import Icon from '../Icon'
import PeriodPicker from '../PeriodPicker'
import { CountUp } from '../network/Motion'
import { VipBoardList } from './parts'
import { PERIODS, periodRange } from '../../lib/analyticsPeriod'
import { cx, formatDate, formatViews } from '../../lib/utils'
import { money, vipRpc, useKindT } from '../../lib/vip'

// THE TEAM'S BOARD, OVER ANY DAYS (10 Oct 2026).
//
// Ethan: "Marta will need to check the views of the VIP and the official team weekly, so can you add a date filter, last 7
// days etc." The month's board (podium and prizes) is what creators see and stays the first answer. One press on the
// picker turns it into the same people ranked by the views they GAINED in the days picked - read from
// `vip_range_analytics`, the numbers the analytics use - with the change against the stretch before, the videos they
// posted in it and what the views are worth at their rate. Last week's figures are kept while the next stretch loads, so
// nothing jumps.
const BOARD_PERIODS = ['this_month', 'last_7', 'this_week', 'last_week', 'last_30', 'last_month', 'custom']
const PICKER = BOARD_PERIODS.map((k) => PERIODS.find((p) => p.key === k)).filter(Boolean)
const ymd = (d) => format(d, 'yyyy-MM-dd')

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

  const rows = useMemo(() => (data?.creators || [])
    .filter((c) => c.status === 'active' || c.views > 0)
    .sort((a, b) => b.views - a.views || a.name.localeCompare(b.name)), [data])
  const shown = limit ? rows.slice(0, limit) : rows
  const lead = Math.max(1, rows[0]?.views || 0)
  const total = rows.reduce((a, c) => a + Number(c.views || 0), 0)
  const prevTotal = rows.reduce((a, c) => a + Number(c.prev_views || 0), 0)
  const cur = programme.currency || 'EUR'

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 text-xs text-smoke">
          {ranged && range.start
            ? <><span className="font-semibold text-ink">{range.label}</span> · {from === to ? formatDate(from) : `${formatDate(from)} - ${formatDate(to)}`}</>
            : tr('This month so far, with the prizes')}
          {loading && <span className="ml-2 inline-flex items-center gap-1 text-brand"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand" />{tr('Updating')}</span>}
        </p>
        <PeriodPicker value={periodKey} from={custom.from} to={custom.to} periods={PICKER} width="w-40"
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
            <span className="text-2xl font-extrabold tabular-nums text-ink"><CountUp value={total} format={formatViews} /></span>
            <span className="text-xs font-semibold text-smoke">{tr('views gained')}</span>
            {range.prev && prevTotal > 0 && <Delta now={total} before={prevTotal} vs={range.short} />}
          </div>
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
