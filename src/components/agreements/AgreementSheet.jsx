import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import Icon from '../Icon'
import { Spinner } from '../ui'
import SignaturePad, { SignatureImage } from './SignaturePad'
import AgreementDoc from './AgreementDoc'
import { lockScroll } from '../../lib/scrollLock'
import { getLocale, useT } from '../../lib/i18n'
import { cx, dateTag } from '../../lib/utils'

export { headingsOf } from './AgreementDoc'

// THE TERMS, ASKED FOR ONCE (7 Oct 2026; rebuilt the same evening).
//
// Ethan: "it should then show up to every creator when they log in ... They don't have to scroll through everything
// but they can if they want or they can just click 'Accept these terms.' Whenever we update the terms they'll be
// notified and have to reaccept them." And then, on the first version: "Should it always show up as full text rather
// than those buttons ... Maybe just improve the UI of it."
//
// So the sheet is a document: the header says what it is and who it is for, the whole text sits in a reading pane
// with its sections on a strip that follows you (AgreementDoc), and the footer holds the one act - a tick for the
// community terms (clickwrap: a real chance to read it and a positive step), a typed or drawn signature for the VIP
// agreement, which licenses content and sets out how money is paid. A creator under 18 adds a parent or guardian's
// name and email, which the server requires and records (migration 360). The server keeps the exact text's
// fingerprint, the time, the account, IP and device with it (accept_agreement).
//
// It leaves the way it arrived: after "Accepted" the sheet sinks away before the next thing is shown, rather than
// vanishing (`leaving`).

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

const when = (iso) => (iso ? new Date(iso).toLocaleString(dateTag(), { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '')

/**
 * @param readOnly    Settings > Agreements: the same document, with the record of how it was accepted instead of the form
 * @param acceptance  that record (my_agreements row)
 */
export default function AgreementSheet({ doc, updated = false, onAccepted, onClose, step, preview = false, previewMinor = false, readOnly = false, acceptance = null }) {
  const tr = useT()
  const { profile } = useAuth()
  const [ticked, setTicked] = useState(false)
  const [sig, setSig] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [progress, setProgress] = useState(0)
  const [scrolled, setScrolled] = useState(false)
  const [ctx, setCtx] = useState(null)
  const [guardian, setGuardian] = useState({ name: '', email: '' })
  const bodyRef = useRef(null)
  useEffect(() => lockScroll(), [])
  useEffect(() => {
    setTicked(false); setSig(null); setErr(''); setDone(false); setLeaving(false); setProgress(0)
    bodyRef.current?.scrollTo({ top: 0 })
  }, [doc?.id])

  // Who is signing: their name for the header, and whether they are under 18. A preview says what it is told to.
  useEffect(() => {
    if (preview || readOnly) { setCtx({ name: null, minor: previewMinor }); return undefined }
    let alive = true
    supabase.rpc('my_agreement_context').then(({ data }) => { if (alive) setCtx(data || { minor: false }) }, () => { if (alive) setCtx({ minor: false }) })
    return () => { alive = false }
  }, [preview, previewMinor, readOnly])

  const vip = doc?.audience === 'vip'
  const needsGuardian = !!ctx?.minor && !vip
  const guardianOk = !needsGuardian || (guardian.name.trim().length >= 3 && EMAIL_RE.test(guardian.email.trim()))
  const ready = ticked && (!doc?.requires_signature || !!sig) && guardianOk
  const firstName = (ctx?.name || profile?.name || '').trim().split(/\s+/)[0]

  const onScroll = useCallback(() => setScrolled((bodyRef.current?.scrollTop || 0) > 24), [])

  function leave() {
    setLeaving(true)
    setTimeout(() => onAccepted?.(), 380)
  }

  async function accept() {
    // The team's preview (Admin > Agreements) shows the real screen and records nothing.
    if (preview) { setDone(true); setTimeout(leave, 650); return }
    setBusy(true); setErr('')
    const { error } = await supabase.rpc('accept_agreement', {
      p_agreement: doc.id,
      p_method: doc.requires_signature ? sig.method : 'click',
      p_signed_name: doc.requires_signature ? sig.name : null,
      p_signature_svg: doc.requires_signature ? sig.svg : null,
      p_locale: getLocale(),
      p_guardian_name: needsGuardian ? guardian.name.trim() : null,
      p_guardian_email: needsGuardian ? guardian.email.trim() : null,
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    setDone(true)
    setTimeout(leave, 750)
  }

  if (!doc) return null
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={doc.title} className={cx('agreement-root fixed inset-0 z-[95] flex items-end justify-center sm:items-center sm:p-6', leaving && 'is-leaving')}>
      <div className="agreement-scrim absolute inset-0 bg-ink/55 backdrop-blur-[3px]" />
      <div className="agreement-sheet relative flex h-[94dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[28px] bg-white shadow-lift sm:h-[min(52rem,92dvh)] sm:rounded-[28px]">
        {/* THE HEADER: what this is, who it is for. It folds to one line once reading starts, to give the text the room. */}
        <div className={cx('relative shrink-0 overflow-hidden px-6 text-white transition-[padding] duration-300', vip ? 'vip-locked-hero' : 'faq-hero', scrolled ? 'pb-3 pt-4' : 'pb-5 pt-6')}>
          <span aria-hidden className="ideas-orb ideas-orb-a !h-48 !w-48 opacity-60" />
          <div className="relative flex items-center justify-between gap-3">
            <p className="flex min-w-0 items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-white/85">
              <Icon name="shield" className="h-4 w-4 shrink-0" />
              <span className="truncate">{updated ? tr('Updated') : vip ? tr('VIP agreement') : tr('Community terms')}</span>
              {doc.version > 1 && <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px]">v{doc.version}</span>}
            </p>
            <div className="flex shrink-0 items-center gap-2">
              {step && <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-bold tabular-nums">{step}</span>}
              {onClose && <button type="button" onClick={onClose} aria-label={tr('Close')} className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 transition-transform duration-200 hoverable:hover:scale-110"><Icon name="close" className="h-4 w-4" /></button>}
            </div>
          </div>
          <h2 className={cx('relative font-extrabold leading-[1.08] tracking-tight transition-all duration-300', scrolled ? 'mt-1 text-[19px]' : 'mt-2 text-[26px]')}>
            {updated ? tr('We updated the {t}', { t: doc.title }) : doc.title}
          </h2>
          <div className={cx('agreement-fold relative grid transition-[grid-template-rows,opacity] duration-300', scrolled ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100')}>
            <div className="min-h-0 overflow-hidden">
              {firstName && !preview && !readOnly && (
                <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[12px] font-semibold"><Icon name="user" className="h-3.5 w-3.5" />{tr('Prepared for {n}', { n: ctx?.name || profile?.name })}</p>
              )}
              <p className="mt-2 text-sm leading-relaxed text-white/90">{updated && doc.change_note ? doc.change_note : doc.summary}</p>
            </div>
          </div>
          <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] bg-white/15">
            <span className="block h-full origin-left bg-white transition-transform duration-150" style={{ transform: `scaleX(${progress})` }} />
          </span>
        </div>

        <div ref={bodyRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-6">
          <div id={readOnly ? 'agreement-print' : undefined}>
            {readOnly && <h1 className="hidden text-2xl font-bold print:block">{doc.title} · v{doc.version}</h1>}
            <AgreementDoc key={doc.id} body={doc.body} scrollRef={bodyRef} onProgress={setProgress} className="pt-2" />
            {readOnly && acceptance && (
              <div className="agreement-section mt-8 rounded-[22px] border border-gray-100 bg-cloud/40 p-5">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-400">{acceptance.method === 'click' ? tr('Accepted') : tr('Signed')}</p>
                {acceptance.method !== 'click' && <SignatureImage svg={acceptance.signature_svg} method={acceptance.method} name={acceptance.signed_name} className="mt-2 max-h-20 max-w-[280px]" />}
                {acceptance.signed_name && <p className="mt-1 text-sm font-semibold text-ink">{acceptance.signed_name}</p>}
                <p className="text-xs text-smoke">{when(acceptance.accepted_at)}</p>
                {acceptance.body_sha256 && <p className="mt-1 break-all font-mono text-[10px] text-gray-400">SHA-256 {acceptance.body_sha256}</p>}
              </div>
            )}
          </div>

          {!readOnly && doc.requires_signature && (
            <div className="agreement-section mt-8 rounded-[22px] border border-gray-100 bg-cloud/40 p-5">
              <p className="mb-3 flex items-center gap-2 text-sm font-bold text-ink"><Icon name="pencil" className="h-4 w-4 text-brand" />{tr('Sign the agreement')}</p>
              <SignaturePad defaultName={ctx?.name || profile?.name || ''} onChange={setSig} />
            </div>
          )}

          {!readOnly && needsGuardian && (
            <div className="agreement-section mt-8 rounded-[22px] border border-brand/25 bg-white p-5">
              <p className="flex items-center gap-2 text-sm font-bold text-ink"><Icon name="users" className="h-4 w-4 text-brand" />{tr('Your parent or guardian')}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-smoke">{tr('You are under 18, so a parent or guardian agrees to these terms with you. Add their details; we only use them about your membership.')}</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="block"><span className="label">{tr('Their full name')}</span>
                  <input className="input no-ios-zoom" value={guardian.name} autoComplete="off" onChange={(e) => setGuardian((g) => ({ ...g, name: e.target.value }))} /></label>
                <label className="block"><span className="label">{tr('Their email')}</span>
                  <input className="input no-ios-zoom" type="email" value={guardian.email} autoComplete="off" onChange={(e) => setGuardian((g) => ({ ...g, email: e.target.value }))} /></label>
              </div>
            </div>
          )}
        </div>

        {readOnly ? (
          <div className="flex shrink-0 gap-2 border-t border-gray-100 bg-white px-6 pb-[calc(1.1rem+env(safe-area-inset-bottom))] pt-4">
            <button type="button" onClick={() => window.print()} className="btn-secondary flex-1 justify-center"><Icon name="download" className="h-4 w-4" />{tr('Print or save as PDF')}</button>
            <button type="button" onClick={onClose} className="btn-primary flex-1 justify-center">{tr('Done')}</button>
          </div>
        ) : (
        <div className="shrink-0 border-t border-gray-100 bg-white px-6 pb-[calc(1.1rem+env(safe-area-inset-bottom))] pt-4">
          <label className="flex cursor-pointer items-start gap-3 text-[13.5px] leading-snug text-ink">
            <input type="checkbox" checked={ticked} onChange={(e) => setTicked(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-brand" />
            <span>
              {doc.requires_signature
                ? tr('I have read the {t} and I agree to it. I sign it electronically with my name above.', { t: doc.title })
                : needsGuardian
                  ? tr('I have read and agree to the {t}, and my parent or guardian named above agrees too.', { t: doc.title })
                  : tr('I have read and agree to the {t}.', { t: doc.title })}
            </span>
          </label>
          {err && <p className="mt-3 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-600 animate-rise">{err}</p>}
          <button type="button" onClick={accept} disabled={!ready || busy || done}
            className={cx('agreement-cta mt-3.5 flex w-full items-center justify-center gap-2 rounded-full py-3.5 text-[15px] font-bold text-white shadow-card transition-all duration-300 disabled:cursor-not-allowed',
              done ? 'is-done bg-ink' : ready ? 'bg-brand hoverable:hover:-translate-y-0.5 hoverable:hover:shadow-lift' : 'bg-brand/45')}>
            {busy ? <Spinner className="h-4 w-4" /> : done ? <Icon name="check" className="agreement-check h-5 w-5" /> : <Icon name={doc.requires_signature ? 'pencil' : 'check'} className="h-4 w-4" />}
            {done ? (doc.requires_signature ? tr('Signed') : tr('Accepted')) : doc.requires_signature ? tr('Sign and accept') : tr('Accept these terms')}
          </button>
          <p className="mt-2 text-center text-[11px] text-smoke">{tr('You can read this again any time in Settings > Agreements.')}</p>
        </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
