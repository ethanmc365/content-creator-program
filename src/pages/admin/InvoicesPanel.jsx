import { useEffect, useMemo, useRef, useState } from 'react'
import { format } from 'date-fns'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { Skeleton, Spinner, Select } from '../../components/ui'
import Icon from '../../components/Icon'
import PaymentDetailsFields from '../../components/PaymentDetails'
import { notice } from '../../lib/confirm'
import { cx, formatMoney, isoToDateInput } from '../../lib/utils'
import { conversionNote, convertForInvoice } from '../../lib/invoiceFx'
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
import { downloadInvoicePdf, invoiceFilename } from '../../lib/invoicePdf'
// The on-screen invoice. Shared with the Testing Centre's invoice lab, so the
// demo and the real composer can never draw two different invoices.
import InvoicePreview from '../../components/InvoicePreview'

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-invoice`
const LAST_RECIPIENT_KEY = 'tryp_invoice_to'
const BILL_TO_SETTING = 'invoice_bill_to'
// Free, keyless ECB exchange rates (also allowed in the prod CSP connect-src).
const FX_URL = 'https://api.frankfurter.dev/v1/latest?base=GBP&symbols=EUR'

// SOMEBODY WHO IS NOT ON THE PLATFORM STILL GETS PAID.
//
// Ethan: "if there's anything like a challenge run off the platform that we
// still want to create an invoice for a creator, they can do it super easily on
// here and download it ... rather than choosing a creator, at the very bottom
// there should be an option to just click Other, and then you can actually type
// the specific name of the creator and the prize amount."
//
// The picker was the only way to name a payee, and it only listed accounts. A
// creator who won a prize in a campaign run somewhere else had no account, so
// the invoice could not be written at all - which meant it was written by hand,
// somewhere else, off the numbering. This is a sentinel in the picker, never a
// creator id: the row it writes carries `creator_id = null` and the name, the
// amount and the bank block are simply typed.
const OFF_PLATFORM = '__off_platform__'

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
export default function InvoicesPanel({ prefill, onClose, onSent }) {
  const { user, profile } = useAuth()
  const [creators, setCreators] = useState([])
  const [loading, setLoading] = useState(true)

  // ---- Composer state ----
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
  // THE AMOUNT IS TYPED IN THE CURRENCY THE INVOICE IS WRITTEN IN.
  //
  // Ethan: "currently it's showing the prize amount in pounds, although it
  // should be in euros ... this one seems to be in euros, but it's still
  // showing the pound sign."
  //
  // It was two boxes: type the prize in POUNDS, and a second box underneath
  // showed the euros it converted to. So the field you typed into wore a £ even
  // when the line item, the total, the bank transfer and the PDF were all in
  // euros - the sign on the box was telling you the wrong thing about the
  // money. There is one box now, denominated in whatever the invoice is in,
  // with the switch beside it. Converting a sterling prize is still automatic
  // (see `switchCurrency` and the reward prefill below); it is just no longer
  // the only way to type an amount.
  const [amount, setAmount] = useState('')
  // THE PRIZE AS AWARDED - `{ amount, currency }` - which is the fact every
  // other figure on this form is derived from. It replaced a `convertedFrom`
  // that recorded what the box said a moment ago and a `gbpToConvert` that
  // assumed every prize was sterling; see lib/invoiceFx for what each of those
  // got wrong. Null on a blank invoice, where the typed figure IS the prize.
  const [source, setSource] = useState(null)
  const [description, setDescription] = useState('')
  const [issueDate, setIssueDate] = useState(isoToDateInput(new Date().toISOString()))
  const [billTo, setBillTo] = useState(DEFAULT_BILL_TO)
  const [notes, setNotes] = useState(defaultNotes('EUR'))
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
    const [{ data: c }, { data: setting }] = await Promise.all([
      supabase.from('profiles').select('id, name').eq('status', 'active').eq('is_admin', false).order('name'),
      supabase.from('app_settings').select('value').eq('key', BILL_TO_SETTING).maybeSingle(),
    ])
    setCreators(c ?? [])
    if (setting?.value?.text) setBillTo(setting.value.text)
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  // MOUNTED MEANS OPEN. The composer used to hide behind a local flag while its
  // own copy of the invoice list sat above it; the list now lives in the queue,
  // where the rest of an invoice's life is, so this component only exists while
  // somebody is writing one. A blank one reserves its number here; a prefilled
  // one already has its number and is set up by the effect further down.
  const started = useRef(false)
  useEffect(() => {
    if (started.current || prefill?.key) return
    started.current = true
    reserveNumber()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill?.key])

  // EUROS UNLESS THE PAYEE'S OWN RECORD ASKS FOR POUNDS. The programme settles
  // in euros; a payee who has chosen GBP still gets GBP, and every invoice
  // already raised keeps the currency it was raised in.
  //
  // ONE currency on this form, not two: the same flag decides the sign on the
  // amount, the words in the notes, the line on the PDF and which bank fields
  // are asked for (a euro payment needs an IBAN, a sterling one a sort code).
  // An invoice whose total said € and whose "Pay to" box asked for a sort code
  // would be unpayable in two directions at once.
  const currency = payee.currency || 'EUR'
  const offPlatform = creatorId === OFF_PLATFORM

  // Keep the default note in step with the currency until the admin edits it.
  useEffect(() => {
    if (!notesTouched.current) setNotes(defaultNotes(currency))
  }, [currency])

  // The rate is fetched once, whichever currency the invoice opens in - the
  // switch needs it the moment somebody presses it, not a request later.
  useEffect(() => {
    fetch(FX_URL)
      .then((r) => r.json())
      .then((d) => setFxRate(d?.rates?.EUR || 0))
      .catch(() => setFxRate(0))
  }, [])

  // A PRIZE IS SET IN POUNDS; THE INVOICE IS USUALLY WRITTEN IN EUROS.
  // A reward row hands this composer a sterling figure, and the rate arrives
  // asynchronously, so the conversion waits for it here rather than being done
  // inline with whatever `fxRate` happened to be at the time (null, usually).
  // BOTH DIRECTIONS, and only when there is a direction. A prize is decided in
  // the challenge's currency and paid in the creator's; when those differ the
  // figure converts, and when they do not it is left exactly as awarded.
  const settledSource = useRef(null)
  useEffect(() => {
    if (!source || fxRate === null) return
    const key = `${source.amount}|${source.currency}|${currency}`
    if (settledSource.current === key) return
    settledSource.current = key
    // Two decimals, because this box is a money field and an invoice figure
    // is written with its pennies. The library returns a number; the form is
    // where it becomes a figure somebody reads.
    const next = convertForInvoice(source.amount, source.currency, currency, fxRate)
    if (next != null) setAmount(next.toFixed(2))
  }, [source, fxRate, currency])

  // What goes on the document is what was typed, in the currency shown beside
  // it. No second figure derived from a first one.
  const invoiceAmount = amount

  // THE NOTE DESCRIBES THE DOCUMENT, NOT THE LAST BUTTON PRESS. Ethan: "when I
  // click on GBP, it shows £20 in the invoice, which is correct, but then it
  // shows 'converted from €23' ... It shouldn't be showing up." It only shows
  // when the invoice is in a different currency from the prize.
  const fxNote = conversionNote(source, currency, fxRate)

  // Changing the currency converts what is already there instead of clearing
  // it - it is the same prize either way - and says so underneath only when
  // the result is no longer the prize as awarded.
  //
  // EVERY CONVERSION IS FROM THE SOURCE, never from the box. Converting the box
  // means £20 -> €23.08 -> £20.00 is three roundings deep by the second press,
  // and pressing GBP on a sterling prize has to give back exactly the prize.
  // An invoice typed from scratch has no source, so the typed figure becomes
  // one at the moment the currency is switched - it is what was decided.
  function switchCurrency(next) {
    if (next === currency) return
    const src = source || (amount !== '' && Number(amount) > 0 ? { amount: Number(amount), currency } : null)
    if (src) {
      if (!source) setSource(src)
      const converted = convertForInvoice(src.amount, src.currency, next, fxRate)
      if (converted != null) setAmount(converted.toFixed(2))
    }
    setPayee((p) => ({ ...p, currency: next }))
  }

  async function reserveNumber() {
    setTo(localStorage.getItem(LAST_RECIPIENT_KEY) || '')
    setCc(user?.email || '')
    // Reserve the next sequential invoice number (gaps from abandoned
    // composers are fine; uniqueness is what matters).
    const { data, error } = await supabase.rpc('next_invoice_number')
    if (error) notice(`Couldn't reserve an invoice number: ${error.message}`)
    else setNumber(data)
  }

  function closeComposer() {
    onClose?.()
    setNumber(null)
    setInvoiceId(null)
    setStage(null)
    setCreatorId('')
    setCreatorName('')
    setPayee(EMPTY_PAYEE)
    setAmount('')
    setSource(null)
    setDescription('')
    setIssueDate(isoToDateInput(new Date().toISOString()))
    setGmailPending(false)
    notesTouched.current = false
    setNotes(defaultNotes('EUR'))
  }

  // Selecting a creator pulls in their saved payment details (admins can read
  // creator_private). Everything stays editable for this invoice only.
  async function selectCreator(id) {
    setCreatorId(id)
    // NOBODY TO LOOK UP. An off-platform payee has no account and therefore no
    // saved bank details: the name is typed above and the IBAN and billing
    // address are typed into the same block every other invoice uses. Euros by
    // default, which is what an off-platform prize is settled in unless the
    // admin says otherwise.
    if (id === OFF_PLATFORM) {
      setCreatorName('')
      setPayee({ ...EMPTY_PAYEE, currency: 'EUR' })
      setHasSaved(true)
      return
    }
    const p = creators.find((c) => c.id === id)
    setCreatorName(p?.name || '')
    if (!id) { setPayee(EMPTY_PAYEE); setHasSaved(true); return }
    const { data } = await supabase.from('creator_private').select('*').eq('id', id).maybeSingle()
    const pay = payeeFromPrivate(data)
    if (!pay.name) pay.name = p?.name || ''
    // EUROS WHEN THEIR RECORD DOES NOT SAY. This used to fall back to GBP,
    // which is how a euro programme kept opening sterling invoices.
    if (!pay.currency) pay.currency = 'EUR'
    setPayee(pay)
    setHasSaved(!!data?.pay_currency)
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
        setTo(localStorage.getItem(LAST_RECIPIENT_KEY) || '')
        setCc(user?.email || '')
        setInvoiceId(prefill.invoiceId)
        setStage(prefill.stage || null)
        setNumber(prefill.number)
        // An invoice with no creator behind it was written for somebody off the
        // platform; reopening it should land back on that option, not on an
        // empty picker that then complains nobody is chosen.
        setCreatorId(prefill.creatorId || (prefill.invoiceId ? OFF_PLATFORM : ''))
        setCreatorName(prefill.creatorName || '')
        // The currency is DERIVED from the payee (`payee.currency`), so the
        // snapshot sets it - falling back to the row's own currency when the
        // snapshot was written before the payee had chosen one.
        if (prefill.payee) {
          setPayee({ ...prefill.payee, currency: prefill.payee.currency || prefill.currency || 'EUR' })
          setHasSaved(!!prefill.payee.currency)
        } else if (prefill.currency) {
          setPayee({ ...EMPTY_PAYEE, currency: prefill.currency })
        }
        // The stored amount is ALREADY in the row's own currency, whichever it
        // is, so it goes straight into the box. Re-converting it would restate
        // a figure somebody has already approved.
        setAmount(prefill.amount != null ? String(prefill.amount) : '')
        if (prefill.description) setDescription(prefill.description)
        if (prefill.billTo) setBillTo(prefill.billTo)
        if (prefill.notes) { notesTouched.current = true; setNotes(prefill.notes) }
        return
      }
      await reserveNumber()
      await selectCreator(prefill.creatorId)
      // A REWARD IS HELD IN POUNDS. If the invoice is going out in euros (which
      // it usually is) the effect above converts it the moment the ECB rate
      // lands, and says on screen that it did.
      // A REWARD CARRIES THE CURRENCY IT WAS AWARDED IN. It used to be assumed
      // to be sterling, which is why a euro prize could not be invoiced in
      // pounds at all. `rewards.currency` has always held it.
      setAmount(prefill.amount != null ? String(prefill.amount) : '')
      setSource(prefill.amount != null
        ? { amount: Number(prefill.amount), currency: prefill.sourceCurrency || 'GBP' }
        : null)
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
    if (!creatorId) problems.push('Pick the creator this invoice is for, or choose “Someone not on the platform”.')
    if (offPlatform && !creatorName.trim()) problems.push('Type the name of the creator this invoice is for.')
    if (!(Number(invoiceAmount) > 0)) problems.push(`Enter the prize amount in ${currency === 'EUR' ? 'euros' : 'pounds'}.`)
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

  // SAVING AN INVOICE IS ONE PRESS, NOT A CEREMONY.
  //
  // Ethan: "remove this copy, it's not needed, it's not needing to be approved
  // by another admin."
  //
  // The form used to explain, at length, that an invoice would sit in a queue
  // until a SECOND admin approved it - and it meant it: the send buttons only
  // appeared on a row somebody else had signed off. For a prize the person
  // writing the invoice has already decided to pay, that is a round trip
  // through another human to get back to where they started.
  //
  // What has NOT changed is the server. `decide_invoice` still refuses to let a
  // plain global admin approve their own submission; an OWNER may, and always
  // could. So this asks - and if the database says somebody else has to look at
  // it, that is what happens and the form says so. The rule about who may
  // approve what still lives in exactly one place, which is the only reason it
  // is a rule.
  async function saveToQueue() {
    const problems = validate()
    if (problems.length) return notice(`Almost there:\n\n${problems.join('\n')}`)
    setSending(true)
    try {
      const row = {
        number,
        // The sentinel is a UI value, never an id: an off-platform invoice is
        // one with nobody behind it.
        creator_id: offPlatform ? null : (creatorId || null),
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

      // Sign it off in the same press. `decide_invoice` is the authority on
      // whether that is allowed (owners yes, a global admin on their own
      // submission no), so the answer comes from it rather than from a guess
      // here about who is logged in.
      const { error: okErr } = await supabase.rpc('decide_invoice', { p_id: id, p_approve: true, p_note: null })
      if (okErr) {
        setInvoiceId(id)
        setStage('awaiting_approval')
        notice(`Invoice ${invoiceRef(number)} is saved, but it needs a second pair of eyes: ${okErr.message}\n\nIt is under "Waiting for approval" in the queue.`)
        onSent?.()
        return
      }
      notice(`Invoice ${invoiceRef(number)} is saved and ready to send.`)
      setInvoiceId(id)
      setStage('approved')
      onSent?.()
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
        creatorId: offPlatform ? null : (creatorId || null),
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

  // THE PLATFORM DOES NOT SEND THE INVOICE ANY MORE (3 Sep 2026).
  //
  // Ethan: "the auto 'send to email' isn't gonna be there any more. Pretty much
  // just gonna download it and click compose in Gmail. It should automatically
  // create the message and download the file for you to then send."
  //
  // `send()` lived here and called `send-invoice` with the PDF as base64, which
  // mailed it through Resend. That is exactly the outbound path that is paused
  // until the DNS records for mail.tryp.com exist - and an invoice is the worst
  // possible thing to discover was silently undeliverable, because the creator
  // is waiting on money and nobody finds out until they ask.
  //
  // So there is one path now: `composeInGmail` below. The edge function is still
  // called, with action 'gmail', but only to RECORD the send and notify the
  // creator in-app - it attaches nothing and mails nothing.

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
      onSent?.()
      closeComposer()
    } catch (e) {
      notice(e.message)
    } finally {
      setSending(false)
    }
  }



  return (
    <div>
      {loading ? <Skeleton className="h-96" /> : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
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
                // LAST IN THE LIST, WHICH IS WHERE IT BELONGS: the everyday case
                // is a creator on the platform, and this is the way out when it
                // is not one.
                options={[
                  ...creators.map((c) => ({ value: c.id, label: c.name })),
                  { value: OFF_PLATFORM, label: 'Someone not on the platform' },
                ]}
              />
              {offPlatform && (
                <div className="mt-3 space-y-2 rounded-xl border border-brand/25 bg-brand-tint/40 px-4 py-3">
                  <label htmlFor="inv-offname" className="label !mb-1">Creator name</label>
                  <input
                    id="inv-offname" type="text" className="input" autoComplete="off"
                    placeholder="e.g. Marta Oliveira"
                    value={creatorName} onChange={(e) => setCreatorName(e.target.value)}
                  />
                  <p className="text-[11px] leading-relaxed text-smoke">
                    They have no account here, so nothing fills itself in: type the amount below and
                    their IBAN and billing address in “Bank details on the invoice”, then download the PDF.
                  </p>
                </div>
              )}
              {creatorId && !offPlatform && !hasSaved && (
                <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-700">
                  {creatorName} hasn’t saved payment details yet. Ask them to add them in Edit profile,
                  or fill in their bank details below for this invoice.
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div>
                {/* THE TWO COLUMNS START THEIR INPUTS ON ONE LINE (28 Sep 2026).
                    Adding the currency switch gave this column a header the
                    height of a button while "Invoice date" still had a plain
                    label, so the two boxes sat at different heights and the row
                    read as crooked. Both headers are now the same fixed height
                    with their contents sitting on the bottom edge, so the
                    inputs line up whatever is in the header. */}
                <div className="flex h-8 items-end justify-between gap-2">
                  {/* NO SYMBOL IN THE LABEL. It said "Prize amount (€)", which
                      was the only way to know the currency before the switch
                      existed. The switch says it, and the box says it again
                      inside the field, so a third copy in the heading was just
                      one more thing to keep in step. */}
                  <label htmlFor="inv-amount" className="label !mb-0">
                    Prize amount
                  </label>
                  {/* THE SWITCH, BESIDE THE MONEY IT CHANGES. Euros are the
                      default because that is what the programme pays in;
                      pounds are one press away for the payees who need them. */}
                  <div className="flex overflow-hidden rounded-lg border border-gray-200 text-xs font-semibold">
                    {[['EUR', '€ EUR'], ['GBP', '£ GBP']].map(([code, label]) => (
                      <button
                        key={code} type="button" onClick={() => switchCurrency(code)}
                        aria-pressed={currency === code}
                        className={cx('px-2.5 py-1 transition-colors',
                          currency === code ? 'bg-brand text-white' : 'bg-white text-smoke hover:text-ink')}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="relative mt-2">
                  <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-sm font-semibold text-smoke">
                    {currency === 'EUR' ? '€' : '£'}
                  </span>
                  <input
                    id="inv-amount" type="number" min="0" step="0.01" inputMode="decimal"
                    className="input !pl-9" placeholder="50"
                    value={amount}
                    onChange={(e) => { setAmount(e.target.value); setSource(null) }}
                  />
                </div>
                <p className="mt-1.5 text-[11px] leading-relaxed text-smoke">
                  {fxNote
                    ? fxNote.text
                    : fxRate === null ? 'Fetching today’s exchange rate…'
                    : fxRate === 0 ? 'Couldn’t load today’s exchange rate, so switching currency won’t convert the figure. Type it yourself.'
                    : `The invoice, the total and the transfer are all in ${currency === 'EUR' ? 'euros' : 'pounds'}. Today’s rate: £1 = €${fxRate}.`}
                </p>
              </div>
              <div>
                <div className="flex h-8 items-end justify-between gap-2">
                  <label htmlFor="inv-date" className="label !mb-0">Invoice date</label>
                </div>
                <input
                  id="inv-date" type="text" className="input mt-2" placeholder="DD/MM/YYYY"
                  value={issueDate} onChange={(e) => setIssueDate(e.target.value)}
                />
              </div>
            </div>

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
                id="inv-billto" rows={4} className="input no-ios-zoom sm:text-sm"
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

            {/* THE COPY ABOUT APPROVAL IS GONE (28 Sep 2026).
                Ethan: "remove this copy, it's not needed, it's not needing to
                be approved by another admin." It was a paragraph explaining a
                round trip that no longer happens - saving the invoice signs it
                off in the same press (see `saveToQueue`). The one case that
                still needs saying is the one where the database refused to let
                the same person approve their own submission, and that line only
                appears when it actually happened. */}
            {!approvedToSend ? (
              <div className="space-y-3">
                {stage === 'awaiting_approval' && (
                  <p className="flex items-start gap-2 rounded-card bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-700">
                    <Icon name="shield" className="mt-0.5 h-4 w-4 shrink-0" />
                    Saved, and waiting for another admin to approve it. It is under “Waiting for
                    approval” in the queue; the send buttons appear here once it comes back.
                  </p>
                )}
                <div className="flex flex-wrap items-center justify-end gap-3">
                  <button type="button" className="btn-ghost" onClick={downloadPdf} disabled={downloading}>
                    {downloading ? <Spinner /> : 'Download PDF'}
                  </button>
                  {stage !== 'awaiting_approval' && (
                    <button type="button" className="btn-primary" onClick={saveToQueue} disabled={sending}>
                      {sending ? <Spinner /> : 'Save invoice'}
                    </button>
                  )}
                </div>
              </div>
            ) : (
              /* ONE WAY OUT, AND IT SAYS WHAT IT DOES.
                 There were three buttons - Download PDF, "Send from platform",
                 "Compose in Gmail" - and the middle one was the one that quietly
                 did not work while mail.tryp.com has no DNS. Two of the three
                 are now one press, because downloading the file and opening the
                 message are not two decisions: you never want one without the
                 other. "Just download the PDF" stays as the quiet option for the
                 times you only want the file. */
              <div className="flex flex-wrap items-center justify-end gap-3">
                <button type="button" className="btn-ghost" onClick={downloadPdf} disabled={downloading}>
                  {downloading ? <Spinner /> : 'Just download the PDF'}
                </button>
                <button
                  type="button"
                  className="btn-primary inline-flex items-center gap-2"
                  onClick={composeInGmail}
                  disabled={downloading || sending}
                >
                  <Icon name="envelope" className="h-4 w-4" />
                  {downloading ? <Spinner /> : 'Download & compose in Gmail'}
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

    </div>
  )
}
