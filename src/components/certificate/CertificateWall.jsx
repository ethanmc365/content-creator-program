import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../../context/AuthContext'
import { certificateLocales, dateIn, prefetchCertificateDesign, useCertificateDesign } from '../../lib/certificateLang'
import { supabase } from '../../lib/supabase'
import { Modal, Skeleton, Spinner } from '../ui'
import Icon from '../Icon'
import { cx } from '../../lib/utils'
import { notice } from '../../lib/confirm'
import { getLocale, tIn, useT } from '../../lib/i18n'
import { downloadBlob, snapshotNode } from '../../lib/domSnapshot'
import CertificateCard, { CERT_W, CERT_H } from './CertificateCard'
import { fillTemplate, formatAwardDate, sortCertificates, tierOf } from '../../lib/certificates'

// WHAT THE PROGRAMME HAS GIVEN YOU, ON A WALL.
//
// It sits UNDER the rewards ledger, and the pairing is the point: the ledger is
// what you were paid and this is what you can show for it. The certificate
// button was removed from the reward ROWS in August for a good reason - "it was
// the loudest control on a page a creator opens to check whether they have been
// paid, and it answered a question nobody had come here to ask" - and that
// argument is about a button on every row, not about a section of its own
// below. Nothing here interrupts the ledger.
//
// THE DOWNLOAD IS A PHOTOGRAPH OF THE REAL CARD, at 2x, through the same
// `snapshotNode` the shareable results use. Ethan: "ensure creators can save it
// to camera roll/download it when they receive it." On iOS the only thing that
// reliably reaches a camera roll is a blob handed to a download, which is what
// `downloadBlob` does - a link to a remote image navigates instead.
export default function CertificateWall({ profileId, className, readOnly = false }) {
  const tr = useT()
  const { profile, isAdmin } = useAuth()
  const speaks = certificateLocales(profile, { all: isAdmin }).filter((l) => l.code !== 'en')
  const [rows, setRows] = useState(null)
  const [open, setOpen] = useState(null)
  const listLang = speaks.some((l) => l.code === getLocale()) ? getLocale() : 'en'

  const load = useCallback(async () => {
    if (!profileId) return
    const { data } = await supabase.from('certificate_awards')
      .select('*, design:certificate_designs(*), person:profiles!certificate_awards_profile_id_fkey(photo_url)')
      .eq('profile_id', profileId)
      .order('awarded_at', { ascending: false })
    const sorted = sortCertificates(data || [])
    setRows(sorted)
    // Every language this person can save in, translated before they open one.
    const langs = certificateLocales(profile, { all: isAdmin })
    for (const r of sorted) prefetchCertificateDesign(r.design, langs)
  }, [profileId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [load])

  // SEEN IS MARKED WHEN THEY OPEN IT, not when the page loads. A creator who
  // scrolls past a section has not seen their certificate; a creator who opens
  // one has. That is what makes the "new" dot mean something.
  async function openOne(row) {
    setOpen(row)
    if (row.seen_at || readOnly) return
    await supabase.from('certificate_awards').update({ seen_at: new Date().toISOString() }).eq('id', row.id)
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, seen_at: new Date().toISOString() } : r)))
  }

  if (rows === null) return <Skeleton className={cx('h-40 w-full rounded-card', className)} />
  if (rows.length === 0) return null

  return (
    <section className={className}>
      <div className="mb-3">
        <h2 className="text-lg font-semibold text-ink">{tr('Your certificates')}</h2>
        <p className="mt-1 text-sm text-smoke">
          {tr('Yours to download and post. They also appear on your portfolio.')}
        </p>
        {speaks.length > 0 && (
          <p className="mt-2 inline-flex flex-wrap items-center gap-1.5 text-xs text-smoke">
            <Icon name="globe" className="h-3.5 w-3.5 text-brand" />
            {tr('Save them in English or in')}
            {speaks.map((l) => (
              <span key={l.code} className="rounded-full bg-brand-tint px-2 py-0.5 font-semibold text-brand">{l.flag} {l.native}</span>
            ))}
          </p>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {rows.map((row) => (
          <CertificateRow key={row.id} row={row} lang={listLang} readOnly={readOnly} onOpen={() => openOne(row)} />
        ))}
      </div>

      <CertificateViewer row={open} onClose={() => setOpen(null)} tr={tr} />
    </section>
  )
}

// ONE CERTIFICATE IN THE LIST, in the reader's language when they speak it.
function CertificateRow({ row, lang, readOnly, onOpen }) {
  const tr = useT()
  const { design } = useCertificateDesign(row.design, lang)
  const tier = tierOf(design?.tier)
  const accent = design?.accent || tier.accent
  const line = fillTemplate(design?.body, row.facts).split('\n')[0]
  return (
            <button
                            type="button"
              onClick={onOpen}
              className="group relative flex items-center gap-3 rounded-card border border-gray-100 bg-white p-4 text-left shadow-card transition-all duration-200 hoverable:hover:-translate-y-0.5 hoverable:hover:shadow-lift"
            >
              {/* THE CERTIFICATE ITSELF, SMALL (28 Sep 2026), rather than an icon
                  standing in for it: the thing you are about to open. */}
              <span className="relative block h-[62px] w-[88px] shrink-0 overflow-hidden rounded-lg border border-gray-100 shadow-sm" style={{ background: accent }}>
                <span className="absolute left-0 top-0 origin-top-left" style={{ transform: `scale(${88 / CERT_W})` }}>
                  <CertificateCard design={design} lang={lang} facts={{ ...(row.facts || {}), serial: row.serial, photo: row.person?.photo_url || '' }} />
                </span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-ink">{design?.title || tr('Certificate')}</span>
                {line && <span className="block truncate text-[11px] text-smoke">{line}</span>}
                {/* THE SAME DATE THE CERTIFICATE ITSELF PRINTS. `facts.date`
                    is the frozen one - the day the challenge ended - and
                    `awarded_at` is the day the row happened to be written,
                    which for the certificates backfilled onto an August
                    challenge is today. Showing one here and the other on the
                    card is two answers to one question. */}
                <span className="mt-0.5 block text-[10px] text-gray-400">
                  {lang === 'en' ? formatAwardDate(row.facts?.date || row.awarded_at) : dateIn(lang, row.facts?.date || row.awarded_at)}
                </span>
              </span>
              {!row.seen_at && !readOnly && (
                <span className="absolute right-3 top-3 h-2 w-2 rounded-full bg-brand" aria-label={tr('New')} />
              )}
              <Icon name="expand" className="h-4 w-4 shrink-0 text-gray-300 group-hover:text-brand" />
            </button>
  )
}

// THE VIEWER (30 Sep 2026). The certificate and its Instagram-story version are two
// tabs of ONE picture-taker, each with its own Save button, because Ethan wanted creators
// to "download the certificate or this Instagram story version" and to open the story
// full screen (it could only be posted, never looked at). The language chips appear only
// when the creator speaks more than English; an admin sees every language, to review the
// wording before it goes out.
function CertificateViewer({ row, onClose, tr }) {
  const { profile, isAdmin } = useAuth()
  const [node, setNode] = useState(null)
  const [storyNode, setStoryNode] = useState(null)
  const [busy, setBusy] = useState('')
  const [width, setWidth] = useState(560)
  const [holder, setHolder] = useState(null)
  const [view, setView] = useState('certificate')
  const langs = certificateLocales(profile, { all: isAdmin })
  // OPENS IN THE READER'S LANGUAGE WHEN THEY SPEAK IT (2 Oct 2026). A creator on the Portuguese
  // platform who speaks Portuguese opened every certificate in English and had to find the chip.
  const reading = getLocale()
  const startLang = langs.some((l) => l.code === reading) ? reading : 'en'
  const [lang, setLang] = useState(startLang)
  const [full, setFull] = useState(false)
  const { design, ready } = useCertificateDesign(row?.design, lang)

  useEffect(() => { setView('certificate'); setLang(startLang); setFull(false) }, [row?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!holder) return undefined
    const measure = () => setWidth(Math.max(260, holder.clientWidth))
    const ro = new ResizeObserver(measure)
    ro.observe(holder)
    measure()
    return () => ro.disconnect()
  }, [holder, view])

  const serial = (row?.serial || 'award').toLowerCase()
  const suffix = lang === 'en' ? '' : `-${lang}`

  async function snap(kind) {
    const target = kind === 'story' ? storyNode : node
    if (!target || !ready) return
    setBusy(kind)
    try {
      // CERTIFICATE x3 (3000 x 2121, A4 at print size); STORY x2 (2160 x 3840). The story
      // was 1080 x 1920 and Instagram scales a story up on a phone, which showed.
      let blob = await snapshotNode(target, kind === 'story' ? { scale: 2, background: '#d94407' } : { scale: 3 })
      if (!blob && kind === 'story') blob = await snapshotNode(target, { scale: 1, background: '#d94407' })
      if (!blob) throw new Error('empty')
      const name = kind === 'story' ? `tryp-certificate-story-${serial}${suffix}.png` : `tryp-certificate-${serial}${suffix}.png`
      const file = new File([blob], name, { type: 'image/png' })
      // The share sheet is for PHONES (straight into Instagram). A laptop's Chrome also offers
      // navigator.share, and there it opened a system sheet instead of saving the file.
      const phone = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
      if (kind === 'story' && phone && navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file] }) } catch (err) { if (err?.name !== 'AbortError') await downloadBlob(blob, name) }
      } else {
        await downloadBlob(blob, name)
      }
    } catch {
      notice(tr('That did not save. Try again in a moment.'), { title: tr('Could not save it') })
    }
    setBusy('')
  }

  if (!row) return null
  const facts = { ...(row.facts || {}), serial: row.serial, photo: row.person?.photo_url || '' }
  const scale = width / CERT_W
  const STORY_H = 470
  const storyW = Math.round(STORY_H * (1080 / 1920))
  const story = view === 'story'

  return (
    <Modal open onClose={onClose} title={design?.title || tr('Certificate')} wide>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-full bg-cloud p-1">
            {[['certificate', tr('Certificate')], ['story', tr('Instagram story')]].map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setView(k)}
                className={cx('rounded-full px-4 py-1.5 text-xs font-semibold transition-all duration-200', view === k ? 'bg-white text-brand shadow-card' : 'text-smoke hoverable:hover:text-ink')}
              >
                {label}
              </button>
            ))}
          </div>
          {langs.length > 1 && (
            <div className="flex items-center gap-2" role="group" aria-label={tr('Language')}>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{tr('Save in')}</span>
              <div className="flex flex-wrap gap-1">
                {langs.map((l) => (
                  <button
                    key={l.code}
                    type="button"
                    onClick={() => setLang(l.code)}
                    aria-pressed={lang === l.code}
                    className={cx('inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition-all duration-200', lang === l.code ? 'border-brand bg-brand text-white shadow-card' : 'border-gray-200 text-smoke hoverable:hover:-translate-y-0.5 hoverable:hover:border-brand/40 hoverable:hover:text-ink')}
                  >
                    <span aria-hidden>{l.flag}</span>{l.native}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* THE CERTIFICATE. Drawn at its true size and scaled to fit; the ref for the
            download is on the UNSCALED node, so the photograph is the full 1000x707. */}
        <div ref={setHolder} className={cx('relative overflow-hidden rounded-xl border border-gray-100 transition-opacity duration-300', story && 'hidden', !ready && 'opacity-60')}>
          <div style={{ width: '100%', height: CERT_H * scale, overflow: 'hidden' }}>
            <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>
              <CertificateCard design={design} facts={facts} cardRef={setNode} lang={lang} />
            </div>
          </div>
          <button type="button" onClick={() => setFull(true)} aria-label={tr('Full screen')} className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-ink shadow-card backdrop-blur transition-transform hoverable:hover:scale-105">
            <Icon name="expand" className="h-4 w-4" />
          </button>
        </div>

        {/* THE STORY. One StoryFrame, always mounted so it can be photographed: on the
            story tab it is scaled into view, otherwise it sits off screen at full size. */}
        {/* Off screen rather than display:none when on the certificate tab, so the story can be
            photographed from either tab (a node that is not laid out photographs as nothing). */}
        <div className={cx('flex justify-center', !story && 'pointer-events-none fixed -left-[12000px] top-0')} aria-hidden={!story}>
          <button
            type="button"
            onClick={() => setFull(true)}
            aria-label={tr('Full screen')}
            className={cx('group relative overflow-hidden rounded-2xl shadow-lift ring-1 ring-black/5 transition-opacity duration-300', !ready && 'opacity-60')}
            style={{ width: storyW, height: STORY_H }}
          >
            <div style={{ transform: `scale(${storyW / 1080})`, transformOrigin: 'top left', width: 1080, height: 1920 }}>
              <StoryFrame refCb={setStoryNode} design={design} facts={facts} lang={lang} />
            </div>
            <span className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-ink shadow-card backdrop-blur transition-transform group-hover:scale-105">
              <Icon name="expand" className="h-4 w-4" />
            </span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-[11px] tracking-wider text-gray-400">{row.serial}</span>
          <button type="button" onClick={onClose} className="btn-ghost ml-auto">{tr('Close')}</button>
          <button type="button" onClick={() => snap('story')} disabled={!!busy || !ready} className={story ? 'btn-primary' : 'btn-secondary'}>
            {busy === 'story' ? <Spinner /> : <><Icon name="download" className="h-4 w-4" /> {tr('Save story')}</>}
          </button>
          <button type="button" onClick={() => snap('certificate')} disabled={!!busy || !ready} className={story ? 'btn-secondary' : 'btn-primary'}>
            {busy === 'certificate' ? <Spinner /> : <><Icon name="download" className="h-4 w-4" /> {tr('Save certificate')}</>}
          </button>
        </div>
      </div>

      {full && (
        <FullScreen w={story ? 1080 : CERT_W} h={story ? 1920 : CERT_H} onClose={() => setFull(false)} label={tr('Close')}>
          {story
            ? <StoryFrame design={design} facts={facts} lang={lang} />
            : <CertificateCard design={design} facts={facts} lang={lang} />}
        </FullScreen>
      )}
    </Modal>
  )
}

/** A picture at its true size, scaled to the largest it can be on this screen. */
export function FullScreen({ w, h, onClose, label, children }) {
  const [size, setSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }))
  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight })
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    window.addEventListener('resize', onResize)
    document.addEventListener('keydown', onKey, true)
    return () => { window.removeEventListener('resize', onResize); document.removeEventListener('keydown', onKey, true) }
  }, [onClose])
  const k = Math.min((size.w - 24) / w, (size.h - 88) / h)
  return createPortal(
    <div className="fixed inset-0 z-[300] flex animate-fade-up flex-col items-center justify-center bg-black/90 p-3" onClick={onClose} role="dialog" aria-modal="true">
      <button type="button" onClick={onClose} aria-label={label} className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition-colors hoverable:hover:bg-white/25">
        <Icon name="close" className="h-5 w-5" />
      </button>
      <div onClick={(e) => e.stopPropagation()} className="overflow-hidden rounded-2xl shadow-2xl" style={{ width: w * k, height: h * k }}>
        <div style={{ transform: `scale(${k})`, transformOrigin: 'top left', width: w, height: h }}>{children}</div>
      </div>
    </div>,
    document.body,
  )
}

/**
 * 1080 x 1920: the certificate on the brand gradient, for a story.
 *
 * EXPORTED SINCE 28 Sep 2026, so the studio can show an admin what they are
 * actually giving out. It is photographed at 2x (2160 x 3840) since 30 Sep, and it
 * says "I just earned" - in the creator's voice, because it is theirs to post.
 */
export function StoryFrame({ refCb, design, facts, lang = 'en' }) {
  const W = 1080
  const inner = 960
  return (
    <div
      ref={refCb}
      style={{
        width: W, height: 1920, position: 'relative', overflow: 'hidden', fontFamily: 'Poppins, system-ui, sans-serif',
        background: 'linear-gradient(160deg,#d94407 0%,#f5853f 60%,#ffb37a 100%)', color: '#ffffff',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 56,
      }}
    >
      <div style={{ position: 'absolute', right: -220, top: -220, width: 720, height: 720, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 68%)' }} />
      <div style={{ textAlign: 'center', padding: '0 80px' }}>
        <p style={{ margin: 0, fontSize: 30, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', opacity: 0.85 }}>{tIn(lang, 'I just earned')}</p>
        <p style={{ margin: '18px 0 0', fontSize: 64, fontWeight: 700, lineHeight: 1.08, letterSpacing: '-0.02em' }}>{design?.title || tIn(lang, 'Certificate')}</p>
      </div>
      <div style={{ width: inner, height: CERT_H * (inner / CERT_W), borderRadius: 28, overflow: 'hidden', boxShadow: '0 40px 90px rgba(0,0,0,0.28)' }}>
        <div style={{ transform: `scale(${inner / CERT_W})`, transformOrigin: 'top left' }}>
          <CertificateCard design={design} facts={facts} lang={lang} />
        </div>
      </div>
      <img src="/brand/tryp-wordmark-white.svg" alt="Tryp.com" crossOrigin="anonymous" style={{ height: 56, width: 'auto' }} />
    </div>
  )
}
