import { format } from 'date-fns'
import { invoiceMoney, invoiceNo, paymentRows } from '../lib/invoice'

// THE INVOICE, ON SCREEN.
//
// It lives here rather than inside the admin invoices panel because it is now
// drawn in two places: the composer an admin types into, and the Testing Centre
// lab that demonstrates the invoice automation over an invented creator. Two
// copies of an invoice layout is exactly the sort of thing that drifts until
// the demo and the product disagree about where the total sits.
//
// This is deliberately a close cousin of the PDF (see lib/invoicePdf.js) and not
// a shared renderer: one is HTML and one is pdf-lib drawing commands, and the
// abstraction that unified them would be worse than the duplication. What IS
// shared is every VALUE - the money formatting, the padded number, the per
// currency bank rows - which is what actually has to match.
export default function InvoicePreview({ inv }) {
  const issue = new Date(inv.issueDate)
  const due = new Date(issue.getTime() + 7 * 24 * 60 * 60 * 1000)
  const rows = paymentRows(inv.payee)
  const billLines = String(inv.billTo || '').split(/\n+/).map((l) => l.trim()).filter(Boolean)
  return (
    <div className="overflow-hidden rounded-card bg-white shadow-lift ring-1 ring-gray-100">
      <div className="space-y-6 px-8 pb-6 pt-8 text-sm">
        {/* Creator headline */}
        <div>
          <p className="text-xl font-extrabold uppercase leading-tight tracking-tight">{inv.creatorName || 'Creator name'}</p>
          <p className="mt-1 text-[10px] font-bold tracking-[0.3em] text-smoke">CONTENT CREATOR PROGRAM</p>
          {inv.creatorAddress && <p className="mt-1 text-xs text-smoke">{String(inv.creatorAddress).replace(/\n+/g, ', ')}</p>}
        </div>

        {/* Logo + INVOICE number (crop the wordmark out of the full-bleed logo file) */}
        <div className="flex items-end justify-between">
          <div
            className="h-11 w-[121px] rounded-xl"
            style={{ backgroundImage: 'url(/brand/tryp-logo.png)', backgroundSize: '174% auto', backgroundPosition: '50% 51%' }}
            role="img" aria-label="Tryp.com"
          />
          <div className="text-right">
            <p className="text-2xl font-extrabold tracking-wide">INVOICE</p>
            <p className="text-sm font-extrabold text-brand">#{invoiceNo(inv.number)}</p>
          </div>
        </div>

        {/* Invoice-to + dates */}
        <div className="flex justify-between gap-6">
          <div className="min-w-0">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-brand">Invoice to</p>
            {billLines.length === 0 ? (
              <p className="text-xs text-smoke">Company details appear here.</p>
            ) : billLines.map((l, i) => (
              i === 0
                ? <p key={i} className="font-semibold">{l}</p>
                : <p key={i} className="text-xs text-smoke">{l}</p>
            ))}
          </div>
          <div className="shrink-0 space-y-1 text-right text-xs">
            <p><span className="text-smoke">Date </span><span className="font-semibold">{format(issue, 'd MMM yyyy')}</span></p>
            <p><span className="text-smoke">Payment due </span><span className="font-semibold">{format(due, 'd MMM yyyy')}</span></p>
          </div>
        </div>

        {/* Line item */}
        <div>
          <div className="flex justify-between rounded-lg bg-brand-tint px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-brand">
            <span>Description</span><span>Amount</span>
          </div>
          <div className="flex justify-between gap-4 px-3 py-3">
            <span>{inv.description}</span>
            <span className="shrink-0">{invoiceMoney(inv.amount, inv.currency)}</span>
          </div>
          <div className="border-t border-gray-200" />
        </div>

        {/* Notes + total */}
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            {inv.notes?.trim() && (
              <>
                <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-brand">Notes</p>
                <p className="text-xs text-smoke">{inv.notes}</p>
              </>
            )}
          </div>
          <div className="shrink-0 border-b-2 border-ink pb-2">
            <span className="mr-6 text-sm font-bold">TOTAL</span>
            <span className="text-lg font-extrabold text-brand">{invoiceMoney(inv.amount, inv.currency)}</span>
          </div>
        </div>

        {/* Pay to */}
        <div className="rounded-lg bg-brand-tint px-4 py-4">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-brand">Pay to</p>
          {rows.length === 0 ? (
            <p className="text-xs text-smoke">Bank details appear here once filled in.</p>
          ) : (
            <div className="space-y-1.5">
              {rows.map(([label, value]) => (
                <div key={label} className="flex gap-4 text-xs">
                  <span className="w-32 shrink-0 text-smoke">{label}</span>
                  <span className="font-semibold">{value}</span>
                </div>
              ))}
            </div>
          )}
          <p className="mt-3 text-[11px] text-smoke">Please pay by bank transfer in {inv.currency === 'EUR' ? 'euros' : 'pounds sterling'}.</p>
        </div>

        <p className="text-xs text-smoke">Thank you! Payment is due within 7 days of the issue date.</p>
      </div>
      <div className="h-3 bg-brand" />
    </div>
  )
}
