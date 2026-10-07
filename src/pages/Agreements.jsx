import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Modal, PageHeader, Skeleton } from '../components/ui'
import Icon from '../components/Icon'
import AgreementSheet, { headingsOf } from '../components/agreements/AgreementSheet'
import { SignatureImage } from '../components/agreements/SignaturePad'
import { renderNote } from '../lib/noteMarkdown'
import { dateTag, cx } from '../lib/utils'
import { useT } from '../lib/i18n'

// SETTINGS > AGREEMENTS (7 Oct 2026). Ethan: "Maybe there's a place in settings or somewhere where the creators can
// actually go back in and review these if they want to." Every document that applies to you, whether you have accepted
// its current version, and every version you ever accepted or signed - with the signature and the exact text, which
// you can print or save as a PDF from the browser.
const when = (iso) => new Date(iso).toLocaleString(dateTag(), { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export default function Agreements() {
  const tr = useT()
  const { profile } = useAuth()
  const [current, setCurrent] = useState(undefined)
  const [pending, setPending] = useState([])
  const [mine, setMine] = useState([])
  const [reading, setReading] = useState(null)
  const [signing, setSigning] = useState(null)

  const load = useCallback(async () => {
    const [{ data: docs }, { data: pend }, { data: had }] = await Promise.all([
      supabase.from('agreements').select('*').not('published_at', 'is', null).order('version', { ascending: false }),
      supabase.rpc('my_pending_agreements'),
      supabase.rpc('my_agreements'),
    ])
    // The newest published version of each document that applies to this person.
    const latest = {}
    for (const d of docs || []) if (!latest[d.audience]) latest[d.audience] = d
    const mineVip = !!profile?.is_vip
    setCurrent(Object.values(latest).filter((d) => d.audience === 'creator' || mineVip || (had || []).some((h) => h.agreement_id === d.id)))
    setPending(pend || [])
    setMine(had || [])
  }, [profile?.is_vip])
  useEffect(() => { load() }, [load])

  const acceptanceOf = (doc) => mine.find((m) => m.agreement_id === doc.id)

  return (
    <div className="page max-w-3xl">
      <PageHeader back={{ to: '/settings', label: tr('Settings') }} title={tr('Agreements')} subtitle={tr('The terms you accepted and the agreements you signed.')} />

      {current === undefined ? (
        <div className="space-y-3"><Skeleton className="h-36 w-full rounded-card" /><Skeleton className="h-36 w-full rounded-card" /></div>
      ) : current.length === 0 ? (
        <p className="rounded-card border border-dashed border-gray-200 bg-white px-5 py-10 text-center text-sm text-smoke">{tr('Nothing to sign yet.')}</p>
      ) : (
        <div className="space-y-4">
          {current.map((doc, i) => {
            const acc = acceptanceOf(doc)
            const isPending = pending.some((p) => p.id === doc.id)
            return (
              <section key={doc.id} className="overflow-hidden rounded-[24px] border border-gray-100 bg-white shadow-card animate-rise" style={{ animationDelay: `${i * 80}ms` }}>
                <div className={cx('relative px-6 py-5 text-white', doc.audience === 'vip' ? 'vip-locked-hero' : 'faq-hero')}>
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/80">{doc.audience === 'vip' ? tr('VIP agreement') : tr('Community terms')} · v{doc.version}</p>
                  <h2 className="mt-1 text-xl font-extrabold">{doc.title}</h2>
                  <p className="mt-1 text-sm text-white/85">{doc.summary}</p>
                </div>
                <div className="flex flex-wrap items-center gap-4 px-6 py-4">
                  <div className="min-w-0 flex-1">
                    {acc ? (
                      <>
                        <p className="flex items-center gap-1.5 text-sm font-bold text-ink"><Icon name="check" className="h-4 w-4 text-brand" />{acc.method === 'click' ? tr('Accepted') : tr('Signed')}</p>
                        <p className="text-xs text-smoke">{when(acc.accepted_at)}</p>
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
      )}

      {mine.filter((m) => !m.is_current).length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 px-1 text-[11px] font-bold uppercase tracking-[0.14em] text-gray-400">{tr('Earlier versions you accepted')}</h2>
          <ul className="divide-y divide-gray-50 rounded-card border border-gray-100 bg-white shadow-card">
            {mine.filter((m) => !m.is_current).map((m) => (
              <li key={m.acceptance_id} className="flex items-center gap-3 px-5 py-3.5">
                <Icon name="shield" className="h-5 w-5 shrink-0 text-brand" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-ink">{m.title} · v{m.version}</span>
                  <span className="block text-xs text-smoke">{when(m.accepted_at)}</span>
                </span>
                <button type="button" onClick={async () => {
                  const { data } = await supabase.from('agreements').select('*').eq('id', m.agreement_id).maybeSingle()
                  if (data) setReading({ doc: data, acc: m })
                }} className="text-sm font-bold text-brand">{tr('Read')}</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {reading && <ReadModal doc={reading.doc} acc={reading.acc} onClose={() => setReading(null)} />}
      {signing && <AgreementSheet doc={signing} onClose={() => setSigning(null)} onAccepted={() => { setSigning(null); load() }} />}
    </div>
  )
}

function ReadModal({ doc, acc, onClose }) {
  const tr = useT()
  const sections = headingsOf(doc.body)
  return (
    <Modal open onClose={onClose} title={`${doc.title} · v${doc.version}`} wide>
      <div id="agreement-print" className="agreement-text text-[14px]">
        <p className="mb-3 text-xs text-smoke">{tr('{n} sections', { n: sections.length })}{doc.published_at ? ` · ${tr('published {d}', { d: when(doc.published_at) })}` : ''}</p>
        {renderNote(doc.body)}
        {acc && (
          <div className="mt-6 rounded-2xl border border-gray-100 bg-cloud/50 p-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-400">{acc.method === 'click' ? tr('Accepted') : tr('Signed')}</p>
            {acc.method !== 'click' && <SignatureImage svg={acc.signature_svg} method={acc.method} name={acc.signed_name} className="mt-2 max-h-20 max-w-[280px]" />}
            {acc.signed_name && <p className="mt-1 text-sm font-semibold text-ink">{acc.signed_name}</p>}
            <p className="text-xs text-smoke">{when(acc.accepted_at)}</p>
            <p className="mt-1 break-all font-mono text-[10px] text-gray-400">SHA-256 {acc.body_sha256}</p>
          </div>
        )}
      </div>
      <button type="button" onClick={() => window.print()} className="btn-secondary mt-5 w-full justify-center"><Icon name="download" className="h-4 w-4" />{tr('Print or save as PDF')}</button>
    </Modal>
  )
}
