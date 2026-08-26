import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { Avatar, Badge, EmptyState, Modal, Skeleton, Spinner, StatCard } from '../../components/ui'
import Icon from '../../components/Icon'
import InvoicePreview from '../../components/InvoicePreview'
import { confirm, notice } from '../../lib/confirm'
import { formatDate, formatMoney, cx } from '../../lib/utils'
import { badEmails, invoiceRef, parseEmails } from '../../lib/invoice'
import { downloadInvoicePdf } from '../../lib/invoicePdf'
import { invoiceFromRow, sendInvoiceRow } from '../../lib/sendInvoice'
import { playPaid } from '../../lib/appSounds'

const LAST_RECIPIENT_KEY = 'tryp_invoice_to'

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

function Row({ inv, people, myId, isOwner, busy, onDecide, onView }) {
  const who = people.get(inv.creator_id)
  const mineToApprove = inv.stage === 'awaiting_approval' && (isOwner || inv.submitted_by !== myId)
  return (
    <button
      type="button"
      onClick={() => onView(inv)}
      className="flex w-full flex-wrap items-center gap-3 rounded-card border border-gray-100 bg-white px-4 py-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-card"
    >
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
        {!payable(inv) && (
          <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-amber-600">
            <Icon name="alert" className="h-3.5 w-3.5" /> Waiting on their bank details
          </p>
        )}
      </div>

      <div className="text-right">
        <p className="text-sm font-bold tabular-nums">{formatMoney(inv.amount, inv.currency)}</p>
        <p className="text-[11px] text-smoke">
          {inv.paid_at ? `Paid ${formatDate(inv.paid_at)}`
            : inv.sent_at ? `Sent ${formatDate(inv.sent_at)}`
            : inv.submitted_at ? `Raised ${formatDate(inv.submitted_at)}`
            : formatDate(inv.created_at)}
        </p>
      </div>

      {/* ONE SHORTCUT, FOR THE ONE ACTION SOMEBODY DOES IN BULK.
          Everything else - sending, marking paid, sending back - happens in the
          document view, because everything else is a decision you should not be
          taking from a summary row. Approving a queue of prize invoices you have
          already read is the exception. */}
      {mineToApprove && payable(inv) ? (
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => { e.stopPropagation(); onDecide(inv, true) }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); e.preventDefault(); onDecide(inv, true) } }}
          className="btn-primary shrink-0 !py-1.5 !px-3 !text-xs"
        >
          {busy === inv.id ? <Spinner /> : 'Approve'}
        </span>
      ) : (
        <Icon name="chevronRight" className="h-4 w-4 shrink-0 text-gray-300" />
      )}
    </button>
  )
}

// ---------------------------------------------------------------------------
// LOOKING AT AN INVOICE.
//
// Ethan: "whenever I click on approved and ready to send, I want to actually
// see a pop up with the preview invoice. I don't wanna have to download it
// every time."
//
// He is describing the missing middle of the whole workflow. Approving an
// invoice is a judgement about a DOCUMENT - is the amount right, is the name
// right, is the bank block filled in - and the queue row shows a name, a
// number and a total. The only way to see the thing you were signing off was to
// download a PDF, open it in another application, come back, and press Approve
// from memory. So people pressed Approve from memory.
//
// The row opens the document. Every action lives under it, in the order the
// invoice actually travels: approve, then send, then mark paid. Sending opens
// the addresses inline rather than throwing you into the composer - an
// auto-raised invoice has nothing left to compose.
function InvoiceModal({ inv, open, onClose, myId, isOwner, onDecide, onSend, onPaid, onDownload, onSubmit, onEdit, busy }) {
  const [mode, setMode] = useState(null)   // null | 'send'
  const [to, setTo] = useState('')
  const [cc, setCc] = useState('')

  useEffect(() => {
    if (!open) { setMode(null); return }
    setTo(localStorage.getItem(LAST_RECIPIENT_KEY) || '')
    setCc('')
  }, [open, inv?.id])

  if (!inv) return null
  const canApprove = inv.stage === 'awaiting_approval' && (isOwner || inv.submitted_by !== myId)
  const payableNow = payable(inv)

  function startSend() {
    const bad = [...badEmails(to), ...badEmails(cc)]
    if (mode !== 'send') return setMode('send')
    if (parseEmails(to).length === 0) return notice('Enter at least one address to send it to.')
    if (bad.length) return notice(`These addresses don't look right: ${bad.join(', ')}.`)
    onSend(inv, { to, cc })
  }

  return (
    <Modal open={open} onClose={onClose} title={`${invoiceRef(inv.number)} · ${inv.creator_name}`} wide>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <StageChip stage={inv.stage} />
          {inv.auto_generated && <Badge tone="light">Raised automatically</Badge>}
          <span className="ml-auto text-lg font-bold tabular-nums">{formatMoney(inv.amount, inv.currency)}</span>
        </div>

        {!payableNow && (
          <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
            <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {inv.creator_name} has not saved their payment details, so there is nowhere to send
              the money. They have been asked for them; this fills itself in the moment they answer.
            </span>
          </p>
        )}

        {inv.decision_note && (
          <p className="rounded-xl bg-cloud px-4 py-3 text-sm italic text-smoke">
            &ldquo;{inv.decision_note}&rdquo;
          </p>
        )}

        {/* THE DOCUMENT. The same component the composer previews and the
            testing lab draws, so what you approve is what goes out. */}
        <div className="rounded-card border border-gray-100 p-1">
          <InvoicePreview inv={invoiceFromRow(inv)} />
        </div>

        {mode === 'send' && (
          <div className="space-y-3 rounded-card border border-brand/25 bg-brand-tint/25 p-4">
            <p className="text-sm font-semibold">Where is it going?</p>
            <div>
              <label htmlFor="q-to" className="label">Send to</label>
              <input id="q-to" type="text" className="input" placeholder="andre@tryp.com, francesco@tryp.com"
                value={to} onChange={(e) => setTo(e.target.value)} autoFocus />
            </div>
            <div>
              <label htmlFor="q-cc" className="label">CC <span className="font-normal text-smoke">(optional)</span></label>
              <input id="q-cc" type="text" className="input" placeholder="you@tryp.com"
                value={cc} onChange={(e) => setCc(e.target.value)} />
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-4">
          <button type="button" onClick={() => onDownload(inv)} className="btn-ghost !py-2 !text-sm">
            Download PDF
          </button>

          <span className="flex-1" />

          {/* A hand-written draft, or one that came back for a change. The
              only two stages where the CONTENT is still up for editing. */}
          {(inv.stage === 'draft' || inv.stage === 'rejected') && (
            <>
              <button type="button" onClick={() => onEdit(inv)} className="btn-secondary !py-2 !text-sm">
                Edit
              </button>
              <button type="button" onClick={() => onSubmit(inv)} disabled={busy === inv.id || !payableNow}
                title={payableNow ? '' : 'No bank details on this invoice yet'}
                className="btn-primary !py-2 !text-sm disabled:opacity-40">
                {busy === inv.id ? <Spinner /> : 'Send for approval'}
              </button>
            </>
          )}

          {inv.stage === 'awaiting_approval' && (
            canApprove ? (
              <>
                <button type="button" onClick={() => onDecide(inv, false)} disabled={busy === inv.id}
                  className="btn-secondary !py-2 !text-sm disabled:opacity-40">
                  Send back
                </button>
                <button type="button" onClick={() => onDecide(inv, true)} disabled={busy === inv.id || !payableNow}
                  title={payableNow ? '' : 'No bank details on this invoice yet'}
                  className="btn-primary !py-2 !text-sm disabled:opacity-40">
                  {busy === inv.id ? <Spinner /> : 'Approve'}
                </button>
              </>
            ) : (
              <span className="text-sm text-smoke">Waiting on another admin</span>
            )
          )}

          {inv.stage === 'approved' && (
            <>
              {mode === 'send' && (
                <button type="button" onClick={() => setMode(null)} className="btn-ghost !py-2 !text-sm">Back</button>
              )}
              <button type="button" onClick={startSend} disabled={busy === inv.id}
                className="btn-primary !py-2 !text-sm disabled:opacity-40">
                {busy === inv.id ? <Spinner /> : mode === 'send' ? 'Send it now' : 'Send it'}
              </button>
            </>
          )}

          {(inv.stage === 'sent' || inv.stage === 'approved') && mode !== 'send' && (
            <button type="button" onClick={() => onPaid(inv)} disabled={busy === inv.id}
              className="btn-secondary !py-2 !text-sm disabled:opacity-40">
              Mark paid
            </button>
          )}
        </div>
      </div>
    </Modal>
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

  const load = useCallback(async () => {
    const [{ data: inv }, { data: profs }] = await Promise.all([
      supabase.from('invoices').select('*').order('number', { ascending: false }),
      supabase.from('profiles').select('id, name, photo_url'),
    ])
    setRows(inv || [])
    setPeople(new Map((profs || []).map((p) => [p.id, p])))
  }, [])

  useEffect(() => { load() }, [load])

  const groups = useMemo(() => {
    // Scoped with the rest of the page. An invoice belongs to the market its
    // creator does.
    const all = (rows || []).filter((i) => !inMarket || inMarket.has(i.creator_id))
    // EVERY INVOICE APPEARS IN EXACTLY ONE GROUP.
    //
    // It did not: "blocked" was derived from the payment block and the other
    // groups from the stage, so an approved invoice with an empty bank block
    // was listed twice - once under "ready to send" and again under "blocked
    // on bank details" - with a different instruction in each. Blocked is
    // checked first and everything else is what is left.
    const blocked = all.filter((i) => !payable(i) && i.stage !== 'sent' && i.stage !== 'paid')
    const rest = all.filter((i) => !blocked.includes(i))
    return {
      blocked,
      ready: rest.filter((i) => i.stage === 'draft' || i.stage === 'rejected'),
      waiting: rest.filter((i) => i.stage === 'awaiting_approval'),
      approved: rest.filter((i) => i.stage === 'approved'),
      out: rest.filter((i) => i.stage === 'sent'),
      paid: rest.filter((i) => i.stage === 'paid'),
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

  // The row that is open in the document view. Re-read from `rows` on every
  // render so an approve made inside the modal redraws the modal's own buttons
  // rather than leaving a stale copy of the row on screen.
  const [viewingId, setViewingId] = useState(null)
  const viewing = (rows || []).find((r) => r.id === viewingId) || null

  async function onSend(inv, { to, cc }) {
    setBusy(inv.id)
    try {
      await sendInvoiceRow(inv, { to, cc, channel: 'resend' })
      localStorage.setItem(LAST_RECIPIENT_KEY, to.trim())
      notice(`${invoiceRef(inv.number)} is on its way to ${parseEmails(to).join(', ')}.\n\n${inv.creator_name} has been told to expect the payment.`)
      setViewingId(null)
      await load()
      onChanged?.()
    } catch (e) {
      notice(e.message)
    } finally {
      setBusy(null)
    }
  }

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
      await downloadInvoicePdf(invoiceFromRow(inv))
    } catch (err) {
      notice(err?.message || 'That PDF could not be built.')
    }
  }

  if (!rows) return <div className="space-y-3"><Skeleton className="h-20" /><Skeleton className="h-20" /></div>

  const shared = { people, myId: user.id, isOwner, busy, onDecide, onView: (inv) => setViewingId(inv.id) }
  const nothing = rows.length === 0

  return (
    <div className="space-y-8">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Waiting for approval" value={groups.waiting.length} accent={groups.waiting.length > 0} />
        <StatCard label="Waiting on bank details" value={groups.blocked.length} />
        <StatCard
          label="Committed, not yet paid"
          value={Object.entries(outstanding).map(([c, v]) => formatMoney(v, c)).join(' · ') || '—'}
        />
      </div>

      {nothing ? (
        <EmptyState
          icon={<Icon name="money" className="h-7 w-7" />}
          title="Nothing in the queue"
          hint="Publish a challenge's winners and every cash prize raises its invoice here, already filled in."
        />
      ) : (
        <>
          <Group title="Waiting for approval" rows={groups.waiting} {...shared} />
          <Group title="Approved, ready to send" rows={groups.approved} {...shared} />
          <Group title="Ready to submit" rows={groups.ready} {...shared} />
          <Group title="Waiting on bank details" rows={groups.blocked} {...shared} />
          <Group title="Sent, not yet paid" rows={groups.out} {...shared} />
          <Group title="Paid" rows={groups.paid.slice(0, 12)} {...shared} />
        </>
      )}


      <InvoiceModal
        inv={viewing}
        open={!!viewing}
        onClose={() => setViewingId(null)}
        myId={user.id}
        isOwner={isOwner}
        busy={busy}
        onDecide={onDecide}
        onSend={onSend}
        onPaid={onPaid}
        onDownload={onDownload}
        onSubmit={onSubmit}
        onEdit={(i) => { setViewingId(null); onEdit(i) }}
      />

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
