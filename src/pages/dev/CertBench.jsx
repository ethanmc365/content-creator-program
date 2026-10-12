import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import CertificateCard, { CERT_W, CERT_H } from '../../components/certificate/CertificateCard'
import { useCertificateDesign } from '../../lib/certificateLang'

// DEV ONLY: every certificate design in every language, at 0.4 scale, to check nothing overflows.
const LANGS = ['en', 'es', 'pt', 'de', 'ro']
const FACTS = { name: 'Alexandra Montgomery', date: '2026-10-12', serial: 'TRYP-2026-ABCD', market: 'Spain', challenge: 'Global Challenge', places: 3, place: 1 }

function One({ design, lang }) {
  const { design: d } = useCertificateDesign(design, lang)
  const k = Number(new URLSearchParams(window.location.search).get('k')) || 0.4
  return (
    <div data-cert={`${design.title}|${lang}`} style={{ width: CERT_W * k, height: CERT_H * k, overflow: 'hidden', border: '1px solid #ddd' }}>
      <div style={{ transform: `scale(${k})`, transformOrigin: 'top left' }}>
        <CertificateCard design={d} facts={FACTS} lang={lang} />
      </div>
    </div>
  )
}

export default function CertBench() {
  const [designs, setDesigns] = useState([])
  const only = new URLSearchParams(window.location.search).get('d')
  useEffect(() => { supabase.from('certificate_designs').select('*').order('created_at').then(({ data }) => setDesigns(data || [])) }, [])
  return (
    <div style={{ padding: 12, background: '#fff' }}>
      {designs.filter((d, i) => only == null || String(i) === only).map((d) => (
        <div key={d.id} style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 12, fontWeight: 700 }}>{d.title} · {d.layout || d.options?.layout}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{LANGS.filter((l) => !new URLSearchParams(window.location.search).get('l') || new URLSearchParams(window.location.search).get('l').split(',').includes(l)).map((l) => <One key={l} design={d} lang={l} />)}</div>
        </div>
      ))}
    </div>
  )
}
