import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import Icon from '../Icon'
import { Spinner } from '../ui'
import SignaturePad from './SignaturePad'
import { renderNote } from '../../lib/noteMarkdown'
import { lockScroll } from '../../lib/scrollLock'
import { getLocale, useT } from '../../lib/i18n'
import { cx } from '../../lib/utils'

// THE TERMS, ASKED FOR ONCE (7 Oct 2026).
//
// Ethan: "it should then show up to every creator when they log in. Obviously it won't show all the text immediately.
// They don't have to scroll through everything but they can if they want or they can just click 'Accept these terms.'
// Whenever we update the terms they'll be notified and have to reaccept them."
//
// So the sheet leads with what the document IS (title, a two-line summary, the headings as a list of what is inside)
// and keeps the full text one press away. For the community terms a tick and a button is the whole act (clickwrap:
// the person had a real chance to read it and took a positive step). For the VIP agreement, which licenses content and
// sets out how money is paid, they sign: typed or drawn. The server records the exact text's fingerprint, the time,
// the account, IP and device with it (accept_agreement, migration 351).

/** The section headings of a document, for "what is inside". */
export function headingsOf(md = '') {
  return md.split('\n').map((l) => l.match(/^##\s+(.*)$/)?.[1]).filter(Boolean).map((h) => h.replace(/^\d+\.\s*/, ''))
}

export default function AgreementSheet({ doc, updated = false, onAccepted, onClose, step, preview = false }) {
  const tr = useT()
  const { profile } = useAuth()
  const [reading, setReading] = useState(false)
  const [ticked, setTicked] = useState(false)
  const [sig, setSig] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)
  const bodyRef = useRef(null)
  useEffect(() => lockScroll(), [])
  useEffect(() => { setReading(false); setTicked(false); setSig(null); setErr(''); setDone(false) }, [doc?.id])
  const inside = useMemo(() => headingsOf(doc?.body), [doc?.body])
  const vip = doc?.audience === 'vip'
  const ready = ticked && (!doc?.requires_signature || !!sig)

  async function accept() {
    // The team's preview (Admin > Agreements) shows the real screen and records nothing.
    if (preview) { setDone(true); setTimeout(() => onAccepted?.(), 700); return }
    setBusy(true); setErr('')
    const { error } = await supabase.rpc('accept_agreement', {
      p_agreement: doc.id,
      p_method: doc.requires_signature ? sig.method : 'click',
      p_signed_name: doc.requires_signature ? sig.name : null,
      p_signature_svg: doc.requires_signature ? sig.svg : null,
      p_locale: getLocale(),
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    setDone(true)
    setTimeout(() => onAccepted?.(), 900)
  }

  if (!doc) return null
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={doc.title} className="fixed inset-0 z-[95] flex items-end justify-center sm:items-center sm:p-6">
      <div className="absolute inset-0 bg-ink/60 backdrop-blur-[3px]" />
      <div className="agreement-sheet relative flex max-h-[94dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-[28px] bg-white shadow-lift sm:rounded-[28px]">
        <div className={cx('relative shrink-0 overflow-hidden px-6 pb-6 pt-6 text-white', vip ? 'vip-locked-hero' : 'faq-hero')}>
          {vip && <span aria-hidden className="ideas-orb ideas-orb-a !h-48 !w-48" />}
          <div className="relative flex items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-white/85">
              <Icon name="shield" className="h-4 w-4" />{updated ? tr('Updated') : vip ? tr('VIP agreement') : tr('Community terms')}
              {doc.version > 1 && <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px]">v{doc.version}</span>}
            </p>
            {step && <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-bold tabular-nums">{step}</span>}
            {onClose && <button type="button" onClick={onClose} aria-label={tr('Close')} className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15"><Icon name="close" className="h-4 w-4" /></button>}
          </div>
          <h2 className="relative mt-2 text-[26px] font-extrabold leading-[1.08] tracking-tight">{updated ? tr('We updated the {t}', { t: doc.title }) : doc.title}</h2>
          <p className="relative mt-1.5 text-sm leading-relaxed text-white/85">
            {updated && doc.change_note ? doc.change_note : doc.summary}
          </p>
        </div>

        <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5">
          {!reading ? (
            <>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-400">{tr('What is inside')}</p>
              <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
                {inside.map((h, i) => (
                  <li key={h} className="agreement-chip flex items-center gap-2 rounded-xl bg-cloud/70 px-3 py-2 text-[13px] font-semibold text-ink" style={{ animationDelay: `${i * 35}ms` }}>
                    <span className="text-[11px] font-black tabular-nums text-brand">{i + 1}</span>{h}
                  </li>
                ))}
              </ul>
              <button type="button" onClick={() => { setReading(true); requestAnimationFrame(() => bodyRef.current?.scrollTo({ top: 0 })) }} className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-brand">
                <Icon name="book" className="h-4 w-4" />{tr('Read the full text')}
              </button>
            </>
          ) : (
            <div className="agreement-text text-[14px]">
              {renderNote(doc.body)}
              <button type="button" onClick={() => setReading(false)} className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-brand"><Icon name="chevronUp" className="h-4 w-4" />{tr('Show less')}</button>
            </div>
          )}

          {doc.requires_signature && (
            <div className="mt-6 border-t border-gray-100 pt-5">
              <p className="mb-3 flex items-center gap-2 text-sm font-bold text-ink"><Icon name="pencil" className="h-4 w-4 text-brand" />{tr('Sign the agreement')}</p>
              <SignaturePad defaultName={profile?.name || ''} onChange={setSig} />
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-gray-100 bg-white px-6 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-4">
          <label className="flex items-start gap-3 text-[13.5px] leading-snug text-ink">
            <input type="checkbox" checked={ticked} onChange={(e) => setTicked(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-brand" />
            <span>
              {doc.requires_signature
                ? tr('I have read the {t} and I agree to it. I sign it electronically with my name above.', { t: doc.title })
                : tr('I have read and agree to the {t}.', { t: doc.title })}
            </span>
          </label>
          {err && <p className="mt-3 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-600">{err}</p>}
          <button type="button" onClick={accept} disabled={!ready || busy || done}
            className={cx('mt-4 flex w-full items-center justify-center gap-2 rounded-full py-3.5 text-[15px] font-bold text-white shadow-card transition-all duration-300 disabled:opacity-50', done ? 'bg-ink' : 'bg-brand hoverable:hover:-translate-y-0.5 hoverable:hover:shadow-lift')}>
            {busy ? <Spinner className="h-4 w-4" /> : done ? <Icon name="check" className="h-5 w-5" /> : <Icon name={doc.requires_signature ? 'pencil' : 'check'} className="h-4 w-4" />}
            {done ? (doc.requires_signature ? tr('Signed') : tr('Accepted')) : doc.requires_signature ? tr('Sign and accept') : tr('Accept these terms')}
          </button>
          <p className="mt-2 text-center text-[11px] text-smoke">{tr('You can read this again any time in Settings > Agreements.')}</p>
        </div>
      </div>
    </div>,
    document.body,
  )
}
