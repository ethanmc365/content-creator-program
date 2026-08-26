import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { Avatar, Badge, EmptyState, Modal, Skeleton, Spinner, StatCard } from '../../components/ui'
import Icon from '../../components/Icon'
import { confirm, notice } from '../../lib/confirm'
import { formatDate, formatMoney, cx } from '../../lib/utils'
import { invoiceRef } from '../../lib/invoice'
import { downloadInvoicePdf } from '../../lib/invoicePdf'
import { playPaid } from '../../lib/appSounds'

// THE APPROVAL QUEUE.
//
// WHY THIS EXISTS AT ALL. An invoice used to come into being already sent:
// `status` defaulted to 'sent', because the only way to make one was to email
// it. Money therefore left the company on one person's judgement, with no
// second pair of eyes, no record of who decided, and - the part that actually
// bit - no way to see what was ABOUT to go out. This is the page that answers
// "what are we on the hook for this week".
//
// WHY IT IS A LIST OF STAGES AND NOT A FILTER.
//
// Every column here is a different question with a different owner:
//   Blocked            - the creator has not given us their bank details.
//                        Nobody can approve this; somebody has to chase them.
//   Ready to submit    - a draft the automation made. Read it and send it up.
//   Waiting on you     - somebody else's submission. This is the actual queue.
//   Approved           - cleared to send, not yet emailed.
//   Out                - sent, waiting to be paid.
// A single table with a status column makes all five look like the same job.

const STAGE_LABEL = {
  draft: 'Draft',
  awaiting_approval: 'Waiting for approval',
  approved: 'Approved',
  rejected: 'Sent back',
  sent: 'Sent',
  paid: 'Paid',
}

const STAGE_TONE = {
  draft: 'bg-cloud text-smoke',
  awaiting_approval: 'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-600',
  sent: 'bg-brand-tint text-brand',
  paid: 'bg-ink text-white',
}

// An invoice cannot be approved without somewhere to send the money, and the
// snapshot on the row is what will be printed on the PDF.
const payable = (inv) =>
  !!(inv.payment?.name && (inv.payment?.iban || inv.payment?.accountNumber))

function StageChip({ stage }) {
  return (
    <span className={cx('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold', STAGE_TONE[stage] || STAGE_TONE.draft)}>
      {STAGE_LABEL[stage] || stage}
    </span>
  )
}

function Row({ inv, people, myId, isOwner, busy, onSubmit, onDecide, onPaid, onOpen, onDownload }) {
  const who = people.get(inv.creator_id)
  const mineToApprove = inv.stage === 'awaiting_approval'
    && (isOwner || inv.submitted_by !== myId)
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-card border border-gray-100 bg-white px-4 py-3">
      <Avatar src={who?.photo_url} name={inv.creator_name} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-semibold">{inv.creator_name}</span>
          <StageChip stage={inv.stage} />
          {inv.auto_generated && <Badge tone="light" className="!px-2 !py-0">Auto</Badge>}
        </p>
        <p className="truncate text-xs text-smoke">
          {invoiceRef(inv.number)} · {inv.description}
        </p>
        {inv.decision_note && (
          <p className="mt-0.5 truncate text-xs italic text-smoke">&ldquo;{inv.decision_note}&rdquo;</p>
        )}
        {!payable(inv) && inv.stage === 'draft' && (
          <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-amber-600">
            <Icon name="alert" className="h-3.5 w-3.5" /> No bank details saved yet
          </p>
        )}
      </div>

      <div className="text-right">
        <p className="text-sm font-bold tabular-nums">{formatMoney(inv.amount, inv.currency)}</p>
        <p className="text-[11px] text-smoke">
          {inv.paid_at ? `Paid ${formatDate(inv.paid_at)}`
            : inv.sent_at ? `Sent ${formatDate(inv.sent_at)}`
            : inv.submitted_at ? `Submitted ${formatDate(inv.submitted_at)}`
            : formatDate(inv.created_at)}
        </p>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        {/* A DOWNLOAD BUTTON DRAWN AS A COPY BUTTON. It is the same shape and
            the same size as the copy buttons three rows above it on the payment
            details tab, so it read as "copy this invoice" - which is a
            different and much more alarming thing to press. */}
        <button type="button" onClick={() => onDownload(inv)} title="Download the PDF"
          aria-label="Download the PDF"
          className="rounded-full border border-gray-200 p-2 text-smoke transition-colors hover:border-brand hover:text-brand">
          <Icon name="arrow-down" className="h-4 w-4" />
        </button>

        {(inv.stage === 'draft' || inv.stage === 'rejected') && (
          <>
            <button type="button" onClick={() => onOpen(inv)} className="btn-secondary !py-1.5 !px-3 !text-xs">
              Edit
            </button>
            <button
              type="button"
              onClick={() => onSubmit(inv)}
              disabled={busy === inv.id || !payable(inv)}
              title={payable(inv) ? 'Send it up for approval' : 'The creator has not saved their bank details'}
              className="btn-primary !py-1.5 !px-3 !text-xs disabled:opacity-40"
            >
              {busy === inv.id ? <Spinner /> : 'Submit'}
            </button>
          </>
        )}

        {inv.stage === 'awaiting_approval' && (
          mineToApprove ? (
            <>
              <button type="button" onClick={() => onDecide(inv, false)} disabled={busy === inv.id}
                className="btn-secondary !py-1.5 !px-3 !text-xs disabled:opacity-40">
                Send back
              </button>
              <button type="button" onClick={() => onDecide(inv, true)} disabled={busy === inv.id}
                className="btn-primary !py-1.5 !px-3 !text-xs disabled:opacity-40">
                {busy === inv.id ? <Spinner /> : 'Approve'}
              </button>
            </>
          ) : (
            // The whole point of an approval step is that it is somebody else's.
            <span className="text-xs text-smoke">Waiting on another admin</span>
          )
        )}

        {inv.stage === 'approved' && (
          <button type="button" onClick={() => onOpen(inv)} className="btn-primary !py-1.5 !px-3 !text-xs">
            Send it
          </button>
        )}

        {(inv.stage === 'sent' || inv.stage === 'approved') && (
          <button type="button" onClick={() => onPaid(inv)} disabled={busy === inv.id}
            className="btn-secondary !py-1.5 !px-3 !text-xs disabled:opacity-40">
            Mark paid
          </button>
        )}
      </div>
    </div>
  )
}

function Group({ title, rows, ...rest }) {
  if (!rows.length) return null
  return (
    <section>
      <h3 className="text-[15px] font-semibold">
        {title} <span className="ml-1 font-normal tabular-nums text-smoke">{rows.length}</span>
      </h3>
      <div className="mt-2.5 space-y-2">
        {rows.map((inv) => <Row key={inv.id} inv={inv} {...rest} />)}
      </div>
    </section>
  )
}

export default function InvoiceQueue({ onEdit, inMarket, onChanged }) {
  const { user, profile } = useAuth()
  const isOwner = profile?.platform_role === 'owner'
  const [rows, setRows] = useState(null)
  const [people, setPeople] = useState(new Map())
  const [busy, setBusy] = useState(null)
  const [rejecting, setRejecting] = useState(null)
  const [note, setNote] = useState('')
  const [threshold, setThreshold] = useState(null)
  const [savingPolicy, setSavingPolicy] = useState(false)

  const load = useCallback(async () => {
    const [{ data: inv }, { data: profs }, { data: policy }] = await Promise.all([
      supabase.from('invoices').select('*').order('number', { ascending: false }),
      supabase.from('profiles').select('id, name, photo_url'),
      supabase.from('app_settings').select('value').eq('key', 'invoice_approval').maybeSingle(),
    ])
    setRows(inv || [])
    setPeople(new Map((profs || []).map((p) => [p.id, p])))
    setThreshold(String(policy?.value?.threshold ?? 0))
  }, [])

  useEffect(() => { load() }, [load])

  async function savePolicy(e) {
    e.preventDefault()
    setSavingPolicy(true)
    const { error } = await supabase.from('app_settings').upsert({
      key: 'invoice_approval',
      value: { threshold: Math.max(0, Number(threshold) || 0) },
      updated_at: new Date().toISOString(),
    })
    setSavingPolicy(false)
    notice(error ? `Couldn't save: ${error.message}` : 'Saved.')
  }

  const groups = useMemo(() => {
    // Scoped with the rest of the page. An invoice belongs to the market its
    // creator does.
    const all = (rows || []).filter((i) => !inMarket || inMarket.has(i.creator_id))
    return {
      blocked: all.filter((i) => i.stage === 'draft' && !payable(i)),
      ready: all.filter((i) => (i.stage === 'draft' && payable(i)) || i.stage === 'rejected'),
      waiting: all.filter((i) => i.stage === 'awaiting_approval'),
      approved: all.filter((i) => i.stage === 'approved'),
      out: all.filter((i) => i.stage === 'sent'),
      paid: all.filter((i) => i.stage === 'paid'),
    }
  }, [rows, inMarket])

  // What is committed but not yet gone. The one number this page exists for.
  const outstanding = useMemo(() => {
    const live = (rows || [])
      .filter((i) => !inMarket || inMarket.has(i.creator_id))
      .filter((i) => i.stage !== 'paid' && i.stage !== 'rejected')
    const byCcy = {}
    for (const i of live) byCcy[i.currency] = (byCcy[i.currency] || 0) + Number(i.amount || 0)
    return byCcy
  }, [rows, inMarket])

  async function call(fn, args, inv) {
    setBusy(inv.id)
    const { error } = await supabase.rpc(fn, args)
    setBusy(null)
    if (error) { notice(error.message); return false }
    await load()
    onChanged?.()
    return true
  }

  const onSubmit = (inv) => call('submit_invoice', { p_id: inv.id }, inv)

  async function onDecide(inv, approve) {
    if (approve) {
      if (!await confirm(`Approve ${invoiceRef(inv.number)} for ${inv.creator_name}, ${formatMoney(inv.amount, inv.currency)}?`)) return
      call('decide_invoice', { p_id: inv.id, p_approve: true, p_note: null }, inv)
      return
    }
    // A rejection without a reason is a rejection the submitter cannot act on.
    setRejecting(inv)
    setNote('')
  }

  async function confirmReject(e) {
    e.preventDefault()
    const inv = rejecting
    setRejecting(null)
    await call('decide_invoice', { p_id: inv.id, p_approve: false, p_note: note }, inv)
  }

  async function onPaid(inv) {
    if (!await confirm(`Mark ${invoiceRef(inv.number)} as paid? This also settles the reward it came from.`)) return
    // MONEY LANDING GETS THE COIN. It is the last step of a chain that started
    // when somebody won something, and the only one with no visible celebration
    // attached to it - the row simply changes colour. Sound is free here and
    // this is the one moment in the admin panel that deserves it.
    if (await call('mark_invoice_paid', { p_id: inv.id, p_paid: true }, inv)) playPaid()
  }

  async function onDownload(inv) {
    try {
      await downloadInvoicePdf({
        number: inv.number,
        creatorName: inv.creator_name,
        amount: Number(inv.amount),
        currency: inv.currency,
        description: inv.description,
        issueDate: inv.issue_date,
        billTo: inv.bill_to,
        payee: inv.payment || {},
        creatorAddress: inv.payment?.address || '',
        notes: inv.notes || '',
      })
    } catch (err) {
      notice(err?.message || 'That PDF could not be built.')
    }
  }

  if (!rows) return <div className="space-y-3"><Skeleton className="h-20" /><Skeleton className="h-20" /></div>

  const shared = { people, myId: user.id, isOwner, busy, onSubmit, onDecide, onPaid, onOpen: onEdit, onDownload }
  const nothing = rows.length === 0

  return (
    <div className="space-y-8">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Waiting for approval" value={groups.waiting.length} accent={groups.waiting.length > 0} />
        <StatCard label="Blocked on bank details" value={groups.blocked.length} />
        <StatCard
          label="Committed, not yet paid"
          value={Object.entries(outstanding).map(([c, v]) => formatMoney(v, c)).join(' · ') || '—'}
        />
      </div>

      {nothing ? (
        <EmptyState
          icon={<Icon name="money" className="h-7 w-7" />}
          title="Nothing in the queue"
          hint="Award a cash prize on the Payouts tab and its invoice appears here as a draft, already filled in."
        />
      ) : (
        <>
          <Group title="Waiting for approval" rows={groups.waiting} {...shared} />
          <Group title="Approved, ready to send" rows={groups.approved} {...shared} />
          <Group title="Ready to submit" rows={groups.ready} {...shared} />
          <Group title="Blocked on bank details" rows={groups.blocked} {...shared} />
          <Group title="Sent, not yet paid" rows={groups.out} {...shared} />
          <Group title="Paid" rows={groups.paid.slice(0, 12)} {...shared} />
        </>
      )}


      {/* IS THE APPROVAL QUEUE NEEDED AT ALL?
          Ethan's question, and this is the answer the page gives back: it is
          needed where a HUMAN TYPED THE NUMBER, because that is where the error
          happens. A prize invoice reads its amount off the challenge's own
          prize structure and is raised by publishing the winners, which is
          already a deliberate act behind a confirm - so above some size it is
          ceremony, and below it, it is just a delay on somebody's money.
          Set the size here. At zero (where it ships) nothing skips approval and
          the queue behaves exactly as it does today. */}
      {threshold !== null && (
        <form onSubmit={savePolicy} className="rounded-card border border-gray-100 bg-white p-5">
          <h3 className="text-[15px] font-semibold">Approval policy</h3>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span>Clear prize invoices automatically at or under</span>
            <span className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2 py-1 focus-within:border-brand">
              <span className="text-smoke">£</span>
              <input
                type="number" min="0" step="1"
                className="w-20 border-0 bg-transparent p-0 text-sm font-semibold tabular-nums outline-none focus:ring-0"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                aria-label="Automatic approval threshold"
              />
            </span>
            <button type="submit" disabled={savingPolicy} className="btn-secondary !py-1.5 !px-3 !text-xs">
              {savingPolicy ? <Spinner /> : 'Save'}
            </button>
          </div>
          <p className="mt-2 text-xs text-smoke">
            {Number(threshold) > 0
              ? `A prize invoice of £${Number(threshold)} or less goes straight to "ready to send". Anything larger, and every invoice written by hand, still needs a second admin.`
              : 'Every invoice needs a second admin before it can be sent.'}
          </p>
        </form>
      )}

      <Modal open={!!rejecting} onClose={() => setRejecting(null)} title="Send it back">
        <form onSubmit={confirmReject} className="space-y-4">
          <p className="text-sm text-smoke">
            {rejecting && `${invoiceRef(rejecting.number)} for ${rejecting.creator_name}.`} Say what needs
            changing - the person who submitted it gets this.
          </p>
          <textarea
            className="input min-h-24"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="The amount does not match the prize breakdown."
            aria-label="Why it is going back"
            autoFocus
          />
          <div className="flex items-center gap-3">
            <button type="submit" className="btn-primary">Send it back</button>
            <button type="button" onClick={() => setRejecting(null)} className="btn-ghost">Cancel</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
