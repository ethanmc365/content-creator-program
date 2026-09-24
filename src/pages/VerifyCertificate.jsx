import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { copyToClipboard } from '../lib/clipboard'
import Icon from '../components/Icon'
import CertificateCard, { CERT_W, CERT_H } from '../components/certificate/CertificateCard'
import { designStyle, fillTemplate, formatAwardDate } from '../lib/certificates'
import { useFluidWidth } from '../components/portfolio/PortfolioDeck'

// IS THIS CERTIFICATE REAL?
//
// The serial is printed on the face of every certificate, on the reasoning that
// a brand can be told what to ask for. That is half a feature; this is the
// other half, and it is what separates a credential from a JPEG - anybody can
// make a picture that says "Certificate of Achievement", and nobody can make
// one whose code resolves here.
//
// OUTSIDE THE APP SHELL, like the public portfolio. The person checking is a
// brand or a recruiter who has never heard of this platform and is not going to
// sign into it. That is also why there is no framer-motion here: this page has
// its own entry in the bundle graph and a stranger checking one code should not
// download an animation library to do it. Everything that moves below is CSS
// keyframes the app already ships, and the platform's global
// `prefers-reduced-motion` rule turns all of them off.
//
// THE PAGE SHOWS THE CERTIFICATE ITSELF, not a row of fields saying
// "valid: true". The whole question is "does this match the picture I am
// holding", and the only answer that settles it is the picture. (Which is also
// why migration 231 had to add `layout` and `paper` to the lookup - without
// them this page answered with a different-looking certificate, which answers
// "no".)
//
// ---------------------------------------------------------------------------
// THE REDESIGN (20 Sep 2026)
//
// Ethan: "we also have the certificate check page. I think that's good, but you
// need to improve the design of it. Currently, the design is really bad. The
// logo shows, but it's squished. And just improve the overall design, matching
// the platform, have clean animations there."
//
// The squish was real and it is the same bug three other surfaces had: the logo
// asset is a 1200x630 card and it was drawn in an `h-8 w-8` box, so a wide
// lockup was crushed into a square. Fixed height, automatic width, everywhere.
//
// The rest was a page that looked like a form with results under it. What it is
// now is a page with one job per state: ASK when there is nothing to show,
// ANSWER when there is. The answer leads with a verdict somebody can read
// across a desk, carries the certificate at the size of the thing it is
// checking, and puts the four facts that were frozen at award time beside it -
// so a recruiter gets the whole answer without scrolling back to the picture.
// ---------------------------------------------------------------------------
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
    document.title = `${row.facts?.name || 'Certificate'} — verified by Tryp.com`
  }, [])

  useEffect(() => { if (serial) look(serial) }, [serial, look])

  const scale = Math.min(1, width / CERT_W)

  return (
    <div className="min-h-screen bg-cloud/50">
      <Header />

      <main className="mx-auto max-w-4xl px-5 pb-20 pt-8 sm:px-8 sm:pt-12">
        <Ask
          typed={typed}
          setTyped={setTyped}
          busy={state === 'loading'}
          onSubmit={(code) => {
            // Through the URL, so a checked certificate is a link somebody can
            // send on - which is the whole point of a credential id.
            navigate(`/verify/${encodeURIComponent(code)}`)
          }}
        />

        {/* `key` on the state, so React remounts the panel and the entrance
            animation actually runs on every answer rather than only the first.
            An animation that plays once and then never again is the kind of
            polish that reads as a bug the second time you use the page. */}
        <div key={state} className="animate-fade-up">
          {state === 'idle' && <Idle />}
          {state === 'loading' && <Loading />}
          {state === 'missing' && <Missing code={serial} />}
          {state === 'found' && data && (
            <Found data={data} holder={holder} scale={scale} />
          )}
        </div>
      </main>

      <footer className="border-t border-gray-200/70 bg-white">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-5 py-6 sm:px-8">
          <p className="text-[12px] text-smoke">
            Certificates are issued by the Tryp.com Content Creator Community.
          </p>
          <a
            href="https://tryp.com"
            className="text-[12px] font-semibold text-brand transition-colors hover:text-brand-light"
          >
            tryp.com →
          </a>
        </div>
      </footer>
    </div>
  )
}

/**
 * THE LOGO AT ITS OWN SHAPE.
 *
 * It was `h-8 w-8 rounded-lg` on a 1200x630 asset - Ethan: "the logo shows, but
 * it's squished". A fixed HEIGHT and an automatic width is the only treatment
 * that is correct for a lockup, and it is what the certificate, the portfolio
 * cover and the kit strip all had to be fixed to do as well.
 */
function Header() {
  return (
    <header className="sticky top-0 z-10 border-b border-gray-200/70 bg-white/85 backdrop-blur">
      <div className="mx-auto flex max-w-4xl items-center gap-3 px-5 py-3.5 sm:px-8">
        <img src="/brand/tryp-logo.png" alt="Tryp.com" className="h-8 w-auto shrink-0 rounded-md" />
        <span className="h-5 w-px shrink-0 bg-gray-200" />
        <div className="min-w-0">
          <p className="truncate text-sm font-bold leading-tight text-ink">Certificate check</p>
          <p className="truncate text-[11px] leading-tight text-smoke">Content Creator Community</p>
        </div>
      </div>
    </header>
  )
}

/** The one control on the page. */
function Ask({ typed, setTyped, busy, onSubmit }) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const code = typed.trim()
        if (code) onSubmit(code)
      }}
      className="mb-8 rounded-card border border-gray-100 bg-white p-4 shadow-card sm:p-5"
    >
      <label htmlFor="serial" className="label">The code on the certificate</label>
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-[200px] flex-1">
          <Icon name="magnifier" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-300" />
          <input
            id="serial"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="TRYP-2026-XXXXXX"
            // Uppercase on screen because that is how it is printed. The lookup
            // is case-insensitive anyway, so nobody is punished for typing it
            // in lower case.
            className="input !pl-10 font-mono uppercase tracking-[0.12em]"
            autoComplete="off"
            spellCheck="false"
            autoCapitalize="characters"
          />
        </div>
        <button type="submit" disabled={busy || !typed.trim()} className="btn-primary shrink-0 disabled:opacity-40">
          {busy ? 'Checking…' : 'Check it'}
        </button>
      </div>
    </form>
  )
}

function Idle() {
  return (
    <div className="rounded-card border border-dashed border-gray-200 bg-white/60 px-6 py-14 text-center">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-tint text-brand">
        <Icon name="shield" className="h-7 w-7" />
      </span>
      <h1 className="mt-5 text-lg font-bold text-ink">Check a Tryp.com certificate</h1>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-smoke">
        Every certificate this community issues carries a code at its foot.
        Type it above and the real one appears here, exactly as it was awarded.
      </p>
    </div>
  )
}

/**
 * A SHAPE, NOT A SPINNER.
 *
 * The old loading state was a spinner in the middle of nothing, so the page
 * jumped from a blank centre to a full answer. A skeleton in the shape of the
 * answer means the layout is already correct before the data lands and only the
 * content fades in - which is the difference between a page that loads and a
 * page that lurches.
 */
function Loading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Checking">
      <div className="h-[70px] animate-pulse rounded-card bg-white" />
      <div className="animate-pulse rounded-card bg-white" style={{ aspectRatio: `${CERT_W} / ${CERT_H}` }} />
    </div>
  )
}

function Missing({ code }) {
  return (
    <div className="rounded-card border border-gray-100 bg-white p-8 text-center shadow-card sm:p-10">
      <span className="mx-auto flex h-14 w-14 animate-pop-in items-center justify-center rounded-full bg-gray-100 text-gray-400">
        <Icon name="close" className="h-7 w-7" />
      </span>
      <h1 className="mt-5 text-lg font-bold text-ink">No certificate with that code</h1>
      {code && (
        <p className="mt-2 font-mono text-[13px] uppercase tracking-[0.12em] text-gray-400">{code}</p>
      )}
      <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-smoke">
        Check it again — it is six characters after the year, and the letters
        O and I are never used, so a nought is a zero and a one is a one.
        If it still does not come up, this was not issued by Tryp.com.
      </p>
    </div>
  )
}

/**
 * THE ANSWER.
 *
 * Verdict, then the picture, then the facts. In that order because they answer
 * three different questions in the order a person asks them: is it real, is it
 * the one I am holding, and what does it actually say.
 */
function Found({ data, holder, scale }) {
  const facts = data.facts || {}
  const s = designStyle(data)
  const awarded = facts.date || data.awarded_at
  // The body is the sentence the design prints, filled with the frozen facts -
  // so this panel and the certificate can never disagree about what it is for.
  const forWhat = fillTemplate(data.body, facts).split('\n').filter(Boolean).join(' · ')
  const link = typeof window !== 'undefined' ? `${window.location.origin}/verify/${data.serial}` : ''

  return (
    <div className="space-y-5">
      <Verdict name={facts.name} date={awarded} accent={s.accent} />

      <div ref={holder} className="overflow-hidden rounded-card border border-gray-100 bg-white p-2.5 shadow-card sm:p-3">
        {/* The card is drawn at its true 1000x707 and scaled to fit, so what is
            on screen is the same pixels as the file the creator downloaded. */}
        <div style={{ width: '100%', height: CERT_H * scale, overflow: 'hidden' }}>
          <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: CERT_W }}>
            <CertificateCard design={data} facts={{ ...facts, serial: data.serial }} />
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Panel title="What it is for">
          <p className="text-sm leading-relaxed text-ink">{forWhat || data.title}</p>
          {facts.challenge && (
            <Line label="Challenge" value={facts.challenge} />
          )}
          {facts.market && <Line label="Market" value={facts.market} />}
          {facts.views != null && <Line label="Views at the deadline" value={Number(facts.views).toLocaleString()} />}
          {facts.milestone && <Line label="Milestone" value={facts.milestone} />}
        </Panel>

        <Panel title="The record">
          <Line label="Awarded to" value={facts.name || 'A Tryp.com creator'} />
          <Line label="Awarded" value={awarded ? formatAwardDate(awarded) : '—'} />
          <Line label="Certificate ID" value={data.serial} mono />
          {/* A CHECKED CERTIFICATE SHOULD BE SENDABLE. The reason the lookup
              goes through the URL at all is so this link exists; leaving the
              person to select it out of the address bar wastes that.
              `CopyButton` from ui/ is deliberately icon-only - it lives in tight
              rows next to what it copies - and a bare clipboard glyph under
              "Certificate ID" would read as copying the ID. This one says what
              it does. */}
          <CopyLink value={link} />
        </Panel>
      </div>
    </div>
  )
}

/**
 * The verdict banner.
 *
 * The tick DRAWS itself rather than appearing - two hundred milliseconds of
 * stroke-dashoffset, which is the one place on this page where an animation is
 * carrying meaning rather than decorating: it reads as a check being performed,
 * and it lands exactly when the answer does.
 */
function Verdict({ name, date, accent }) {
  return (
    <div className="flex items-center gap-4 overflow-hidden rounded-card border border-green-200 bg-white px-5 py-4 shadow-card">
      <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-green-500 text-white">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
          <path d="M4.5 12.5l5 5 10-11" className="verify-tick" pathLength="1" />
        </svg>
        {/* One ring, once. A repeating pulse on a verdict reads as "still
            checking"; a single expanding ring reads as the moment it settled. */}
        <span aria-hidden className="verify-ring absolute inset-0 rounded-full border-2 border-green-400" />
      </span>
      <div className="min-w-0">
        <p className="text-[15px] font-bold leading-snug text-ink">
          This is a genuine Tryp.com certificate
        </p>
        <p className="mt-0.5 truncate text-[13px] text-smoke">
          Awarded to <span className="font-semibold text-ink">{name || 'a creator'}</span>
          {date ? ` on ${formatAwardDate(date)}` : ''}.
        </p>
      </div>
      <span
        aria-hidden
        className="ml-auto hidden h-10 w-1.5 shrink-0 rounded-full sm:block"
        style={{ background: accent }}
      />
    </div>
  )
}

function Panel({ title, children }) {
  return (
    <section className="space-y-2.5 rounded-card border border-gray-100 bg-white p-5 shadow-card">
      <h2 className="text-[10px] font-bold uppercase tracking-[0.16em] text-gray-400">{title}</h2>
      {children}
    </section>
  )
}

function Line({ label, value, mono = false }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-gray-50 pt-2.5 first:border-0 first:pt-0">
      <span className="shrink-0 text-[12px] text-smoke">{label}</span>
      <span className={`min-w-0 break-words text-right text-[13px] font-semibold text-ink${mono ? ' font-mono tracking-[0.1em]' : ''}`}>
        {value}
      </span>
    </div>
  )
}

/**
 * Copy the link to THIS check, with its own label.
 *
 * Not `ui/CopyButton`: that one is an icon in a row beside the value it copies,
 * and here there is no such row - an unlabelled clipboard glyph under
 * "Certificate ID" reads as "copy the id", which is not what it does.
 */
function CopyLink({ value }) {
  const [done, setDone] = useState(false)
  useEffect(() => {
    if (!done) return undefined
    const t = setTimeout(() => setDone(false), 1600)
    return () => clearTimeout(t)
  }, [done])
  return (
    <button
      type="button"
      onClick={async () => {
        const ok = await copyToClipboard(value)
        if (ok) setDone(true)
      }}
      className="mt-1 inline-flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-[12px] font-semibold text-smoke transition-all hover:-translate-y-px hover:border-brand/40 hover:text-brand"
    >
      <Icon name={done ? 'check' : 'link'} className={`h-3.5 w-3.5${done ? ' text-green-600' : ''}`} />
      {done ? 'Link copied' : 'Copy this check link'}
    </button>
  )
}
