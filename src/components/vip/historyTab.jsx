import { Link } from 'react-router-dom'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Avatar, Skeleton } from '../ui'
import Icon from '../Icon'
import { money, monthLabel, useKindT, vipRpc } from '../../lib/vip'
import { formatViews } from '../../lib/utils'

// Current programme members are the source of truth. A new member appears here
// automatically, even before their first earning, while a member who moved to the
// official programme appears there with their personal earlier history intact.
export function VipHistoryTab({ programme }) {
  const tr = useKindT()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    try { setData(await vipRpc('vip_finance_summary', { p_programme: programme.id })); setError('') }
    catch (e) { setError(e.message); setData({ rows: [] }) }
  }, [programme.id])
  useEffect(() => { setData(null); load() }, [load])
  useEffect(() => {
    const timer = setInterval(() => { if (document.visibilityState === 'visible') load() }, 60000)
    const visible = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', visible)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', visible) }
  }, [load])
  const rows = useMemo(() => data?.rows || [], [data])
  const totals = useMemo(() => rows.reduce((a, r) => ({
    lifetime: a.lifetime + Number(r.lifetime || 0),
    paid: a.paid + Number(r.paid_out || 0),
    balance: a.balance + Number(r.balance || 0),
  }), { lifetime: 0, paid: 0, balance: 0 }), [rows])
  if (data === null) return <div className="space-y-3"><div className="grid gap-3 sm:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 rounded-card" />)}</div><Skeleton className="h-64 w-full rounded-card" /></div>
  if (error) return <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error} <button type="button" onClick={load} className="ml-2 font-bold underline">{tr('Try again')}</button></p>
  return <div className="space-y-4">
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <Summary featured label={tr('Earned all time')} value={totals.lifetime} hint={tr('Includes this month while it is counting')} />
      <Summary label={tr('Paid or withdrawn')} value={totals.paid} hint={tr('Past payouts and wallet withdrawals')} />
      <Summary label={tr('Available in balances')} value={totals.balance} hint={tr('What creators can still withdraw')} />
    </div>
    <div className="flex flex-wrap items-end justify-between gap-2 px-1">
      <div><h3 className="text-lg font-bold text-ink">{tr('Creator earnings')}</h3><p className="text-xs text-smoke">{tr('Current creators and their full earning history')}</p></div>
      <span className="rounded-full bg-brand-tint px-3 py-1.5 text-xs font-bold text-brand">{rows.length} {tr('creators')}</span>
    </div>
    {!rows.length && <p className="rounded-card border border-dashed border-gray-200 bg-white px-6 py-12 text-center text-sm text-smoke">{tr('Creators will appear here when they join this programme.')}</p>}
    <ul className="grid items-stretch gap-3 md:grid-cols-2 xl:grid-cols-3">
      {rows.map((r, i) => <CreatorCard key={r.profile_id} r={r} i={i} tr={tr} />)}
    </ul>
  </div>
}

function Summary({ featured, label, value, hint }) {
  return <section className={`relative overflow-hidden rounded-card p-4 shadow-card animate-rise sm:p-5 ${featured ? 'col-span-2 bg-gradient-to-br from-brand via-[#eb6729] to-brand-light text-white shadow-lift sm:col-span-1' : 'border border-orange-100 bg-white text-ink'}`}>
    {featured && <span aria-hidden className="pointer-events-none absolute -right-12 -top-16 h-36 w-36 rounded-full bg-white/20 blur-2xl" />}
    <p className={`relative text-xs font-bold ${featured ? 'text-white/90' : 'text-smoke'}`}>{label}</p>
    <p className="relative mt-2 text-xl font-extrabold tabular-nums sm:text-3xl">{money(value, 'EUR')}</p>
    <p className={`relative mt-1.5 text-xs ${featured ? 'text-white/80' : 'text-smoke'}`}>{hint}</p>
  </section>
}

function CreatorCard({ r, i, tr }) {
  const months = [...(r.months || [])].sort((a, b) => a.year - b.year || a.month - b.month)
  const top = Math.max(1, ...months.map((m) => Number(m.earned) || 0))
  return <li className="flex h-full flex-col overflow-hidden rounded-card border border-orange-100 bg-white shadow-card transition-all duration-200 animate-rise hoverable:hover:-translate-y-0.5 hoverable:hover:shadow-lift" style={{ animationDelay: `${Math.min(i, 12) * 35}ms` }}>
    <div className="h-1.5 bg-gradient-to-r from-brand via-[#ed692b] to-brand-light" />
    <div className="flex flex-1 flex-col p-4">
      <div className="flex items-center gap-3">
        <Link to={`/profile/${r.profile_id}`} aria-label={tr('Open {n} profile', { n: r.name })} className="shrink-0 rounded-full ring-2 ring-brand-tint transition-transform hoverable:hover:scale-105"><Avatar src={r.photo_url} name={r.name} size="md" /></Link>
        <div className="min-w-0 flex-1"><Link to={`/profile/${r.profile_id}`} className="block truncate text-[15px] font-extrabold text-ink hover:text-brand">{r.name}</Link><p className="text-[11px] text-smoke">{r.status === 'paused' ? tr('Paused') : tr('Creator')} · {months.length} {tr('months')}</p></div>
        <span className="rounded-full bg-brand-tint px-2 py-1 text-[10px] font-bold text-brand">{r.kind === 'official' ? tr('Official') : 'VIP'}</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-orange-50/70 p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-brand">{tr('Earned all time')}</p><p className="mt-1 text-xl font-extrabold tabular-nums text-ink">{money(r.lifetime, 'EUR')}</p></div>
        <div className="rounded-xl bg-cloud/70 p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-smoke">{tr('In balance')}</p><p className="mt-1 text-xl font-extrabold tabular-nums text-ink">{money(r.balance, 'EUR')}</p></div>
      </div>
      <div className="mt-3 flex h-12 items-end gap-1" role="img" aria-label={tr('Monthly earnings chart')}>
        {months.length ? months.map((m) => <span key={`${m.year}-${m.month}`} title={`${monthLabel(m.year,m.month,{short:true})}: ${money(m.earned,'EUR')} · ${formatViews(m.views)} ${tr('views')}`} className="min-w-[3px] flex-1 rounded-t bg-gradient-to-t from-brand to-brand-light transition-[height] duration-700" style={{ height: `${Math.max(8,Number(m.earned)/top*100)}%` }} />) : <div className="w-full rounded-lg bg-cloud px-3 py-2 text-xs text-smoke">{tr('First earnings will appear here')}</div>}
      </div>
      <div className="mt-3 flex flex-wrap justify-between gap-1 text-[11px] text-smoke"><span>{tr('Paid or withdrawn')}: <strong className="text-ink">{money(r.paid_out,'EUR')}</strong></span><span>{formatViews(r.views)} {tr('views')}</span></div>
      <Link to={`/vip?mode=as&who=${r.profile_id}&tab=earnings`} className="mt-4 flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand to-brand-light px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-all hoverable:hover:brightness-105 hoverable:hover:-translate-y-0.5">{tr('View earnings')}<Icon name="chevronRight" className="h-4 w-4" /></Link>
    </div>
  </li>
}
