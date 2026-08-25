import { useEffect, useMemo, useRef, useState } from 'react'
import { format } from 'date-fns'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { Badge, EmptyState, Skeleton, Spinner, StatCard, Select } from '../../components/ui'
import Icon from '../../components/Icon'
import PaymentDetailsFields from '../../components/PaymentDetails'
import { confirm, notice } from '../../lib/confirm'
import { formatDate, formatMoney, isoToDateInput } from '../../lib/utils'
import {
  DEFAULT_BILL_TO,
  EMPTY_PAYEE,
  invoiceMoney,
  invoiceNo,
  invoiceRef,
  payeeFromPrivate,
  validatePayee,
  parseEmails,
  badEmails,
} from '../../lib/invoice'
import { buildInvoicePdf, downloadInvoicePdf, invoiceFilename, pdfToBase64 } from '../../lib/invoicePdf'
// The on-screen invoice. Shared with the Testing Centre's invoice lab, so the
// demo and the real composer can never draw two different invoices.
import InvoicePreview from '../../components/InvoicePreview'

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-invoice`
const LAST_RECIPIENT_KEY = 'tryp_invoice_to'
const BILL_TO_SETTING = 'invoice_bill_to'
// Free, keyless ECB exchange rates (also allowed in the prod CSP connect-src).
const FX_URL = 'https://api.frankfurter.dev/v1/latest?base=GBP&symbols=EUR'

/** "11/07/2026" -> ISO date "2026-07-11" (null if malformed). */
function dateInputToIso(v = '') {
  const m = v.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  const d = new Date(+m[3], +m[2] - 1, +m[1], 12)
  if (d.getDate() !== +m[1]) return null
  return format(d, 'yyyy-MM-dd')
}


const firstName = (s = '') => s.trim().split(/\s+/)[0] || ''
const nameFromEmail = (e = '') => {
  const local = e.split('@')[0].split(/[._-]/)[0]
  return local ? local[0].toUpperCase() + local.slice(1) : ''
}
const defaultNotes = (currency) => `To be paid in ${currency === 'EUR' ? 'euros' : 'pounds'}.`

// The invoice generator, embedded in the Rewards dashboard. Prizes are set in
// pounds; if the creator wants euros the amount converts automatically at
// today's ECB rate. `prefill` (from a reward row's Invoice button) opens the
// composer with the creator, amount and description already filled.
export default function InvoicesPanel({ prefill }) {
  const { user, profile } = useAuth()
  const [invoices, setInvoices] = useState([])
  const [creators, setCreators] = useState([])
  const [loading, setLoading] = useState(true)

  // ---- Composer state ----
  const [open, setOpen] = useState(false)
  const [number, setNumber] = useState(null)
  // THE ROW THIS COMPOSER IS EDITING, if it came from the approval queue.
  //
  // The composer used to be write-only: it built a PDF, emailed it, and the
  // edge function INSERTED a fresh row afterwards. That is the right shape when
  // an invoice comes into being at the moment it is sent, and the wrong one now
  // that awarding a prize writes the draft first (migration 091) - without an
  // id, sending a queued invoice would mint a SECOND row and leave the approved
  // one sitting in the queue forever.
  const [invoiceId, setInvoiceId] = useState(null)
  const [stage, setStage] = useState(null)
  const [creatorId, setCreatorId] = useState('')
  const [creatorName, setCreatorName] = useState('')
  const [payee, setPayee] = useState(EMPTY_PAYEE)
  const [hasSaved, setHasSaved] = useState(true) // did the creator save payment details?
  const [gbpAmount, setGbpAmount] = useState('') // the prize, always in pounds
  const [eurOverride, setEurOverride] = useState(null) // admin-typed euro amount (beats the auto conversion)
  const [description, setDescription] = useState('')
  const [issueDate, setIssueDate] = useState(isoToDateInput(new Date().toISOString()))
  const [billTo, setBillTo] = useState(DEFAULT_BILL_TO)
  const [notes, setNotes] = useState(defaultNotes('GBP'))
  const notesTouched = useRef(false)
  const [to, setTo] = useState('')
  const [cc, setCc] = useState('')
  const [sending, setSending] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [savingDefault, setSavingDefault] = useState(false)
  const [gmailPending, setGmailPending] = useState(false)

  // ---- GBP -> EUR conversion (ECB daily rate, applied automatically) ----
  const [fxRate, setFxRate] = useState(null) // null = not loaded, 0 = failed

  async function load() {
    const [{ data: inv }, { data: c }, { data: setting }] = await Promise.all([
      supabase.from('invoices').select('*').order('number', { ascending: false }),
      supabase.from('profiles').select('id, name').eq('status', 'active').eq('is_admin', false).order('name'),
      supabase.from('app_settings').select('value').eq('key', BILL_TO_SETTING).maybeSingle(),
    ])
    setInvoices(inv ?? [])
    setCreators(c ?? [])
    if (setting?.value?.text) setBillTo(setting.value.text)
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const currency = payee.currency || 'GBP'

  // Keep the default note in step with the currency until the admin edits it.
  useEffect(() => {
    if (!notesTouched.current) setNotes(defaultNotes(currency))
  }, [currency])

  // Load the exchange rate the first time euros come up.
  useEffect(() => {
    if (currency !== 'EUR' || fxRate !== null) return
    fetch(FX_URL)
      .then((r) => r.json())
      .then((d) => setFxRate(d?.rates?.EUR || 0))
      .catch(() => setFxRate(0))
  }, [currency, fxRate])

  // The amount that actually goes on the invoice: pounds as typed, or the
  // automatic euro conversion (which the admin can overtype).
  const autoEur = fxRate > 0 && Number(gbpAmount) > 0 ? (Number(gbpAmount) * fxRate).toFixed(2) : ''
  const invoiceAmount = currency === 'EUR' ? (eurOverride ?? autoEur) : gbpAmount

  async function openComposer() {
    setOpen(true)
    setTo(localStorage.getItem(LAST_RECIPIENT_KEY) || '')
    setCc(user?.email || '')
    // Reserve the next sequential invoice number (gaps from abandoned
    // composers are fine; uniqueness is what matters).
    const { data, error } = await supabase.rpc('next_invoice_number')
    if (error) notice(`Couldn't reserve an invoice number: ${error.message}`)
    else setNumber(data)
  }

  function closeComposer() {
    setOpen(false)
    setNumber(null)
    setInvoiceId(null)
    setStage(null)
    setCreatorId('')
    setCreatorName('')
    setPayee(EMPTY_PAYEE)
    setGbpAmount('')
    setEurOverride(null)
    setDescription('')
    setIssueDate(isoToDateInput(new Date().toISOString()))
    setGmailPending(false)
    notesTouched.current = false
    setNotes(defaultNotes('GBP'))
  }

  // Selecting a creator pulls in their saved payment details (admins can read
  // creator_private). Everything stays editable for this invoice only.
  async function selectCreator(id) {
    setCreatorId(id)
    const p = creators.find((c) => c.id === id)
    setCreatorName(p?.name || '')
    if (!id) { setPayee(EMPTY_PAYEE); return }
    const { data } = await supabase.from('creator_private').select('*').eq('id', id).maybeSingle()
    const pay = payeeFromPrivate(data)
    if (!pay.name) pay.name = p?.name || ''
    if (!pay.currency) pay.currency = 'GBP'
    setPayee(pay)
    setHasSaved(!!data?.pay_currency)
    setEurOverride(null)
  }

  // A reward row's "Invoice" button lands here with everything prefilled.
  const consumedPrefill = useRef(null)
  useEffect(() => {
    if (!prefill?.key || prefill.key === consumedPrefill.current || !creators.length) return
    consumedPrefill.current = prefill.key
    ;(async () => {
      // A QUEUED INVOICE ALREADY HAS A NUMBER AND A PAYEE SNAPSHOT.
      // Reserving a new number would leave the row's own number orphaned, and
      // re-reading the bank details would quietly swap what was approved for
      // whatever is on file now - which is the one thing an approval is
      // supposed to pin down.
      if (prefill.invoiceId) {
        setOpen(true)
        setTo(localStorage.getItem(LAST_RECIPIENT_KEY) || '')
        setCc(user?.email || '')
        setInvoiceId(prefill.invoiceId)
        setStage(prefill.stage || null)
        setNumber(prefill.number)
        setCreatorId(prefill.creatorId || '')
        setCreatorName(prefill.creatorName || '')
        // The currency is DERIVED from the payee (`payee.currency`), so the
        // snapshot sets it. In euros the stored amount is already the euro
        // figure, so it goes in as the override rather than being re-converted
        // from a pound amount nobody kept.
        if (prefill.payee) { setPayee(prefill.payee); setHasSaved(!!prefill.payee.currency) }
        if (prefill.currency === 'EUR') setEurOverride(String(prefill.amount ?? ''))
        setGbpAmount(prefill.currency === 'EUR' ? '' : String(prefill.amount ?? ''))
        if (prefill.description) setDescription(prefill.description)
        if (prefill.billTo) setBillTo(prefill.billTo)
        if (prefill.notes) { notesTouched.current = true; setNotes(prefill.notes) }
        return
      }
      if (!open) await openComposer()
      await selectCreator(prefill.creatorId)
      setGbpAmount(prefill.amount != null ? String(prefill.amount) : '')
      setEurOverride(null)
      if (prefill.description) setDescription(prefill.description)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill, creators])

  // The invoice object shared by the live preview, the PDF and the email.
  const inv = useMemo(() => ({
    number,
    issueDate: dateInputToIso(issueDate) || format(new Date(), 'yyyy-MM-dd'),
    creatorName: payee.name || creatorName,
    creatorAddress: payee.address,
    amount: invoiceAmount,
    currency,
    description: description || 'Challenge cash prize',
    notes,
    billTo,
    payee,
  }), [number, issueDate, creatorName, payee, invoiceAmount, description, notes, billTo, currency])

  function validate({ needRecipient = false } = {}) {
    const problems = []
    if (!creatorId) problems.push('Pick the creator this invoice is for.')
    if (!(Number(gbpAmount) > 0)) problems.push('Enter the prize amount in pounds.')
    if (currency === 'EUR' && !(Number(invoiceAmount) > 0)) problems.push('The euro amount is missing. The exchange rate may not have loaded; type it manually.')
    if (!description.trim()) problems.push('Describe the prize (e.g. Placed 1st in the Summer Challenge).')
    if (!dateInputToIso(issueDate)) problems.push('The date should look like 15/07/2026.')
    if (!billTo.trim()) problems.push('Fill in the Tryp.com company details (Invoice to).')
    problems.push(...validatePayee(payee))
    if (needRecipient) {
      const toList = parseEmails(to)
      const badTo = badEmails(to)
      const badCc = badEmails(cc)
      if (toList.length === 0) problems.push('Enter at least one email address the invoice should go to.')
      if (badTo.length) problems.push(`These addresses don’t look right: ${badTo.join(', ')}.`)
      if (badCc.length) problems.push(`These CC addresses don’t look right: ${badCc.join(', ')}.`)
    }
    return problems
  }

  async function saveBillToDefault() {
    setSavingDefault(true)
    const { error } = await supabase.from('app_settings').upsert({
      key: BILL_TO_SETTING, value: { text: billTo }, updated_at: new Date().toISOString(),
    })
    setSavingDefault(false)
    notice(error ? `Couldn't save: ${error.message}` : 'Saved. These company details will prefill every new invoice.')
  }

  // Only an approved row may be emailed. Everything else goes to the queue.
  const approvedToSend = !!invoiceId && stage === 'approved'

  // Write (or update) the draft and put it in front of an approver. This is the
  // ONLY way an invoice leaves this form now.
  async function saveToQueue() {
    const problems = validate()
    if (problems.length) return notice(`Almost there:\n\n${problems.join('\n')}`)
    setSending(true)
    try {
      const row = {
        number,
        creator_id: creatorId || null,
        creator_name: inv.creatorName,
        amount: Number(invoiceAmount),
        currency,
        description: description.trim(),
        issue_date: inv.issueDate,
        bill_to: billTo,
        payment: payee,
        notes,
        stage: 'draft',
        status: 'draft',
      }
      let id = invoiceId
      if (id) {
        const { error } = await supabase.from('invoices').update(row).eq('id', id)
        if (error) throw new Error(error.message)
      } else {
        const { data, error } = await supabase.from('invoices')
          .insert({ ...row, created_by: user.id }).select('id').single()
        if (error) throw new Error(error.message)
        id = data.id
      }
      // `submit_invoice` re-reads the creator's bank details and refuses if
      // they are missing, so this is also the point at which a half-filled
      // invoice is caught.
      const { error: subErr } = await supabase.rpc('submit_invoice', { p_id: id })
      if (subErr) throw new Error(subErr.message)
      notice(`Invoice ${invoiceRef(number)} is with an approver.\n\nIt appears under "Waiting for approval" in the queue.`)
      closeComposer()
      load()
    } catch (e) {
      notice(e.message)
    } finally {
      setSending(false)
    }
  }

  async function downloadPdf() {
    const problems = validate().filter((p) => !p.startsWith('Pick the creator'))
    if (problems.length) return notice(`Almost there:\n\n${problems.join('\n')}`)
    setDownloading(true)
    try { await downloadInvoicePdf(inv) } finally { setDownloading(false) }
  }

  // Record the invoice + notify the creator via the edge function.
  // channel 'resend' also emails the PDF; 'gmail' only records (the admin
  // sends the email themselves from Gmail).
  async function callSendInvoice(channel, pdfBase64OrNull) {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(FN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        apikey: supabase.supabaseKey,
      },
      body: JSON.stringify({
        channel,
        invoiceId,
        number,
        creatorId,
        creatorName: inv.creatorName,
        amount: Number(invoiceAmount),
        currency,
        description: description.trim(),
        issueDate: inv.issueDate,
        billTo,
        notes,
        payment: payee,
        to: parseEmails(to).join(', '),
        cc: parseEmails(cc).join(', '),
        filename: invoiceFilename(inv),
        pdfBase64: pdfBase64OrNull,
      }),
    })
    const out = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(out.error || 'Something went wrong. Please try again.')
    return out
  }

  async function send() {
    const problems = validate({ needRecipient: true })
    if (problems.length) return notice(`Almost there:\n\n${problems.join('\n')}`)
    if (!await confirm(
      `Send invoice ${invoiceRef(number)} for ${invoiceMoney(invoiceAmount, currency)} to ${parseEmails(to).join(', ')}?` +
      (cc.trim() ? `\n\nYou'll be CC'd at ${cc.trim()} for your records.` : ''),
      { confirmLabel: 'Send invoice' },
    )) return
    setSending(true)
    try {
      const bytes = await buildInvoicePdf(inv)
      await callSendInvoice('resend', pdfToBase64(bytes))
      localStorage.setItem(LAST_RECIPIENT_KEY, to.trim())
      notice(`Invoice ${invoiceRef(number)} is on its way to ${parseEmails(to).join(', ')}.\n\n${inv.creatorName} has been told to expect the payment within 7 days.`)
      closeComposer()
      load()
    } catch (e) {
      notice(e.message)
    } finally {
      setSending(false)
    }
  }

  // Open a prefilled Gmail compose (the PDF downloads alongside; Gmail can't
  // attach files from a link, so the admin drags it in and sends). The tab is
  // opened synchronously inside the click so popup blockers allow it.
  function composeInGmail() {
    const problems = validate({ needRecipient: true })
    if (problems.length) return notice(`Almost there:\n\n${problems.join('\n')}`)
    const win = window.open('about:blank', '_blank')
    ;(async () => {
      setDownloading(true)
      try { await downloadInvoicePdf(inv) } finally { setDownloading(false) }
      const names = [to, cc]
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e && e !== user?.email?.toLowerCase())
        .map(nameFromEmail)
        .filter(Boolean)
      const descPhrase = description.trim()
        ? description.trim()[0].toLowerCase() + description.trim().slice(1)
        : 'a challenge prize'
      const body = [
        `Hey ${names.length ? names.join(' and ') : 'there'},`,
        '',
        `I've attached the invoice for ${firstName(inv.creatorName)}, ${formatMoney(Number(invoiceAmount), currency)} for ${descPhrase} in the Content Creator Program. ${notes.trim() || defaultNotes(currency)}`,
        '',
        'Thank you,',
        firstName(profile?.name) || 'The Tryp.com team',
      ].join('\n')
      const ccList = parseEmails(cc).filter((e) => e.toLowerCase() !== user?.email?.toLowerCase())
      const url = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(parseEmails(to).join(','))}` +
        (ccList.length ? `&cc=${encodeURIComponent(ccList.join(','))}` : '') +
        `&su=${encodeURIComponent(`Invoice ${invoiceRef(number)} · ${inv.creatorName} · ${invoiceMoney(invoiceAmount, currency)}`)}` +
        `&body=${encodeURIComponent(body)}`
      if (win && !win.closed) win.location.replace(url)
      else window.open(url, '_blank', 'noopener')
      localStorage.setItem(LAST_RECIPIENT_KEY, to.trim())
      setGmailPending(true)
    })()
  }

  // After the admin actually pressed send in Gmail: record + notify.
  async function markGmailSent() {
    setSending(true)
    try {
      await callSendInvoice('gmail', null)
      notice(`Invoice ${invoiceRef(number)} recorded.\n\n${inv.creatorName} has been told to expect the payment within 7 days.`)
      closeComposer()
      load()
    } catch (e) {
      notice(e.message)
    } finally {
      setSending(false)
    }
  }

  async function deleteInvoice(row) {
    if (!await confirm(`Delete the record of invoice ${invoiceRef(row.number)}? This only removes it from this list, it doesn't recall the email.`)) return
    const { error } = await supabase.from('invoices').delete().eq('id', row.id)
    if (error) notice(`Couldn't delete: ${error.message}`)
    else setInvoices((list) => list.filter((i) => i.id !== row.id))
  }

  function downloadExisting(row) {
    downloadInvoicePdf({
      number: row.number,
      issueDate: row.issue_date,
      creatorName: row.creator_name,
      creatorAddress: row.payment?.address,
      amount: row.amount,
      currency: row.currency,
      description: row.description,
      notes: row.notes,
      billTo: row.bill_to,
      payee: row.payment || {},
    })
  }

  const totals = useMemo(() => {
    const sum = (cur) => invoices.filter((i) => i.currency === cur).reduce((s, i) => s + Number(i.amount || 0), 0)
    return { gbp: sum('GBP'), eur: sum('EUR') }
  }, [invoices])

  return (
    <div>
      {!open && (
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div className="grid flex-1 grid-cols-2 gap-4 sm:grid-cols-3">
            <StatCard label="Invoices sent" value={invoices.length} />
            <StatCard label="Total invoiced (GBP)" value={invoiceMoney(totals.gbp, 'GBP')} />
            <StatCard label="Total invoiced (EUR)" value={invoiceMoney(totals.eur, 'EUR')} />
          </div>
          <button type="button" className="btn-primary" onClick={openComposer}>+ New invoice</button>
        </div>
      )}

      {open && (
        <div className="mb-10 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* ---- Form ---- */}
          <div className="card space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">New invoice <span className="text-brand">#{invoiceNo(number)}</span></h2>
              <button type="button" className="btn-ghost !py-1.5 text-sm" onClick={closeComposer}>Cancel</button>
            </div>

            {gmailPending && (
              <div className="space-y-3 rounded-xl border border-brand/30 bg-brand-tint p-4">
                <p className="text-sm font-semibold text-brand">Sent it from Gmail?</p>
                <p className="text-xs leading-relaxed text-smoke">
                  The PDF downloaded and Gmail opened in a new tab. Attach the PDF there, press send,
                  then mark it as sent here so it's recorded and {firstName(inv.creatorName) || 'the creator'} is notified.
                </p>
                <div className="flex gap-2">
                  <button type="button" className="btn-primary !py-2 text-xs" onClick={markGmailSent} disabled={sending}>
                    {sending ? <Spinner className="h-4 w-4" /> : 'Mark as sent & notify creator'}
                  </button>
                  <button type="button" className="btn-ghost !py-2 text-xs" onClick={() => setGmailPending(false)}>Not yet</button>
                </div>
              </div>
            )}

            <div>
              <label htmlFor="inv-creator" className="label">Creator</label>
              <Select
                id="inv-creator" variant="field" ariaLabel="Creator" placeholder="Choose a creator…"
                value={creatorId}
                onChange={selectCreator}
                options={creators.map((c) => ({ value: c.id, label: c.name }))}
              />
              {creatorId && !hasSaved && (
                <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-700">
                  {creatorName} hasn’t saved payment details yet. Ask them to add them in Edit profile,
                  or fill in their bank details below for this invoice.
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="inv-amount" className="label">Prize amount (£)</label>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-sm font-semibold text-smoke">£</span>
                  <input
                    id="inv-amount" type="number" min="0" step="0.01" inputMode="decimal"
                    className="input !pl-9" placeholder="50"
                    value={gbpAmount}
                    onChange={(e) => { setGbpAmount(e.target.value); setEurOverride(null) }}
                  />
                </div>
              </div>
              <div>
                <label htmlFor="inv-date" className="label">Invoice date</label>
                <input
                  id="inv-date" type="text" className="input" placeholder="DD/MM/YYYY"
                  value={issueDate} onChange={(e) => setIssueDate(e.target.value)}
                />
              </div>
            </div>

            {currency === 'EUR' && (
              <div className="rounded-xl bg-brand-tint px-4 py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-xs font-semibold text-brand">{creatorName ? `${firstName(creatorName)} gets paid in euros:` : 'Paid in euros:'}</p>
                  <div className="relative w-36">
                    <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-xs font-semibold text-smoke">€</span>
                    <input
                      type="number" min="0" step="0.01" inputMode="decimal"
                      className="input !py-2 !pl-7 text-sm"
                      value={invoiceAmount}
                      onChange={(e) => setEurOverride(e.target.value)}
                    />
                  </div>
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-smoke">
                  {fxRate === null ? 'Fetching today’s exchange rate…'
                    : fxRate === 0 ? 'Couldn’t load the exchange rate, so type the euro amount yourself.'
                    : eurOverride !== null ? 'You’ve set the euro amount yourself. Change the £ prize to go back to the automatic rate.'
                    : `Converted automatically at today’s European Central Bank rate (£1 = €${fxRate}). You can overtype it.`}
                </p>
              </div>
            )}

            <div>
              <label htmlFor="inv-desc" className="label">Prize won</label>
              <input
                id="inv-desc" type="text" className="input"
                placeholder="e.g. Placed 1st in the Summer Challenge"
                value={description} onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="inv-notes" className="label">Notes on the invoice</label>
              <input
                id="inv-notes" type="text" className="input"
                value={notes}
                onChange={(e) => { notesTouched.current = true; setNotes(e.target.value) }}
              />
            </div>

            <div>
              <div className="flex items-baseline justify-between">
                <label htmlFor="inv-billto" className="label">Invoice to (Tryp.com company details)</label>
                <button type="button" className="text-xs font-medium text-brand hover:underline" onClick={saveBillToDefault} disabled={savingDefault}>
                  {savingDefault ? 'Saving…' : 'Save as default'}
                </button>
              </div>
              <textarea
                id="inv-billto" rows={4} className="input text-sm"
                value={billTo} onChange={(e) => setBillTo(e.target.value)}
              />
              <p className="mt-1 text-xs text-smoke">First line is the company name. Shown on every invoice; save as default to reuse.</p>
            </div>

            <div className="space-y-4 rounded-xl border border-gray-100 p-4">
              <p className="text-sm font-semibold">Bank details on the invoice</p>
              <PaymentDetailsFields value={payee} onChange={setPayee} compact />
            </div>

            <div className="space-y-4 rounded-xl border border-gray-100 p-4">
              <p className="text-sm font-semibold">Email</p>
              <div>
                <label htmlFor="inv-to" className="label">Send to</label>
                <input
                  id="inv-to" type="text" className="input"
                  placeholder="andre@tryp.com, francesco@tryp.com"
                  value={to} onChange={(e) => setTo(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="inv-cc" className="label">CC</label>
                <input
                  id="inv-cc" type="text" className="input" placeholder="you@tryp.com"
                  value={cc} onChange={(e) => setCc(e.target.value)}
                />
              </div>
            </div>

            {/* SENDING IS GATED ON APPROVAL, AND THAT INCLUDES THIS FORM.
                An approval queue that any admin can walk around by opening the
                composer instead is not a control, it is a suggestion. So a
                hand-written invoice goes into the queue like every other one -
                the only difference is that the automation did not write it.
                Only a row that has come back APPROVED gets a send button. */}
            {!approvedToSend ? (
              <div className="rounded-card border border-brand/25 bg-brand-tint/25 px-4 py-4">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <Icon name="shield" className="h-4 w-4 shrink-0 text-brand" />
                  {stage === 'awaiting_approval'
                    ? 'This one is with an approver'
                    : stage === 'rejected'
                      ? 'This came back for a change'
                      : 'Invoices are approved before they go out'}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-smoke">
                  {stage === 'awaiting_approval'
                    ? 'Nothing to do here until somebody approves it. It will appear under "Approved, ready to send" in the queue.'
                    : 'Save it to the approval queue. Once another admin approves it, open it again from the queue and the send buttons are here.'}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button type="button" className="btn-ghost" onClick={downloadPdf} disabled={downloading}>
                    {downloading ? <Spinner /> : 'Download PDF'}
                  </button>
                  {stage !== 'awaiting_approval' && (
                    <button type="button" className="btn-primary" onClick={saveToQueue} disabled={sending}>
                      {sending ? <Spinner /> : 'Send for approval'}
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-end gap-3">
                <button type="button" className="btn-ghost" onClick={downloadPdf} disabled={downloading}>
                  {downloading ? <Spinner /> : 'Download PDF'}
                </button>
                <button type="button" className="btn-secondary" onClick={send} disabled={sending}>
                  {sending && !gmailPending ? <Spinner /> : 'Send from platform'}
                </button>
                <button type="button" className="btn-primary" onClick={composeInGmail} disabled={downloading || sending}>
                  Compose in Gmail
                </button>
              </div>
            )}
          </div>

          {/* ---- Live preview ---- */}
          <div className="lg:sticky lg:top-24 lg:self-start">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-smoke">Preview</p>
            <InvoicePreview inv={inv} />
          </div>
        </div>
      )}

      {/* ---- History ---- */}
      {loading ? (
        <div className="space-y-3"><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
      ) : invoices.length === 0 ? (
        !open && (
          <EmptyState
            icon={<Icon name="cash" className="h-8 w-8 text-brand" />}
            title="No invoices yet"
            hint="When a creator wins a cash prize, generate their invoice here and email it straight to finance."
          />
        )
      ) : (
        <div className="space-y-3">
          {invoices.map((row) => (
            <div key={row.id} className="card flex flex-col gap-3 !py-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-brand">#{invoiceNo(row.number)}</span>
                  <span className="text-sm font-semibold">{row.creator_name}</span>
                  <Badge tone="light">{invoiceMoney(row.amount, row.currency)}</Badge>
                </div>
                <p className="mt-1 truncate text-sm text-smoke">{row.description}</p>
                <p className="mt-0.5 text-xs text-smoke">
                  Sent to {row.sent_to || '?'}{row.cc ? ` (cc ${row.cc})` : ''} · {formatDate(row.sent_at || row.created_at)}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button type="button" className="btn-secondary !py-2 text-xs" onClick={() => downloadExisting(row)}>PDF</button>
                <button type="button" className="btn-ghost !py-2 text-xs text-red-500" onClick={() => deleteInvoice(row)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
