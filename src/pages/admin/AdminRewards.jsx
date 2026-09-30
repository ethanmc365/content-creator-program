import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Avatar, Badge, CopyButton, EmptyState, Modal, PageHeader, Skeleton, Spinner, StatCard, Select } from '../../components/ui'
import { cx } from '../../lib/utils'
import Icon from '../../components/Icon'
import { formatDate, formatMoney, downloadCsv } from '../../lib/utils'
import { notice } from '../../lib/confirm'
import { payeeFromPrivate, payeeStarted, formatSortCode, formatIban, cleanIban, invoiceRef, EMPTY_PAYEE, validatePayee } from '../../lib/invoice'
import PaymentDetailsFields from '../../components/PaymentDetails'
import InvoicesPanel from './InvoicesPanel'
import InvoiceQueue from './InvoiceQueue'
import MarketScope, { useScopedMarkets } from '../../components/admin/MarketScope'
import { useInvoiceViewer } from '../../components/admin/InvoiceModal'
import { isRealMember } from '../../lib/members'
import { awaitingCode } from '../../lib/wallet'
import { rewardsTotal } from '../../lib/programme'
import { groupRewards } from '../../lib/rewardsGrouping'
import VoucherTicket from '../../components/VoucherTicket'
import VouchersPanel from './VouchersPanel'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CHART, FILL, axisTick, axisTickSmall, tooltipStyle } from '../../components/charts/chartTheme'

// A `rewardsTotal` result, printed. "≈" whenever a conversion was involved,
// because that figure moves with the FX rate and is not the exact amount that
// left anybody's account.
const money = (t) => `${t.converted ? '≈ ' : ''}${formatMoney(t.amount, t.currency)}`

// Build the label / display / copy-value rows for a creator's saved bank
// details, per currency. Numbers copy as raw digits so they paste cleanly into
// a banking app; names/addresses copy as shown.
function detailRows(p) {
  const rows = []
  const add = (label, display, copy) => { if (display) rows.push({ label, display, copy: copy ?? display }) }
  add('Account holder', p.name)
  add('Bank', p.bank)
  if (p.currency === 'EUR') {
    add('IBAN', formatIban(p.iban), cleanIban(p.iban))
    add('BIC / SWIFT', p.bic)
  } else if (p.currency === 'GBP') {
    add('Sort code', formatSortCode(p.sortCode), p.sortCode)
    add('Account number', p.accountNumber)
  }
  add('Address', p.address)
  return rows
}


// ---------------------------------------------------- referral vouchers
//
// ON THE PAYOUTS TAB, WHERE IT IS ACTUALLY DUE.
//
// It sat beside the invoice queue for a while, and that was wrong for a plain
// reason Ethan put better than I would: a referral pays a Tryp.com VOUCHER.
// There is no document, no approval and no bank transfer, so parking it next to
// the invoice pipeline implied it went through the same machinery. It belongs
// with the other vouchers, which is here.
//
// It keeps its own section rather than dissolving into the reward list, because
// "who is owed a referral voucher" is a question somebody asks on its own.
function ReferralSection({ loading, rewards, owed, paid, pendingCount, busyId, onPay }) {
  const [open, setOpen] = useState(false)
  if (!loading && rewards.length === 0) return null

  return (
    <section className="mb-8 overflow-hidden rounded-card border border-gray-100 bg-white shadow-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full flex-wrap items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-cloud/50"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand text-white">
          <Icon name="share" className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold">Referral vouchers</span>
          <span className="mt-0.5 block text-xs text-smoke">
            {pendingCount > 0 ? `${money(owed)} owed` : 'Nothing outstanding'}
            {paid.amount > 0 && ` · ${money(paid)} paid`}
          </span>
        </span>
        {pendingCount > 0 && (
          <span className="shrink-0 rounded-full bg-brand px-2.5 py-0.5 text-[11px] font-bold tabular-nums text-white">
            {pendingCount}
          </span>
        )}
        <Icon name="chevronRight" className={cx('h-4 w-4 shrink-0 text-gray-300 transition-transform', open && 'rotate-90')} />
      </button>

      {open && (
        <div className="border-t border-gray-100">
          {loading ? (
            <div className="space-y-2 p-4">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : (
            rewards.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-4 border-b border-gray-50 px-5 py-3.5 last:border-0 sm:px-7">
                <Avatar src={r.profiles?.photo_url} name={r.profiles?.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{r.profiles?.name}</p>
                  <p className="truncate text-xs text-smoke">brought in {r.referred?.name || 'a creator'}</p>
                </div>
                <span className="font-bold tabular-nums">{formatMoney(r.amount, r.currency)}</span>
                {r.status === 'pending' ? (
                  <button onClick={() => onPay(r)} disabled={busyId === r.id} className="btn-primary !py-2 text-xs">
                    {busyId === r.id ? <Spinner className="h-4 w-4" /> : 'Mark paid'}
                  </button>
                ) : (
                  <Badge tone="green">paid</Badge>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </section>
  )
}

// ONE REWARD ROW. Extracted so a challenge's section and the (former) flat
// list draw it identically - the row itself did not change, only what wraps it.
function RewardRow({ r, invoiceOf, viewer, busyId, onInvoice, onDistribute }) {
  return (
    <div
      {...(invoiceOf.has(r.id)
        ? {
            role: 'button',
            tabIndex: 0,
            onClick: () => viewer.open(invoiceOf.get(r.id)),
            onKeyDown: (e) => {
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); viewer.open(invoiceOf.get(r.id)) }
            },
          }
        : {})}
      className={cx(
        'flex flex-wrap items-center gap-4 border-b border-gray-50 px-5 py-4 last:border-0 sm:px-7',
        invoiceOf.has(r.id) && 'cursor-pointer transition-colors hover:bg-cloud/50',
      )}
    >
      <Avatar src={r.profiles?.photo_url} name={r.profiles?.name} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{r.profiles?.name}</p>
        <p className="flex items-center gap-1 truncate text-xs text-smoke">
          <Icon name={r.reward_type === 'cash' ? 'cash' : 'ticket'} className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">
            {r.source === 'milestone' ? 'Milestone voucher'
              : r.reward_type === 'cash' ? 'Cash' : 'Voucher'}
            {r.payment_notes && ` · ${r.payment_notes}`}
          </span>
        </p>
        {r.voucher_code && (
          <p className="mt-0.5 flex items-center gap-1.5 text-xs">
            <code className="rounded bg-cloud px-1.5 py-0.5 font-mono font-semibold tracking-wider text-ink">{r.voucher_code}</code>
            {r.used_at && <span className="font-medium text-smoke">used {formatDate(r.used_at)}</span>}
          </p>
        )}
      </div>
      <span className="font-bold tabular-nums">{formatMoney(r.amount, r.currency)}</span>
      {/* A DISTRIBUTED VOUCHER WITH NO CODE IS NOT DONE (29 Sep 2026).
          It was wearing the same green "distributed" badge as a voucher the
          creator can actually spend, so six of them sat here looking finished
          while six creators had nothing to redeem. The badge now says which
          of the two it is, and the row sorts into the "Needs a code" filter. */}
      {(() => {
        // A SENT INVOICE IS NOT A PAID ONE (1 Oct 2026). It sits in "Still to pay" with the day
        // it settles by itself (seven days after sending, `auto_settle_sent_invoices_internal`).
        const inv = invoiceOf.get(r.id)
        if (r.reward_type === 'cash' && inv && inv.stage !== 'paid') {
          if (inv.stage === 'sent' && inv.sent_at) {
            const due = new Date(new Date(inv.sent_at).getTime() + 7 * 86400000)
            return <Badge tone="amber">sent · paid {formatDate(due)}</Badge>
          }
          return <Badge tone="amber">{STAGE_WORD[inv.stage] || inv.stage}</Badge>
        }
        return (
          <Badge tone={needsCode(r) ? 'amber' : r.status === 'distributed' ? 'green' : 'amber'}>
            {needsCode(r) ? 'needs a code' : r.issued_via === 'chat' && !r.voucher_code ? 'sent by chat' : r.status === 'distributed' ? (r.reward_type === 'cash' ? 'paid' : 'handed over') : 'to pay'}
          </Badge>
        )
      })()}
      {/* ONE BUTTON PER PAYMENT.
          If an invoice is already carrying this prize, that invoice is
          the truth about whether it has been paid. It used to be a
          button reading "On invoice Tryp.com 003" that navigated to a
          different tab and left you to find the row again. A payout row
          IS an invoice - clicking it shows you the invoice. */}
      {invoiceOf.has(r.id) ? (
        <span className="text-xs font-medium text-brand">
          {invoiceRef(invoiceOf.get(r.id).number)} →
        </span>
      ) : (
        <>
          {r.reward_type === 'cash' && (
            <button onClick={() => onInvoice(r)} className="btn-secondary !py-2 text-xs">Invoice</button>
          )}
          {r.status === 'pending' && (
            <button onClick={() => onDistribute(r)} disabled={busyId === r.id} className="btn-primary !py-2 text-xs">
              {busyId === r.id ? <Spinner className="h-4 w-4" /> : 'Mark distributed'}
            </button>
          )}
          {r.status === 'distributed' && r.reward_type === 'voucher' && (
            <button onClick={() => onDistribute(r)} className="btn-secondary !py-2 text-xs">
              {r.voucher_code ? 'Edit code' : 'Add code'}
            </button>
          )}
        </>
      )}
    </div>
  )
}

const GROUP_ICON = { challenge: 'trophy', milestone: 'flag', other: 'wallet' }
const STAGE_WORD = { draft: 'invoice draft', awaiting_approval: 'awaiting approval', approved: 'approved, to send', rejected: 'invoice rejected' }

// ONE SECTION PER CHALLENGE (plus milestones, plus the rest) - see
// lib/rewardsGrouping. Capped at six rows so a challenge with forty winners
// does not turn the page back into one long scroll; "+N more" opens the rest.
function RewardGroupCard({ group, ...rowProps }) {
  // PAID PRIZES, FOLDED (1 Oct 2026). Ethan: the by-challenge list should "look good and tidy
  // whenever there are more challenges". Everything owed is in "Still to pay" above, so a
  // challenge here is a settled record: one line with its total, opened when you need a name.
  const [open, setOpen] = useState(false)
  const paid = rewardsTotal(group.rows)
  return (
    <section className="overflow-hidden rounded-card border border-gray-100 bg-white shadow-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-cloud/40 sm:px-5"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-brand">
          <Icon name={GROUP_ICON[group.kind] || 'wallet'} className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{group.title}</span>
          <span className="mt-0.5 block text-xs text-smoke">{group.rows.length} {group.rows.length === 1 ? 'prize' : 'prizes'} paid</span>
        </span>
        <span className="shrink-0 text-sm font-bold tabular-nums">{money(paid)}</span>
        <Icon name="chevronDown" className={cx('h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200', open && 'rotate-180')} />
      </button>
      {open && <div className="border-t border-gray-50">{group.rows.map((r) => <RewardRow key={r.id} r={r} {...rowProps} />)}</div>}
    </section>
  )
}

// A STRIP THAT CANNOT BE MISSED (30 Sep 2026): whatever still needs paying or handing over,
// pinned above everything else on its tab, in the warm colour of "your move". Empty, it is one
// quiet green line so a clear desk is also visible.
function StillToPay({ title, hint, rows, loading, openInvoices = 0, ...rowProps }) {
  if (loading) return <Skeleton className="mb-8 h-24 w-full" />
  // An invoice raised by hand (no prize behind it) that is sent and not yet paid is still money
  // going out, so the desk is not clear while one exists.
  if (rows.length === 0 && openInvoices > 0) {
    return (
      // Brand, not yellow (2 Oct 2026), and no "under Invoices below".
      <div className="mb-8 flex items-center gap-2.5 rounded-card border border-gray-100 bg-white px-5 py-3.5 text-sm font-medium text-ink shadow-card">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-brand"><Icon name="clock" className="h-4 w-4" /></span>
        {openInvoices === 1 ? 'One invoice is sent and not marked paid yet.' : `${openInvoices} invoices are sent and not marked paid yet.`}
      </div>
    )
  }
  if (rows.length === 0) {
    return (
      <div className="mb-8 flex items-center gap-2.5 rounded-card border border-emerald-100 bg-emerald-50/60 px-5 py-3.5 text-sm font-medium text-emerald-700">
        <Icon name="check" className="h-4 w-4" /> Nothing waiting. All paid up.
      </div>
    )
  }
  const total = rewardsTotal(rows)
  return (
    <section className="mb-8 overflow-hidden rounded-card border border-brand/25 bg-white shadow-card animate-fade-up">
      <div className="flex flex-wrap items-center gap-3 bg-gradient-to-r from-brand to-brand-light px-5 py-3.5 text-white sm:px-7">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20"><Icon name="alert" className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold">{title}</p>
          <p className="text-xs text-white/85">{hint}</p>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-bold tabular-nums text-brand shadow-card">{rows.length} · {money(total)}</span>
      </div>
      <div>{rows.map((r) => <RewardRow key={r.id} r={r} {...rowProps} />)}</div>
    </section>
  )
}

// PAID OUT SO FAR, READABLE (30 Sep 2026). Ethan: "The payout so far, everything looks hard to read
// there. The information is just in a line. Improve it." It was two rows of label and number. Now: the
// total, the split between cash and vouchers as one bar with both halves named, how many payouts and
// creators that is, and the last six months as a small chart (cash and vouchers stacked, in euros).
function PaidOut({ rewards, cashOut, voucherOut, paid }) {
  const paidRows = rewards.filter((r) => r.status === 'distributed')
  const total = (cashOut.amount || 0) + (voucherOut.amount || 0)
  const cashPct = total > 0 ? Math.round(((cashOut.amount || 0) / total) * 100) : 0
  const people = new Set(paidRows.map((r) => r.creator_id || r.profiles?.id).filter(Boolean)).size
  const months = useMemo(() => {
    const now = new Date()
    const out = []
    for (let i = 5; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${d.getMonth()}`
      const inMonth = paidRows.filter((r) => { const t = r.distributed_at && new Date(r.distributed_at); return t && `${t.getFullYear()}-${t.getMonth()}` === key })
      out.push({
        name: d.toLocaleDateString('en-GB', { month: 'short' }),
        cash: rewardsTotal(inMonth.filter((r) => r.reward_type === 'cash')).amount || 0,
        vouchers: rewardsTotal(inMonth.filter((r) => r.reward_type === 'voucher')).amount || 0,
      })
    }
    return out
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rewards])
  const eur = (n) => formatMoney(n, 'EUR')
  return (
    <section className="card">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold">Paid out so far</h2>
        <span className="text-xs text-smoke">{paidRows.length} payouts · {people} creators</span>
      </div>
      <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight">{money(paid)}</p>
      <div className="mt-4 flex h-3 gap-[3px] overflow-hidden rounded-full bg-cloud">
        {cashPct > 0 && <span className="kpi-fill h-full rounded-l-full bg-gradient-to-r from-brand-light to-brand" style={{ width: `${cashPct}%` }} />}
        {cashPct < 100 && total > 0 && <span className="kpi-fill h-full rounded-r-full bg-[#fbc9a6]" style={{ width: `${100 - cashPct}%` }} />}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-cloud/70 px-3.5 py-2.5">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-smoke"><span className="h-2 w-2 rounded-full bg-brand" />Cash · {cashPct}%</p>
          <p className="mt-0.5 text-lg font-bold tabular-nums">{money(cashOut)}</p>
        </div>
        <div className="rounded-xl bg-cloud/70 px-3.5 py-2.5">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-smoke"><span className="h-2 w-2 rounded-full bg-[#fbc9a6]" />Vouchers · {total > 0 ? 100 - cashPct : 0}%</p>
          <p className="mt-0.5 text-lg font-bold tabular-nums">{money(voucherOut)}</p>
        </div>
      </div>
      <p className="mb-1 mt-5 text-[11px] font-bold uppercase tracking-wide text-gray-400">Last six months</p>
      <div className="h-32">
        <ResponsiveContainer>
          <BarChart data={months} margin={{ top: 4, right: 0, left: -18, bottom: 0 }} barCategoryGap="30%">
            <CartesianGrid vertical={false} stroke={CHART.grid} />
            <XAxis dataKey="name" tick={axisTick} axisLine={false} tickLine={false} />
            <YAxis tick={axisTickSmall} axisLine={false} tickLine={false} tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 100) / 10}k` : v)} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(217,68,7,0.05)' }} formatter={(v, k) => [eur(v), k === 'cash' ? 'Cash' : 'Vouchers']} />
            <Bar dataKey="cash" stackId="p" fill={FILL.brand} maxBarSize={28} />
            <Bar dataKey="vouchers" stackId="p" fill={FILL.light} radius={[5, 5, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}

// THE FIRST PAGE (30 Sep 2026): the money at a glance and whatever needs following up.
function Overview({ loading, spend, paid, pending, invoiceStages, cashToPay, vouchersNeedCode, referralPending, rewards, go }) {
  const count = (st) => invoiceStages.filter((i) => i.stage === st).length
  const jobs = [
    { n: count('awaiting_approval'), icon: 'check', label: 'invoices to approve', to: 'cash' },
    { n: count('approved'), icon: 'money', label: 'approved invoices to send', to: 'cash' },
    { n: cashToPay.length, icon: 'wallet', label: 'cash prizes still to pay', to: 'cash' },
    { n: vouchersNeedCode.length, icon: 'ticket', label: 'vouchers that need a code', to: 'vouchers' },
    { n: referralPending.length, icon: 'share', label: 'referral vouchers owed', to: 'vouchers' },
  ].filter((j) => j.n > 0)
  const recent = rewards.filter((r) => r.status === 'distributed' && r.distributed_at).sort((a, b) => new Date(b.distributed_at) - new Date(a.distributed_at)).slice(0, 5)
  const cashOut = rewardsTotal(rewards.filter((r) => r.reward_type === 'cash' && r.status === 'distributed'))
  const voucherOut = rewardsTotal(rewards.filter((r) => r.reward_type === 'voucher' && r.status === 'distributed'))
  if (loading) return <div className="space-y-4"><Skeleton className="h-28 w-full" /><Skeleton className="h-48 w-full" /></div>
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total community spend" value={money(spend)} />
        {/* SAME AS ITS NEIGHBOURS (30 Sep 2026). Ethan: "For that card that says Distributed, it's a
            different colour. I don't like that it's a different colour. Just align it with the others." */}
        <StatCard label="Distributed" value={money(paid)} />
        <StatCard label="Pending payout" value={money(pending)} hint={pending.amount > 0 ? "Don't keep creators waiting" : 'All settled'} />
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold">To follow up</h2>
        {jobs.length === 0 ? (
          <div className="flex items-center gap-2.5 rounded-card border border-emerald-100 bg-emerald-50/60 px-5 py-4 text-sm font-medium text-emerald-700">
            <Icon name="check" className="h-4 w-4" /> Nothing to chase. Every prize is paid and every voucher handed over.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {jobs.map((j) => (
              <button key={j.label} type="button" onClick={() => go(j.to)} className="group flex items-center gap-3 rounded-card border border-gray-100 bg-white px-4 py-3.5 text-left shadow-card transition-all duration-200 hoverable:hover:-translate-y-0.5 hoverable:hover:border-brand/30 hoverable:hover:shadow-lift">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand"><Icon name={j.icon} className="h-5 w-5" /></span>
                <span className="min-w-0 flex-1"><span className="block text-xl font-bold tabular-nums leading-none">{j.n}</span><span className="mt-1 block truncate text-xs text-smoke">{j.label}</span></span>
                <Icon name="chevronRight" className="h-4 w-4 shrink-0 text-gray-300 transition-transform group-hover:translate-x-0.5" />
              </button>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <PaidOut rewards={rewards} cashOut={cashOut} voucherOut={voucherOut} paid={paid} />
        <section className="card">
          <h2 className="mb-3 text-base font-semibold">Recently paid</h2>
          {recent.length === 0 ? <p className="text-sm text-smoke">Nothing yet.</p> : (
            <ul className="divide-y divide-gray-50">
              {recent.map((r) => (
                <li key={r.id} className="flex items-center gap-3 py-2.5">
                  <Avatar src={r.profiles?.photo_url} name={r.profiles?.name} size="xs" />
                  <span className="min-w-0 flex-1 truncate text-sm">{r.profiles?.name}<span className="text-smoke"> · {r.reward_type === 'cash' ? 'cash' : 'voucher'}</span></span>
                  <span className="text-sm font-bold tabular-nums">{formatMoney(r.amount, r.currency)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

// The community's money hub: rewards (payouts) and prize invoices live
// together. A reward row's Invoice button jumps straight into the invoice
// composer with the creator, amount and challenge prefilled.
// A voucher that has been handed over but has no code on it yet. The creator
// sees a ticket saying the team is preparing it; here it is a job to do. Same
// predicate the creator's wallet uses, so the two sides cannot drift.
const needsCode = awaitingCode

export default function AdminRewards() {
  const [searchParams] = useSearchParams()
  // The old five tabs collapse to three. `queue`, `invoices` and `referrals`
  // were three views of one question - what money is going out - so they are
  // one page now, and every link anybody has bookmarked still lands on it.
  // REORGANISED 30 Sep 2026. Ethan: everything about vouchers on the Vouchers tab, "payouts
  // could be renamed cash and just have cash stuff", the invoices page "combined with this
  // and called cash invoices", and the first page "an overview ... of anything important to
  // follow up with". Old links (?tab=queue / invoices / payouts / referrals) still land.
  const TABS = ['overview', 'cash', 'vouchers', 'details']
  const LEGACY_TAB = { queue: 'cash', invoices: 'cash', payouts: 'cash', referrals: 'vouchers' }
  const [tab, setTab] = useState(() => {
    const t = searchParams.get('tab')
    return TABS.includes(t) ? t : (LEGACY_TAB[t] || 'overview')
  })
  const [invoiceStages, setInvoiceStages] = useState([])
  // Non-null while somebody is writing an invoice. The composer takes the whole
  // page while it is up: it has a live preview beside it and no room to share.
  const [invoicePrefill, setInvoicePrefill] = useState(null)
  const [queueKey, setQueueKey] = useState(0)
  const [invoiceOf, setInvoiceOf] = useState(new Map())
  const [allRewards, setAllRewards] = useState([])
  // WHICH MARKET'S MONEY. Same control as Analytics, same reasoning: a country
  // manager reading a worldwide payout list has to find their own creators in
  // it first. A reward belongs to the market its CREATOR belongs to - the
  // reward's own `community_id` is only set on some rows and never on the older
  // ones, so membership is the honest source.
  const { markets, memberRows } = useScopedMarkets()
  // The same invoice document the queue opens, opened from a payout row.
  const viewer = useInvoiceViewer({ onChanged: () => load() })
  const [market, setMarket] = useState('')
  const [creators, setCreators] = useState([])
  const [challenges, setChallenges] = useState([])
  const [loading, setLoading] = useState(true)
  // CASH AND VOUCHERS ARE TWO DIFFERENT JOBS. A cash prize is paid by an
  // invoice somebody has to approve and send; a voucher is a code somebody
  // hands over. Reading them in one list means reading past the ones you are
  // not doing today, which is Ethan's "clear view of what we need to do".
  const [busyId, setBusyId] = useState(null)

  // "Add reward" modal
  const [showAdd, setShowAdd] = useState(false)
  const [adding, setAdding] = useState(false)
  // EUROS BY DEFAULT. Five of the six open markets settle in euros and the
  // programme's own reporting is in euros, so pounds as the default meant every
  // new payout outside the UK started wrong and had to be corrected by hand.
  // Ethan: "payouts is actually in pounds, it should be in euros now too as
  // most markets will be operating in euros."
  // A DEFAULT, NOT A CONVERSION: rewards already raised keep the currency they
  // were raised in, because that is what the invoice says and what was paid.
  const [newReward, setNewReward] = useState({ creator_id: '', challenge_id: '', reward_type: 'cash', currency: 'EUR', amount: '', payment_notes: '' })

  // "Mark distributed" modal (replaces a flaky window.prompt).
  const [distributing, setDistributing] = useState(null) // the reward being marked
  const [distNotes, setDistNotes] = useState('')
  const [distCode, setDistCode] = useState('')
  const [distChat, setDistChat] = useState(false)

  const inMarket = useMemo(() => {
    if (!market) return null
    const ids = new Set(memberRows.filter((m) => m.community_id === market).map((m) => m.profile_id))
    return ids
  }, [market, memberRows])

  const rewards = useMemo(
    () => (inMarket ? allRewards.filter((r) => inMarket.has(r.creator_id)) : allRewards),
    [allRewards, inMarket],
  )

  // Payment-details tab: creators + their private bank details (admins can read
  // creator_private via RLS). Loaded lazily the first time the tab is opened.
  const [payDetails, setPayDetails] = useState([])
  const [payLoaded, setPayLoaded] = useState(false)
  const [paySearch, setPaySearch] = useState('')
  // WHO WE ARE EDITING. A creator typing their account number with a digit
  // missing used to mean asking them to go and fix it themselves, which for
  // somebody who has already been paid late is a poor thing to have to say.
  const [editingPay, setEditingPay] = useState(null)
  const [payForm, setPayForm] = useState(EMPTY_PAYEE)
  const [savingPay, setSavingPay] = useState(false)

  function openPayEditor(c) {
    setEditingPay(c)
    setPayForm({ ...EMPTY_PAYEE, ...c.payee, name: c.payee?.name || c.name || '' })
  }

  async function savePayDetails(e) {
    e.preventDefault()
    const problems = validatePayee(payForm)
    if (problems.length) return notice(`Almost there:\n\n${problems.join('\n')}`)
    setSavingPay(true)
    const { error } = await supabase.rpc('admin_set_payment_details', {
      p_creator: editingPay.id,
      p_currency: payForm.currency || null,
      p_name: payForm.name || null,
      p_bank: payForm.bank || null,
      p_sort_code: payForm.sortCode || null,
      p_account_number: payForm.accountNumber || null,
      p_iban: payForm.iban || null,
      p_bic: payForm.bic || null,
      p_address: payForm.address || null,
    })
    setSavingPay(false)
    if (error) return notice(error.message)
    // Saving these refreshes any invoice still waiting on them (and raises the
    // ones that were never raised), so the money page has to redraw too.
    setPayDetails((list) => list.map((c) => (c.id === editingPay.id ? { ...c, payee: { ...payForm } } : c)))
    setEditingPay(null)
    load()
  }
  useEffect(() => {
    if (tab !== 'details' || payLoaded) return
    let alive = true
    Promise.all([
      // `isRealMember`'s rule, in query form: active, not an admin, not a test
      // account, not the view-as-creator sandbox, not on the way out. The
      // sandbox HAS bank details on file - it must, or the invoice path could
      // never be exercised - so leaving it in put "Sam Rivera" under Payment
      // details in every market.
      // `status` IS IN THIS SELECT ON PURPOSE. `isRealMember` reads it, and
      // leaving it out made the predicate reject every single row - which is
      // why this tab was completely empty. A filter that reads a column the
      // query did not fetch fails silently and totally.
      supabase.from('profiles')
        .select('id, name, photo_url, status, is_test, is_sandbox, deletion_requested_at')
        .eq('status', 'active').eq('is_admin', false).order('name'),
      supabase.from('creator_private').select('*'),
    ]).then(([{ data: profs }, { data: privs }]) => {
      if (!alive) return
      const byId = new Map((privs ?? []).map((r) => [r.id, r]))
      setPayDetails((profs ?? [])
        .filter(isRealMember)
        .map((p) => ({ ...p, payee: payeeFromPrivate(byId.get(p.id)) })))
      setPayLoaded(true)
    })
    return () => { alive = false }
  }, [tab, payLoaded])

  const payFiltered = useMemo(() => {
    const q = paySearch.trim().toLowerCase()
    // Scoped with everything else: "who in Spain has not given us their bank
    // details" is the question this tab gets asked, and a worldwide list makes
    // somebody read past five markets to answer it.
    const scoped = inMarket ? payDetails.filter((p) => inMarket.has(p.id)) : payDetails
    return q ? scoped.filter((p) => (p.name || '').toLowerCase().includes(q)) : scoped
  }, [payDetails, paySearch, inMarket])

  // Referral vouchers, split out. `source` is set by the trigger in migration
  // 109; anything older has the column default of 'challenge'.
  //
  // DELIBERATELY NOT SCOPED BY MARKET. A referral is one creator bringing in
  // another and the two can be in different markets; there is no market that
  // owns the pair. Scoping it made the market bar look like it governed the
  // whole page when it governs the invoice queue, and Ethan read it that way
  // immediately. When referrals do become a per-market thing, this is the line
  // that changes.
  const referralRewards = useMemo(() => allRewards.filter((r) => r.source === 'referral'), [allRewards])
  const referralPending = useMemo(() => referralRewards.filter((r) => r.status === 'pending'), [referralRewards])
  // Same story as the stat cards above: euros, converted, whole. A referral
  // voucher raised in pounds and one raised in euros cannot be added as plain
  // numbers and then given one currency symbol.
  const referralOwed = useMemo(() => rewardsTotal(referralPending), [referralPending])
  const referralPaid = useMemo(
    () => rewardsTotal(referralRewards.filter((r) => r.status === 'distributed')),
    [referralRewards],
  )

  const load = useCallback(async function load() {
    const [{ data: r }, { data: c }, { data: ch }, { data: inv }, { data: allInv }] = await Promise.all([
      supabase.from('rewards')
        .select('*, profiles:creator_id(id, name, photo_url), challenges(title), referred:referred_creator_id(id, name, photo_url)')
        .order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, name').order('name'),
      supabase.from('challenges').select('id, title, status, end_date').order('created_at', { ascending: false }),
      supabase.from('invoices').select('*').not('reward_id', 'is', null),
      supabase.from('invoices').select('id, stage'),
    ])
    setInvoiceStages(allInv ?? [])
    // WHICH PRIZES ARE ALREADY SOMEBODY ELSE'S JOB.
    //
    // A cash prize is paid by its invoice. Offering "Mark distributed" on the
    // payout row as well gave two buttons for one payment, and pressing the
    // wrong one left the payouts list saying "paid" while the invoice sat in
    // the queue - the two disagreeing with no way to tell which was right. The
    // database refuses that now; this is what stops the page offering it.
    // EVERY invoice, paid ones included: a paid prize still has a document
    // somebody may want to look at, and hiding it made the row inert.
    setInvoiceOf(new Map((inv ?? []).map((i) => [i.reward_id, i])))
    setAllRewards(r ?? [])
    setCreators(c ?? [])
    setChallenges(ch ?? [])
    setLoading(false)
    setQueueKey((k) => k + 1)
  }, [])

  useEffect(() => { load() }, [load])

  // Open the "mark distributed" modal, pre-filling any existing note.
  // Also opened on a voucher that is ALREADY distributed, to add or change its
  // code (the historical ones went out by DM) - then only the code is written.
  function openDistribute(reward) {
    setDistributing(reward)
    setDistNotes(reward.payment_notes || (reward.reward_type === 'voucher' ? 'Voucher code' : 'Bank transfer'))
    setDistCode(reward.voucher_code || '')
    setDistChat(false)
  }

  // Confirm distribution: set status + notes + timestamp.
  // The DB trigger notifies the creator automatically.
  async function confirmDistribute(e) {
    e.preventDefault()
    const isVoucher = distributing.reward_type === 'voucher'
    const code = distCode.trim() || null
    // FUTURE VOUCHERS CARRY THEIR CODE (29 Sep 2026). Ethan: the old ones went out
    // by chat, but "the codes for all future vouchers should be inputted". So a
    // voucher cannot be marked handed over without one, unless the team says it
    // really was sent by chat.
    if (isVoucher && !code && !distChat) {
      notice('Enter the voucher code, or tick that you sent it by chat instead.')
      return
    }
    setBusyId(distributing.id)
    const already = distributing.status === 'distributed'
    let error
    if (already) {
      // Group-aware, so recoding a combined voucher recodes every part.
      ;({ error } = await supabase.rpc('admin_set_voucher_code', {
        p_reward: distributing.id, p_code: distChat ? '' : code, p_via: distChat ? 'chat' : null,
      }))
    } else {
      ;({ error } = await supabase
        .from('rewards')
        .update({
          status: 'distributed', payment_notes: distNotes, distributed_at: new Date().toISOString(),
          ...(isVoucher ? { voucher_code: distChat ? null : code, issued_via: distChat ? 'chat' : null } : {}),
        })
        .eq('id', distributing.id))
    }
    setBusyId(null)
    setDistributing(null)
    if (!error) load()
    else notice(`Could not update: ${error.message}`)
  }

  async function addReward(e) {
    e.preventDefault()
    setAdding(true)
    const { error } = await supabase.from('rewards').insert({
      creator_id: newReward.creator_id,
      challenge_id: newReward.challenge_id || null,
      reward_type: newReward.reward_type,
      amount: Number(newReward.amount),
      // Half the markets are in euros and this form could only say pounds.
      currency: newReward.currency,
      payment_notes: newReward.payment_notes,
    })
    setAdding(false)
    if (!error) {
      setShowAdd(false)
      setNewReward({ creator_id: '', challenge_id: '', reward_type: 'cash', currency: 'EUR', amount: '', payment_notes: '' })
      load()
    }
  }

  function exportRewards() {
    downloadCsv(
      'tryp-rewards.csv',
      filtered.map((r) => ({
        creator: r.profiles?.name ?? '',
        challenge: r.challenges?.title ?? '',
        type: r.reward_type,
        amount: r.amount,
        currency: r.currency,
        status: r.status,
        payment_notes: r.payment_notes ?? '',
        created: formatDate(r.created_at),
        distributed: r.distributed_at ? formatDate(r.distributed_at) : '',
      }))
    )
  }

  const filtered = rewards

  const challengesById = useMemo(
    () => Object.fromEntries(challenges.map((c) => [c.id, c])),
    [challenges],
  )
  // SPLIT INTO SECTIONS (23 Sep 2026). Ethan: "everything seems mixed in with
  // each other, this could be confusing when we have multiple challenges going
  // on at once." One card per challenge (running first), then milestones, then
  // anything left over - referrals keep their own `ReferralSection` above.
  // ANYTHING THAT NEEDS PAYING IS ALWAYS AT THE TOP (30 Sep 2026). Ethan: the list "is grouped
  // by challenge etc which is good but anything that needs paid should always appear at the top
  // so you can't miss it". Two things do it: a "Still to pay" strip above everything, and inside
  // the groups the unpaid rows come first and a group with money owed comes before one without.
  const cashFiltered = useMemo(() => rewards.filter((r) => r.reward_type === 'cash'), [rewards])
  const cashGroups = useMemo(() => {
    const groups = groupRewards(cashFiltered, challengesById).map((g) => ({
      ...g,
      rows: [...g.rows].sort((a, b) => (b.status === 'pending') - (a.status === 'pending')),
    }))
    return groups
      .map((g, i) => ({ g, i, owed: g.rows.some((r) => r.status === 'pending') }))
      .sort((a, b) => (b.owed - a.owed) || (a.i - b.i))
      .map((x) => x.g)
  }, [cashFiltered, challengesById])
  // OWED = not paid yet, which includes a prize whose invoice has gone out and not been marked
  // paid (it is paid automatically seven days after sending). SETTLED = everything else, and only
  // that goes into the per-challenge record below.
  const isOwed = useCallback((r) => {
    if (r.reward_type !== 'cash') return false
    const inv = invoiceOf.get(r.id)
    return r.status === 'pending' || (!!inv && inv.stage !== 'paid')
  }, [invoiceOf])
  const cashOutstanding = useMemo(
    () => rewards.filter(isOwed).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
    [rewards, isOwed],
  )
  const vouchersNeedCode = useMemo(
    () => rewards.filter((r) => r.reward_type === 'voucher' && r.source !== 'referral' && (r.status === 'pending' || needsCode(r))),
    [rewards],
  )
  const rewardGroups = useMemo(
    () => cashGroups.map((g) => ({ ...g, rows: g.rows.filter((r) => !isOwed(r)) })).filter((g) => g.rows.length),
    [cashGroups, isOwed],
  )

  // EUROS, AND ADDED UP THE WAY THE CREATOR'S OWN PAGE ADDS THEM UP.
  //
  // THE BUG THIS FIXES: these were raw `reduce`s over `r.amount` across every
  // currency in the table, printed through `formatMoney` with no currency at
  // all - so nine GBP rows and a EUR one were summed as if pounds and euros
  // were the same number, and the result was labelled in whichever currency
  // formatMoney happened to default to. Ethan: "rewards/invoices payouts are
  // in pounds and should be euros."
  //
  // `rewardsTotal` is the function Rewards.jsx already uses for exactly this:
  // it converts every row into euros, rounds to whole euros (a converted total
  // moves with the FX rate and has no business showing cents), and reports
  // whether a conversion was involved so the figure can be marked "≈".
  const paidTotal = rewardsTotal(rewards.filter((r) => r.status === 'distributed'))
  const pendingTotal = rewardsTotal(rewards.filter((r) => r.status === 'pending'))
  const spendTotal = rewardsTotal(rewards.filter((r) => r.status === 'distributed' || r.status === 'pending'))

  // Jump from a reward straight into the invoice composer, prefilled.
  // (Counter ref instead of Date.now(): the purity lint bans clock reads here;
  // the key only needs to differ per click so repeat clicks re-trigger.)
  const prefillSeq = useRef(0)
  function newInvoice() {
    prefillSeq.current += 1
    setInvoicePrefill({ key: `blank-${prefillSeq.current}`, creatorId: '' })
  }
  function invoiceReward(r) {
    prefillSeq.current += 1
    setInvoicePrefill({
      key: `${r.id}-${prefillSeq.current}`,
      creatorId: r.creator_id,
      amount: r.amount,
      // THE CURRENCY THE PRIZE WAS AWARDED IN, which `rewards.currency` has
      // always held and nothing ever passed on. Without it the composer took
      // every prize for sterling, so a euro prize won by a creator banking in
      // pounds could not be converted at all - it just changed sign.
      sourceCurrency: r.currency || 'GBP',
      description: r.challenges?.title ? `Cash prize for ${r.challenges.title}` : 'Challenge cash prize',
    })
    setTab('cash')
  }

  // OPENING A QUEUED INVOICE LOADS THE ROW, NOT A BLANK FORM. The draft already
  // holds the number, the creator, the amount, the description and a snapshot
  // of the bank details; retyping any of that would be a second chance to get
  // it wrong. `invoiceId` is what tells the composer to update this row rather
  // than mint a new one - see InvoicesPanel.
  function editInvoice(inv) {
    prefillSeq.current += 1
    setInvoicePrefill({
      key: `${inv.id}-${prefillSeq.current}`,
      invoiceId: inv.id,
      number: inv.number,
      creatorId: inv.creator_id,
      creatorName: inv.creator_name,
      amount: inv.amount,
      currency: inv.currency,
      description: inv.description,
      billTo: inv.bill_to,
      notes: inv.notes,
      payee: inv.payment,
      stage: inv.stage,
    })
    setTab('cash')
  }

  // WRITING AN INVOICE TAKES THE PAGE. The composer carries a live preview of
  // the document beside the form; squeezing it into a third of the width beside
  // a queue helped nobody.
  const composing = !!invoicePrefill

  return (
    <div className="page">
      <PageHeader
        back="/admin"
        title="Money"
        action={!composing && (
          tab === 'cash' ? (
            <div className="flex flex-wrap gap-2">
              <button onClick={exportRewards} className="btn-secondary">Export CSV ↓</button>
              <button onClick={() => setShowAdd(true)} className="btn-secondary">+ Add reward</button>
              <button onClick={newInvoice} className="btn-primary">+ New invoice</button>
            </div>
          ) : null
        )}
      />

      {composing ? (
        <InvoicesPanel
          prefill={invoicePrefill}
          onClose={() => setInvoicePrefill(null)}
          onSent={load}
        />
      ) : (
      <>
      {/* SECTIONS, NOT A ROW OF BUTTONS.
          The shape Analytics uses - underlined sections you move between -
          rather than filled buttons competing to look like the action on the
          page. A tab is navigation; a button does something. */}
      <div className="mb-8 flex flex-wrap gap-1 border-b border-gray-100">
        {[['overview', 'Overview'], ['cash', 'Cash & Invoices'], ['vouchers', 'Vouchers'], ['details', 'Payment details']].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cx(
              'relative -mb-px border-b-2 px-4 py-2.5 text-[15px] font-semibold transition-colors',
              tab === key ? 'border-brand text-brand' : 'border-transparent text-smoke hover:text-ink',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ---------- Overview ---------- */}
      {tab === 'overview' && (
        <Overview
          loading={loading}
          spend={spendTotal} paid={paidTotal} pending={pendingTotal}
          invoiceStages={invoiceStages}
          cashToPay={cashOutstanding}
          vouchersNeedCode={vouchersNeedCode}
          referralPending={referralPending}
          rewards={rewards}
          go={setTab}
        />
      )}

      {/* ---------- Cash & invoices ----------
          ONE PAGE FOR ALL THE MONEY THAT LEAVES BY BANK TRANSFER: what is still to pay
          first, then the invoice pipeline, then every cash prize by challenge. */}
      <div className={tab === 'cash' ? '' : 'hidden'}>
        <MarketScope markets={markets} value={market} onChange={setMarket} />
        <StillToPay
          title="Still to pay"
          hint="Unpaid prizes, and invoices sent but not yet marked paid (they are marked paid by themselves 7 days after sending)"
          rows={cashOutstanding}
          loading={loading}
          openInvoices={invoiceStages.filter((i) => ['approved', 'sent'].includes(i.stage) && ![...invoiceOf.values()].some((x) => x.id === i.id)).length}
          invoiceOf={invoiceOf} viewer={viewer} busyId={busyId} onInvoice={invoiceReward} onDistribute={openDistribute}
        />
        <h2 className="mb-3 mt-2 text-lg font-semibold">Invoices</h2>
        <InvoiceQueue key={queueKey} onEdit={editInvoice} inMarket={inMarket} onChanged={load} />

        <div className="mb-3 mt-10 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">Cash prizes by challenge</h2>
          {!loading && rewardGroups.length > 0 && (
            <span className="text-sm text-smoke">{money(rewardsTotal(rewardGroups.flatMap((g) => g.rows)))} paid across {rewardGroups.length} {rewardGroups.length === 1 ? 'challenge' : 'challenges'}</span>
          )}
        </div>
        {loading ? (
          <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
        ) : rewardGroups.length === 0 ? (
          <EmptyState icon={<Icon name="wallet" className="h-7 w-7" />} title="Nothing paid yet" hint="Prizes land here once they are paid." />
        ) : (
          <div className="space-y-2.5">
            {rewardGroups.map((group) => (
              <RewardGroupCard
                key={group.key}
                group={group}
                invoiceOf={invoiceOf}
                viewer={viewer}
                busyId={busyId}
                onInvoice={invoiceReward}
                onDistribute={openDistribute}
              />
            ))}
          </div>
        )}
      </div>{/* /cash tab */}

      {/* ---------- Vouchers tab: everything voucher-shaped ---------- */}
      <div className={tab === 'vouchers' ? '' : 'hidden'}>
        <MarketScope markets={markets} value={market} onChange={setMarket} />
        <ReferralSection
          loading={loading}
          rewards={referralRewards}
          owed={referralOwed}
          paid={referralPaid}
          pendingCount={referralPending.length}
          busyId={busyId}
          onPay={openDistribute}
        />
        <VouchersPanel
          rewards={rewards}
          loading={loading}
          onChanged={load}
          onHandOver={openDistribute}
        />
      </div>{/* /vouchers tab */}

      {/* ---------- Payment details tab ---------- */}
      <div className={tab === 'details' ? '' : 'hidden'}>
        <MarketScope
          markets={markets}
          value={market}
          onChange={setMarket}
        />
        {/* ACROSS BOTH COLUMNS (1 Oct 2026), so it lines up with the grid of cards under it. */}
        <div className="mb-6">
          <div className="relative">
            <Icon name="magnifier" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-smoke" />
            <input
              type="search" className="input !pl-9" placeholder="Search creators…"
              value={paySearch} onChange={(e) => setPaySearch(e.target.value)}
            />
          </div>
        </div>
        {!payLoaded ? (
          <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}</div>
        ) : payFiltered.length === 0 ? (
          <EmptyState icon={<Icon name="wallet" className="h-7 w-7" />} title="No creators found" hint="Try a different search." />
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {payFiltered.map((c) => {
              const rows = payeeStarted(c.payee) ? detailRows(c.payee) : []
              return (
                <div key={c.id} className="card">
                  <div className="mb-3 flex items-center gap-3">
                    <Avatar src={c.photo_url} name={c.name} size="sm" />
                    <p className="min-w-0 flex-1 truncate text-sm font-semibold">{c.name}</p>
                    {c.payee.currency
                      ? <Badge tone="light">{c.payee.currency === 'EUR' ? '€ Euros' : '£ Pounds'}</Badge>
                      : <Badge tone="grey">Not set up</Badge>}
                    <button
                      type="button"
                      onClick={() => openPayEditor(c)}
                      className="shrink-0 rounded-full border border-gray-200 px-3 py-1 text-xs font-medium text-smoke transition-colors hover:border-brand hover:text-brand"
                    >
                      {rows.length === 0 ? 'Add' : 'Edit'}
                    </button>
                  </div>
                  {rows.length === 0 ? (
                    <p className="rounded-xl bg-cloud px-4 py-3 text-xs text-smoke">
                      Nothing saved yet. They were asked for their details the first time a prize was
                      waiting on them - or you can enter what they have given you.
                    </p>
                  ) : (
                    <dl className="divide-y divide-gray-50">
                      {rows.map((row) => (
                        <div key={row.label} className="flex items-center gap-3 py-2">
                          <dt className="w-32 shrink-0 text-xs font-medium text-smoke">{row.label}</dt>
                          <dd className="min-w-0 flex-1 truncate text-sm tabular-nums">{row.display}</dd>
                          <CopyButton value={row.copy} label={`Copy ${row.label.toLowerCase()}`} />
                        </div>
                      ))}
                    </dl>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>{/* /details tab */}

      </>
      )}

      {viewer.modal}

      {/* ---------- Editing somebody's bank details ---------- */}
      <Modal open={!!editingPay} onClose={() => setEditingPay(null)} title={`Payment details · ${editingPay?.name ?? ''}`}>
        <form onSubmit={savePayDetails} className="space-y-5">
          <p className="text-sm text-smoke">
            These are the details every invoice for {editingPay?.name?.split(' ')[0] || 'them'} is drawn
            from. Saving updates any invoice that has not gone out yet, and raises one for any prize
            that was waiting on them. The change is recorded in the audit log.
          </p>
          <PaymentDetailsFields value={payForm} onChange={setPayForm} compact />
          <button type="submit" disabled={savingPay} className="btn-primary w-full">
            {savingPay ? <Spinner /> : 'Save details'}
          </button>
        </form>
      </Modal>

      {/* ---------- Add reward modal ---------- */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add a reward">
        <form onSubmit={addReward} className="space-y-5">
          <div>
            <label htmlFor="r-creator" className="label">Creator</label>
            <Select
              id="r-creator" variant="field" ariaLabel="Creator" placeholder="Choose a creator…"
              value={newReward.creator_id}
              onChange={(v) => setNewReward({ ...newReward, creator_id: v })}
              options={creators.map((c) => ({ value: c.id, label: c.name }))}
            />
          </div>
          <div>
            <label htmlFor="r-challenge" className="label">Challenge <span className="font-normal text-smoke">(optional)</span></label>
            <Select
              id="r-challenge" variant="field" ariaLabel="Challenge"
              value={newReward.challenge_id}
              onChange={(v) => setNewReward({ ...newReward, challenge_id: v })}
              options={[{ value: '', label: 'Not tied to a challenge' }, ...challenges.map((c) => ({ value: c.id, label: c.title }))]}
            />
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="r-type" className="label">Type</label>
              <Select
                id="r-type" variant="field" ariaLabel="Reward type"
                value={newReward.reward_type}
                onChange={(v) => setNewReward({ ...newReward, reward_type: v })}
                options={[{ value: 'cash', label: 'Cash' }, { value: 'voucher', label: 'Tryp.com voucher' }]}
              />
            </div>
            <div>
              <label htmlFor="r-ccy" className="label">Currency</label>
              <Select
                id="r-ccy" variant="field" ariaLabel="Currency"
                value={newReward.currency}
                onChange={(v) => setNewReward({ ...newReward, currency: v })}
                options={[{ value: 'EUR', label: 'Euros (€)' }, { value: 'GBP', label: 'Pounds (£)' }]}
              />
            </div>
            <div>
              <label htmlFor="r-amount" className="label">Amount</label>
              <input id="r-amount" type="number" min="1" step="0.01" required className="input" value={newReward.amount} onChange={(e) => setNewReward({ ...newReward, amount: e.target.value })} placeholder="150" />
            </div>
          </div>
          <div>
            <label htmlFor="r-notes" className="label">Notes <span className="font-normal text-smoke">(optional)</span></label>
            <input id="r-notes" type="text" className="input" value={newReward.payment_notes} onChange={(e) => setNewReward({ ...newReward, payment_notes: e.target.value })} placeholder="e.g. 1st place prize" />
          </div>
          {/* A cash reward for a creator with bank details raises its invoice
              the moment this row lands - that is the trigger, not this form. */}
          <p className="rounded-xl bg-cloud px-4 py-3 text-xs text-smoke">
            {newReward.reward_type === 'cash'
              ? 'It is added as still to pay. If the creator has saved their payment details, its invoice is raised automatically and appears under Invoices; if not, they are asked for them.'
              : 'It is added as still to pay. Vouchers are handed over by the team - no invoice is raised.'}
          </p>
          <button type="submit" disabled={adding} className="btn-primary w-full">
            {adding ? <Spinner /> : 'Add reward'}
          </button>
        </form>
      </Modal>

      {/* ---------- Mark distributed modal ---------- */}
      <Modal
        open={!!distributing}
        onClose={() => setDistributing(null)}
        title={distributing?.status === 'distributed' ? 'Voucher code' : 'Mark reward as distributed'}
      >
        {distributing && (
          <form onSubmit={confirmDistribute} className="space-y-5">
            <p className="text-sm text-smoke">
              {distributing.status === 'distributed' ? 'The code for ' : 'Confirming payout of '}
              <span className="font-semibold text-ink">{formatMoney(distributing.amount, distributing.currency)}</span>{' '}
              to <span className="font-semibold text-ink">{distributing.profiles?.name}</span>. They'll be notified automatically.
            </p>
            {/* THE CODE GOES ON THE REWARD, NOT IN A DM (24 Sep 2026). The
                creator sees it on /rewards as a ticket they can copy and tick
                off once used. REQUIRED from 29 Sep 2026 unless the team says it was
                sent by chat, which is what the older ones were. */}
            {distributing.reward_type === 'voucher' && (
              <div>
                <label htmlFor="dist-code" className="label">Voucher code <span className="font-normal text-smoke">(required, shown to the creator)</span></label>
                <input
                  id="dist-code"
                  type="text"
                  className="input font-mono tracking-wider"
                  value={distCode}
                  onChange={(e) => setDistCode(e.target.value)}
                  placeholder="e.g. TRYP-10-ABCD"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  disabled={distChat}
                />
                <label className="mt-3 flex cursor-pointer items-start gap-2.5 text-sm text-ink">
                  <input type="checkbox" checked={distChat} onChange={(e) => setDistChat(e.target.checked)} className="mt-1 h-4 w-4 accent-[#d94407]" />
                  <span>I sent it by chat instead. <span className="text-smoke">Their ticket will say it was issued by chat.</span></span>
                </label>
                {distCode.trim() && !distChat && (
                  <div className="mt-3">
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-smoke">What they will see</p>
                    <VoucherTicket reward={{ ...distributing, voucher_code: distCode.trim(), distributed_at: distributing.distributed_at || new Date().toISOString(), used_at: null }} />
                  </div>
                )}
              </div>
            )}
            {distributing.status !== 'distributed' && (
              <div>
                <label htmlFor="dist-notes" className="label">Payment notes <span className="font-normal text-smoke">(method, reference)</span></label>
                <input id="dist-notes" type="text" className="input" value={distNotes} onChange={(e) => setDistNotes(e.target.value)} placeholder="e.g. Bank transfer, ref TRYP-001" />
              </div>
            )}
            <button type="submit" disabled={busyId === distributing.id} className="btn-primary w-full">
              {busyId === distributing.id ? <Spinner /> : distributing.status === 'distributed' ? 'Save code' : 'Confirm distributed'}
            </button>
          </form>
        )}
      </Modal>
    </div>
  )
}
