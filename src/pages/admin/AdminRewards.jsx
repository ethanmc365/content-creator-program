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
import MarketScope, { useMarkets } from '../../components/admin/MarketScope'
import { useInvoiceViewer } from '../../components/admin/InvoiceModal'
import { isRealMember } from '../../lib/members'
import { rewardsTotal } from '../../lib/programme'

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

// A pair of these reads better than six buttons in a row: the two questions a
// payout list gets asked - which KIND, and what STATE - stay visibly separate.
function Segmented({ value, onChange, options }) {
  return (
    <div className="flex gap-0.5 rounded-lg border border-gray-200 bg-white p-0.5">
        {options.map(([v, text]) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            aria-pressed={value === v}
            className={cx(
              'rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
              value === v ? 'bg-brand text-white' : 'text-smoke hover:bg-cloud hover:text-ink',
            )}
          >
            {text}
          </button>
      ))}
    </div>
  )
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

// The community's money hub: rewards (payouts) and prize invoices live
// together. A reward row's Invoice button jumps straight into the invoice
// composer with the creator, amount and challenge prefilled.
export default function AdminRewards() {
  const [searchParams] = useSearchParams()
  // The old five tabs collapse to three. `queue`, `invoices` and `referrals`
  // were three views of one question - what money is going out - so they are
  // one page now, and every link anybody has bookmarked still lands on it.
  const TABS = ['invoices', 'payouts', 'details']
  const LEGACY_TAB = { queue: 'invoices', referrals: 'invoices' }
  const [tab, setTab] = useState(() => {
    const t = searchParams.get('tab')
    return TABS.includes(t) ? t : (LEGACY_TAB[t] || 'invoices')
  })
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
  const { markets, memberRows } = useMarkets()
  // The same invoice document the queue opens, opened from a payout row.
  const viewer = useInvoiceViewer({ onChanged: () => load() })
  const [market, setMarket] = useState('')
  const [creators, setCreators] = useState([])
  const [challenges, setChallenges] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  // CASH AND VOUCHERS ARE TWO DIFFERENT JOBS. A cash prize is paid by an
  // invoice somebody has to approve and send; a voucher is a code somebody
  // hands over. Reading them in one list means reading past the ones you are
  // not doing today, which is Ethan's "clear view of what we need to do".
  const [kindFilter, setKindFilter] = useState('')
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
    const [{ data: r }, { data: c }, { data: ch }, { data: inv }] = await Promise.all([
      supabase.from('rewards')
        .select('*, profiles:creator_id(id, name, photo_url), challenges(title), referred:referred_creator_id(id, name, photo_url)')
        .order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, name').order('name'),
      supabase.from('challenges').select('id, title').order('created_at', { ascending: false }),
      supabase.from('invoices').select('*').not('reward_id', 'is', null),
    ])
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
  function openDistribute(reward) {
    setDistributing(reward)
    setDistNotes(reward.payment_notes || 'Bank transfer')
  }

  // Confirm distribution: set status + notes + timestamp.
  // The DB trigger notifies the creator automatically.
  async function confirmDistribute(e) {
    e.preventDefault()
    setBusyId(distributing.id)
    const { error } = await supabase
      .from('rewards')
      .update({ status: 'distributed', payment_notes: distNotes, distributed_at: new Date().toISOString() })
      .eq('id', distributing.id)
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

  const filtered = useMemo(
    () => rewards.filter((r) => (!statusFilter || r.status === statusFilter)
      && (!kindFilter || r.reward_type === kindFilter)),
    [rewards, statusFilter, kindFilter]
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
      description: r.challenges?.title ? `Cash prize for ${r.challenges.title}` : 'Challenge cash prize',
    })
    setTab('invoices')
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
    setTab('invoices')
  }

  // WRITING AN INVOICE TAKES THE PAGE. The composer carries a live preview of
  // the document beside the form; squeezing it into a third of the width beside
  // a queue helped nobody.
  const composing = !!invoicePrefill

  return (
    <div className="page">
      <PageHeader
        back="/admin"
        title="Rewards & Invoices"
        action={!composing && (
          tab === 'payouts' ? (
            <div className="flex gap-2">
              <button onClick={exportRewards} className="btn-secondary">Export CSV ↓</button>
              <button onClick={() => setShowAdd(true)} className="btn-primary">+ Add reward</button>
            </div>
          ) : tab === 'invoices' ? (
            <button onClick={newInvoice} className="btn-primary">+ New invoice</button>
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
        {[['invoices', 'Invoices'], ['payouts', 'Payouts'], ['details', 'Payment Details']].map(([key, label]) => (
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

      {/* ---------- Invoices ----------
          INVOICES LEFT, REFERRALS RIGHT, which is what Ethan asked for and also
          what the two things are worth. The invoice pipeline is where money
          leaves the company and needs reading in order; a referral voucher is a
          ten-pound tick-off that only ever needs a glance and a button. Giving
          them a tab each meant the glance cost a page load. */}
      <div className={tab === 'invoices' ? '' : 'hidden'}>
        {/* REFERRALS ARE NOT INVOICED, so they are not on the invoices page.
            A referral pays a Tryp.com voucher - there is no document, no
            approval and no bank transfer - and putting it beside the invoice
            pipeline implied it went through the same machinery. It lives on
            Payouts now, next to the other vouchers, where it is actually due. */}
        <MarketScope markets={markets} value={market} onChange={setMarket} />
        <InvoiceQueue key={queueKey} onEdit={editInvoice} inMarket={inMarket} onChanged={load} />
      </div>

      <div className={tab === 'payouts' ? '' : 'hidden'}>
      <MarketScope
        markets={markets}
        value={market}
        onChange={setMarket}
      />
      <div className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total community spend" value={money(spendTotal)} />
        <StatCard label="Distributed" value={money(paidTotal)} accent />
        <StatCard label="Pending payout" value={money(pendingTotal)} hint={pendingTotal.amount > 0 ? "Don't keep creators waiting" : 'All settled'} />
      </div>

      {/* Two questions, two controls, and no words explaining what a row of
          buttons above a list of rewards is for. The totals live in the stat
          cards directly above; repeating them here said the same thing twice. */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Segmented
          value={kindFilter}
          onChange={setKindFilter}
          options={[['', 'Everything'], ['cash', 'Cash'], ['voucher', 'Vouchers']]}
        />
        <Segmented
          value={statusFilter}
          onChange={setStatusFilter}
          options={[['', 'All'], ['pending', 'Still to pay'], ['distributed', 'Paid']]}
        />
      </div>

      <ReferralSection
        loading={loading}
        rewards={referralRewards}
        owed={referralOwed}
        paid={referralPaid}
        pendingCount={referralPending.length}
        busyId={busyId}
        onPay={openDistribute}
      />

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={<Icon name="wallet" className="h-7 w-7" />} title="No rewards here" hint="Add rewards after a challenge closes. Winners first!" />
      ) : (
        <div className="overflow-hidden rounded-card border border-gray-100 shadow-card">
          {filtered.map((r) => (
            <div
              key={r.id}
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
                    {r.source === 'referral' ? 'Referral voucher'
                      : r.source === 'milestone' ? 'Milestone voucher'
                        : r.reward_type === 'cash' ? 'Cash' : 'Voucher'}
                    {r.challenges?.title && ` · ${r.challenges.title}`}
                    {r.source === 'referral' && r.referred?.name && ` · brought in ${r.referred.name}`}
                    {r.payment_notes && r.source !== 'referral' && ` · ${r.payment_notes}`}
                  </span>
                </p>
              </div>
              <span className="font-bold tabular-nums">{formatMoney(r.amount, r.currency)}</span>
              <Badge tone={r.status === 'distributed' ? 'green' : 'amber'}>{r.status}</Badge>
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
                    <button onClick={() => invoiceReward(r)} className="btn-secondary !py-2 text-xs">Invoice</button>
                  )}
                  {r.status === 'pending' && (
                    <button onClick={() => openDistribute(r)} disabled={busyId === r.id} className="btn-primary !py-2 text-xs">
                      {busyId === r.id ? <Spinner className="h-4 w-4" /> : 'Mark distributed'}
                    </button>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
      </div>{/* /payouts tab */}

      {/* ---------- Payment details tab ---------- */}
      <div className={tab === 'details' ? '' : 'hidden'}>
        <MarketScope
          markets={markets}
          value={market}
          onChange={setMarket}
        />
        <div className="mb-6 max-w-sm">
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
      <Modal open={!!distributing} onClose={() => setDistributing(null)} title="Mark reward as distributed">
        {distributing && (
          <form onSubmit={confirmDistribute} className="space-y-5">
            <p className="text-sm text-smoke">
              Confirming payout of <span className="font-semibold text-ink">{formatMoney(distributing.amount, distributing.currency)}</span>{' '}
              to <span className="font-semibold text-ink">{distributing.profiles?.name}</span>. They'll be notified automatically.
            </p>
            <div>
              <label htmlFor="dist-notes" className="label">Payment notes <span className="font-normal text-smoke">(method, reference)</span></label>
              <input id="dist-notes" type="text" className="input" value={distNotes} onChange={(e) => setDistNotes(e.target.value)} placeholder="e.g. Bank transfer, ref TRYP-001" />
            </div>
            <button type="submit" disabled={busyId === distributing.id} className="btn-primary w-full">
              {busyId === distributing.id ? <Spinner /> : 'Confirm distributed'}
            </button>
          </form>
        )}
      </Modal>
    </div>
  )
}
