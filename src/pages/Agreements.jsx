import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { PageHeader, Skeleton } from '../components/ui'
import Icon from '../components/Icon'
import AgreementSheet from '../components/agreements/AgreementSheet'
import { SignatureImage } from '../components/agreements/SignaturePad'
import { dateTag, cx } from '../lib/utils'
import { useT } from '../lib/i18n'

// SETTINGS > AGREEMENTS (7 Oct 2026). Ethan: "Maybe there's a place in settings or somewhere where the creators can
// actually go back in and review these if they want to." Every document that applies to you, whether you have accepted
// its current version, and every version you ever accepted or signed - with the signature and the exact text, which
// you can print or save as a PDF from the browser.
const when = (iso) => new Date(iso).toLocaleString(dateTag(), { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export default function Agreements() {
  const tr = useT()
  const [current, setCurrent] = useState(undefined)
  const [pending, setPending] = useState([])
  const [mine, setMine] = useState([])
  const [reading, setReading] = useState(null)
  const [signing, setSigning] = useState(null)

  // EVERYTHING HERE IS THE TEXT AS THIS READER SEES IT (migration 357): the market's numbers filled in. Waiting documents
  // come from my_pending_agreements; signed ones show the exact filled-in text that was signed (`rendered_body`).
  const load = useCallback(async () => {
    const [{ data: pend }, { data: had }] = await Promise.all([
      supabase.rpc('my_pending_agreements'),
      supabase.rpc('my_agreements'),
    ])
    const signedNow = (had || []).filter((h) => h.is_current)
    const docs = await Promise.all(signedNow.map(async (h) => {
      const { data } = await supabase.rpc('agreement_for_me', { p_agreement: h.agreement_id })
      const d = (Array.isArray(data) ? data[0] : data) || { id: h.agreement_id, title: h.title, audience: h.audience, version: h.version, summary: '' }
      return { ...d, body: h.rendered_body || d.body }
    }))
    setCurrent([...(pend || []), ...docs].sort((a, b) => (a.audience === 'creator' ? -1 : 1) - (b.audience === 'creator' ? -1 : 1)))
    setPending(pend || [])
    setMine(had || [])
  }, [])
  useEffect(() => { load() }, [load])

  const acceptanceOf = (doc) => mine.find((m) => m.agreement_id === doc.id)

  const accepted = (current || []).filter((d) => acceptanceOf(d)).length
  return (
    <div className="page max-w-3xl">
      <PageHeader back={{ to: '/settings', label: tr('Settings') }} title={tr('Agreements')} subtitle={tr('The terms you accepted and the agreements you signed.')} />

      {current === undefined ? (
        <div className="space-y-3"><Skeleton className="h-36 w-full rounded-card" /><Skeleton className="h-36 w-full rounded-card" /></div>
      ) : current.length === 0 ? (
        <div className="rounded-card border border-dashed border-gray-200 bg-white px-5 py-12 text-center animate-rise">
          <Icon name="shield" className="mx-auto h-8 w-8 text-brand" />
          <p className="mt-3 text-sm font-semibold text-ink">{tr('Nothing to sign yet.')}</p>
          <p className="mt-1 text-xs text-smoke">{tr('When the team publishes terms, they appear here.')}</p>
        </div>
      ) : (
        <>
          {/* WHERE YOU STAND, IN ONE LINE (7 Oct 2026). */}
          <div className="mb-4 flex items-center gap-3 rounded-card border border-gray-100 bg-white px-5 py-4 shadow-card animate-rise">
            <span className="relative h-11 w-11 shrink-0">
              <svg viewBox="0 0 36 36" className="h-11 w-11 -rotate-90">
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="#f1f1f3" strokeWidth="3.5" />
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="#d94407" strokeWidth="3.5" strokeLinecap="round"
                  strokeDasharray={`${(accepted / current.length) * 97.4} 97.4`} className="transition-[stroke-dasharray] duration-700" />
              </svg>
              <Icon name={accepted === current.length ? 'check' : 'shield'} className="absolute inset-0 m-auto h-4 w-4 text-brand" />
            </span>
            <p className="min-w-0 text-sm text-ink">
              <strong>{accepted === current.length ? tr('You are all up to date.') : tr('{n} waiting for you', { n: current.length - accepted })}</strong>
              <span className="block text-xs text-smoke">{tr('{a} of {b} accepted', { a: accepted, b: current.length })}</span>
            </p>
          </div>

          <div className="space-y-4">
            {current.map((doc, i) => {
              const acc = acceptanceOf(doc)
              const isPending = pending.some((p) => p.id === doc.id)
              const vip = doc.audience === 'vip'
              return (
                <section key={doc.id} className="group overflow-hidden rounded-[24px] border border-gray-100 bg-white shadow-card transition-all duration-300 animate-rise hoverable:hover:-translate-y-0.5 hoverable:hover:shadow-lift" style={{ animationDelay: `${80 + i * 80}ms` }}>
                  <div className={cx('relative overflow-hidden px-6 py-5 text-white', vip ? 'vip-locked-hero' : 'faq-hero')}>
                    <span aria-hidden className="ideas-orb ideas-orb-a !h-40 !w-40 opacity-50" />
                    <div className="relative flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/80">{vip ? tr('VIP agreement') : tr('Community terms')} · v{doc.version}</p>
                        <h2 className="mt-1 text-xl font-extrabold">{doc.title}</h2>
                      </div>
                      <span className={cx('shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold', acc ? 'bg-white text-brand' : 'bg-white/20 text-white')}>
                        {acc ? (acc.method === 'click' ? tr('Accepted') : tr('Signed')) : tr('Waiting')}
                      </span>
                    </div>
                    <p className="relative mt-1.5 text-sm leading-relaxed text-white/90">{doc.summary}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 px-6 py-4">
                    <div className="min-w-0 flex-1">
                      {acc ? (
                        <>
                          <p className="flex items-center gap-1.5 text-sm font-bold text-ink"><Icon name="check" className="h-4 w-4 text-brand" />{acc.method === 'click' ? tr('Accepted') : tr('Signed')} {when(acc.accepted_at)}</p>
                          {acc.method !== 'click' && <SignatureImage svg={acc.signature_svg} method={acc.method} name={acc.signed_name} className="mt-2 max-h-14 max-w-[220px]" textClass="text-[28px]" />}
                        </>
                      ) : (
                        <p className="flex items-center gap-1.5 text-sm font-bold text-brand"><Icon name="alert" className="h-4 w-4" />{isPending ? tr('Waiting for you') : tr('Not accepted yet')}</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setReading({ doc, acc })} className="btn-secondary !py-2 text-sm"><Icon name="book" className="h-4 w-4" />{tr('Read')}</button>
                      {!acc && <button type="button" onClick={() => setSigning(doc)} className="btn-primary !py-2 text-sm"><Icon name={doc.requires_signature ? 'pencil' : 'check'} className="h-4 w-4" />{doc.requires_signature ? tr('Sign') : tr('Accept')}</button>}
                    </div>
                  </div>
                </section>
              )
            })}
          </div>
        </>
      )}

      {mine.filter((m) => !m.is_current).length > 0 && (
        <section className="mt-8 animate-rise" style={{ animationDelay: '240ms' }}>
          <h2 className="mb-2 px-1 text-[11px] font-bold uppercase tracking-[0.14em] text-gray-400">{tr('Earlier versions you accepted')}</h2>
          <ul className="divide-y divide-gray-50 rounded-card border border-gray-100 bg-white shadow-card">
            {mine.filter((m) => !m.is_current).map((m) => (
              <li key={m.acceptance_id} className="flex items-center gap-3 px-5 py-3.5">
                <Icon name="shield" className="h-5 w-5 shrink-0 text-brand" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-ink">{m.title} · v{m.version}</span>
                  <span className="block text-xs text-smoke">{when(m.accepted_at)}</span>
                </span>
                <button type="button" onClick={() => setReading({ doc: { id: m.agreement_id, title: m.title, version: m.version, audience: m.audience, summary: '', body: m.rendered_body || '' }, acc: m })} className="text-sm font-bold text-brand">{tr('Read')}</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {reading && <AgreementSheet readOnly doc={reading.doc} acceptance={reading.acc} onClose={() => setReading(null)} />}
      {signing && <AgreementSheet doc={signing} onClose={() => setSigning(null)} onAccepted={() => { setSigning(null); load() }} />}
    </div>
  )
}
