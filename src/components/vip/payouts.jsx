import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Modal, Skeleton, Spinner } from '../ui'
import Icon from '../Icon'
import InvoicePreview from '../InvoicePreview'
import { CountUp } from '../network/Motion'
import { downloadInvoicePdf } from '../../lib/invoicePdf'
import { invoiceFromRow } from '../../lib/sendInvoice'
import { cx } from '../../lib/utils'
import { money, monthLabel, nf, rate } from '../../lib/vip'
import { useT } from '../../lib/i18n'

// PAYOUTS (1 Oct 2026). Ethan: "they can view their invoices and perhaps download them as well once they're sent.
// Obviously, I'll be the one sending them. Just improve that."
//
// Three numbers on top (paid to you, on its way, months paid), the payment details as one quiet row, then every
// month's statement with where its invoice is (checked, approved, sent, paid) drawn as steps. Once the team has sent
// the invoice it can be opened right here and downloaded as the PDF the team sent.

const STEPS = [
  { key: 'checked', label: 'Checked' },
  { key: 'approved', label: 'Approved' },
  { key: 'sent', label: 'Invoice sent' },
  { key: 'paid', label: 'Paid' },
]

function stageOf(s) {
  if (s.paid_at || s.invoice_stage === 'paid') return 3
  if (s.invoice_stage === 'sent') return 2
  if (s.invoice_stage === 'approved' || s.status === 'approved') return 1
  return 0
}

export function PayoutSummary({ overview, statements, programme }) {
  const tr = useT()
  const cur = programme.currency
  const list = statements || []
  const paid = list.filter((s) => stageOf(s) === 3).reduce((a, s) => a + Number(s.total || 0), 0)
  const waiting = list.filter((s) => stageOf(s) < 3).reduce((a, s) => a + Number(s.total || 0), 0)
  const months = list.filter((s) => stageOf(s) === 3).length
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: tr('Paid to you'), value: paid, fmt: (n) => money(n, cur, { cents: false }), icon: 'check' },
          { label: tr('On its way'), value: waiting, fmt: (n) => money(n, cur, { cents: false }), icon: 'clock' },
          { label: tr('Months paid'), value: months, fmt: nf, icon: 'calendar' },
        ].map((t, i) => (
          <div key={t.label} className="rounded-card border border-gray-100 bg-white px-3.5 py-3 shadow-card animate-rise sm:px-4" style={{ animationDelay: `${i * 60}ms` }}>
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-400"><Icon name={t.icon} className="h-3.5 w-3.5 text-brand" />{t.label}</p>
            <p className="mt-1 text-xl font-bold tabular-nums text-ink sm:text-2xl"><CountUp value={t.value} format={t.fmt} /></p>
          </div>
        ))}
      </div>

      <Link to="/settings?section=payment" className="group flex items-center gap-3 rounded-card border border-gray-100 bg-white px-4 py-3.5 shadow-card transition-all duration-200 hoverable:hover:-translate-y-0.5 hoverable:hover:shadow-lift">
        <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', overview.payment_ready ? 'bg-emerald-50 text-emerald-600' : 'bg-brand-tint text-brand')}>
          <Icon name={overview.payment_ready ? 'check' : 'wallet'} className="h-5 w-5" strokeWidth={overview.payment_ready ? 2.4 : 1.9} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-ink">{overview.payment_ready ? tr('Your payment details are saved') : tr('Add your payment details')}</span>
          <span className="block text-xs text-smoke">{overview.payment_ready ? tr('Change them any time in Settings.') : tr('We cannot pay your monthly invoice until they are saved.')}</span>
        </span>
        <span className="shrink-0 text-xs font-bold text-brand">{overview.payment_ready ? tr('Change') : tr('Add them')}</span>
      </Link>

      <p className="text-sm leading-relaxed text-smoke">{tr('On the last day of each month we take a final reading of your views. Your statement appears here once the team has checked it, and your invoice follows.')}</p>

      {statements === null ? <Skeleton className="h-24 w-full rounded-card" />
        : list.length === 0
          ? (
            <div className="rounded-card border border-dashed border-gray-200 px-6 py-10 text-center">
              <Icon name="wallet" className="mx-auto h-7 w-7 text-gray-300" />
              <p className="mt-2 text-sm font-semibold text-ink">{tr('No statements yet')}</p>
              <p className="mt-1 text-sm text-smoke">{tr('Your first one arrives after this month closes.')}</p>
            </div>
          )
          : <ul className="space-y-3">{list.map((s, i) => <Statement key={s.id} s={s} programmeCpm={programme.cpm} delay={i * 60} />)}</ul>}
    </div>
  )
}

function Statement({ s, programmeCpm, delay }) {
  const tr = useT()
  const [open, setOpen] = useState(false)
  const [invoice, setInvoice] = useState(null)
  const [busy, setBusy] = useState('')
  const stage = stageOf(s)
  const sent = stage >= 2 && s.invoice_id
  const cash = (s.bonuses || []).filter((b) => (b.reward || 'cash') === 'cash')
  const vouchers = (s.bonuses || []).filter((b) => b.reward === 'voucher')

  async function loadInvoice() {
    const { data } = await supabase.from('invoices').select('*').eq('id', s.invoice_id).single()
    return data ? invoiceFromRow(data) : null
  }
  async function view() {
    setBusy('view')
    try { setInvoice(await loadInvoice()) } finally { setBusy('') }
  }
  async function download() {
    setBusy('pdf')
    try { const inv = invoice || await loadInvoice(); if (inv) await downloadInvoicePdf(inv) } finally { setBusy('') }
  }

  return (
    <li className="overflow-hidden rounded-card border border-gray-100 bg-white shadow-card animate-rise" style={{ animationDelay: `${delay}ms` }}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-3 px-4 pb-3 pt-4 text-left">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand"><Icon name="calendar" className="h-5 w-5" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-bold text-ink">{monthLabel(s.year, s.month)}</span>
          <span className="block text-xs text-smoke">{tr('{n} views', { n: nf(s.views) })}</span>
        </span>
        <span className="text-right text-lg font-bold tabular-nums text-ink">{money(s.total, s.currency)}</span>
        <Icon name="chevronDown" className={cx('h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200', open && 'rotate-180')} />
      </button>

      {Number(s.total) > 0 && (
        <ol className="flex items-center gap-1 px-4 pb-4" aria-label={tr('Where your invoice is')}>
          {STEPS.map((st, i) => (
            <li key={st.key} className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className={cx('h-1.5 rounded-full transition-colors duration-500', i <= stage ? (stage === 3 ? 'bg-emerald-500' : 'bg-brand') : 'bg-gray-100')} />
              <span className={cx('truncate text-[10px] font-bold uppercase tracking-wide', i <= stage ? (stage === 3 ? 'text-emerald-600' : 'text-brand') : 'text-gray-300')}>{tr(st.label)}</span>
            </li>
          ))}
        </ol>
      )}

      {sent && (
        <div className="flex flex-wrap gap-2 border-t border-gray-50 px-4 py-3">
          <button type="button" onClick={view} disabled={!!busy} className="btn-secondary !py-2 text-xs">{busy === 'view' ? <Spinner className="h-3.5 w-3.5" /> : <Icon name="eye" className="h-3.5 w-3.5" />}{tr('View invoice')}</button>
          <button type="button" onClick={download} disabled={!!busy} className="btn-secondary !py-2 text-xs">{busy === 'pdf' ? <Spinner className="h-3.5 w-3.5" /> : <Icon name="download" className="h-3.5 w-3.5" />}{tr('Download PDF')}</button>
        </div>
      )}

      {open && (
        <div className="animate-rise space-y-2 border-t border-gray-100 bg-cloud/30 px-4 py-4 text-sm">
          <Line label={tr('{n} views at {r} per 1,000', { n: nf(s.views), r: `${s.currency} ${rate(s.cpm ?? programmeCpm)}` })} value={money(s.base, s.currency)} />
          {s.cap_applied && <p className="text-xs text-smoke">{tr('Your monthly cap applied to the views pay.')}</p>}
          {Number(s.rollover_in) > 0 && <Line label={tr('Carried over from last month')} value={money(s.rollover_in, s.currency)} />}
          {cash.map((b, i) => <Line key={`c${i}`} label={b.label} value={`+ ${money(b.amount, s.currency)}`} good />)}
          {vouchers.map((b, i) => <Line key={`v${i}`} label={`${b.label} (${tr('voucher')})`} value={money(b.amount, s.currency, { cents: false })} good />)}
          {(s.adjustments || []).map((a, i) => <Line key={`a${i}`} label={a.label} value={`${Number(a.amount) >= 0 ? '+' : '-'} ${money(Math.abs(a.amount), s.currency)}`} />)}
          <div className="flex items-center justify-between border-t border-gray-200 pt-2.5">
            <span className="font-bold text-ink">{tr('Paid to you')}</span>
            <span className="text-base font-bold tabular-nums text-brand">{money(s.total, s.currency)}</span>
          </div>
        </div>
      )}

      <Modal open={!!invoice} onClose={() => setInvoice(null)} title={tr('Invoice {n}', { n: invoice?.number || '' })} wide>
        {invoice && (
          <div className="space-y-4">
            <InvoicePreview inv={invoice} />
            <button type="button" onClick={download} disabled={!!busy} className="btn-primary w-full justify-center">{busy === 'pdf' ? <Spinner className="h-4 w-4" /> : <Icon name="download" className="h-4 w-4" />}{tr('Download PDF')}</button>
          </div>
        )}
      </Modal>
    </li>
  )
}

function Line({ label, value, good }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-smoke">{label}</span>
      <span className={cx('shrink-0 font-semibold tabular-nums', good ? 'text-emerald-700' : 'text-ink')}>{value}</span>
    </div>
  )
}
