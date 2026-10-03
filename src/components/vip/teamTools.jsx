import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Avatar, Modal, Select, Skeleton, Spinner, Toggle } from '../ui'
import Icon from '../Icon'
import Segmented from '../network/Segmented'
import { CountUp } from '../network/Motion'
import { confirm, notice, promptText } from '../../lib/confirm'
import { toastSuccess } from '../../lib/toast'
import { cx, downloadCsv, formatDate } from '../../lib/utils'
import { money, monthLabel, nf, rate, vipRpc } from '../../lib/vip'
import { useT } from '../../lib/i18n'

// THE TEAM'S VIP TOOLS FOR MONEY AND MEMBERSHIP (2 Oct 2026, migration 312).
//
//   Balances  - every VIP's balance against the cash threshold, who asked for what, and the voucher codes still owed.
//   Stay-in   - the monthly rule (5 videos, or one video of 20,000 views): live for this month, and for a closed month
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
        <Tile icon="cash" label={tr('Over the threshold')} value={nf(ready.length)} hint={tr('Can ask for cash ({a}+)', { a: money(data.threshold, cur, { cents: false }) })} tone="good" delay={50} />
        <Tile icon="ticket" label={tr('Voucher codes to send')} value={nf(openCodes.length)} hint={tr('Asked for, no code yet')} tone={openCodes.length ? 'warn' : 'brand'} delay={100} />
        <Tile icon="clock" label={tr('Cash not yet paid')} value={nf(unpaid.length)} hint={tr('Invoices approved or sent')} delay={150} />
      </div>

      <div className="rounded-card border border-gray-100 bg-cloud/40 px-4 py-3 text-xs leading-relaxed text-smoke animate-rise">
        <Icon name="bulb" className="mr-1.5 inline h-4 w-4 text-brand" />
        {tr('Approving a month adds it to each balance. For {d} days after the month ends, a VIP can take cash (from {a}) or a Tryp.com voucher (any amount). Otherwise it keeps growing.', { d: data.request_days, a: money(data.threshold, cur, { cents: false }) })}
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
                <Avatar src={q.photo_url} name={q.name} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">{q.name}</span>
                  <span className="block truncate text-xs text-smoke">{q.kind === 'voucher' ? tr('Tryp.com voucher') : tr('Cash')}{q.auto ? ` · ${tr('automatic')}` : ''} · {formatDate(q.at)}</span>
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
    </div>
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
      name: r.name, videos: r.videos, best_video_views: r.best_views, met: r.met ? 'yes' : 'no', months_missed_in_a_row: r.missed_in_row, decision: r.decision || '', note: r.note || '',
    })))
  }

  const monthOptions = [
    ...((data.months || []).map((m) => ({ value: m.status === 'closed' ? m.id : '__live', label: m.status === 'closed' ? `${monthLabel(m.year, m.month)}${m.missed ? ` · ${tr('{n} missed', { n: m.missed })}` : ''}` : `${monthLabel(m.year, m.month)} · ${tr('live')}` }))),
  ]

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">{tr('To stay in: {v} videos in the month, or one video with {n} views.', { v: rule.videos, n: nf(rule.views) })}</p>
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
                    <span className={cx(r.best_views >= rule.views && 'font-semibold text-emerald-700')}>{tr('Best video {n} views', { n: nf(r.best_views) })}</span>
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
  const cols = useMemo(() => [...(data?.months || [])].reverse(), [data])

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
        <Tile icon="chart" label={tr('Effective CPM')} value={`${cur} ${data.total_views ? rate((data.total_earned / data.total_views) * 1000) : rate(data.cpm)}`} hint={tr('Earned per 1,000 views')} delay={150} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented size="sm" value={show} onChange={setShow} label={tr('Show')} options={[
          { value: 'both', label: tr('Views and money') }, { value: 'views', label: tr('Views') }, { value: 'earned', label: tr('Money') },
        ]} />
        <div className="flex flex-wrap items-center gap-2">
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
                  <th className="sticky left-0 z-10 border-b border-gray-100 bg-white px-4 py-2.5">{tr('Creator')}</th>
                  {cols.map((m) => (
                    <th key={key(m)} className={cx('whitespace-nowrap border-b border-gray-100 px-3 py-2.5 text-right', m.live && 'bg-brand-tint/40 text-brand')}>
                      {monthLabel(m.year, m.month, { short: true })}{m.live ? ' ·' : ''}{m.live && <span className="ml-1 normal-case">{tr('live')}</span>}
                    </th>
                  ))}
                  <th className="whitespace-nowrap border-b border-l border-gray-100 bg-cloud/60 px-4 py-2.5 text-right">{tr('Total')}</th>
                  <th className="whitespace-nowrap border-b border-gray-100 bg-cloud/60 px-4 py-2.5 text-right">{tr('Balance')}</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r, i) => (
                  <tr key={`${r.profile_id || r.name}`} className="group animate-rise" style={{ animationDelay: `${Math.min(i, 15) * 25}ms` }}>
                    <td className="sticky left-0 z-10 border-b border-gray-50 bg-white px-4 py-2.5 group-hover:bg-cloud/60">
                      <span className="block max-w-[11rem] truncate font-semibold text-ink">{r.name}</span>
                      <span className="block text-[11px] text-smoke">{cur} {rate(r.cpm)}{r.status && r.status !== 'active' ? ` · ${tr(r.status)}` : ''}{!r.profile_id ? ` · ${tr('typed in')}` : ''}</span>
                    </td>
                    {cols.map((m) => {
                      const c = r.cells[key(m)]
                      return (
                        <td key={key(m)} className={cx('whitespace-nowrap border-b border-gray-50 px-3 py-2.5 text-right tabular-nums group-hover:bg-cloud/60', m.live && 'bg-brand-tint/20', c?.hist && 'italic')}>
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
  const [f, setF] = useState({
    threshold: programme.min_payout ?? 100, days: programme.request_days ?? 10,
    on: programme.req_on ?? true, videos: programme.req_videos ?? 5, views: programme.req_single_views ?? 20000,
  })
  const [busy, setBusy] = useState(false)
  const set = (p) => setF((x) => ({ ...x, ...p }))
  async function save() {
    setBusy(true)
    try {
      await vipRpc('vip_set_rules', { p_programme: programme.id, p_threshold: Number(f.threshold), p_request_days: Number(f.days), p_req_on: f.on, p_req_videos: Number(f.videos), p_req_views: Number(f.views) })
      toastSuccess(tr('Saved.'))
      onSaved?.()
    } catch (e) { notice(e.message) } finally { setBusy(false) }
  }
  const dis = !programme.can_manage
  return (
    <section className="rounded-card border border-gray-100 bg-white p-5 shadow-card animate-rise">
      <h3 className="flex items-center gap-2 text-[15px] font-bold text-ink"><Icon name="wallet" className="h-5 w-5 text-brand" />{tr('Payouts and staying in')}</h3>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block"><span className="label">{tr('Cash payouts from ({c})', { c: programme.currency })}</span><input className="input" type="number" min="0" step="1" value={f.threshold} disabled={dis} onChange={(e) => set({ threshold: e.target.value })} /><span className="mt-1 block text-[11px] text-smoke">{tr('Below this, a VIP can only take a travel voucher or let it grow.')}</span></label>
        <label className="block"><span className="label">{tr('Days to ask after the month ends')}</span><input className="input" type="number" min="1" max="31" value={f.days} disabled={dis} onChange={(e) => set({ days: e.target.value })} /><span className="mt-1 block text-[11px] text-smoke">{tr('The payout window. Never shorter than three days after you approve.')}</span></label>
      </div>
      <div className="mt-5 flex items-center justify-between gap-3 border-t border-gray-100 pt-4">
        <span><span className="block text-sm font-semibold text-ink">{tr('Monthly requirement to stay in')}</span><span className="block text-xs text-smoke">{tr('Either one is enough.')}</span></span>
        <Toggle on={!!f.on} onChange={(v) => set({ on: v })} label={tr('Monthly requirement to stay in')} disabled={dis} />
      </div>
      <div className={cx('mt-3 grid gap-4 transition-opacity sm:grid-cols-2', !f.on && 'opacity-40')}>
        <label className="block"><span className="label">{tr('Videos in the month')}</span><input className="input" type="number" min="0" value={f.videos} disabled={dis || !f.on} onChange={(e) => set({ videos: e.target.value })} /></label>
        <label className="block"><span className="label">{tr('Or one video with this many views')}</span><input className="input" type="number" min="0" step="1000" value={f.views} disabled={dis || !f.on} onChange={(e) => set({ views: e.target.value })} /></label>
      </div>
      {!dis && <div className="mt-5 flex justify-end"><button type="button" onClick={save} disabled={busy} className="btn-primary">{busy ? <Spinner className="h-4 w-4" /> : <Icon name="check" className="h-4 w-4" />}{tr('Save')}</button></div>}
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
            <span className="text-xs text-smoke">{tr('on track for {v} videos or a {n}-view video', { v: req.data?.rule?.videos ?? 5, n: nf(req.data?.rule?.views ?? 20000) })}</span>
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
