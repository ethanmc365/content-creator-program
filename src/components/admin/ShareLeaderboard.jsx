import { useCallback, useEffect, useState } from 'react'
import { Modal, Spinner } from '../ui'
import Icon from '../Icon'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { SHAREABLE_ROOMS, postToRooms } from '../../lib/announce'
import { renderPodium, renderLeaderboard, downloadBlob, slugForFile } from '../../lib/shareGraphics'
import { uploadFile } from '../../lib/upload'

// Sharing the result of a challenge, as a picture.
//
//   The podium      the top three on a podium, the voucher row included, drawn
//                   to match WinnersPodium.
//   The leaderboard every place in order with the voucher marked against
//                   whoever earned it. The thing a top-three graphic cannot
//                   show, and the thing most creators are actually looking for.
//
// Both are drawn on canvas (lib/shareGraphics.js). Snapshotting the real
// components would be better and was tried; html-to-image hangs in this app,
// measured on a plain text div with no images, so it is not an option.

export default function ShareLeaderboard({
  open, onClose, challenge, winners = [], ranking = [], entries, totalViews,
  voucherWinners = [], voucherPrize = '', onDone,
}) {
  const { user } = useAuth()
  const [what, setWhat] = useState('podium')
  const [room, setRoom] = useState('announcements')
  const [note, setNote] = useState('')
  const [preview, setPreview] = useState(null)
  const [market, setMarket] = useState(null)
  const [busy, setBusy] = useState(false)
  const [drawing, setDrawing] = useState(false)
  const [error, setError] = useState('')

  const voucherIds = new Set(voucherWinners.map((v) => v?.id).filter(Boolean))

  // Which room this actually lands in, said out loud. Today every challenge is
  // the UK's, so the answer is always the same - but it will not be, and a
  // dialog that says "Announcements" without saying WHOSE is the one that
  // eventually posts a Spanish leaderboard to the wrong country.
  useEffect(() => {
    if (!open) return
    let dead = false
    const id = challenge?.community_id
    if (!id) return setMarket({ name: 'Worldwide' })
    supabase.from('communities').select('name').eq('id', id).maybeSingle()
      .then(({ data }) => { if (!dead) setMarket(data ?? null) })
    return () => { dead = true }
  }, [open, challenge?.community_id])

  const render = useCallback(async () => {
    const shared = {
      title: challenge?.title ?? 'Challenge', entries, totalViews, voucherPrize,
      // A points challenge is scored in points. Without this the picture says
      // "views" under numbers that are not views, which the panel beside it
      // does not.
      scoring: challenge?.scoring,
    }
    return what === 'podium'
      ? renderPodium({ ...shared, winners, voucherWinners })
      : renderLeaderboard({ ...shared, ranking, voucherIds })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [what, challenge?.title, challenge?.scoring, entries, totalViews, voucherPrize, winners, ranking, voucherWinners])

  // Draw whichever is selected, so what you send is what you have already seen.
  useEffect(() => {
    if (!open) return
    let dead = false
    let url
    setDrawing(true)
    const t = setTimeout(() => {
      render()
        .then((blob) => {
          if (dead || !blob) return setDrawing(false)
          url = URL.createObjectURL(blob)
          setPreview(url)
          setDrawing(false)
        })
        .catch(() => setDrawing(false))
    }, 120)
    return () => {
      dead = true
      clearTimeout(t)
      if (url) URL.revokeObjectURL(url)
      setPreview(null)
    }
  }, [open, what, render])

  useEffect(() => {
    if (open) { setError(''); setNote('') }
  }, [open])

  async function share() {
    setBusy(true)
    setError('')
    try {
      const blob = await render()
      if (!blob) throw new Error('The image could not be drawn. Try again.')
      const path = `leaderboards/${challenge.id}-${what}-${Date.now()}.png`
      const image_url = await uploadFile('chat-media', path, blob, 'image/png')

      const { posted, error: postError } = await postToRooms({
        communityIds: challenge?.community_id ? [challenge.community_id] : [],
        base: room,
        senderId: user.id,
        body: note.trim(),
        extra: { image_url },
      })
      if (postError) throw postError

      onDone?.(
        posted
          ? `Shared to ${posted === 1 ? 'the room' : `${posted} rooms`}.`
          : 'No matching room was found for this challenge.',
      )
      onClose?.()
    } catch (e) {
      setError(e.message ?? 'Could not share that.')
    }
    setBusy(false)
  }

  async function download() {
    const blob = await render()
    downloadBlob(blob, slugForFile(challenge?.title, what === 'podium' ? 'winners' : 'leaderboard'))
  }

  return (
    <>
      <Modal open={open} onClose={onClose} title="Share the result">
        <div className="space-y-6">
          <div>
            <p className="label">What to share</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { key: 'podium', title: 'The podium', hint: 'Every winning place, the vouchers and the totals.' },
                { key: 'table', title: 'The leaderboard', hint: 'Every place down to tenth, with the vouchers marked.' },
              ].map((o) => (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => setWhat(o.key)}
                  className={
                    what === o.key
                      ? 'rounded-card border-2 border-brand bg-brand-tint/40 p-4 text-left transition-all'
                      : 'rounded-card border border-gray-200 p-4 text-left transition-all hover:border-brand'
                  }
                >
                  <p className="text-sm font-semibold">{o.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-smoke">{o.hint}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-hidden rounded-card border border-gray-100 bg-cloud/40 p-3">
            {preview && !drawing ? (
              <img src={preview} alt="Exactly what will be shared" className="mx-auto block w-full max-w-[320px]" />
            ) : (
              <div className="flex h-56 items-center justify-center text-sm text-smoke">
                <Spinner className="mr-2 h-4 w-4" /> Drawing it…
              </div>
            )}
          </div>

          <div>
            <p className="label">Where it goes</p>
            <div className="space-y-2">
              {SHAREABLE_ROOMS.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => setRoom(r.key)}
                  className={
                    room === r.key
                      ? 'flex w-full items-center gap-3 rounded-card border-2 border-brand bg-brand-tint/40 px-4 py-3 text-left'
                      : 'flex w-full items-center gap-3 rounded-card border border-gray-200 px-4 py-3 text-left hover:border-brand'
                  }
                >
                  <Icon
                    name={r.key === 'announcements' ? 'megaphone' : r.key === 'general' ? 'chat' : 'bulb'}
                    className={`h-4 w-4 shrink-0 ${room === r.key ? 'text-brand' : 'text-smoke'}`}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">
                      {market?.name ? `${market.name} ${r.label.toLowerCase()}` : r.label}
                    </span>
                    <span className="block text-xs text-smoke">{r.hint}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="label">Say something (optional)</span>
            <textarea
              className="input min-h-[80px]"
              placeholder="Congratulations to everyone who entered."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>

          {error ? <p className="text-sm text-brand">{error}</p> : null}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <button type="button" className="btn-secondary !py-2 text-sm" onClick={download} disabled={busy}>
              Download the image
            </button>
            <div className="flex gap-2">
              <button type="button" className="btn-secondary !py-2 text-sm" onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <button type="button" className="btn-primary !py-2 text-sm" onClick={share} disabled={busy || drawing}>
                {busy ? <Spinner className="h-4 w-4" /> : null}
                {busy ? 'Sharing…' : 'Share'}
              </button>
            </div>
          </div>
        </div>
      </Modal>
    </>
  )
}
