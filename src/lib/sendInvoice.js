import { supabase } from './supabase'
import { parseEmails } from './invoice'
import { buildInvoicePdf, invoiceFilename, pdfToBase64 } from './invoicePdf'

// SENDING AN INVOICE, IN ONE PLACE.
//
// This used to live inside the composer, which meant the ONLY way to send an
// invoice was to open the composer - a form for writing one - and press a
// button at the bottom of it. For an auto-raised prize invoice that is a form
// with nothing to fill in: the number, the creator, the amount, the description
// and the bank block were all written by the trigger, and an admin's whole job
// is to look at the document and say yes.
//
// So the queue can now send one straight from the preview, and both surfaces
// call this. If the shape of the payload ever changes it changes here, and it
// cannot change for one caller only.

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-invoice`

/**
 * The invoice object the PDF builder, the preview and the email all take.
 * Built from a database row, so the document that goes out is the document that
 * was approved rather than whatever a form currently holds.
 */
export function invoiceFromRow(row) {
  return {
    number: row.number,
    issueDate: row.issue_date,
    creatorName: row.creator_name,
    creatorAddress: row.payment?.address || '',
    amount: Number(row.amount),
    currency: row.currency,
    description: row.description,
    notes: row.notes || '',
    billTo: row.bill_to,
    payee: row.payment || {},
  }
}

/**
 * Record that an approved invoice has gone out - and, on the retired 'resend'
 * channel, send it.
 *
 * `channel` is 'gmail' (the admin sent it themselves; this only records the
 * fact and notifies the creator) or 'resend' (the platform mails the PDF).
 *
 * IT DEFAULTS TO 'gmail' NOW, AND NOTHING IN THE CLIENT PASSES 'resend' (3 Sep
 * 2026). All outbound mail is paused until mail.tryp.com has its DNS records -
 * see lib/compose - so a caller that forgot to say which channel it wanted must
 * get the one that cannot silently fail to deliver an invoice somebody is
 * waiting on. The 'resend' branch is left in place, unreferenced, because the
 * edge function still understands it and this becomes a one-word change when
 * the domain is verified.
 */
export async function sendInvoiceRow(row, { to, cc, channel = 'gmail' } = {}) {
  const inv = invoiceFromRow(row)
  const { data: { session } } = await supabase.auth.getSession()

  let pdfBase64 = null
  if (channel === 'resend') pdfBase64 = pdfToBase64(await buildInvoicePdf(inv))

  const res = await fetch(FN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      apikey: supabase.supabaseKey,
    },
    body: JSON.stringify({
      channel,
      invoiceId: row.id,
      number: row.number,
      creatorId: row.creator_id,
      creatorName: inv.creatorName,
      amount: inv.amount,
      currency: inv.currency,
      description: inv.description,
      issueDate: inv.issueDate,
      billTo: inv.billTo,
      notes: inv.notes,
      payment: inv.payee,
      to: parseEmails(to).join(', '),
      cc: parseEmails(cc).join(', '),
      filename: invoiceFilename(inv),
      pdfBase64,
    }),
  })
  const out = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(out.error || 'Something went wrong. Please try again.')
  return out
}
