import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Avatar, Badge, CopyButton, EmptyState, Modal, PageHeader, Skeleton, Spinner, StatCard, Select } from '../../components/ui'
import { cx } from '../../lib/utils'
import Icon from '../../components/Icon'
import { formatDate, formatMoney, downloadCsv } from '../../lib/utils'
import { notice } from '../../lib/confirm'
import { payeeFromPrivate, payeeStarted, formatSortCode, formatIban, cleanIban } from '../../lib/invoice'
import InvoicesPanel from './InvoicesPanel'
import InvoiceQueue from './InvoiceQueue'

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

// The program's money hub: rewards (payouts) and prize invoices live
// together. A reward row's Invoice button jumps straight into the invoice
// composer with the creator, amount and challenge prefilled.
export default function AdminRewards() {
  const [searchParams] = useSearchParams()
  const TABS = ['queue', 'payouts', 'referrals', 'invoices', 'details']
  const [tab, setTab] = useState(() => {
    const t = searchParams.get('tab')
    return TABS.includes(t) ? t : 'queue'
  })
  const [invoicePrefill, setInvoicePrefill] = useState(null)
  const [rewards, setRewards] = useState([])
  const [creators, setCreators] = useState([])
  const [challenges, setChallenges] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [busyId, setBusyId] = useState(null)

  // "Add reward" modal
  const [showAdd, setShowAdd] = useState(false)
  const [adding, setAdding] = useState(false)
  const [newReward, setNewReward] = useState({ creator_id: '', challenge_id: '', reward_type: 'cash', amount: '', payment_notes: '' })

  // "Mark distributed" modal (replaces a flaky window.prompt).
  const [distributing, setDistributing] = useState(null) // the reward being marked
  const [distNotes, setDistNotes] = useState('')

  // Payment-details tab: creators + their private bank details (admins can read
  // creator_private via RLS). Loaded lazily the first time the tab is opened.
  const [payDetails, setPayDetails] = useState([])
  const [payLoaded, setPayLoaded] = useState(false)
  const [paySearch, setPaySearch] = useState('')
  useEffect(() => {
    if (tab !== 'details' || payLoaded) return
    let alive = true
    Promise.all([
      supabase.from('profiles').select('id, name, photo_url').eq('status', 'active').eq('is_admin', false).order('name'),
      supabase.from('creator_private').select('*'),
    ]).then(([{ data: profs }, { data: privs }]) => {
      if (!alive) return
      const byId = new Map((privs ?? []).map((r) => [r.id, r]))
      setPayDetails((profs ?? []).map((p) => ({ ...p, payee: payeeFromPrivate(byId.get(p.id)) })))
      setPayLoaded(true)
    })
    return () => { alive = false }
  }, [tab, payLoaded])

  const payFiltered = useMemo(() => {
    const q = paySearch.trim().toLowerCase()
    return q ? payDetails.filter((p) => (p.name || '').toLowerCase().includes(q)) : payDetails
  }, [payDetails, paySearch])

  // Referral vouchers, split out. `source` is set by the trigger in migration
  // 109; anything older has the column default of 'challenge'.
  const referralRewards = useMemo(() => rewards.filter((r) => r.source === 'referral'), [rewards])
  const referralPending = useMemo(() => referralRewards.filter((r) => r.status === 'pending'), [referralRewards])
  const referralOwed = useMemo(() => referralPending.reduce((n, r) => n + Number(r.amount || 0), 0), [referralPending])
  const referralPaid = useMemo(
    () => referralRewards.filter((r) => r.status === 'distributed').reduce((n, r) => n + Number(r.amount || 0), 0),
    [referralRewards],
  )

  async function load() {
    const [{ data: r }, { data: c }, { data: ch }] = await Promise.all([
      supabase.from('rewards')
        .select('*, profiles:creator_id(id, name, photo_url), challenges(title), referred:referred_creator_id(id, name, photo_url)')
        .order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, name').order('name'),
      supabase.from('challenges').select('id, title').order('created_at', { ascending: false }),
    ])
    setRewards(r ?? [])
    setCreators(c ?? [])
    setChallenges(ch ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

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
      currency: 'GBP',
      payment_notes: newReward.payment_notes,
    })
    setAdding(false)
    if (!error) {
      setShowAdd(false)
      setNewReward({ creator_id: '', challenge_id: '', reward_type: 'cash', amount: '', payment_notes: '' })
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
    () => rewards.filter((r) => !statusFilter || r.status === statusFilter),
    [rewards, statusFilter]
  )

  const totalPaid = rewards.filter((r) => r.status === 'distributed').reduce((s, r) => s + Number(r.amount), 0)
  const totalPending = rewards.filter((r) => r.status === 'pending').reduce((s, r) => s + Number(r.amount), 0)

  // Jump from a reward straight into the invoice composer, prefilled.
  // (Counter ref instead of Date.now(): the purity lint bans clock reads here;
  // the key only needs to differ per click so repeat clicks re-trigger.)
  const prefillSeq = useRef(0)
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

  return (
    <div className="page">
      <PageHeader
        back="/admin"
        title="Rewards & invoices"
        action={tab === 'payouts' && (
          <div className="flex gap-2">
            <button onClick={exportRewards} className="btn-secondary">Export CSV ↓</button>
            <button onClick={() => setShowAdd(true)} className="btn-primary">+ Add reward</button>
          </div>
        )}
      />

      {/* SECTIONS, NOT A ROW OF BUTTONS.
          Ethan asked for the shape Analytics uses - underlined sections you
          move between - rather than five filled buttons competing to look like
          the action on the page. A tab is navigation; a button does something.

          THE QUEUE LEADS, and that is the point of it. Publishing winners now
          raises an invoice per cash prize by itself, so the first question here
          stopped being "what shall I invoice" and became "what did the machine
          raise that I have not looked at". */}
      <div className="mb-8 flex flex-wrap gap-1 border-b border-gray-100">
        {[['queue', 'To approve'], ['invoices', 'Invoices'], ['referrals', 'Referrals'], ['payouts', 'Payouts'], ['details', 'Payment details']].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cx(
              'relative -mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors',
              tab === key ? 'border-brand text-brand' : 'border-transparent text-smoke hover:text-ink',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className={tab === 'queue' ? '' : 'hidden'}>
        <InvoiceQueue onEdit={editInvoice} />
      </div>

      <div className={tab === 'invoices' ? '' : 'hidden'}>
        <InvoicesPanel prefill={invoicePrefill} />
      </div>

      <div className={tab === 'payouts' ? '' : 'hidden'}>
      <div className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total program spend" value={formatMoney(totalPaid + totalPending)} />
        <StatCard label="Distributed" value={formatMoney(totalPaid)} accent />
        <StatCard label="Pending payout" value={formatMoney(totalPending)} hint={totalPending > 0 ? "Don't keep creators waiting" : 'All settled'} />
      </div>

      <div className="mb-6 flex gap-2">
        {['', 'pending', 'distributed'].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={statusFilter === s ? 'btn-primary !py-2 text-xs' : 'btn-secondary !py-2 text-xs'}
          >
            {s === '' ? 'All' : s}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={<Icon name="wallet" className="h-7 w-7" />} title="No rewards here" hint="Add rewards after a challenge closes. Winners first!" />
      ) : (
        <div className="overflow-hidden rounded-card border border-gray-100 shadow-card">
          {filtered.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-4 border-b border-gray-50 px-5 py-4 last:border-0 sm:px-7">
              <Avatar src={r.profiles?.photo_url} name={r.profiles?.name} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{r.profiles?.name}</p>
                <p className="flex items-center gap-1 truncate text-xs text-smoke">
                  <Icon name={r.reward_type === 'cash' ? 'cash' : 'ticket'} className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">
                    {r.source === 'referral' ? 'Referral voucher' : r.reward_type === 'cash' ? 'Cash' : 'Voucher'}
                    {r.challenges?.title && ` · ${r.challenges.title}`}
                    {r.source === 'referral' && r.referred?.name && ` · brought in ${r.referred.name}`}
                    {r.payment_notes && r.source !== 'referral' && ` · ${r.payment_notes}`}
                  </span>
                </p>
              </div>
              <span className="font-bold tabular-nums">{formatMoney(r.amount, r.currency)}</span>
              <Badge tone={r.status === 'distributed' ? 'green' : 'amber'}>{r.status}</Badge>
              {r.reward_type === 'cash' && (
                <button onClick={() => invoiceReward(r)} className="btn-secondary !py-2 text-xs">Invoice</button>
              )}
              {r.status === 'pending' && (
                <button onClick={() => openDistribute(r)} disabled={busyId === r.id} className="btn-primary !py-2 text-xs">
                  {busyId === r.id ? <Spinner className="h-4 w-4" /> : 'Mark distributed'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      </div>{/* /payouts tab */}

      {/* ---------- Referrals tab ----------
          THE REFERRAL FUNNEL NOW PAYS, AND THIS IS WHERE IT GETS PAID.
          A counted referral - meaning the person somebody brought in has
          actually posted a challenge video - mints a pending voucher reward
          automatically (migration 109). It shows in Payouts with everything
          else, and it also gets this tab, because "who is owed a referral
          voucher" is a question somebody asks on its own and should not have to
          filter a payout list to answer. */}
      <div className={tab === 'referrals' ? '' : 'hidden'}>
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard label="Referral vouchers owed" value={formatMoney(referralOwed)} accent hint={referralPending.length ? `${referralPending.length} waiting` : 'Nothing outstanding'} />
          <StatCard label="Paid out so far" value={formatMoney(referralPaid)} />
          <StatCard label="Referrals that counted" value={referralRewards.length} hint="A referral counts once they post their first video" />
        </div>

        {loading ? (
          <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
        ) : referralRewards.length === 0 ? (
          <EmptyState
            icon={<Icon name="share" className="h-7 w-7" />}
            title="No referral vouchers yet"
            hint="One appears the moment a referred creator posts their first challenge video. Nothing has to be raised by hand."
          />
        ) : (
          <div className="overflow-hidden rounded-card border border-gray-100 shadow-card">
            {referralRewards.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-4 border-b border-gray-50 px-5 py-4 last:border-0 sm:px-7">
                <Avatar src={r.profiles?.photo_url} name={r.profiles?.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{r.profiles?.name}</p>
                  <p className="flex items-center gap-1.5 truncate text-xs text-smoke">
                    <Icon name="share" className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">brought in {r.referred?.name || 'a creator'}</span>
                  </p>
                </div>
                <span className="font-bold tabular-nums">{formatMoney(r.amount, r.currency)}</span>
                <Badge tone={r.status === 'distributed' ? 'green' : 'amber'}>
                  {r.status === 'distributed' ? 'paid' : 'owed'}
                </Badge>
                {r.status === 'pending' && (
                  <button onClick={() => openDistribute(r)} disabled={busyId === r.id} className="btn-primary !py-2 text-xs">
                    {busyId === r.id ? <Spinner className="h-4 w-4" /> : 'Mark paid'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>{/* /referrals tab */}

      {/* ---------- Payment details tab ---------- */}
      <div className={tab === 'details' ? '' : 'hidden'}>
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
                  </div>
                  {rows.length === 0 ? (
                    <p className="rounded-xl bg-cloud px-4 py-3 text-xs text-smoke">This creator hasn't added their payment details yet.</p>
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
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="r-type" className="label">Type</label>
              <Select
                id="r-type" variant="field" ariaLabel="Reward type"
                value={newReward.reward_type}
                onChange={(v) => setNewReward({ ...newReward, reward_type: v })}
                options={[{ value: 'cash', label: 'Cash (£)' }, { value: 'voucher', label: 'Tryp.com voucher' }]}
              />
            </div>
            <div>
              <label htmlFor="r-amount" className="label">Amount (£)</label>
              <input id="r-amount" type="number" min="1" step="0.01" required className="input" value={newReward.amount} onChange={(e) => setNewReward({ ...newReward, amount: e.target.value })} placeholder="150" />
            </div>
          </div>
          <div>
            <label htmlFor="r-notes" className="label">Notes <span className="font-normal text-smoke">(optional)</span></label>
            <input id="r-notes" type="text" className="input" value={newReward.payment_notes} onChange={(e) => setNewReward({ ...newReward, payment_notes: e.target.value })} placeholder="e.g. 1st place prize" />
          </div>
          <button type="submit" disabled={adding} className="btn-primary w-full">
            {adding ? <Spinner /> : 'Add reward (pending)'}
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
