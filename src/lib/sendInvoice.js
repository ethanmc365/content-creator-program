import { supabase } from './supabase'
import { parseEmails } from './invoice'


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
 * Record that an approved invoice has gone out (the admin emails the PDF from their own mailbox) and tell the creator.
 * There is no platform email: Resend was never used and was removed on 14 Oct 2026.
 */
export async function sendInvoiceRow(row, { to, cc } = {}) {
  const inv = invoiceFromRow(row)
  const { data: { session } } = await supabase.auth.getSession()

  const res = await fetch(FN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      apikey: supabase.supabaseKey,
    },
    body: JSON.stringify({
      channel: 'gmail',
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
    }),
  })
  const out = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(out.error || 'Something went wrong. Please try again.')
  return out
}
