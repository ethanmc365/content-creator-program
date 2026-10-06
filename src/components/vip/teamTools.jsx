import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Avatar, Modal, Select, Skeleton, Spinner, Toggle } from '../ui'
import Icon from '../Icon'
import Segmented from '../network/Segmented'
import { CountUp } from '../network/Motion'
import { confirm, notice, promptText } from '../../lib/confirm'
import { toastSuccess } from '../../lib/toast'
import { cx, downloadCsv, formatDate } from '../../lib/utils'
import { curSym, money, monthLabel, nf, perK, vipRpc } from '../../lib/vip'
import { useT } from '../../lib/i18n'

// THE TEAM'S VIP TOOLS FOR MONEY AND MEMBERSHIP (2 Oct 2026, migration 312).
//
//   Balances  - every VIP's balance against the cash threshold, who asked for what, and the voucher codes still owed.
//   Stay-in   - the monthly rule (5 videos AND 20,000 views, 4 Oct 2026): live for this month, and for a closed month
//               the list written down at close, with keep / warn / pause / remove.
//   CPM sheet - the Spanish manager's spreadsheet, generated: creators down the side, months across, views and money.

function useRpc(fn, args) {
  const [data, setData] = useState(undefined)
  const [error, setError] = useState('')
  const key = JSON.stringify(args)
  const load = useCallback(async () => {
    try { setData(await vipRpc(fn, JSON.parse(key))); setError('') } catch (e) { setData(null); setError(e.message) }
  }, [fn, key])
  useEffect(() => { load() }, [load])
  return { data, error, reload: load }
}

function Tile({ icon, label, value, hint, tone = 'brand', delay = 0 }) {
  return (
    <div className="rounded-card border border-gray-100 bg-white px-4 py-3.5 shadow-card animate-rise" style={{ animationDelay: `${delay}ms` }}>
      <p className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wide text-gray-400"><Icon name={icon} className={cx('h-3.5 w-3.5', tone === 'warn' ? 'text-amber-500' : tone === 'good' ? 'text-emerald-500' : 'text-brand')} />{label}</p>
      <p className={cx('mt-1 truncate text-2xl font-bold tabular-nums', tone === 'warn' ? 'text-amber-600' : tone === 'good' ? 'text-emerald-600' : 'text-ink')}>{value}</p>
      {hint && <p className="mt-0.5 line-clamp-2 text-[11px] text-smoke">{hint}</p>}
    </div>
  )
}

function Empty({ icon, title, hint }) {
  return (
    <div className="rounded-card border border-dashed border-gray-200 px-6 py-10 text-center animate-rise">
      <Icon name={icon} className="mx-auto h-7 w-7 text-gray-300" />
      <p className="mt-2 text-sm font-semibold text-ink">{title}</p>
      {hint && <p className="mx-auto mt-1 max-w-md text-sm text-smoke">{hint}</p>}
    </div>
  )
}

// ======================================================================== balances
export function VipWalletsTab({ programme }) {
  const tr = useT()
  const { data, error, reload } = useRpc('vip_wallets', { p_programme: programme.id })
  const [filter, setFilter] = useState('all')
  const [person, setPerson] = useState(null)
  if (data === undefined) return <Skeleton className="h-72 w-full rounded-card" />
  if (!data) return <Empty icon="alert" title={tr('Could not load the balances')} hint={error} />

  const cur = data.currency
  const rows = data.rows || []
  const owed = rows.reduce((a, r) => a + Number(r.balance || 0), 0)
  const ready = rows.filter((r) => Number(r.balance) >= Number(data.threshold) && Number(r.balance) > 0)
  const openCodes = (data.requests || []).filter((q) => q.kind === 'voucher' && !q.voucher_code)
  const unpaid = (data.requests || []).filter((q) => q.kind === 'payout' && q.invoice_stage !== 'paid')
  const shown = filter === 'ready' ? ready : filter === 'growing' ? rows.filter((r) => Number(r.balance) > 0 && Number(r.balance) < Number(data.threshold)) : rows

  async function adjust(r) {
    const amt = await promptText(tr('How much to add? Use a minus sign to take away, for example -5.'), { title: tr('Correct {n}\'s balance', { n: r.name.split(' ')[0] }), placeholder: '10', confirmLabel: tr('Next') })
    if (amt === null) return
    const n = Number(String(amt).replace(',', '.'))
    if (!Number.isFinite(n) || n === 0) { notice(tr('That is not an amount.')); return }
    const why = await promptText(tr('Why? The creator sees this.'), { title: tr('Reason'), placeholder: tr('For example: views from a video that could not be read'), confirmLabel: tr('Save') })
    if (!why) return
    try { await vipRpc('vip_adjust_balance', { p_profile: r.profile_id, p_amount: n, p_note: why }); toastSuccess(tr('Balance updated.')); reload() } catch (e) { notice(e.message) }
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile icon="wallet" label={tr('Held in balances')} value={<CountUp value={owed} format={(n) => money(n, cur, { cents: false })} />} hint={tr('Earned, not yet taken')} />
        <Tile icon="cash" label={tr('Ready for cash')} value={nf(ready.length)} hint={tr('Can ask for cash ({a}+)', { a: money(data.threshold, cur, { cents: false }) })} tone="good" delay={50} />
        <Tile icon="ticket" label={tr('Voucher codes to send')} value={nf(openCodes.length)} hint={tr('Asked for, no code yet')} tone={openCodes.length ? 'warn' : 'brand'} delay={100} />
        <Tile icon="clock" label={tr('Cash not yet paid')} value={nf(unpaid.length)} hint={tr('Invoices approved or sent')} delay={150} />
      </div>

      <div className="rounded-card border border-gray-100 bg-cloud/40 px-4 py-3 text-xs leading-relaxed text-smoke animate-rise">
        <Icon name="bulb" className="mr-1.5 inline h-4 w-4 text-brand" />
        {tr('Approving a month adds it to each balance. A VIP can ask at any time: cash from {a}, a Tryp.com voucher from {v}. Otherwise it keeps growing. Press a name for their full history.', { a: money(data.threshold, cur, { cents: false }), v: money(programme.voucher_min ?? 10, cur, { cents: false }) })}
      </div>

      {(data.requests || []).length > 0 && (
        <section className="rounded-card border border-gray-100 bg-white p-5 shadow-card animate-rise">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-[15px] font-bold text-ink"><Icon name="bell" className="h-5 w-5 text-brand" />{tr('Requests')}</h3>
            <div className="flex gap-2">
              <Link to="/admin/rewards?tab=vouchers" className="btn-secondary !py-1.5 text-xs"><Icon name="ticket" className="h-3.5 w-3.5" />{tr('Vouchers page')}</Link>
              <Link to="/admin/rewards?tab=cash" className="btn-secondary !py-1.5 text-xs"><Icon name="envelope" className="h-3.5 w-3.5" />{tr('Invoices')}</Link>
            </div>
          </div>
          <ul className="divide-y divide-gray-50">
            {data.requests.slice(0, 12).map((q, i) => (
              <li key={q.id} className="flex items-center gap-3 py-2.5 animate-rise" style={{ animationDelay: `${i * 35}ms` }}>
                {/* CASH OR VOUCHER, AT A GLANCE (3 Oct 2026). Ethan: "make it more clear if it's cash or Tryp.com
                    voucher. There's not much difference there." Each request leads with what it is. */}
                <span className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', q.kind === 'voucher' ? 'bg-brand-tint text-brand' : 'bg-cloud text-ink')}><Icon name={q.kind === 'voucher' ? 'ticket' : 'cash'} className="h-5 w-5" /></span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-sm font-semibold text-ink"><span className="truncate">{q.name}</span>
                    <span className={cx('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', q.kind === 'voucher' ? 'bg-brand-tint text-brand' : 'bg-cloud text-ink')}>{q.kind === 'voucher' ? tr('Voucher') : tr('Cash')}</span>
                  </span>
                  <span className="block truncate text-xs text-smoke">{q.kind === 'voucher' ? tr('Tryp.com travel voucher') : tr('Bank transfer')}{q.auto ? ` · ${tr('automatic')}` : ''} · {formatDate(q.at)}</span>
                </span>
                <RequestState q={q} />
                <span className="w-20 shrink-0 text-right font-bold tabular-nums text-ink">{money(q.amount, cur)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-card border border-gray-100 bg-white shadow-card animate-rise">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4">
          <h3 className="flex items-center gap-2 text-[15px] font-bold text-ink"><Icon name="users" className="h-5 w-5 text-brand" />{tr('Every balance')}</h3>
          <Segmented size="sm" value={filter} onChange={setFilter} label={tr('Show')} options={[
            { value: 'all', label: tr('All') }, { value: 'ready', label: tr('Ready for cash') }, { value: 'growing', label: tr('Still growing') },
          ]} />
        </div>
        {shown.length === 0 ? <p className="px-5 py-6 text-sm text-smoke">{tr('Nobody here.')}</p> : (
          <ul className="mt-3 divide-y divide-gray-50 border-t border-gray-100">
            {shown.map((r, i) => {
              const pct = Math.min(1, Number(r.balance) / Math.max(1, Number(data.threshold)))
              return (
                <li key={r.profile_id} className="flex flex-wrap items-center gap-3 px-5 py-3 animate-rise sm:flex-nowrap" style={{ animationDelay: `${i * 30}ms` }}>
                  <button type="button" onClick={() => setPerson(r)} className="group flex min-w-0 flex-1 items-center gap-3 text-left">
                  <Avatar src={r.photo_url} name={r.name} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                      <span className="truncate">{r.name}</span>
                      {r.status !== 'active' && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold uppercase text-smoke">{tr(r.status)}</span>}
                      {r.auto_payout && <span title={tr('Paid automatically')}><Icon name="refresh" className="h-3.5 w-3.5 text-brand" /></span>}
                      {!r.payment_ready && <span title={tr('No payment details')}><Icon name="alert" className="h-3.5 w-3.5 text-amber-500" /></span>}
                    </span>
                    <span className="mt-1.5 block h-1.5 w-full max-w-[14rem] overflow-hidden rounded-full bg-gray-100">
                      <span className={cx('block h-full rounded-full transition-[width] duration-700', pct >= 1 ? 'bg-emerald-500' : 'bg-brand')} style={{ width: `${Math.round(pct * 100)}%` }} />
                    </span>
                  </span>
                  </button>
                  <span className="hidden text-right text-xs text-smoke sm:block">
                    <span className="block">{tr('Earned {a}', { a: money(r.earned, cur, { cents: false }) })}</span>
                    <span className="block">{tr('Taken {a}', { a: money(Number(r.paid) + Number(r.vouchers), cur, { cents: false }) })}</span>
                  </span>
                  <span className="w-24 shrink-0 text-right text-base font-bold tabular-nums text-ink">{money(r.balance, cur)}</span>
                  <button type="button" onClick={() => adjust(r)} disabled={!programme.can_manage} className="rounded-full p-2 text-smoke transition-all hoverable:hover:bg-brand-tint hoverable:hover:text-brand disabled:opacity-30" aria-label={tr('Correct the balance')} title={tr('Correct the balance')}>
                    <Icon name="pencil" className="h-4 w-4" />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>
      {person && <PersonMoney r={person} data={data} programme={programme} onClose={() => setPerson(null)} onAdjust={() => { const r = person; setPerson(null); adjust(r) }} />}
    </div>
  )
}

// ONE VIP'S MONEY (3 Oct 2026). Ethan: "clicking on a person here should also show more info on them ... their all-time
// earnings, their monthly earnings, what they currently have, and what they can withdraw." The four figures, then the
// months, then every movement of the balance.
function PersonMoney({ r, data, programme, onClose, onAdjust }) {
  const tr = useT()
  const cur = data.currency
  const [months, setMonths] = useState(null)
  const [moves, setMoves] = useState(null)
  useEffect(() => {
    let alive = true
    Promise.all([
      supabase.from('vip_statements').select('id, views, total, status, month:month_id(year, month, starts_at)').eq('profile_id', r.profile_id).neq('status', 'void'),
      supabase.from('vip_ledger').select('id, kind, amount, note, created_at').eq('profile_id', r.profile_id).order('created_at', { ascending: false }).limit(30),
    ]).then(([st, lg]) => {
      if (!alive) return
      setMonths((st.data || []).filter((x) => x.month).sort((a, b) => String(b.month.starts_at).localeCompare(String(a.month.starts_at))))
      setMoves(lg.data || [])
    })
    return () => { alive = false }
  }, [r.profile_id])
  const bal = Number(r.balance) || 0
  const cash = Number(data.threshold) || 0
  const voucher = Number(programme.voucher_min ?? 10) || 0
  const can = bal >= cash && bal > 0 ? tr('Cash or a voucher') : bal >= voucher && bal > 0 ? tr('A voucher (cash from {a})', { a: money(cash, cur, { cents: false }) }) : tr('Nothing yet')
  const best = Math.max(1, ...(months || []).map((m) => Number(m.total) || 0))
  return (
    <Modal open onClose={onClose} title={r.name} wide>
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {[
            [tr('Earned, all time'), money(r.earned, cur), 'trophy'],
            [tr('Balance now'), money(bal, cur), 'wallet'],
            [tr('Taken so far'), money(Number(r.paid) + Number(r.vouchers), cur), 'check'],
            [tr('Can withdraw'), can, 'cash'],
          ].map(([label, value, icon], i) => (
            <div key={label} className="rounded-xl bg-cloud/60 px-3.5 py-3 animate-rise" style={{ animationDelay: `${i * 50}ms` }}>
              <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-400"><Icon name={icon} className="h-3.5 w-3.5 text-brand" />{label}</p>
              <p className="mt-1 text-[15px] font-bold tabular-nums text-ink">{value}</p>
            </div>
          ))}
        </div>
        <section>
          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">{tr('Month by month')}</h3>
          {months === null ? <Skeleton className="h-24 w-full rounded-xl" /> : months.length === 0 ? <p className="text-sm text-smoke">{tr('No closed months yet.')}</p> : (
            <ul className="space-y-1.5">
              {months.map((m, i) => (
                <li key={m.id} className="flex items-center gap-3 rounded-xl px-3 py-2 animate-rise hoverable:hover:bg-cloud/50" style={{ animationDelay: `${i * 35}ms` }}>
                  <span className="w-24 shrink-0 text-sm font-semibold text-ink">{monthLabel(m.month.year, m.month.month, { short: true })}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100"><span className="block h-full rounded-full bg-gradient-to-r from-brand to-brand-light" style={{ width: `${Math.max(3, Math.round((Number(m.total) / best) * 100))}%` }} /></span>
                  <span className="hidden w-24 text-right text-xs tabular-nums text-smoke sm:block">{tr('{n} views', { n: nf(m.views) })}</span>
                  <span className="w-20 text-right text-sm font-bold tabular-nums text-ink">{money(m.total, cur)}</span>
                  {m.status === 'draft' && <span className="rounded-full bg-cloud px-2 py-0.5 text-[10px] font-bold uppercase text-smoke">{tr('Draft')}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">{tr('Balance history')}</h3>
          {moves === null ? <Skeleton className="h-20 w-full rounded-xl" /> : moves.length === 0 ? <p className="text-sm text-smoke">{tr('Nothing yet.')}</p> : (
            <ul className="divide-y divide-gray-50 rounded-xl border border-gray-100">
              {moves.map((e) => (
                <li key={e.id} className="flex items-center gap-3 px-3.5 py-2.5 text-sm">
                  <Icon name={e.kind === 'voucher' ? 'ticket' : e.kind === 'payout' ? 'cash' : e.kind === 'adjust' ? 'pencil' : 'plus'} className="h-4 w-4 shrink-0 text-brand" />
                  <span className="min-w-0 flex-1 truncate text-ink">{e.kind === 'earned' ? tr('Month approved') : e.kind === 'payout' ? tr('Cash payout') : e.kind === 'voucher' ? tr('Tryp.com voucher') : (e.note || tr('Correction'))}<span className="ml-2 text-xs text-smoke">{formatDate(e.created_at)}</span></span>
                  <span className={cx('font-bold tabular-nums', Number(e.amount) > 0 ? 'text-emerald-700' : 'text-ink')}>{Number(e.amount) > 0 ? '+' : '-'}{money(Math.abs(e.amount), cur)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <div className="flex flex-wrap justify-between gap-2">
          <Link to={`/vip?mode=as&who=${r.profile_id}`} className="btn-secondary !py-2 text-sm" onClick={onClose}><Icon name="eye" className="h-4 w-4" />{tr('Their VIP page')}</Link>
          {programme.can_manage && <button type="button" onClick={onAdjust} className="btn-primary !py-2 text-sm"><Icon name="pencil" className="h-4 w-4" />{tr('Correct the balance')}</button>}
        </div>
      </div>
    </Modal>
  )
}

function RequestState({ q }) {
  const tr = useT()
  const s = q.kind === 'voucher'
    ? (q.voucher_code ? [tr('Code sent'), 'bg-emerald-50 text-emerald-700'] : [tr('Send the code'), 'bg-amber-50 text-amber-700'])
    : q.invoice_stage === 'paid' ? [tr('Paid'), 'bg-emerald-50 text-emerald-700']
      : q.invoice_stage === 'sent' ? [tr('Invoice sent'), 'bg-brand-tint text-brand']
        : q.invoice_stage ? [tr('Approved, to pay'), 'bg-brand-tint text-brand'] : [tr('No payment details'), 'bg-amber-50 text-amber-700']
  return <span className={cx('hidden shrink-0 rounded-full px-2.5 py-1 text-[10.5px] font-bold sm:inline', s[1])}>{s[0]}</span>
}

// ======================================================================== stay-in check
const DECISIONS = [
  { key: 'keep', label: 'Keep', icon: 'check', tone: 'hoverable:hover:border-emerald-300 hoverable:hover:text-emerald-700' },
  { key: 'warn', label: 'Warn', icon: 'bell', tone: 'hoverable:hover:border-amber-300 hoverable:hover:text-amber-700' },
  { key: 'pause', label: 'Pause', icon: 'clock', tone: 'hoverable:hover:border-brand hoverable:hover:text-brand' },
  { key: 'remove', label: 'Remove', icon: 'exit', tone: 'hoverable:hover:border-red-300 hoverable:hover:text-red-600' },
]

export function VipRequirementsTab({ programme }) {
  const tr = useT()
  const [month, setMonth] = useState(null)
  const { data, error, reload } = useRpc('vip_requirements', { p_programme: programme.id, p_month: month })
  const [show, setShow] = useState('missed')
  const [busy, setBusy] = useState('')

  if (data === undefined) return <Skeleton className="h-72 w-full rounded-card" />
  if (!data) return <Empty icon="calendar" title={tr('No month to check yet')} hint={error} />

  const live = data.month.status !== 'closed'
  const rows = data.rows || []
  const missed = rows.filter((r) => !r.met)
  const list = show === 'missed' ? missed : show === 'met' ? rows.filter((r) => r.met) : rows
  const undecided = missed.filter((r) => !r.decision).length
  const rule = data.rule

  async function decide(r, decision) {
    if (decision === 'remove' && !await confirm(tr('{n} leaves the VIP community and goes back to the community creators. Their balance stays theirs.', { n: r.name }), { title: tr('Remove {n}?', { n: r.name }), confirmLabel: tr('Remove'), danger: true })) return
    if (decision === 'pause' && !await confirm(tr('{n}\'s new views stop counting until you restart them. They are told.', { n: r.name }), { title: tr('Pause {n}?', { n: r.name }), confirmLabel: tr('Pause') })) return
    let note = null
    if (decision === 'warn') {
      note = await promptText(tr('Optional: a line from you, added to the message they get.'), { title: tr('Warn {n}', { n: r.name }), placeholder: tr('For example: we know August was quiet, let us talk'), confirmLabel: tr('Send the warning') })
      if (note === null) return
    }
    setBusy(r.profile_id + decision)
    try { await vipRpc('vip_requirement_decide', { p_month: data.month.id, p_profile: r.profile_id, p_decision: decision, p_note: note }); toastSuccess(tr('Saved.')); reload() } catch (e) { notice(e.message) } finally { setBusy('') }
  }

  function exportCsv() {
    downloadCsv(`vip-requirements-${programme.name}-${data.month.year}-${data.month.month}.csv`, rows.map((r) => ({
      name: r.name, videos: r.videos, views: r.views ?? r.best_views, met: r.met ? 'yes' : 'no', months_missed_in_a_row: r.missed_in_row, decision: r.decision || '', note: r.note || '',
    })))
  }

  const monthOptions = [
    ...((data.months || []).map((m) => ({ value: m.status === 'closed' ? m.id : '__live', label: m.status === 'closed' ? `${monthLabel(m.year, m.month)}${m.missed ? ` · ${tr('{n} missed', { n: m.missed })}` : ''}` : `${monthLabel(m.year, m.month)} · ${tr('live')}` }))),
  ]

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">{tr('To stay in: {v} videos and {n} views in the month.', { v: rule.videos, n: nf(rule.views) })}</p>
          <p className="text-xs text-smoke">{live ? tr('Live for this month. The list is written down when the month closes, and you are told who missed it.') : tr('As it stood when {m} closed.', { m: monthLabel(data.month.year, data.month.month) })}</p>
        </div>
        <div className="flex items-center gap-2">
          <Select variant="chip" value={month || '__live'} onChange={(v) => setMonth(v === '__live' ? null : v)} options={monthOptions} ariaLabel={tr('Month')} className="w-56" search={false} />
          <button type="button" onClick={exportCsv} disabled={!rows.length} className="btn-secondary !py-1.5 text-xs"><Icon name="download" className="h-3.5 w-3.5" />CSV</button>
        </div>
      </div>

      {!rule.on && <p className="rounded-card border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{tr('The rule is switched off for this market in Settings, so nobody is judged on it.')}</p>}

      <div className="grid grid-cols-3 gap-3">
        <Tile icon="users" label={live ? tr('Active VIPs') : tr('Checked')} value={nf(rows.length)} />
        <Tile icon="check" label={live ? tr('On track') : tr('Met it')} value={nf(rows.length - missed.length)} tone="good" delay={50} />
        <Tile icon="alert" label={live ? tr('Behind') : tr('Missed it')} value={nf(missed.length)} hint={!live && missed.length ? tr('{n} to decide', { n: undecided }) : ''} tone={missed.length ? 'warn' : 'brand'} delay={100} />
      </div>

      <Segmented size="sm" value={show} onChange={setShow} label={tr('Show')} options={[
        { value: 'missed', label: live ? tr('Behind') : tr('Missed') }, { value: 'met', label: live ? tr('On track') : tr('Met') }, { value: 'all', label: tr('Everyone') },
      ]} />

      {list.length === 0 ? (
        <Empty icon={show === 'missed' ? 'check' : 'users'} title={show === 'missed' ? (live ? tr('Everybody is on track') : tr('Everybody met it')) : tr('Nobody here')} />
      ) : (
        <ul className="space-y-2.5">
          {list.map((r, i) => (
            <li key={r.profile_id} className="rounded-card border border-gray-100 bg-white p-4 shadow-card animate-rise" style={{ animationDelay: `${i * 35}ms` }}>
              <div className="flex flex-wrap items-center gap-3">
                <Avatar src={r.photo_url} name={r.name} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <Link to={`/profile/${r.profile_id}`} className="truncate text-sm font-semibold text-ink hover:text-brand">{r.name}</Link>
                    {r.status && r.status !== 'active' && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold uppercase text-smoke">{tr(r.status)}</span>}
                    {r.missed_in_row > 1 && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold uppercase text-red-600">{tr('{n} months in a row', { n: r.missed_in_row })}</span>}
                  </span>
                  <span className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-smoke">
                    <span className={cx(r.videos >= rule.videos && 'font-semibold text-emerald-700')}>{tr('{n} of {t} videos', { n: r.videos, t: rule.videos })}</span>
                    <span className={cx((r.views ?? r.best_views) >= rule.views && 'font-semibold text-emerald-700')}>{tr('{n} of {t} views', { n: nf(r.views ?? r.best_views), t: nf(rule.views) })}</span>
                  </span>
                </span>
                {r.met
                  ? <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10.5px] font-bold uppercase text-emerald-700">{live ? tr('On track') : tr('Met')}</span>
                  : r.decision
                    ? <span className="rounded-full bg-cloud px-2.5 py-1 text-[10.5px] font-bold uppercase text-ink">{tr(DECISIONS.find((d) => d.key === r.decision)?.label || r.decision)}</span>
                    : <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10.5px] font-bold uppercase text-amber-700">{live ? tr('Behind') : tr('To decide')}</span>}
              </div>
              {!live && !r.met && programme.can_manage && (
                <div className="mt-3 flex flex-wrap gap-2 border-t border-gray-50 pt-3">
                  {DECISIONS.map((d) => (
                    <button key={d.key} type="button" disabled={!!busy} onClick={() => decide(r, d.key)}
                      className={cx('inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all duration-200 hover:-translate-y-px disabled:opacity-50', r.decision === d.key ? 'border-brand bg-brand text-white' : cx('border-gray-200 text-ink', d.tone))}>
                      {busy === r.profile_id + d.key ? <Spinner className="h-3.5 w-3.5" /> : <Icon name={d.icon} className="h-3.5 w-3.5" />}{tr(d.label)}
                    </button>
                  ))}
                  {r.note && <span className="self-center text-xs text-smoke">“{r.note}”</span>}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ======================================================================== CPM sheet
export function VipSheetTab({ programme }) {
  const tr = useT()
  const [months, setMonths] = useState(12)
  const { data, error, reload } = useRpc('vip_cpm_sheet', { p_programme: programme.id, p_months: months })
  const [show, setShow] = useState('both')
  const [importing, setImporting] = useState(false)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('views')
  const cols = useMemo(() => [...(data?.months || [])].reverse(), [data])
  // THE SHEET, REDRAWN (6 Oct 2026). Ethan: "for the CPM sheet improve the UI and ensure it shows creator profile etc." Each creator is
  // their face and name (a link to their profile), their rate and status; every month's cell is shaded by how big it is next to the
  // biggest, so the busy months read at a glance; and the cost per 1,000 each creator has actually come to sits beside their total.
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = (data?.rows || []).filter((r) => !q || r.name.toLowerCase().includes(q))
    return list.sort((a, b) => (sort === 'earned' ? b.earned - a.earned : sort === 'name' ? a.name.localeCompare(b.name) : b.views - a.views))
  }, [data, query, sort])
  const peak = useMemo(() => Math.max(1, ...(data?.rows || []).flatMap((r) => Object.values(r.cells || {}).map((c) => Number(c?.views) || 0))), [data])

  if (data === undefined) return <Skeleton className="h-72 w-full rounded-card" />
  if (!data) return <Empty icon="chart" title={tr('Could not load the sheet')} hint={error} />
  const cur = data.currency
  const key = (m) => `${m.year}-${String(m.month).padStart(2, '0')}`

  function exportCsv() {
    downloadCsv(`vip-cpm-${programme.name}.csv`, data.rows.map((r) => {
      const o = { creator: r.name, cpm: r.cpm }
      cols.forEach((m) => { const c = r.cells[key(m)]; o[`${key(m)} views`] = c?.views ?? ''; o[`${key(m)} ${cur}`] = c?.earned ?? '' })
      o['total views'] = r.views; o[`total ${cur}`] = r.earned; o[`balance ${cur}`] = r.balance ?? ''
      return o
    }))
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile icon="eye" label={tr('Views, all months')} value={<CountUp value={data.total_views} format={nf} />} />
        <Tile icon="money" label={tr('Earned, all months')} value={<CountUp value={data.total_earned} format={(n) => money(n, cur, { cents: false })} />} delay={50} />
        <Tile icon="users" label={tr('Creators')} value={nf(data.rows.length)} delay={100} />
        <Tile icon="chart" label={tr('Average per 1,000 views')} value={perK(data.total_views ? (data.total_earned / data.total_views) * 1000 : data.cpm, cur)} hint={tr('Every creator, every month shown')} delay={150} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented size="sm" value={show} onChange={setShow} label={tr('Show')} options={[
            { value: 'both', label: tr('Views and money') }, { value: 'views', label: tr('Views') }, { value: 'earned', label: tr('Money') },
          ]} />
          <Segmented size="sm" value={sort} onChange={setSort} label={tr('Sort by')} options={[
            { value: 'views', label: tr('Most views') }, { value: 'earned', label: tr('Most paid') }, { value: 'name', label: tr('A to Z') },
          ]} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {data.rows.length > 5 && <input className="input !w-44 !py-1.5 text-xs" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tr('Search creators')} aria-label={tr('Search creators')} />}
          <Select variant="chip" value={months} onChange={setMonths} search={false} ariaLabel={tr('Months shown')} className="w-36" options={[6, 12, 24, 36].map((n) => ({ value: n, label: tr('Last {n} months', { n }) }))} />
          {programme.can_manage && <button type="button" onClick={() => setImporting(true)} className="btn-secondary !py-1.5 text-xs"><Icon name="plus" className="h-3.5 w-3.5" />{tr('Add past months')}</button>}
          <button type="button" onClick={exportCsv} disabled={!data.rows.length} className="btn-secondary !py-1.5 text-xs"><Icon name="download" className="h-3.5 w-3.5" />CSV</button>
        </div>
      </div>

      {data.rows.length === 0 ? (
        <Empty icon="chart" title={tr('Nothing on the sheet yet')} hint={tr('Months appear as they are counted. Add the months before the platform with "Add past months".')} />
      ) : (
        <div className="overflow-hidden rounded-card border border-gray-100 bg-white shadow-card animate-rise">
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-0 text-[13px]">
              <thead>
                <tr className="text-left text-[10.5px] font-bold uppercase tracking-wide text-gray-400">
                  <th className="sticky left-0 z-10 border-b border-gray-100 bg-cloud/70 px-4 py-3 backdrop-blur">{tr('Creator')}</th>
                  {cols.map((m) => (
                    <th key={key(m)} className={cx('whitespace-nowrap border-b border-gray-100 px-3 py-3 text-right', m.live ? 'bg-brand-tint/60 text-brand' : 'bg-cloud/70')}>
                      {monthLabel(m.year, m.month, { short: true })}{m.live ? ' ·' : ''}{m.live && <span className="ml-1 normal-case">{tr('live')}</span>}
                    </th>
                  ))}
                  <th className="whitespace-nowrap border-b border-l border-gray-100 bg-cloud/60 px-4 py-2.5 text-right">{tr('Total')}</th>
                  <th className="whitespace-nowrap border-b border-gray-100 bg-cloud/60 px-4 py-2.5 text-right">{tr('Per 1,000')}</th>
                  <th className="whitespace-nowrap border-b border-gray-100 bg-cloud/60 px-4 py-2.5 text-right">{tr('Balance')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.profile_id || r.name}`} className="group animate-rise" style={{ animationDelay: `${Math.min(i, 15) * 25}ms` }}>
                    <td className="sticky left-0 z-10 border-b border-gray-50 bg-white px-4 py-3 group-hover:bg-cloud/60">
                      {(() => {
                        const face = (
                          <span className="flex items-center gap-3">
                            <Avatar src={r.photo_url || r.photo} name={r.name} size="sm" className="shrink-0 transition-transform duration-200 group-hover/who:scale-105" />
                            <span className="min-w-0">
                              <span className="block max-w-[11rem] truncate text-[13.5px] font-bold text-ink group-hover/who:text-brand">{r.name}</span>
                              <span className="mt-0.5 flex flex-wrap items-center gap-1 text-[10.5px] font-semibold">
                                <span className="rounded-full bg-cloud px-1.5 py-0.5 text-smoke">{perK(r.cpm, cur)}</span>
                                {r.status && r.status !== 'active' && <span className="rounded-full bg-gray-100 px-1.5 py-0.5 uppercase text-smoke">{tr(r.status)}</span>}
                                {!r.profile_id && <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-amber-700">{tr('typed in')}</span>}
                              </span>
                            </span>
                          </span>
                        )
                        return r.profile_id ? <Link to={`/profile/${r.profile_id}`} className="group/who block" aria-label={tr('Open {n}\'s profile', { n: r.name })}>{face}</Link> : face
                      })()}
                    </td>
                    {cols.map((m) => {
                      const c = r.cells[key(m)]
                      return (
                        <td key={key(m)} style={c && Number(c.views) > 0 ? { backgroundColor: `rgba(217, 68, 7, ${(0.04 + 0.2 * Math.sqrt(Number(c.views) / peak)).toFixed(3)})` } : undefined} className={cx('whitespace-nowrap border-b border-gray-50 px-3 py-3 text-right tabular-nums transition-colors', !c && 'group-hover:bg-cloud/60', m.live && !c && 'bg-brand-tint/25', c?.hist && 'italic')}>
                          {!c ? <span className="text-gray-300">-</span> : (
                            <>
                              {show !== 'earned' && <span className="block font-semibold text-ink">{nf(c.views)}</span>}
                              {show !== 'views' && <span className={cx('block', show === 'earned' ? 'font-semibold text-ink' : 'text-[11px] text-smoke')}>{money(c.earned, cur)}</span>}
                            </>
                          )}
                        </td>
                      )
                    })}
                    <td className="whitespace-nowrap border-b border-l border-gray-50 bg-cloud/40 px-4 py-2.5 text-right tabular-nums">
                      {show !== 'earned' && <span className="block font-bold text-ink">{nf(r.views)}</span>}
                      {show !== 'views' && <span className={cx('block', show === 'earned' ? 'font-bold text-ink' : 'text-[11px] font-semibold text-brand')}>{money(r.earned, cur)}</span>}
                    </td>
                    <td className="whitespace-nowrap border-b border-gray-50 bg-cloud/40 px-4 py-2.5 text-right tabular-nums text-smoke">{r.views > 0 ? perK((r.earned / r.views) * 1000, cur) : '-'}</td>
                    <td className="whitespace-nowrap border-b border-gray-50 bg-cloud/40 px-4 py-2.5 text-right font-semibold tabular-nums text-ink">{r.balance == null ? '-' : money(r.balance, cur)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-bold">
                  <td className="sticky left-0 z-10 bg-cloud px-4 py-3 text-ink">{tr('Every creator')}</td>
                  {cols.map((m) => (
                    <td key={key(m)} className="whitespace-nowrap bg-cloud px-3 py-3 text-right tabular-nums">
                      {show !== 'earned' && <span className="block text-ink">{nf(m.views)}</span>}
                      {show !== 'views' && <span className={cx('block', show === 'earned' ? 'text-ink' : 'text-[11px] text-brand')}>{money(m.earned, cur)}</span>}
                    </td>
                  ))}
                  <td className="whitespace-nowrap border-l border-gray-100 bg-cloud px-4 py-3 text-right tabular-nums">
                    {show !== 'earned' && <span className="block text-ink">{nf(data.total_views)}</span>}
                    {show !== 'views' && <span className={cx('block', show === 'earned' ? 'text-ink' : 'text-[11px] text-brand')}>{money(data.total_earned, cur)}</span>}
                  </td>
                  <td className="whitespace-nowrap bg-cloud px-4 py-3 text-right tabular-nums text-smoke">{data.total_views ? perK((data.total_earned / data.total_views) * 1000, cur) : '-'}</td>
                  <td className="bg-cloud" />
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="border-t border-gray-100 px-4 py-2.5 text-[11px] text-smoke">{tr('Closed months come from the approved statements, this month is live, and months in italics were typed in.')}</p>
        </div>
      )}

      <ImportHistory open={importing} onClose={() => setImporting(false)} programme={programme} onDone={() => { setImporting(false); reload() }} />
    </div>
  )
}

// PAST MONTHS, PASTED (2 Oct 2026). The Spanish sheet goes back to December 2025; those months were never on the
// platform. One line per creator per month - "Name, 2026-08, 481437, 120.36" - straight out of a spreadsheet.
const MONTHS_ES = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, oct: 10, nov: 11, dic: 12 }
const MONTHS_EN = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 }
export function parseHistory(text) {
  const out = []
  const bad = []
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    // Tabs (a spreadsheet), then semicolons, then ", " - so "481,437" stays one number - and a bare comma last.
    const sep = line.includes('\t') ? /\t/ : line.includes(';') ? /;/ : /,\s+/.test(line) ? /,\s+/ : /,/
    const cells = line.split(sep).map((x) => x.trim()).filter(Boolean)
    if (cells.length < 3) { bad.push(line); continue }
    const [name, when, views, earned, cpm] = cells
    let y; let m
    const iso = when.match(/^(\d{4})[-/](\d{1,2})$/)
    const mon = when.toLowerCase().match(/^([a-z]{3})[a-z]*\s*'?\s*(\d{2,4})$/)
    if (iso) { y = +iso[1]; m = +iso[2] } else if (mon) { m = MONTHS_EN[mon[1]] || MONTHS_ES[mon[1]]; y = +mon[2] < 100 ? 2000 + +mon[2] : +mon[2] }
    const num = (s) => (s == null ? null : Number(String(s).replace(/[€$£\s]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(/,(?=\d{3}(\D|$))/g, '').replace(',', '.')))
    const v = num(views)
    if (!name || !y || !m || m < 1 || m > 12 || !Number.isFinite(v)) { bad.push(line); continue }
    const e = num(earned)
    out.push({ name, year: y, month: m, views: Math.round(v), earned: Number.isFinite(e) ? e : null, cpm: num(cpm) })
  }
  return { rows: out, bad }
}

function ImportHistory({ open, onClose, programme, onDone }) {
  const tr = useT()
  const [text, setText] = useState('')
  const [fill, setFill] = useState(true)
  const [busy, setBusy] = useState(false)
  const { rows, bad } = parseHistory(text)
  async function save() {
    setBusy(true)
    try {
      const n = await vipRpc('vip_import_history', { p_programme: programme.id, p_rows: rows.map((r) => ({ ...r, earned: r.earned ?? (fill ? Math.round(r.views * Number(r.cpm || programme.cpm) / 10) / 100 : 0) })) })
      toastSuccess(tr('{n} months added to the sheet.', { n }))
      setText('')
      onDone()
    } catch (e) { notice(e.message) } finally { setBusy(false) }
  }
  return (
    <Modal open={open} onClose={onClose} title={tr('Add past months')} wide>
      <div className="space-y-4">
        <p className="text-sm text-smoke">{tr('One line per creator per month: name, month, views, and optionally the amount and the rate. Paste straight from a spreadsheet.')}</p>
        <pre className="rounded-xl bg-cloud px-3 py-2 text-xs text-ink">Nadia, 2026-08, 481437, 120.36{'\n'}Mary, Aug 26, 45200, 11.30, 0.25{'\n'}Eva	2026-07	21806</pre>
        <textarea className="input min-h-[10rem] font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)} placeholder={tr('Paste here')} />
        <label className="flex items-center gap-3 text-sm text-ink"><Toggle on={fill} onChange={setFill} label={tr('Work out the amount from the rate when it is missing')} />{tr('Work out the amount from the rate when it is missing')}</label>
        {text && (
          <p className="text-xs text-smoke">
            {tr('{n} lines ready', { n: rows.length })}{bad.length ? ` · ${tr('{n} not understood', { n: bad.length })}: ${bad.slice(0, 2).join(' | ')}` : ''}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-ghost">{tr('Cancel')}</button>
          <button type="button" onClick={save} disabled={busy || rows.length === 0} className="btn-primary">{busy ? <Spinner className="h-4 w-4" /> : <Icon name="plus" className="h-4 w-4" />}{tr('Add {n}', { n: rows.length })}</button>
        </div>
      </div>
    </Modal>
  )
}

// ======================================================================== rules (on the Settings tab)
export function VipRulesCard({ programme, onSaved }) {
  const tr = useT()
  const sym = curSym(programme.currency)
  const [f, setF] = useState({
    threshold: String(programme.min_payout ?? 100), voucher: String(programme.voucher_min ?? 10),
    on: programme.req_on ?? true, videos: String(programme.req_videos ?? 5), views: String(programme.req_single_views ?? 20000),
  })
  const [busy, setBusy] = useState(false)
  const set = (p) => setF((x) => ({ ...x, ...p }))
  const digits = (v) => String(v).replace(/[^\d]/g, '')
  async function save() {
    setBusy(true)
    try {
      await vipRpc('vip_set_rules', { p_programme: programme.id, p_threshold: Number(f.threshold) || 0, p_request_days: null, p_req_on: f.on, p_req_videos: Number(f.videos) || 0, p_req_views: Number(f.views) || 0, p_voucher_min: Number(f.voucher) || 0 })
      toastSuccess(tr('Saved.'))
      onSaved?.()
    } catch (e) { notice(e.message) } finally { setBusy(false) }
  }
  const dis = !programme.can_manage
  // EVERY BOX THE SAME, THE UNIT INSIDE IT (4 Oct 2026). Ethan: "the UI is a bit weird, and things are misaligned." The payout boxes
  // had a prefix, the stay-in boxes had a label above and a unit under, and the two rows did not line up. Now one field shape: a
  // label above, the number typed in a box that carries its unit (EUR, videos, views) on the right or left, all one height.
  const field = (label, value, onChange, { prefix, suffix, off } = {}) => (
    <label className="block min-w-0">
      <span className="label">{label}</span>
      <span className={cx('relative flex items-center', off && 'opacity-40')}>
        {prefix && <span className="pointer-events-none absolute left-3.5 text-sm font-semibold text-gray-400">{prefix}</span>}
        <input className={cx('input w-full', prefix && '!pl-8', suffix && '!pr-16')} inputMode="numeric" value={value} disabled={dis || off} onChange={(e) => onChange(digits(e.target.value))} />
        {suffix && <span className="pointer-events-none absolute right-3.5 text-xs font-semibold text-gray-400">{suffix}</span>}
      </span>
    </label>
  )
  return (
    <section className="space-y-5 rounded-card border border-gray-100 bg-white p-5 shadow-card animate-rise">
      <div>
        <h3 className="flex items-center gap-2 text-[15px] font-bold text-ink"><Icon name="wallet" className="h-5 w-5 text-brand" />{tr('Payouts')}</h3>
        <p className="mt-0.5 text-xs text-smoke">{tr('A VIP can ask for their balance at any time once it reaches these amounts.')}</p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {field(tr('Cash from'), f.threshold, (v) => set({ threshold: v }), { prefix: sym })}
          {field(tr('Voucher from'), f.voucher, (v) => set({ voucher: v }), { prefix: sym })}
        </div>
      </div>
      <div className="border-t border-gray-100 pt-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-[15px] font-bold text-ink"><Icon name="shield" className="h-5 w-5 text-brand" />{tr('Staying in')}</h3>
            <p className="mt-0.5 text-xs text-smoke">{tr('Each month a VIP needs both.')}</p>
          </div>
          <Toggle on={!!f.on} onChange={(v) => set({ on: v })} label={tr('Monthly requirement to stay in')} disabled={dis} />
        </div>
        <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2.5">
          {field(tr('Videos'), f.videos, (v) => set({ videos: v }), { suffix: tr('videos'), off: !f.on })}
          <span className={cx('pb-2.5 text-[11px] font-bold uppercase tracking-[0.18em] text-gray-300 transition-opacity', !f.on && 'opacity-40')}>{tr('and')}</span>
          {field(tr('Views'), f.views, (v) => set({ views: v }), { suffix: tr('views'), off: !f.on })}
        </div>
        <p className={cx('mt-2 text-[11px] text-smoke', !f.on && 'opacity-40')}>{tr('The views are added up across all their videos in the month.')}</p>
      </div>
      {!dis && <div className="flex justify-end"><button type="button" onClick={save} disabled={busy} className="btn-primary !py-2 text-sm">{busy ? <Spinner className="h-4 w-4" /> : <Icon name="check" className="h-4 w-4" />}{tr('Save')}</button></div>}
    </section>
  )
}

// ======================================================================== the team overview's top row
// THE TEAM OVERVIEW, IMPROVED (2 Oct 2026). Ethan: "improve the team overview page". What a lead opens it to find out:
// who is falling behind the stay-in rule, what is sitting in balances and what is waiting on the team. Each card opens
// the tool that deals with it.
export function TeamPulse({ programme, onTool }) {
  const tr = useT()
  const req = useRpc('vip_requirements', { p_programme: programme.id, p_month: null })
  const wal = useRpc('vip_wallets', { p_programme: programme.id })
  const rows = req.data?.rows || []
  const behind = rows.filter((r) => !r.met)
  const cur = wal.data?.currency || programme.currency
  const owed = (wal.data?.rows || []).reduce((a, r) => a + Number(r.balance || 0), 0)
  const codes = (wal.data?.requests || []).filter((q) => q.kind === 'voucher' && !q.voucher_code).length
  const ready = (wal.data?.rows || []).filter((r) => Number(r.balance) >= Number(wal.data?.threshold) && Number(r.balance) > 0).length
  const onTrackPct = rows.length ? (rows.length - behind.length) / rows.length : 0

  const card = 'group flex flex-col rounded-card border border-gray-100 bg-white p-4 text-left shadow-card transition-all duration-200 animate-rise hoverable:hover:-translate-y-0.5 hoverable:hover:shadow-lift'
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <button type="button" onClick={() => onTool('requirements')} className={card}>
        <span className="flex items-center justify-between text-[10.5px] font-bold uppercase tracking-wide text-gray-400">
          <span className="flex items-center gap-1.5"><Icon name="shield" className="h-3.5 w-3.5 text-brand" />{tr('Stay-in check')}</span>
          <Icon name="chevronRight" className="h-3.5 w-3.5 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
        </span>
        {req.data === undefined ? <Skeleton className="mt-2 h-10 w-full" /> : (
          <>
            <span className="mt-1.5 text-2xl font-bold tabular-nums text-ink">{tr('{a} of {b}', { a: nf(rows.length - behind.length), b: nf(rows.length) })}</span>
            <span className="text-xs text-smoke">{tr('on track for {v} videos and {n} views', { v: req.data?.rule?.videos ?? 5, n: nf(req.data?.rule?.views ?? 20000) })}</span>
            <span className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-gray-100"><span className="block h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-[width] duration-1000" style={{ width: `${Math.round(onTrackPct * 100)}%` }} /></span>
            {behind.length > 0 && (
              <span className="mt-2.5 flex items-center gap-2">
                <span className="flex -space-x-2">{behind.slice(0, 5).map((r) => <Avatar key={r.profile_id} src={r.photo_url} name={r.name} size="xs" />)}</span>
                <span className="truncate text-[11px] font-semibold text-amber-700">{tr('{n} behind', { n: behind.length })}</span>
              </span>
            )}
          </>
        )}
      </button>
      <button type="button" onClick={() => onTool('wallets')} className={cx(card, '[animation-delay:60ms]')}>
        <span className="flex items-center justify-between text-[10.5px] font-bold uppercase tracking-wide text-gray-400">
          <span className="flex items-center gap-1.5"><Icon name="wallet" className="h-3.5 w-3.5 text-brand" />{tr('Balances')}</span>
          <Icon name="chevronRight" className="h-3.5 w-3.5 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
        </span>
        {wal.data === undefined ? <Skeleton className="mt-2 h-10 w-full" /> : (
          <>
            <span className="mt-1.5 text-2xl font-bold tabular-nums text-ink"><CountUp value={owed} format={(n) => money(n, cur, { cents: false })} /></span>
            <span className="text-xs text-smoke">{tr('held for VIPs, {n} over the cash threshold', { n: ready })}</span>
          </>
        )}
      </button>
      <button type="button" onClick={() => onTool(codes ? 'wallets' : 'close')} className={cx(card, '[animation-delay:120ms]')}>
        <span className="flex items-center justify-between text-[10.5px] font-bold uppercase tracking-wide text-gray-400">
          <span className="flex items-center gap-1.5"><Icon name="bell" className="h-3.5 w-3.5 text-brand" />{tr('Waiting on the team')}</span>
          <Icon name="chevronRight" className="h-3.5 w-3.5 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
        </span>
        {wal.data === undefined ? <Skeleton className="mt-2 h-10 w-full" /> : (
          <>
            <span className={cx('mt-1.5 text-2xl font-bold tabular-nums', codes ? 'text-amber-600' : 'text-emerald-600')}>{codes ? nf(codes) : <Icon name="check" className="h-7 w-7" strokeWidth={2.4} />}</span>
            <span className="text-xs text-smoke">{codes ? tr('voucher codes to send') : tr('Nothing waiting. Month end is in VIP tools.')}</span>
          </>
        )}
      </button>
    </div>
  )
}
