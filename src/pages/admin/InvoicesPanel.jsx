import { useEffect, useMemo, useRef, useState } from 'react'
import { format } from 'date-fns'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { Badge, EmptyState, Skeleton, Spinner, StatCard } from '../../components/ui'
import Icon from '../../components/Icon'
import PaymentDetailsFields from '../../components/PaymentDetails'
import { confirm, notice } from '../../lib/confirm'
import { formatDate, formatMoney, isoToDateInput } from '../../lib/utils'
import {
  DEFAULT_BILL_TO, EMPTY_PAYEE, invoiceMoney, invoiceNo, invoiceRef,
  payeeFromPrivate, paymentRows, validatePayee,
} from '../../lib/invoice'
import { buildInvoicePdf, downloadInvoicePdf, invoiceFilename, pdfToBase64 } from '../../lib/invoicePdf'

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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
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
      if (!EMAIL_RE.test(to.trim())) problems.push('Enter the email address the invoice should go to.')
      if (cc.trim() && !EMAIL_RE.test(cc.trim())) problems.push('That CC address doesn’t look right.')
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
        to: to.trim(),
        cc: cc.trim(),
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
      `Send invoice ${invoiceRef(number)} for ${invoiceMoney(invoiceAmount, currency)} to ${to.trim()}?` +
      (cc.trim() ? `\n\nYou'll be CC'd at ${cc.trim()} for your records.` : ''),
      { confirmLabel: 'Send invoice' },
    )) return
    setSending(true)
    try {
      const bytes = await buildInvoicePdf(inv)
      await callSendInvoice('resend', pdfToBase64(bytes))
      localStorage.setItem(LAST_RECIPIENT_KEY, to.trim())
      notice(`Invoice ${invoiceRef(number)} is on its way to ${to.trim()}.\n\n${inv.creatorName} has been told to expect the payment within 7 days.`)
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
      const url = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to.trim())}` +
        (cc.trim() && cc.trim().toLowerCase() !== user?.email?.toLowerCase() ? `&cc=${encodeURIComponent(cc.trim())}` : '') +
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
              <select id="inv-creator" className="input" value={creatorId} onChange={(e) => selectCreator(e.target.value)}>
                <option value="">Choose a creator…</option>
                {creators.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
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
                  id="inv-to" type="email" className="input" placeholder="e.g. francesco@tryp.com"
                  value={to} onChange={(e) => setTo(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="inv-cc" className="label">CC <span className="font-normal text-smoke">(your copy, for records)</span></label>
                <input
                  id="inv-cc" type="email" className="input" placeholder="you@tryp.com"
                  value={cc} onChange={(e) => setCc(e.target.value)}
                />
              </div>
              <p className="text-xs leading-relaxed text-smoke">
                Compose in Gmail opens a ready-written email in your Gmail: attach the downloaded PDF, review, send.
                Either way, {firstName(inv.creatorName) || 'the creator'} gets a notification to expect payment within 7 days.
              </p>
            </div>

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

// On-screen twin of the PDF so admins see exactly what lands in the inbox.
function InvoicePreview({ inv }) {
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
