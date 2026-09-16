import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Spinner } from '../components/ui'
import Icon from '../components/Icon'
import CertificateCard, { CERT_W, CERT_H } from '../components/certificate/CertificateCard'
import { formatAwardDate } from '../lib/certificates'
import { useFluidWidth } from '../components/portfolio/PortfolioDeck'

// IS THIS CERTIFICATE REAL?
//
// The serial has been printed on the face of every certificate since the
// builder shipped, on the reasoning that a brand can be told what to ask for.
// That was half a feature: there was nowhere to ask. This is the other half,
// and it is what separates a credential from a JPEG - anybody can make a
// picture that says "Certificate of Achievement", and nobody can make one whose
// code resolves here.
//
// OUTSIDE THE APP SHELL, like the public portfolio. The person checking is a
// brand or a recruiter who has never heard of this platform and is not going to
// sign into it.
//
// THE PAGE SHOWS THE CERTIFICATE ITSELF, not a row of fields saying "valid:
// true". The whole question is "does this match the picture I am holding", and
// the only answer that actually settles it is the picture.
export default function VerifyCertificate() {
  const { serial } = useParams()
  const navigate = useNavigate()
  const [state, setState] = useState(serial ? 'loading' : 'idle')
  const [data, setData] = useState(null)
  const [typed, setTyped] = useState(serial || '')
  const [holder, width] = useFluidWidth(280)

  const look = useCallback(async (code) => {
    if (!code) return
    setState('loading')
    const { data: row, error } = await supabase.rpc('verify_certificate', { p_serial: code })
    if (error || !row) { setData(null); setState('missing'); return }
    setData(row)
    setState('found')
    document.title = `${row.facts?.name || 'Certificate'} — verified`
  }, [])

  useEffect(() => { if (serial) look(serial) }, [serial, look])

  const scale = Math.min(1, width / CERT_W)

  return (
    <div className="min-h-screen bg-cloud/40">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3">
          <img src="/brand/tryp-logo.png" alt="Tryp.com" className="h-8 w-8 rounded-lg" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-ink">Certificate check</p>
            <p className="truncate text-[11px] text-smoke">Tryp.com Content Creator Community</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const code = typed.trim()
            if (!code) return
            // Through the URL, so a checked certificate is a link somebody can
            // send on - which is the whole point of a credential id.
            navigate(`/verify/${encodeURIComponent(code)}`)
          }}
          className="mb-8 flex flex-wrap items-end gap-3 rounded-card border border-gray-100 bg-white p-4 shadow-card"
        >
          <div className="min-w-[220px] flex-1">
            <label htmlFor="serial" className="label">The code on the certificate</label>
            <input
              id="serial"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="TRYP-2026-XXXXXX"
              // Uppercase on screen because that is how it is printed. The
              // lookup is case-insensitive anyway, so nobody is punished for
              // typing it in lower case.
              className="input font-mono uppercase tracking-wider"
              autoComplete="off"
              spellCheck="false"
            />
          </div>
          <button type="submit" className="btn-primary">Check it</button>
        </form>

        {state === 'loading' && (
          <div className="flex justify-center py-16"><Spinner className="h-8 w-8" /></div>
        )}

        {state === 'idle' && (
          <p className="py-12 text-center text-sm text-smoke">
            Type the code printed at the foot of the certificate and we will show you the real one.
          </p>
        )}

        {state === 'missing' && (
          <div className="rounded-card border border-gray-100 bg-white p-8 text-center shadow-card">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-400">
              <Icon name="close" className="h-6 w-6" />
            </span>
            <h1 className="mt-4 text-lg font-bold text-ink">No certificate with that code</h1>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-smoke">
              Check the code again - it is six characters after the year, and the letters O and I
              are never used. If it still does not come up, this was not issued by Tryp.com.
            </p>
          </div>
        )}

        {state === 'found' && data && (
          <div className="space-y-5">
            <div className="flex items-center gap-3 rounded-card border border-green-200 bg-green-50 px-5 py-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-500 text-white">
                <Icon name="check" className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-green-800">This is a genuine Tryp.com certificate</p>
                {/* THE DATE THE CERTIFICATE ITSELF PRINTS. `facts.date` is the
                    frozen one - the day the challenge ended - and `awarded_at`
                    is the day the row happened to be written. Saying one here
                    and the other on the picture directly under it is the worst
                    possible place for two answers to one question, because this
                    page exists to confirm the picture. */}
                <p className="text-[12px] text-green-700">
                  Awarded to {data.facts?.name || 'a creator'}
                  {(data.facts?.date || data.awarded_at)
                    ? ` on ${formatAwardDate(data.facts?.date || data.awarded_at)}` : ''}.
                </p>
              </div>
            </div>

            <div ref={holder} className="overflow-hidden rounded-card border border-gray-100 bg-white p-3 shadow-card">
              <div style={{ width: '100%', height: CERT_H * scale, overflow: 'hidden' }}>
                <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>
                  <CertificateCard design={data} facts={{ ...(data.facts || {}), serial: data.serial }} />
                </div>
              </div>
            </div>

            <a href="https://tryp.com" className="block text-center text-xs font-semibold text-smoke hover:text-brand">
              Part of the Tryp.com Content Creator Community
            </a>
          </div>
        )}
      </main>
    </div>
  )
}
