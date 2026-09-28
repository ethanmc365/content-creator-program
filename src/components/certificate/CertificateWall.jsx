import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Modal, Skeleton, Spinner } from '../ui'
import Icon from '../Icon'
import { cx } from '../../lib/utils'
import { notice } from '../../lib/confirm'
import { useT } from '../../lib/i18n'
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
  const [rows, setRows] = useState(null)
  const [open, setOpen] = useState(null)

  const load = useCallback(async () => {
    if (!profileId) return
    const { data } = await supabase.from('certificate_awards')
      .select('*, design:certificate_designs(*), person:profiles!certificate_awards_profile_id_fkey(photo_url)')
      .eq('profile_id', profileId)
      .order('awarded_at', { ascending: false })
    setRows(sortCertificates(data || []))
  }, [profileId])
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
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {rows.map((row) => {
          const tier = tierOf(row.design?.tier)
          const accent = row.design?.accent || tier.accent
          const line = fillTemplate(row.design?.body, row.facts).split('\n')[0]
          return (
            <button
              key={row.id}
              type="button"
              onClick={() => openOne(row)}
              className="group relative flex items-center gap-3 rounded-card border border-gray-100 bg-white p-4 text-left shadow-card transition-all duration-200 hoverable:hover:-translate-y-0.5 hoverable:hover:shadow-lift"
            >
              {/* THE CERTIFICATE ITSELF, SMALL (28 Sep 2026), rather than an icon
                  standing in for it: the thing you are about to open. */}
              <span className="relative block h-[62px] w-[88px] shrink-0 overflow-hidden rounded-lg border border-gray-100 shadow-sm" style={{ background: accent }}>
                <span className="absolute left-0 top-0 origin-top-left" style={{ transform: `scale(${88 / CERT_W})` }}>
                  <CertificateCard design={row.design} facts={{ ...(row.facts || {}), serial: row.serial, photo: row.person?.photo_url || '' }} />
                </span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-ink">{row.design?.title || tr('Certificate')}</span>
                {line && <span className="block truncate text-[11px] text-smoke">{line}</span>}
                {/* THE SAME DATE THE CERTIFICATE ITSELF PRINTS. `facts.date`
                    is the frozen one - the day the challenge ended - and
                    `awarded_at` is the day the row happened to be written,
                    which for the certificates backfilled onto an August
                    challenge is today. Showing one here and the other on the
                    card is two answers to one question. */}
                <span className="mt-0.5 block text-[10px] text-gray-400">
                  {formatAwardDate(row.facts?.date || row.awarded_at)}
                </span>
              </span>
              {!row.seen_at && !readOnly && (
                <span className="absolute right-3 top-3 h-2 w-2 rounded-full bg-brand" aria-label={tr('New')} />
              )}
              <Icon name="expand" className="h-4 w-4 shrink-0 text-gray-300 group-hover:text-brand" />
            </button>
          )
        })}
      </div>

      <CertificateViewer row={open} onClose={() => setOpen(null)} tr={tr} />
    </section>
  )
}

function CertificateViewer({ row, onClose, tr }) {
  const [node, setNode] = useState(null)
  const [busy, setBusy] = useState(false)
  const [width, setWidth] = useState(560)
  const [holder, setHolder] = useState(null)

  useEffect(() => {
    if (!holder) return undefined
    const measure = () => setWidth(Math.max(260, holder.clientWidth))
    const ro = new ResizeObserver(measure)
    ro.observe(holder)
    measure()
    return () => ro.disconnect()
  }, [holder])

  async function save() {
    if (!node) return
    setBusy(true)
    try {
      // THREE TIMES THE SIZE (28 Sep 2026): 3000 x 2121, sharp enough to print
      // at A4 ("surely it can be downloaded in high quality").
      const blob = await snapshotNode(node, { scale: 3 })
      if (!blob) throw new Error('empty')
      const name = `tryp-certificate-${(row.serial || 'award').toLowerCase()}.png`
      await downloadBlob(blob, name)
    } catch {
      notice(tr('That did not save. Try again in a moment.'), { title: tr('Could not save it') })
    }
    setBusy(false)
  }

  // SHARE TO A STORY (28 Sep 2026). Ethan: certificates should "be shared on
  // their story too." A 1080 x 1920 picture - the certificate on the Tryp.com
  // gradient with a line above it - drawn off screen and handed to the phone's
  // share sheet (Instagram and TikTok are on it), or downloaded on a laptop.
  const [storyNode, setStoryNode] = useState(null)
  const [sharing, setSharing] = useState(false)
  async function shareStory() {
    if (!storyNode) return
    setSharing(true)
    try {
      const blob = await snapshotNode(storyNode, { scale: 1, background: '#d94407' })
      if (!blob) throw new Error('empty')
      const name = `tryp-certificate-story-${(row.serial || 'award').toLowerCase()}.png`
      const file = new File([blob], name, { type: 'image/png' })
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file] })
        } catch (err) {
          if (err?.name !== 'AbortError') await downloadBlob(blob, name)
        }
      } else {
        await downloadBlob(blob, name)
      }
    } catch {
      notice(tr('That did not save. Try again in a moment.'), { title: tr('Could not save it') })
    }
    setSharing(false)
  }

  if (!row) return null
  const facts = { ...(row.facts || {}), serial: row.serial, photo: row.person?.photo_url || '' }
  const scale = width / CERT_W

  return (
    <Modal open onClose={onClose} title={row.design?.title || tr('Certificate')} wide>
      <div className="space-y-4">
        <div ref={setHolder} className="overflow-hidden rounded-xl border border-gray-100">
          {/* The card is drawn at its true size and scaled to fit. The ref for
              the download is on the UNSCALED node, so the photograph is the
              full 1000x707 whatever the screen is. */}
          <div style={{ width: '100%', height: CERT_H * scale, overflow: 'hidden' }}>
            <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>
              <CertificateCard design={row.design} facts={facts} cardRef={setNode} />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-[11px] tracking-wider text-gray-400">{row.serial}</span>
          <button type="button" onClick={onClose} className="btn-ghost ml-auto">{tr('Close')}</button>
          <button type="button" onClick={shareStory} disabled={sharing} className="btn-secondary">
            {sharing ? <Spinner /> : <><Icon name="share" className="h-4 w-4" /> {tr('Share to your story')}</>}
          </button>
          <button type="button" onClick={save} disabled={busy} className="btn-primary">
            {busy ? <Spinner /> : <><Icon name="download" className="h-4 w-4" /> {tr('Save the picture')}</>}
          </button>
        </div>
        {/* The story picture, drawn at full size where nobody can see it. */}
        <div aria-hidden style={{ position: 'fixed', left: -12000, top: 0, pointerEvents: 'none' }}>
          <StoryFrame refCb={setStoryNode} design={row.design} facts={facts} />
        </div>
      </div>
    </Modal>
  )
}

/** 1080 x 1920: the certificate on the brand gradient, for a story. */
function StoryFrame({ refCb, design, facts }) {
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
        <p style={{ margin: 0, fontSize: 30, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', opacity: 0.85 }}>Just earned</p>
        <p style={{ margin: '18px 0 0', fontSize: 64, fontWeight: 700, lineHeight: 1.08, letterSpacing: '-0.02em' }}>{design?.title || 'A certificate'}</p>
      </div>
      <div style={{ width: inner, height: CERT_H * (inner / CERT_W), borderRadius: 28, overflow: 'hidden', boxShadow: '0 40px 90px rgba(0,0,0,0.28)' }}>
        <div style={{ transform: `scale(${inner / CERT_W})`, transformOrigin: 'top left' }}>
          <CertificateCard design={design} facts={facts} />
        </div>
      </div>
      <img src="/brand/tryp-wordmark-white.svg" alt="Tryp.com" crossOrigin="anonymous" style={{ height: 56, width: 'auto' }} />
    </div>
  )
}
