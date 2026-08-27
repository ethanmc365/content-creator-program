import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { Badge, Modal, Spinner } from '../ui'
import Icon from '../Icon'
import InvoicePreview from '../InvoicePreview'
import { confirm, notice } from '../../lib/confirm'
import { formatMoney, cx } from '../../lib/utils'
import { badEmails, invoiceRef, parseEmails } from '../../lib/invoice'
import { downloadInvoicePdf } from '../../lib/invoicePdf'
import { invoiceFromRow, sendInvoiceRow } from '../../lib/sendInvoice'
import { playPaid } from '../../lib/appSounds'

const LAST_RECIPIENT_KEY = 'tryp_invoice_to'

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
export const payable = (inv) =>
  !!(inv.payment?.name && (inv.payment?.iban || inv.payment?.accountNumber))

export function StageChip({ stage }) {
  return (
    <span className={cx('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold', STAGE_TONE[stage] || STAGE_TONE.draft)}>
      {STAGE_LABEL[stage] || stage}
    </span>
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
export function InvoiceModal({ inv, open, onClose, myId, isOwner, onDecide, onSend, onPaid, onDownload, onSubmit, onEdit, busy }) {
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
              {onEdit && (
                <button type="button" onClick={() => onEdit(inv)} className="btn-secondary !py-2 !text-sm">
                  Edit
                </button>
              )}
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


// ---------------------------------------------------------------------------
// ONE INVOICE VIEWER, WHEREVER YOU FIND AN INVOICE.
//
// The modal and everything it can do used to live inside the queue, so the only
// place an invoice could be opened was the queue. A cash reward on the Payouts
// tab therefore got a button reading "On invoice Tryp.com 003" that navigated
// you to a different tab and left you to find the row again - Ethan: "that
// button just doesn't really make sense". It does not: a payout row IS an
// invoice, and clicking it should show you the invoice.
//
// Mount `viewer.modal` once, call `viewer.open(row)` from wherever, and pass
// `onChanged` if the page around it counts invoices.
export function useInvoiceViewer({ onChanged, myId, isOwner, onEdit } = {}) {
  const [row, setRow] = useState(null)
  const [busy, setBusy] = useState(null)
  const [rejecting, setRejecting] = useState(null)
  const [note, setNote] = useState('')

  // Always re-read the row after anything changes it, so the buttons under the
  // document match the document.
  async function reload(id) {
    const { data } = await supabase.from('invoices').select('*').eq('id', id).maybeSingle()
    setRow(data ?? null)
    onChanged?.()
  }

  async function call(fn, args, inv) {
    setBusy(inv.id)
    const { error } = await supabase.rpc(fn, args)
    setBusy(null)
    if (error) { notice(error.message); return false }
    await reload(inv.id)
    return true
  }

  async function onDecide(inv, approve) {
    if (approve) {
      if (!await confirm(`Approve ${invoiceRef(inv.number)} for ${inv.creator_name}, ${formatMoney(inv.amount, inv.currency)}?`)) return
      await call('decide_invoice', { p_id: inv.id, p_approve: true, p_note: null }, inv)
      return
    }
    // A rejection without a reason is one the submitter cannot act on.
    setRejecting(inv)
    setNote('')
  }

  async function onPaid(inv) {
    if (!await confirm(`Mark ${invoiceRef(inv.number)} as paid? This also settles the reward it came from.`)) return
    // MONEY LANDING GETS THE COIN. It is the last step of a chain that started
    // when somebody won something, and the only one with no visible celebration
    // attached to it.
    if (await call('mark_invoice_paid', { p_id: inv.id, p_paid: true }, inv)) playPaid()
  }

  async function onSend(inv, { to, cc }) {
    setBusy(inv.id)
    try {
      await sendInvoiceRow(inv, { to, cc, channel: 'resend' })
      localStorage.setItem(LAST_RECIPIENT_KEY, to.trim())
      notice(`${invoiceRef(inv.number)} is on its way to ${parseEmails(to).join(', ')}.\n\n${inv.creator_name} has been told to expect the payment.`)
      await reload(inv.id)
    } catch (e) {
      notice(e.message)
    } finally {
      setBusy(null)
    }
  }

  async function onDownload(inv) {
    try { await downloadInvoicePdf(invoiceFromRow(inv)) }
    catch (err) { notice(err?.message || 'That PDF could not be built.') }
  }

  const modal = (
    <>
      <InvoiceModal
        inv={row}
        open={!!row}
        onClose={() => setRow(null)}
        myId={myId}
        isOwner={isOwner}
        busy={busy}
        onDecide={onDecide}
        onSend={onSend}
        onPaid={onPaid}
        onDownload={onDownload}
        onSubmit={(inv) => call('submit_invoice', { p_id: inv.id }, inv)}
        onEdit={onEdit ? (inv) => { setRow(null); onEdit(inv) } : undefined}
      />

      <Modal open={!!rejecting} onClose={() => setRejecting(null)} title="Send it back">
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            const inv = rejecting
            setRejecting(null)
            await call('decide_invoice', { p_id: inv.id, p_approve: false, p_note: note }, inv)
          }}
          className="space-y-4"
        >
          <p className="text-sm text-smoke">
            {rejecting && `${invoiceRef(rejecting.number)} for ${rejecting.creator_name}.`} Say what needs
            changing - the person who submitted it gets this.
          </p>
          <textarea
            className="input min-h-24" value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="The amount does not match the prize breakdown."
            aria-label="Why it is going back" autoFocus
          />
          <div className="flex items-center gap-3">
            <button type="submit" className="btn-primary">Send it back</button>
            <button type="button" onClick={() => setRejecting(null)} className="btn-ghost">Cancel</button>
          </div>
        </form>
      </Modal>
    </>
  )

  // `approve` is exposed because the queue keeps one shortcut on the row: it is
  // the only action anybody does in bulk, on invoices they have already read.
  return { open: setRow, close: () => setRow(null), approve: onDecide, modal, busy }
}
