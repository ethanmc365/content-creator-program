import { useEffect, useState } from 'react'
import { Modal, Spinner } from '../ui'
import Icon from '../Icon'
import { useAuth } from '../../context/AuthContext'
import { SHAREABLE_ROOMS, postToRooms } from '../../lib/announce'
import { generatePodiumImage, downloadPodiumImage } from '../../lib/podiumImage'
import { uploadFile } from '../../lib/upload'

// Sharing the result of a challenge.
//
// There used to be one button, "Share to Announcements", which posted the
// interactive leaderboard card and nothing else. Two things were missing: the
// podium as an actual IMAGE, which is the thing anybody would want to send on or
// put in a story, and any choice about WHERE it lands - a leaderboard is not
// always worth notifying a whole market about.
//
// So: pick what, pick where, add a note if you want. The image is drawn on
// canvas in the browser (lib/podiumImage.js), uploaded to the chat bucket, and
// posted as an ordinary message, which means it renders and downloads like any
// other photo with no new plumbing behind it.

export default function ShareLeaderboard({ open, onClose, challenge, winners, entries, totalViews, onDone }) {
  const { user } = useAuth()
  const [what, setWhat] = useState('image')
  const [room, setRoom] = useState('announcements')
  const [note, setNote] = useState('')
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Draw the image as soon as the dialog opens, so what you send is what you
  // have already seen rather than a description of it.
  useEffect(() => {
    if (!open) return
    let dead = false
    let url
    generatePodiumImage({ title: challenge?.title ?? 'Challenge', winners, entries, totalViews })
      .then((blob) => {
        if (dead || !blob) return
        url = URL.createObjectURL(blob)
        setPreview(url)
      })
      .catch(() => {})
    return () => {
      dead = true
      if (url) URL.revokeObjectURL(url)
      setPreview(null)
    }
  }, [open, challenge?.title, winners, entries, totalViews])

  useEffect(() => {
    if (open) { setError(''); setNote('') }
  }, [open])

  async function share() {
    setBusy(true)
    setError('')
    try {
      const extra = {}

      if (what === 'image') {
        const blob = await generatePodiumImage({
          title: challenge?.title ?? 'Challenge', winners, entries, totalViews,
        })
        if (!blob) throw new Error('The image could not be drawn.')
        const path = `leaderboards/${challenge.id}-${winners.length}-winners.png`
        extra.image_url = await uploadFile('chat-media', path, blob, 'image/png')
      } else {
        extra.leaderboard_challenge_id = challenge.id
      }

      const { posted, error: postError } = await postToRooms({
        communityIds: challenge?.community_id ? [challenge.community_id] : [],
        base: room,
        senderId: user.id,
        body: note.trim(),
        extra,
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

  return (
    <Modal open={open} onClose={onClose} title="Share the result">
      <div className="space-y-6">
        <div>
          <p className="label">What to share</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { key: 'image', title: 'The podium graphic', hint: 'A picture creators can save and repost.' },
              { key: 'card', title: 'The leaderboard card', hint: 'The interactive standings, inside the app.' },
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

        {what === 'image' ? (
          <div className="overflow-hidden rounded-card border border-gray-100 bg-cloud/40">
            {preview ? (
              <img src={preview} alt="The podium as it will be shared" className="mx-auto block w-full max-w-sm" />
            ) : (
              <div className="flex h-56 items-center justify-center text-sm text-smoke">
                <Spinner className="mr-2 h-4 w-4" /> Drawing it…
              </div>
            )}
          </div>
        ) : null}

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
                  <span className="block text-sm font-semibold">{r.label}</span>
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
          <button
            type="button"
            className="btn-secondary !py-2 text-sm"
            onClick={() => downloadPodiumImage({ title: challenge?.title ?? 'Challenge', winners, entries, totalViews })}
          >
            Download the image
          </button>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary !py-2 text-sm" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="button" className="btn-primary !py-2 text-sm" onClick={share} disabled={busy}>
              {busy ? <Spinner className="h-4 w-4" /> : null}
              {busy ? 'Sharing…' : 'Share'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
