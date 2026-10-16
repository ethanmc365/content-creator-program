import { useCallback, useEffect, useMemo, useState } from 'react'
import { Avatar, Select, Skeleton, Spinner } from '../ui'
import Icon from '../Icon'
import { confirm, notice } from '../../lib/confirm'
import { toastSuccess } from '../../lib/toast'
import { money, monthLabel, nf, useKindT, vipRpc } from '../../lib/vip'
import { cx, formatViews } from '../../lib/utils'

// VIP TOOLS > MONEY > PAST EARNINGS (migration 430). The months before the platform ran the VIP programme came from
// the team's sheet, which names creators by a short first name ("Mary", "Noeta"). Which profile each name is, is a
// decision for the person who knows them (Marta), not a guess: until a name is confirmed its months are nobody's, and
// the creator sees nothing. "No longer with us" keeps the history under the sheet's name with no profile.
const STATUS = {
  confirmed: { label: 'Confirmed', cls: 'bg-brand text-white' },
  suggested: { label: 'Suggested', cls: 'bg-amber-50 text-amber-700' },
  former: { label: 'No longer with us', cls: 'bg-cloud text-smoke' },
  unmatched: { label: 'Not matched', cls: 'bg-red-50 text-red-600' },
}
const FORMER = '__former'
const ym = (n) => ({ y: Math.floor(n / 100), m: n % 100 })

export function VipHistoryTab({ programme }) {
  const tr = useKindT()
  const [data, setData] = useState(null)
  const [show, setShow] = useState('check')
  const [busy, setBusy] = useState(null)
  const load = useCallback(async () => {
    try { setData(await vipRpc('vip_history_names_list', { p_programme: programme.id })) }
    catch (e) { setData({ names: [], people: [], error: e.message }) }
  }, [programme.id])
  useEffect(() => { setData(null); load() }, [load])

  const names = useMemo(() => data?.names || [], [data])
  const people = useMemo(() => [...(data?.people || [])].sort((a, b) => String(a.name).localeCompare(String(b.name))), [data])
  const done = names.filter((n) => n.status === 'confirmed' || n.status === 'former').length
  const suggested = names.filter((n) => n.status === 'suggested' && n.profile_id)
  const shown = show === 'check' ? names.filter((n) => n.status === 'suggested' || n.status === 'unmatched') : names
  const options = useMemo(() => [
    { value: '', label: tr('Who is this?') },
    ...people.map((p) => ({ value: p.id, label: `${p.name}${p.kind === 'official' ? ` (${tr('official')})` : ''}${p.status && p.status !== 'active' ? ` · ${p.status === 'left' ? tr('left') : tr('paused')}` : ''}` })),
    { value: FORMER, label: tr('No longer with us') },
  ], [people, tr])

  async function decide(n, profile, status, quiet = false) {
    setBusy(n.name)
    try {
      await vipRpc('vip_history_match', { p_programme: programme.id, p_name: n.name, p_profile: profile, p_status: status })
      if (!quiet) toastSuccess(status === 'confirmed' ? tr('{n} confirmed', { n: n.name }) : status === 'former' ? tr('Kept as history: {n}', { n: n.name }) : tr('Saved'))
      setData((d) => ({ ...d, names: d.names.map((x) => (x.name === n.name ? { ...x, status, profile_id: profile, ...(profile ? { profile_name: people.find((p) => p.id === profile)?.name, photo_url: people.find((p) => p.id === profile)?.photo_url } : { profile_name: null, photo_url: null }) } : x)) }))
      return true
    } catch (e) { if (!quiet) notice(e.message); return false }
    finally { setBusy(null) }
  }
  function pick(n, v) {
    if (!v) return decide(n, null, 'unmatched')
    if (v === FORMER) return decide(n, null, 'former')
    return decide(n, v, 'confirmed')
  }
  async function confirmAll() {
    if (!await confirm(tr('Confirm all {n} suggestions? Each creator will see these months as theirs.', { n: suggested.length }), { confirmLabel: tr('Confirm all') })) return
    let ok = 0
    for (const n of suggested) if (await decide(n, n.profile_id, 'confirmed', true)) ok++
    toastSuccess(tr('{n} confirmed', { n: ok }))
    load()
  }

  if (data === null) return <div className="space-y-3"><Skeleton className="h-28 w-full rounded-card" /><Skeleton className="h-64 w-full rounded-card" /></div>
  if (data.error) return <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{data.error}</p>
  if (!names.length) return <p className="rounded-card border border-dashed border-gray-200 px-6 py-12 text-center text-sm text-smoke">{tr('This market has no earnings from before the platform.')}</p>

  const pct = Math.round((done / names.length) * 100)
  return (
    <div className="space-y-4">
      <section className="relative overflow-hidden rounded-card border border-gray-100 bg-white p-4 shadow-card animate-rise sm:p-5">
        <span aria-hidden className="pointer-events-none absolute -right-12 -top-16 h-40 w-40 rounded-full bg-brand/10 blur-2xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 max-w-2xl">
            <h3 className="flex items-center gap-2 text-[15px] font-bold text-ink"><Icon name="book" className="h-4 w-4 text-brand" />{tr('Past earnings from the team sheet')}</h3>
            <p className="mt-1 text-xs leading-relaxed text-smoke">{tr('Before October 2026 the views and pay were kept in a sheet under short names. Match each name to the creator it belongs to. Their past months only appear on their VIP page once you confirm. Someone who has left keeps their history under the sheet name.')}</p>
          </div>
          {suggested.length > 0 && (
            <button type="button" onClick={confirmAll} disabled={!!busy} className="btn-primary !py-2 text-xs disabled:opacity-50"><Icon name="check" className="h-3.5 w-3.5" strokeWidth={2.4} />{tr('Confirm all suggestions ({n})', { n: suggested.length })}</button>
          )}
        </div>
        <div className="relative mt-4">
          <div className="mb-1.5 flex justify-between text-xs font-semibold"><span className="text-ink">{tr('{a} of {b} names checked', { a: done, b: names.length })}</span><span className="tabular-nums text-brand">{pct}%</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-cloud"><div className="h-full rounded-full bg-gradient-to-r from-brand to-brand-light transition-[width] duration-700" style={{ width: `${pct}%` }} /></div>
        </div>
      </section>

      <div className="inline-flex gap-1 rounded-xl bg-cloud p-1 text-xs font-semibold" role="tablist" aria-label={tr('Show')}>
        {[['check', tr('To check'), names.length - done], ['all', tr('All names'), names.length]].map(([k, label, n]) => (
          <button key={k} type="button" role="tab" aria-selected={show === k} onClick={() => setShow(k)} className={cx('rounded-lg px-3 py-1.5 transition-all duration-200', show === k ? 'bg-white text-ink shadow-card' : 'text-smoke hoverable:hover:text-ink')}>{label} {n}</button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="rounded-card border border-dashed border-gray-200 px-6 py-10 text-center text-sm text-smoke">{tr('Every name is checked. Nice work.')}</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {shown.map((n, i) => {
            const st = STATUS[n.status] || STATUS.unmatched
            const first = n.first ? ym(n.first) : null
            const last = n.last ? ym(n.last) : null
            const max = Math.max(1, ...(n.series || []).map((s) => Number(s.earned) || 0))
            return (
              <li key={n.name} className="flex flex-col rounded-card border border-gray-100 bg-white p-4 shadow-card transition-transform duration-200 animate-rise hoverable:hover:-translate-y-0.5" style={{ animationDelay: `${Math.min(i, 10) * 35}ms` }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="text-[17px] font-extrabold text-ink">{n.name}</span>
                      <span className={cx('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase', st.cls)}>{tr(st.label)}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-smoke">
                      {n.months === 1 ? tr('1 month') : tr('{n} months', { n: n.months })}
                      {first && last ? ` · ${monthLabel(first.y, first.m, { short: true })}${n.first !== n.last ? ` - ${monthLabel(last.y, last.m, { short: true })}` : ''}` : ''}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-lg font-bold tabular-nums text-ink">{money(n.earned, 'EUR')}</p>
                    <p className="text-[11px] tabular-nums text-smoke">{nf(n.views)} {tr('views')}</p>
                  </div>
                </div>
                {/* Their months as small bars, so two people with the same first name can be told apart at a glance. */}
                <div className="mt-3 flex h-10 items-end gap-1" aria-hidden>
                  {(n.series || []).map((s) => (
                    <span key={`${s.y}-${s.m}`} title={`${monthLabel(s.y, s.m, { short: true })}: ${money(s.earned, 'EUR')} · ${formatViews(s.views)}`} className="flex-1 rounded-t bg-gradient-to-t from-brand to-brand-light transition-[height] duration-700" style={{ height: `${Math.max(8, (Number(s.earned) / max) * 100)}%` }} />
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-50 pt-3">
                  {n.profile_id ? <Avatar src={n.photo_url} name={n.profile_name || ''} size="sm" /> : <span className="flex h-9 w-9 items-center justify-center rounded-full bg-cloud text-smoke"><Icon name={n.status === 'former' ? 'book' : 'user'} className="h-4 w-4" /></span>}
                  <Select
                    value={n.status === 'former' ? FORMER : (n.profile_id || '')}
                    onChange={(v) => pick(n, v)}
                    options={options}
                    ariaLabel={tr('Who is {n}?', { n: n.name })}
                    className="min-w-0 flex-1"
                    disabled={busy === n.name}
                  />
                  {busy === n.name && <Spinner className="h-4 w-4" />}
                  {n.status === 'suggested' && n.profile_id && busy !== n.name && (
                    <button type="button" onClick={() => decide(n, n.profile_id, 'confirmed')} className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-brand to-brand-light px-3 py-2 text-xs font-semibold text-white shadow-sm transition-all hoverable:hover:-translate-y-px">
                      <Icon name="check" className="h-3.5 w-3.5" strokeWidth={2.4} />{tr('Confirm')}
                    </button>
                  )}
                </div>
                {n.decided_by && (n.status === 'confirmed' || n.status === 'former') && (
                  <p className="mt-2 text-[11px] text-gray-400">{tr('Checked by {n}', { n: n.decided_by })}</p>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
