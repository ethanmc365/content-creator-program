import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Skeleton, Spinner, Toggle } from '../ui'
import Icon from '../Icon'
import { CountUp } from '../network/Motion'
import { confirm, notice } from '../../lib/confirm'
import { toastSuccess } from '../../lib/toast'
import { cx, formatDate } from '../../lib/utils'
import { money, monthLabel, nf, rate, useOptionalRpc, useVipPreview, vipRpc } from '../../lib/vip'
import { useT } from '../../lib/i18n'

// THE VIP BALANCE (2 Oct 2026, migration 312).
//
// Ethan, for the Spanish VIPs: "because we work with them with a fixed CPM ... if they don't reach 100EUR they cannot
// transfer the money, so they accumulate it until 100EUR or ask for a travel voucher with the same amount they have at
// the end of the month." So an approved month ADDS to a balance. Once a month, when the statement is approved, a
// window opens: cash for the whole balance (from the threshold up), or a Tryp.com travel voucher for the whole balance
// (any amount), or leave it to grow. The database decides every one of those rules (vip_request_payout); this page
// shows where the creator stands and offers only what will be accepted.

const ENTRY = {
  earned: { icon: 'plus', label: 'Added', tone: 'text-emerald-700' },
  adjust: { icon: 'pencil', label: 'Correction', tone: 'text-ink' },
  payout: { icon: 'cash', label: 'Cash payout', tone: 'text-ink' },
  voucher: { icon: 'ticket', label: 'Travel voucher', tone: 'text-ink' },
}

function entryState(e, tr) {
  if (e.kind === 'payout') {
    if (e.paid_at || e.invoice_stage === 'paid') return { label: tr('Paid'), tone: 'bg-emerald-50 text-emerald-700' }
    if (e.invoice_stage === 'sent') return { label: tr('Invoice sent'), tone: 'bg-brand-tint text-brand' }
    if (e.invoice_stage) return { label: tr('Approved'), tone: 'bg-brand-tint text-brand' }
    return { label: tr('Waiting for payment details'), tone: 'bg-amber-50 text-amber-700' }
  }
  if (e.kind === 'voucher') {
    return e.voucher_code ? { label: tr('Code sent'), tone: 'bg-emerald-50 text-emerald-700' } : { label: tr('Code on its way'), tone: 'bg-amber-50 text-amber-700' }
  }
  return null
}

export function VipWallet({ onChanged }) {
  const tr = useT()
  const preview = useVipPreview()
  const { data: w, missing, reload } = useOptionalRpc('vip_my_wallet')
  const [busy, setBusy] = useState('')

  if (missing) return null
  if (w === undefined) return <Skeleton className="h-64 w-full rounded-card" />
  if (!w) return null

  const cur = w.currency
  const bal = Number(w.balance) || 0
  const threshold = Number(w.threshold) || 0
  const pct = threshold > 0 ? Math.min(1, bal / threshold) : 1
  // ANY TIME, OVER A THRESHOLD (3 Oct 2026, migration 318). Ethan: a voucher "at any time over ten euro", cash "when it's
  // over a hundred euro". There is no window to wait for any more.
  const voucherMin = Number(w.voucher_min ?? 10) || 0
  const canCash = bal >= threshold && bal > 0
  const canVoucher = bal >= voucherMin && bal > 0

  async function ask(kind) {
    const label = kind === 'cash' ? tr('Ask for {a} in cash?', { a: money(bal, cur) }) : tr('Take {a} as a Tryp.com travel voucher?', { a: money(bal, cur) })
    const body = kind === 'cash'
      ? tr('Your invoice is raised and approved straight away, and your balance goes back to zero.')
      : tr('The team sends you a voucher code for the whole amount, usually within a few days. It appears under Rewards. Your balance goes back to zero.')
    if (!await confirm(body, { title: label, confirmLabel: kind === 'cash' ? tr('Ask for the cash') : tr('Take the voucher') })) return
    setBusy(kind)
    try {
      await vipRpc('vip_request_payout', { p_kind: kind })
      toastSuccess(kind === 'cash' ? tr('Done. Your payout is on its way.') : tr('Done. Your voucher code is on its way.'))
      reload(); onChanged?.()
    } catch (e) { notice(e.message) } finally { setBusy('') }
  }

  async function setAuto(on) {
    try { await vipRpc('vip_set_auto_payout', { p_on: on }); reload() } catch (e) { notice(e.message) }
  }

  // A MONTH WITH NOTHING IN IT IS NOT A ROW (4 Oct 2026). Ethan: it "shows being checked for September, but obviously there was
  // nothing in September, so there's no need to show anything there."
  const history = (w.history || []).filter((h) => Number(h.views) > 0 || Number(h.earned) > 0)

  return (
    <div className="vip-stage space-y-5">
      {/* ---------------- the balance ---------------- */}
      <section className="relative overflow-hidden rounded-card border border-gray-100 bg-white p-5 shadow-card animate-rise sm:p-6">
        <span aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-brand/10 blur-2xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-gray-400"><Icon name="wallet" className="h-4 w-4 text-brand" />{tr('Your balance')}</p>
            <p className="mt-1.5 text-4xl font-bold tabular-nums tracking-tight text-ink sm:text-5xl"><CountUp value={bal} format={(n) => money(n, cur)} /></p>
          </div>
          {(canCash || canVoucher) && (
            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3.5 py-2 text-xs font-bold text-emerald-700 animate-rise">
              <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/70" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" /></span>
              {canCash ? tr('Ready to withdraw') : tr('Ready for a voucher')}
            </span>
          )}
        </div>

        {threshold > 0 && (
          <div className="relative mt-5">
            <div className="flex items-baseline justify-between text-xs">
              <span className="font-semibold text-ink">{bal >= threshold ? tr('Ready for a cash payout') : tr('{a} to go for a cash payout', { a: money(threshold - bal, cur) })}</span>
              <span className="tabular-nums text-smoke">{money(bal, cur, { cents: false })} / {money(threshold, cur, { cents: false })}</span>
            </div>
            <div className="mt-2 h-3 overflow-hidden rounded-full bg-gray-100" role="progressbar" aria-valuenow={Math.round(pct * 100)} aria-valuemin={0} aria-valuemax={100}>
              <div
                className={cx('h-full rounded-full transition-[width] duration-1000 ease-out', bal >= threshold ? 'bg-gradient-to-r from-emerald-500 to-emerald-400' : 'bg-gradient-to-r from-brand to-brand-light')}
                style={{ width: `${Math.max(pct > 0 ? 3 : 0, Math.round(pct * 100))}%` }}
              />
            </div>
          </div>
        )}

        <div className="relative mt-5 grid gap-2.5 sm:grid-cols-2">
          <ChoiceButton
            icon="cash" title={tr('Cash to your bank')}
            hint={bal < threshold ? tr('From {a}', { a: money(threshold, cur, { cents: false }) }) : !w.payment_ready ? tr('Add your payment details first') : tr('The whole {a}', { a: money(bal, cur) })}
            disabled={!!preview || !canCash || !w.payment_ready} busy={busy === 'cash'} onClick={() => ask('cash')} primary
          />
          <ChoiceButton
            icon="plane" title={tr('Tryp.com travel voucher')}
            hint={bal < voucherMin ? tr('From {a}', { a: money(voucherMin, cur, { cents: false }) }) : tr('The whole {a}', { a: money(bal, cur) })}
            disabled={!!preview || !canVoucher} busy={busy === 'voucher'} onClick={() => ask('voucher')}
          />
        </div>
      </section>

      {/* ---------------- automatic payout + payment details ---------------- */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex items-center gap-3 rounded-card border border-gray-100 bg-white px-4 py-3.5 shadow-card animate-rise [animation-delay:60ms]">
          <Icon name="refresh" className="h-6 w-6 shrink-0 text-brand" strokeWidth={2} />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-ink">{tr('Pay me automatically')}</span>
            <span className="block text-xs text-smoke">{tr('Cash goes out by itself once a month takes you past {a}.', { a: money(threshold, cur, { cents: false }) })}</span>
          </span>
          <Toggle on={!!w.auto_payout} onChange={setAuto} label={tr('Pay me automatically')} disabled={!!preview} />
        </div>
        <Link to="/settings?section=payment" className="group flex items-center gap-3 rounded-card border border-gray-100 bg-white px-4 py-3.5 shadow-card transition-all duration-200 animate-rise [animation-delay:120ms] hoverable:hover:-translate-y-0.5 hoverable:hover:shadow-lift">
          <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', w.payment_ready ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600')}>
            <Icon name={w.payment_ready ? 'check' : 'alert'} className="h-5 w-5" strokeWidth={w.payment_ready ? 2.4 : 1.9} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-ink">{w.payment_ready ? tr('Payment details saved') : tr('Add your payment details')}</span>
            <span className="block text-xs text-smoke">{w.payment_ready ? tr('Change them any time.') : tr('Needed for a cash payout.')}</span>
          </span>
          <Icon name="chevronRight" className="h-4 w-4 shrink-0 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
        </Link>
      </div>

      {/* ---------------- the CPM panel: month by month ---------------- */}
      <section className="overflow-hidden rounded-card border border-gray-100 bg-white shadow-card animate-rise [animation-delay:160ms]">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4">
          <h2 className="flex items-center gap-2 text-[15px] font-bold text-ink"><Icon name="chart" className="h-5 w-5 text-brand" />{tr('Month by month')}</h2>
          <p className="text-xs text-smoke">{tr('Earned in total: {a}', { a: money(w.lifetime_earned, cur) })}</p>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[30rem] text-sm">
            <thead>
              <tr className="border-y border-gray-100 bg-cloud/50 text-left text-[10.5px] font-bold uppercase tracking-wide text-gray-400">
                <th className="px-5 py-2">{tr('Month')}</th>
                <th className="px-3 py-2 text-right">{tr('Views')}</th>
                <th className="px-3 py-2 text-right">{tr('Rate per 1,000')}</th>
                <th className="px-5 py-2 text-right">{tr('Earned')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              <tr className="bg-brand-tint/30">
                <td className="px-5 py-2.5 font-semibold text-ink">
                  {monthLabel(w.this_month?.year, w.this_month?.month)}
                  <span className="ml-2 rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">{tr('Live')}</span>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{nf(w.this_month?.views)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-smoke">{cur} {rate(w.this_month?.cpm)}</td>
                <td className="px-5 py-2.5 text-right font-bold tabular-nums text-ink">{money(w.this_month?.earned, cur)}</td>
              </tr>
              {history.map((h) => (
                <tr key={`${h.year}-${h.month}`}>
                  <td className="px-5 py-2.5 font-semibold text-ink">
                    {monthLabel(h.year, h.month)}
                    {h.status === 'draft' && <span className="ml-2 text-[10px] font-bold uppercase tracking-wide text-amber-600">{tr('Being checked')}</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{nf(h.views)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-smoke">{cur} {rate(h.cpm)}</td>
                  <td className="px-5 py-2.5 text-right font-bold tabular-nums text-ink">{money(h.earned, cur)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {history.length === 0 && <p className="px-5 py-4 text-xs text-smoke">{tr('Your first month appears here once it closes.')}</p>}
      </section>

      {/* ---------------- everything that moved the balance ---------------- */}
      {(w.entries || []).length > 0 && (
        <section className="animate-rise [animation-delay:200ms]">
          <h2 className="mb-3 text-[15px] font-bold text-ink">{tr('Balance history')}</h2>
          <ul className="space-y-2">
            {w.entries.map((e, i) => {
              const k = ENTRY[e.kind] || ENTRY.adjust
              const st = entryState(e, tr)
              return (
                <li key={e.id} className="flex items-center gap-3 rounded-card border border-gray-100 bg-white px-4 py-3 shadow-card animate-rise" style={{ animationDelay: `${220 + i * 40}ms` }}>
                  <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', Number(e.amount) > 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-brand-tint text-brand')}><Icon name={k.icon} className="h-[18px] w-[18px]" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">{e.year ? `${tr(k.label)}: ${monthLabel(e.year, e.month)}` : tr(k.label)}{e.auto ? ` · ${tr('automatic')}` : ''}</span>
                    <span className="block truncate text-xs text-smoke">{formatDate(e.at)}{e.kind === 'adjust' && e.note ? ` · ${e.note}` : ''}{e.voucher_code ? ` · ${tr('Code')}: ${e.voucher_code}` : ''}</span>
                  </span>
                  {st && <span className={cx('hidden shrink-0 rounded-full px-2.5 py-1 text-[10.5px] font-bold sm:inline', st.tone)}>{st.label}</span>}
                  <span className={cx('shrink-0 text-right font-bold tabular-nums', Number(e.amount) > 0 ? 'text-emerald-700' : 'text-ink')}>{Number(e.amount) > 0 ? '+' : '-'}{money(Math.abs(e.amount), e.currency)}</span>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </div>
  )
}

function ChoiceButton({ icon, title, hint, disabled, busy, onClick, primary }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      className={cx(
        'group flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-all duration-200 disabled:cursor-not-allowed',
        primary && !disabled ? 'border-transparent bg-gradient-to-r from-brand to-brand-light text-white shadow-card hoverable:hover:-translate-y-0.5 hoverable:hover:shadow-lift'
          : !disabled ? 'border-brand/30 bg-white text-ink hoverable:hover:-translate-y-0.5 hoverable:hover:border-brand hoverable:hover:shadow-card'
            : 'border-gray-100 bg-cloud/60 text-gray-400',
      )}
    >
      <span className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-transform duration-200 group-enabled:group-hover:scale-105', primary && !disabled ? 'bg-white/20' : disabled ? 'bg-white' : 'bg-brand-tint text-brand')}>
        {busy ? <Spinner className="h-4 w-4" /> : <Icon name={icon} className="h-5 w-5" />}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-bold">{title}</span>
        <span className={cx('block truncate text-xs', primary && !disabled ? 'text-white/85' : 'text-smoke')}>{hint}</span>
      </span>
    </button>
  )
}

// STAYING IN (2 Oct 2026; AND on 4 Oct; back to OR on 6 Oct). Ethan: keeping a VIP place is "5 videos or 1 video with 20k+ views" -
// two roads, either is enough, drawn as two bars with "or" between them. `views` is the best single video's.
export function StayInCard({ compact = false }) {
  const tr = useT()
  const { data: w } = useOptionalRpc('vip_my_wallet')
  const r = w?.requirement
  if (!r || r.on === false) return null
  const met = !!r.met
  const views = Number(r.best_video ?? r.views ?? r.best_views) || 0
  // SMALL, NOT THE MAIN THING (3 Oct 2026). One row: the status, and the two things to reach side by side.
  if (compact) {
    return (
      <section className={cx('rounded-card border bg-white px-4 py-3.5 shadow-card', met ? 'border-emerald-100' : 'border-gray-100')}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-[13.5px] font-bold text-ink"><Icon name="shield" className="h-4 w-4 text-brand" />{tr('Keep your VIP place')}</h2>
          <span className={cx('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide transition-colors duration-500', met ? 'bg-emerald-50 text-emerald-700' : 'bg-cloud text-smoke')}>{met ? tr('Done this month') : tr('Not yet')}</span>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-5">
          <Road small label={tr('{n} videos', { n: nf(r.need_videos) })} value={r.videos} target={r.need_videos} />
          <Road small label={tr('One video with {n} views', { n: nf(r.need_views) })} value={views} target={r.need_views} />
        </div>
      </section>
    )
  }
  return (
    <section className={cx('rounded-card border bg-white p-5 shadow-card', met ? 'border-emerald-100' : 'border-gray-100')}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <h2 className="flex items-center gap-2 text-[15px] font-bold text-ink"><Icon name="shield" className="h-5 w-5 text-brand" />{tr('Keep your VIP place')}</h2>
        <span className={cx('shrink-0 rounded-full px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wide transition-colors duration-500', met ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700')}>
          {met ? tr('Done this month') : tr('Not yet')}
        </span>
      </div>
      <Road label={tr('{n} videos this month', { n: nf(r.need_videos) })} value={r.videos} target={r.need_videos} />
      <div className="my-3 flex items-center gap-3 text-[10.5px] font-bold uppercase tracking-[0.2em] text-gray-300"><span className="h-px flex-1 bg-gray-100" />{tr('or')}<span className="h-px flex-1 bg-gray-100" /></div>
      <Road label={tr('One video with {n} views', { n: nf(r.need_views) })} value={views} target={r.need_views} />
      <p className="mt-4 text-xs leading-relaxed text-smoke">{tr('Checked at the end of every month. Videos count in the month they were posted.')}</p>
    </section>
  )
}

function Road({ label, value, target, small = false }) {
  const pct = target > 0 ? Math.min(1, value / target) : 0
  const done = target > 0 && value >= target
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <p className={cx('flex min-w-0 items-center gap-1.5 truncate font-semibold text-ink', small ? 'text-[12px]' : 'text-[13px]')}>{done && <Icon name="check" className="h-3.5 w-3.5 text-emerald-600" strokeWidth={2.6} />}{label}</p>
        <p className="text-xs tabular-nums text-smoke"><span className={cx('font-bold', value >= target ? 'text-emerald-600' : 'text-ink')}>{nf(value)}</span> / {nf(target)}</p>
      </div>
      <div className={cx('overflow-hidden rounded-full bg-gray-100', small ? 'mt-1.5 h-1.5' : 'mt-2 h-2.5')}>
        <div className={cx('h-full rounded-full transition-[width] duration-1000 ease-out', value >= target ? 'bg-gradient-to-r from-emerald-500 to-emerald-400' : 'bg-gradient-to-r from-brand to-brand-light')} style={{ width: `${Math.max(pct > 0 ? 3 : 0, Math.round(pct * 100))}%` }} />
      </div>
    </div>
  )
}
