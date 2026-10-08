import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import LegalShell from './LegalShell'
import { supabase } from '../../lib/supabase'
import { renderNote } from '../../lib/noteMarkdown'
import Icon from '../../components/Icon'
import { Spinner } from '../../components/ui'
import { cx, formatDate } from '../../lib/utils'
import { useT } from '../../lib/i18n'
import { SUPPORT_EMAIL } from '../../lib/team'

// /guardian/<token>: WHERE A PARENT OR GUARDIAN CONFIRMS (8 Oct 2026, migration 367).
//
// Public, no account. The token is the only key and it opens exactly one acceptance: the text the young creator
// accepted, word for word as they saw it, and a confirmation in the guardian's own name. What is recorded is the time,
// the name typed, and the IP and device it came from - the same evidence the creator's own acceptance keeps.
export default function GuardianConsent() {
  const tr = useT()
  const { token } = useParams()
  const [doc, setDoc] = useState(undefined)
  const [name, setName] = useState('')
  const [ticked, setTicked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [read, setRead] = useState(false)

  useEffect(() => {
    let alive = true
    supabase.rpc('guardian_consent_view', { p_token: token || '' }).then(({ data, error }) => {
      if (!alive) return
      setDoc(error || !data ? null : data)
      if (data?.guardian_name) setName(data.guardian_name)
    })
    return () => { alive = false }
  }, [token])

  async function confirm() {
    setBusy(true); setErr('')
    const { data, error } = await supabase.rpc('guardian_consent_confirm', { p_token: token, p_name: name.trim() })
    setBusy(false)
    if (error) { setErr(error.message); return }
    setDoc((d) => ({ ...d, confirmed_at: data, confirmed_name: name.trim() }))
  }

  if (doc === undefined) return <LegalShell title={tr('Parent or guardian confirmation')}><Spinner className="h-5 w-5" /></LegalShell>
  if (doc === null) {
    return (
      <LegalShell title={tr('This link is not valid')}>
        <p>{tr('The link may have been copied only in part. Ask for it to be sent again.')}</p>
      </LegalShell>
    )
  }
  const who = doc.creator
  return (
    <LegalShell title={tr('Parent or guardian confirmation')}>
      {doc.confirmed_at ? (
        <div className="animate-rise rounded-[22px] bg-brand px-6 py-6 text-white shadow-card">
          <Icon name="check" className="h-8 w-8" />
          <p className="mt-2 text-lg font-bold">{tr('Thank you, {n}.', { n: doc.confirmed_name || name })}</p>
          <p className="mt-1 text-white/85">{tr('You confirmed the {t} for {c} on {d}. They have been told. You can close this page.', { t: doc.title, c: who, d: formatDate(doc.confirmed_at) })}</p>
        </div>
      ) : (
        <div className="animate-rise space-y-2">
          <p className="text-base text-ink">{tr('{c} has joined the Tryp.com Creator Community and accepted the {t} on {d}.', { c: who, t: doc.title, d: formatDate(doc.accepted_at) })}</p>
          <p>{tr('As {c} is under 18, the terms also need the agreement of a parent or legal guardian. Please read them below, then confirm in your own name.', { c: who })}</p>
          {doc.summary && <p className="rounded-xl bg-cloud px-4 py-3 text-ink">{doc.summary}</p>}
        </div>
      )}

      <details className="group rounded-[18px] border border-gray-100 bg-white" open={!doc.confirmed_at} onToggle={(e) => e.currentTarget.open && setRead(true)}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 font-semibold text-ink">
          {tr('The {t}, exactly as {c} accepted them', { t: doc.title, c: who })}
          <Icon name="chevronDown" className="h-5 w-5 text-gray-400 transition-transform duration-300 group-open:rotate-180" />
        </summary>
        <div className="max-h-[60vh] overflow-y-auto border-t border-gray-100 px-5 py-4" onScroll={(e) => { const el = e.currentTarget; if (el.scrollTop + el.clientHeight >= el.scrollHeight - 40) setRead(true) }}>
          {renderNote(doc.body || '')}
        </div>
      </details>

      {!doc.confirmed_at && (
        <div className="space-y-4 rounded-[22px] border border-brand/25 bg-white p-5">
          <label className="block"><span className="label">{tr('Your full name')}</span>
            <input className="input no-ios-zoom" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </label>
          <label className="flex cursor-pointer items-start gap-3 text-[13.5px] leading-snug text-ink">
            <input type="checkbox" checked={ticked} onChange={(e) => setTicked(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-brand" />
            <span>{tr('I am {c}\'s parent or legal guardian. I have read the {t} and I agree to them for {c}.', { c: who, t: doc.title })}</span>
          </label>
          {err && <p className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-600">{err}</p>}
          <button type="button" onClick={confirm} disabled={!ticked || name.trim().length < 3 || busy}
            className={cx('flex w-full items-center justify-center gap-2 rounded-full py-3.5 text-[15px] font-bold text-white shadow-card transition-all duration-300 disabled:cursor-not-allowed', ticked && name.trim().length >= 3 ? 'bg-brand hoverable:hover:scale-[1.02]' : 'bg-brand/45')}>
            {busy ? <Spinner className="h-4 w-4" /> : <Icon name="check" className="h-4 w-4" />}{tr('Confirm')}
          </button>
          {!read && <p className="text-center text-xs text-smoke">{tr('Please read the terms above before confirming.')}</p>}
          <p className="text-xs text-smoke">{tr('We record your name, the time, and the IP address and device you confirm from, as evidence of your agreement. Questions: {e}', { e: SUPPORT_EMAIL })}</p>
        </div>
      )}
    </LegalShell>
  )
}
