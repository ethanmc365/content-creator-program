import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Avatar, Badge, EmptyState, Skeleton, Spinner, StatCard } from '../../components/ui'
import Icon from '../../components/Icon'
import { formatDate, formatMoney } from '../../lib/utils'
import { invoiceRef } from '../../lib/invoice'
import { StageChip, payable, useInvoiceViewer } from '../../components/admin/InvoiceModal'

// THE APPROVAL QUEUE. What an invoice IS, and everything you can do to one,
// lives in components/admin/InvoiceModal - the Payouts tab opens the same
// document from the same code.

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

function Row({ inv, people, busy, onDecide, onView }) {
  const who = people.get(inv.creator_id)
  const mineToApprove = inv.stage === 'awaiting_approval'
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
  const [rows, setRows] = useState(null)
  const [people, setPeople] = useState(new Map())

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

  // Everything you can DO to an invoice lives in the viewer, so the queue only
  // has to say which one you clicked. `onChanged` refreshes this list; the
  // viewer refreshes the row inside itself.
  const viewer = useInvoiceViewer({
    onEdit,
    onChanged: () => { load(); onChanged?.() },
  })

  if (!rows) return <div className="space-y-3"><Skeleton className="h-20" /><Skeleton className="h-20" /></div>

  const shared = { people, busy: viewer.busy, onDecide: viewer.approve, onView: viewer.open }
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


      {viewer.modal}
    </div>
  )
}
