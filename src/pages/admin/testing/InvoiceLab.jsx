import { useMemo, useState } from 'react'
import { Badge } from '../../../components/ui'
import Icon from '../../../components/Icon'
import InvoicePreview from '../../../components/InvoicePreview'
import { downloadInvoicePdf } from '../../../lib/invoicePdf'
import {
  DEFAULT_BILL_TO, invoiceMoney, invoiceNo, invoiceRef, payeeComplete, paymentRows, validatePayee,
} from '../../../lib/invoice'
import { convert, FALLBACK_RATES } from '../../../lib/programme'
import { toast } from '../../../lib/toast'
import { LabPage, Panel, Runner, Note, KeyVal, Choice, Field, Code, useNow, PersonRow, InfoList } from './kit'
import { CREATORS, PAYEE_GBP, PAYEE_EUR, PAYEE_EMPTY, CHALLENGE, iso } from './fixtures'

// AUTOMATIC INVOICING, DEMONSTRATED.
//
// This is the automation that is hardest to talk about and easiest to show: a
// creator wins a cash prize, and an invoice for it exists a second later,
// correctly numbered, addressed to the right company, carrying the bank details
// that were on file AT THAT MOMENT, and refusing to go anywhere until a second
// person has signed it off.
//
// Everything on this page except the row it would have written is real. The
// money formatting is the shared formatter, the validation is the validator the
// creator's own payment form uses, the on-screen invoice is the component the
// admin composer draws, and "Download the PDF" builds a genuine PDF with
// pdf-lib and the embedded Poppins subset. The one thing it does not do is
// insert anything.

const STAGES = [
  { key: 'none', label: 'Not raised', tone: 'grey' },
  { key: 'awaiting_approval', label: 'Awaiting approval', tone: 'amber' },
  { key: 'approved', label: 'Approved', tone: 'light' },
  { key: 'sent', label: 'Sent', tone: 'brand' },
  { key: 'paid', label: 'Paid', tone: 'green' },
]

// Which stage the invoice is in after N steps of the runner have completed.
// The index is the automation's own state machine, which is why the preview and
// the chips can never disagree with the timeline.
const STAGE_AT = ['none', 'none', 'awaiting_approval', 'awaiting_approval', 'approved', 'approved', 'approved', 'sent', 'paid']

// Three test accounts, and the currency is in the label because "which one is
// the euro one" is the first thing anybody asks looking at this.
const SCENARIOS = [
  { value: 'gbp', label: 'Pounds · James Test', creator: 'demo-c1', payee: PAYEE_GBP, amount: 250, currency: 'GBP', place: 1 },
  { value: 'eur', label: 'Euros · Miguel Test', creator: 'demo-c2', payee: PAYEE_EUR, amount: 150, currency: 'EUR', place: 2 },
  { value: 'missing', label: 'Nothing on file · Sofia Test', creator: 'demo-c3', payee: PAYEE_EMPTY, amount: 100, currency: 'GBP', place: 3 },
]

function StageChips({ stage }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {STAGES.slice(1).map((s) => {
        const idx = STAGES.findIndex((x) => x.key === stage)
        const mine = STAGES.findIndex((x) => x.key === s.key)
        const passed = idx >= mine && idx > 0
        return (
          <span
            key={s.key}
            className={
              'rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors duration-300 ' +
              (stage === s.key
                ? 'bg-brand text-white'
                : passed
                  ? 'bg-brand-tint text-brand'
                  : 'bg-cloud text-gray-400')
            }
          >
            {s.label}
          </span>
        )
      })}
    </div>
  )
}

export default function InvoiceLab() {
  const now = useNow()
  const [scenarioKey, setScenarioKey] = useState('gbp')
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)

  const scenario = SCENARIOS.find((s) => s.value === scenarioKey) || SCENARIOS[0]
  const creator = CREATORS.find((c) => c.id === scenario.creator) || CREATORS[0]
  const payee = scenario.payee
  const complete = payeeComplete(payee)
  const problems = validatePayee(payee)

  // THE SELF-APPROVAL RULE, WHICH IS THE POINT OF THE WHOLE QUEUE.
  // The person who raised an invoice cannot be the person who approves it,
  // unless they are the platform owner - somebody has to be able to unblock a
  // one-person day. This is enforced in the database as well as here.

  const invoice = useMemo(() => ({
    number: 47,
    issueDate: iso(0, now),
    creatorName: creator.name,
    creatorAddress: payee.address,
    amount: scenario.amount,
    currency: scenario.currency,
    description: `${CHALLENGE.title} - ${scenario.place === 1 ? '1st' : scenario.place === 2 ? '2nd' : '3rd'} place prize`,
    notes: `To be paid in ${scenario.currency === 'EUR' ? 'euros' : 'pounds'}.`,
    billTo: DEFAULT_BILL_TO,
    payee,
  }), [creator.name, payee, scenario, now])

  const stage = STAGE_AT[Math.min(step, STAGE_AT.length - 1)]

  async function download() {
    setBusy(true)
    try {
      await downloadInvoicePdf(invoice)
      toast('Invoice PDF downloaded. It is a real PDF, for a creator who does not exist.')
    } catch (e) {
      toast(`Could not build the PDF: ${e.message}`)
    }
    setBusy(false)
  }

  const other = scenario.currency === 'GBP' ? 'EUR' : 'GBP'
  const converted = convert(scenario.amount, scenario.currency, other, FALLBACK_RATES)

  const steps = [
    {
      key: 'award', actor: 'admin',
      title: `Log ${creator.name.split(' ')[0]} as ${scenario.place === 1 ? '1st' : scenario.place === 2 ? '2nd' : '3rd'} place`,
      detail: 'An admin closes the challenge and records the winners. This is the only human decision in the whole sequence that is about money.',
      tech: `insert into rewards (creator_id, challenge_id, reward_type, amount, currency, status)\nvalues ('${creator.id}', '${CHALLENGE.id}', 'cash', ${scenario.amount}, '${scenario.currency}', 'pending');`,
    },
    {
      key: 'trigger', actor: 'db',
      title: 'The reward is cash, so an invoice is required',
      detail: 'Vouchers stop here. A cash reward cannot be paid without a document, so the platform raises one rather than waiting for somebody to remember.',
    },
    {
      key: 'draft', actor: 'system',
      title: `Invoice ${invoiceRef(invoice.number)} writes itself, straight into the queue`,
      detail: 'Numbered from the running sequence, dated today, payable in seven days, described from the challenge it came out of. It does NOT pass through a draft stage: a draft is something a person is still writing, and nobody is writing this one.',
      tech: `stage: 'awaiting_approval'\nnumber: ${invoice.number}   ->  "${invoiceRef(invoice.number)}"\namount: ${invoiceMoney(invoice.amount, invoice.currency)}\ndescription: "${invoice.description}"`,
    },
    complete ? {
      key: 'snapshot', actor: 'system',
      title: 'The payee is copied onto the invoice, not linked to it',
      detail: 'The bank details are written INTO the invoice at this moment. If the creator changes their account next month, an invoice already raised keeps the details it was raised with. An invoice that quietly rewrites itself after it was sent is not a record of anything.',
      tech: `invoices.payment = ${JSON.stringify({ currency: payee.currency, name: payee.name, bank: payee.bank, ...(payee.currency === 'EUR' ? { iban: payee.iban, bic: payee.bic } : { sortCode: payee.sortCode, accountNumber: payee.accountNumber }) }, null, 2)}`,
    } : {
      key: 'snapshot', actor: 'guard', blocked: true,
      title: 'Stopped: this creator has no payment details on file',
      detail: 'No invoice is raised, and the creator is asked for their bank details instead. The moment they save them the invoice raises itself and joins the queue - nobody has to come back and remember this one.',
      tech: problems.map((p) => `- ${p}`).join('\n'),
      output: (
        <div className="rounded-card border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-xs font-semibold text-amber-800">Notification to {creator.name}</p>
          <p className="mt-1 text-xs text-amber-800/80">
            You have won a cash prize. Add your payment details so we can pay you.
          </p>
        </div>
      ),
    },
    {
      key: 'queue', actor: 'admin',
      title: 'It appears on every admin’s desk',
      detail: '"1 invoice to approve" on the panel. Money does not go out until somebody has opened the document, read it, and signed it off.',
      tech: "notify_user(type: 'reward', link: '/admin/rewards')",
    },
    {
      key: 'guard', actor: 'guard',
      title: 'The only thing that can stop it here is having nowhere to send the money',
      detail: 'There used to be a two-person rule - the person who raised an invoice could not approve it. It is gone: an auto-raised invoice has nobody who raised it, so the rule only ever bit the rarer hand-written case, and the ceremony was costing more than it caught. What the database still refuses is approving an invoice with an empty bank block, which is the part that was actually protecting money.',
      tech: "invoice_is_payable(payment)  ->  " + (complete ? 'true' : 'FALSE, refused'),
      blocked: !complete,
    },
    {
      key: 'approve', actor: 'admin',
      title: 'Approved',
      detail: 'Recorded against a person and a time, and it is what unlocks every step after this one. An admin opens the document, reads it, and presses Approve.',
      tech: "stage: 'awaiting_approval' -> 'approved'\napproved_by, approved_at recorded",
    },
    {
      key: 'pdf', actor: 'system',
      title: 'The PDF is generated',
      detail: 'Built with pdf-lib and an embedded Poppins subset so it is on brand and the glyph metrics are right. The button below builds a genuine one, right now, for a creator who does not exist.',
      output: (
        <button type="button" onClick={download} disabled={busy} className="btn-secondary text-sm disabled:opacity-50">
          <Icon name="copy" className="mr-1.5 inline h-4 w-4" />
          {busy ? 'Building the PDF…' : 'Download the PDF'}
        </button>
      ),
    },
    {
      key: 'server', actor: 'guard',
      title: 'The server checks the stage again before it sends',
      detail: 'The send-invoice edge function refuses anything that is not approved. If the interface were bypassed entirely, this is what would still stop it.',
      tech: "if (invoice.stage !== 'approved') return 403",
    },
    {
      key: 'send', actor: 'email',
      title: 'Emailed, with the PDF attached',
      detail: `Goes to the finance address and to ${creator.name}, and the invoice is marked as sent.`,
      tech: "stage: 'approved' -> 'sent'",
      output: (
        <div className="rounded-card border border-gray-200 bg-white p-4">
          <p className="text-xs text-smoke">To</p>
          <p className="text-sm font-semibold">finance@tryp.com</p>
          <p className="mt-2 text-xs text-smoke">Subject</p>
          <p className="text-sm font-semibold">{invoiceRef(invoice.number)} - {creator.name} - {invoiceMoney(invoice.amount, invoice.currency)}</p>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-smoke">
            <Icon name="copy" className="h-3.5 w-3.5" />
            Tryp.com-{invoiceNo(invoice.number)}-{creator.name.replace(/\s+/g, '-')}.pdf
          </p>
        </div>
      ),
    },
    {
      key: 'paid', actor: 'admin',
      title: 'Marked as paid',
      detail: 'The reward closes, the creator is notified, and it stops counting towards "rewards still to pay" on the admin desk.',
      tech: "stage: 'sent' -> 'paid'\nrewards.status: 'pending' -> 'distributed'",
    },
  ]

  return (
    <LabPage
      title="Automatic invoicing"
      icon="money"
      subtitle="A cash prize raises its own invoice, snapshots the bank details as they were at that moment, and waits in the queue. An admin opens it, approves it, sends it."
      aside={<StageChips stage={stage} />}
    >
      <Panel
        i={0}
        title="Pick a scenario"
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-5">
            <Field label="Who won">
              <div className="mt-1"><Choice options={SCENARIOS} value={scenarioKey} onChange={(v) => { setScenarioKey(v); setStep(0) }} /></div>
            </Field>
            <div className="space-y-3 rounded-card border border-gray-100 bg-cloud/50 p-4">
              <PersonRow
                creator={creator}
                right={<Badge tone={complete ? 'green' : 'amber'}>{payee.label}</Badge>}
              />
              {complete ? (
                <dl className="space-y-1.5 border-t border-white pt-3">
                  {paymentRows(payee).map(([k, v]) => (
                    <div key={k} className="flex gap-3 text-xs">
                      <dt className="w-28 shrink-0 text-smoke">{k}</dt>
                      <dd className="font-semibold tabular-nums">{v}</dd>
                    </div>
                  ))}
                  <p className="pt-1 text-[11px] text-smoke">
                    Invented, and well formed enough to pass the same validator a creator&apos;s own
                    payment form uses. {payee.currency === 'EUR' ? 'Euro payments go over SEPA and need an IBAN and a BIC.' : 'Pound payments need a six digit sort code and an eight digit account number.'}
                  </p>
                </dl>
              ) : (
                <p className="border-t border-white pt-3 text-[11px] text-smoke">
                  This test account has never filled in its payment details, which is the case the
                  automation has to stop itself on.
                </p>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <KeyVal
              rows={[
                ['Challenge', CHALLENGE.title],
                ['Place', `${scenario.place === 1 ? '1st' : scenario.place === 2 ? '2nd' : '3rd'} of ${CHALLENGE.winners_count}`],
                ['Amount', invoiceMoney(scenario.amount, scenario.currency)],
                ['Roughly', `${invoiceMoney(converted, other)} at the fallback rate`, `${other} per ${scenario.currency}: ${(FALLBACK_RATES[other] / FALLBACK_RATES[scenario.currency]).toFixed(3)}`],
                ['Invoice number', invoiceRef(invoice.number)],
                ['Payment terms', 'Seven days from issue'],
                ['Billed to', 'Tryp.com ApS, Copenhagen'],
              ]}
            />
            <Note>
              <p>
                Live invoices convert at the European Central Bank rate through frankfurter.dev. The sandbox
                uses the built-in fallback so a demo never depends on somebody else being online.
              </p>
            </Note>
          </div>
        </div>
      </Panel>

      <Panel
        i={1}
        title="Run it"
      >
        <Runner steps={steps} onIndexChange={setStep} />
      </Panel>

      <Panel
        i={2}
        title="The invoice itself"
        action={
          <button type="button" onClick={download} disabled={busy} className="btn-secondary text-sm disabled:opacity-50">
            {busy ? 'Building…' : 'Download the PDF'}
          </button>
        }
      >
        <div className="mx-auto max-w-xl">
          <InvoicePreview inv={invoice} />
        </div>
        {!complete && (
          <Note tone="warn" icon="alert" >
            <p className="font-semibold">The bank block is empty, on purpose.</p>
            <p>This is what the document looks like for a creator with no payment details, which is why the automation refuses to move it past draft.</p>
          </Note>
        )}
      </Panel>

      <Panel
        i={3}
        title="What stops this going wrong"
      >
        <InfoList
          items={[
            { icon: 'users', t: 'Two people, always', d: 'Nobody approves their own invoice. The only exception is the platform owner, so one person on their own is never completely blocked.' },
            { icon: 'shield', t: 'The server checks too', d: 'The send function re-reads the stage from the database. Disabling a button in a browser is not a control.' },
            { icon: 'clock', t: 'A snapshot, not a link', d: 'Bank details are copied onto the invoice when it is raised. A document that changes after it is issued is not a document.' },
            { icon: 'eye', t: 'Everything is logged', d: 'Who raised it, who approved it, when it was sent and when it was paid, alongside the audit log of account actions.' },
          ]}
        />
      </Panel>

      <Panel i={3} title="The numbering rule" hint="Invoices are numbered in one running sequence across the whole programme, not per creator and not per market.">
        <Code>{[1, 2, 46, 47, 128].map((n) => `${n}  ->  ${invoiceRef(n)}`).join('\n')}</Code>
      </Panel>
    </LabPage>
  )
}
