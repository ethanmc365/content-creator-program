import { useCallback, useEffect, useRef, useState } from 'react'
import { Modal, Spinner } from './ui'
import Certificate, { CERTIFICATE_W } from './Certificate'
import { snapshotNode, downloadBlob, slugForFile } from '../lib/domSnapshot'
import { useT } from '../lib/i18n'

// The certificate, previewed exactly as it will save, with the two things a
// creator actually wants to do with it. Share first on a phone (it opens
// Instagram, WhatsApp, the lot); download everywhere else.
export default function CertificateModal({ open, onClose, reward, result }) {
  const tr = useT()
  const cardRef = useRef(null)
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const shoot = useCallback(() => snapshotNode(cardRef.current, { scale: 2 }), [])

  useEffect(() => {
    if (!open) return
    let dead = false
    let url
    setError('')
    const t = setTimeout(() => {
      shoot()
        .then((blob) => {
          if (dead || !blob) return
          url = URL.createObjectURL(blob)
          setPreview(url)
        })
        .catch((e) => setError(e.message ?? 'The certificate could not be drawn.'))
    }, 120)
    return () => {
      dead = true
      clearTimeout(t)
      if (url) URL.revokeObjectURL(url)
      setPreview(null)
    }
  }, [open, shoot, reward?.id])

  if (!reward) return null

  const name = reward.profiles?.name ?? reward.creator_name ?? ''
  const challenge = reward.challenges?.title ?? ''
  const prize = reward.reward_type === 'cash'
    ? `a ${reward.currency === 'GBP' ? '£' : ''}${Number(reward.amount)} cash prize`
    : reward.payment_notes?.split(' - ')[0] || 'a Tryp.com voucher'
  const file = slugForFile(challenge || 'tryp', 'certificate')

  async function save() {
    setBusy(true)
    try {
      const blob = await shoot()
      // A phone can put this straight into a story; a laptop cannot, and
      // `canShare` is the only honest way to know which one you are holding.
      const filed = blob ? new File([blob], file, { type: 'image/png' }) : null
      if (filed && navigator.canShare?.({ files: [filed] })) await navigator.share({ files: [filed] })
      else downloadBlob(blob, file)
    } catch (e) {
      // A cancelled share is not an error worth showing.
      if (e?.name !== 'AbortError') setError(e.message ?? 'Could not save that.')
    }
    setBusy(false)
  }

  return (
    <>
      {open && (
        <div aria-hidden style={{ position: 'fixed', top: 0, left: '-20000px', width: `${CERTIFICATE_W}px`, pointerEvents: 'none', zIndex: -1 }}>
          <Certificate
            cardRef={cardRef}
            name={name}
            prize={prize}
            challenge={challenge}
            rank={result?.rank ?? null}
            views={result?.final_views ?? null}
            date={reward.distributed_at || reward.created_at}
          />
        </div>
      )}

      <Modal open={open} onClose={onClose} title={tr("Your certificate")}>
        <div className="space-y-5">
          <div className="overflow-hidden rounded-card border border-gray-100 bg-cloud/40 p-3">
            {preview ? (
              <img src={preview} alt="Your certificate" className="mx-auto block w-full rounded-lg" />
            ) : (
              <div className="flex h-48 items-center justify-center text-sm text-smoke">
                <Spinner className="mr-2 h-4 w-4" /> {tr("Making it…")}
              </div>
            )}
          </div>
          {error ? <p className="text-sm text-brand">{error}</p> : null}
          <p className="text-xs text-smoke">{tr("Post it, print it, put it on your story. It is yours.")}</p>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary !py-2 text-sm" onClick={onClose}>{tr("Close")}</button>
            <button type="button" className="btn-primary !py-2 text-sm" onClick={save} disabled={busy || !preview}>
              {busy ? <Spinner className="h-4 w-4" /> : null} Save it
            </button>
          </div>
        </div>
      </Modal>
    </>
  )
}
