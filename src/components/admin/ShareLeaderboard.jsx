import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Modal, Spinner } from '../ui'
import Icon from '../Icon'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { ROOM_LABELS, postToRooms } from '../../lib/announce'
import { snapshotNode, downloadBlob, slugForFile } from '../../lib/domSnapshot'
import ShareCard, { SHARE_LAYOUT } from './ShareCard'
import { uploadFile } from '../../lib/upload'
import { cx } from '../../lib/utils'

// SHARING THE RESULT OF A CHALLENGE, AS A PICTURE, INTO THE ROOM IT BELONGS IN.
//
//   The podium      the winners, the voucher row and the totals.
//   The leaderboard every place in order, with the prize on each place, the
//                   vouchers and the platforms marked. The thing a top-three
//                   graphic cannot show, and the thing most creators are
//                   actually looking for.
//
// BOTH ARE PHOTOGRAPHS OF THE REAL COMPONENTS (lib/domSnapshot.js), not drawings
// of them. They were drawn on a canvas, which meant a second implementation of
// the podium that drifted from the first, and Ethan, comparing the picture with
// the board it came from, picked the board. So the picture IS the board now.
//
// THE ROOMS ARE THE CHALLENGE'S OWN ROOMS, FETCHED, NOT ASSUMED (1 Sep 2026).
//
// Ethan: "ensure that the admin can select the correct market, if its a global
// challenge the options should be from the global rooms, if its a spanish
// challenge the options from the spanish rooms."
//
// It used to render a hard-coded list of three room KEYS and label them with the
// market's name. Three things were wrong with that, and only one of them was
// cosmetic:
//   - a market that has not opened `content_tips` was still offered it, and the
//     share silently posted nothing ("No matching room was found");
//   - a market that has opened a room those three do not name (meetups, and
//     whatever a market opens next) could never be chosen at all;
//   - the label was a guess assembled from two strings rather than the room's
//     own name, so it could disagree with what the room is actually called.
// Now the dialog asks the database which rooms this challenge's community has,
// and every option is a room that demonstrably exists.
//
// A SPLIT CHALLENGE HAS MORE THAN ONE RESULT, so it gets a board chooser. This
// was listed as open work: the picture was built from the flat ranking, so
// sharing a two-group challenge shared a board nobody had competed on.

export default function ShareLeaderboard({
  open, onClose, challenge, boards = [], subCountByCreator = {}, platformsFor, onDone,
}) {
  const { user } = useAuth()
  const [what, setWhat] = useState('podium')
  const [boardIdx, setBoardIdx] = useState(0)
  const [roomId, setRoomId] = useState(null)
  const [note, setNote] = useState('')
  const [preview, setPreview] = useState(null)
  const [rooms, setRooms] = useState(null) // null = still loading
  const [busy, setBusy] = useState(false)
  const [drawing, setDrawing] = useState(false)
  const [error, setError] = useState('')

  // WHICH ROOMS THIS CHALLENGE CAN GO TO. A market challenge: that market's
  // rooms. A global one (no community): the worldwide network's rooms, which is
  // the same convention `postToRooms` uses for an empty market list.
  useEffect(() => {
    if (!open) return
    let dead = false
    setRooms(null)
    const run = async () => {
      let communityId = challenge?.community_id
      if (!communityId) {
        const { data: net } = await supabase.from('communities').select('id').eq('kind', 'network').maybeSingle()
        communityId = net?.id ?? null
      }
      if (!communityId) { if (!dead) setRooms([]); return }
      const { data } = await supabase
        .from('channels')
        .select('id, key, name, icon, community_id, communities:community_id(name, slug, kind)')
        .eq('community_id', communityId)
        .order('position')
      if (dead) return
      // Only rooms a leaderboard belongs in. A market can open rooms for
      // anything (a trip thread, a language room), and dropping a podium into
      // every one of them is not a feature.
      const shareable = (data ?? []).filter((r) => ROOM_LABELS[r.key])
      setRooms(shareable)
      setRoomId((cur) => cur ?? shareable.find((r) => r.key === 'announcements')?.id ?? shareable[0]?.id ?? null)
    }
    run()
    return () => { dead = true }
  }, [open, challenge?.community_id])

  // The board being shared. A challenge with no groups produces exactly one,
  // keyed on a null group, so there is one code path either way.
  const board = boards[Math.min(boardIdx, Math.max(0, boards.length - 1))] ?? null
  const room = (rooms ?? []).find((r) => r.id === roomId) ?? null

  const cardRef = useRef(null)

  // The card below is mounted off-screen for exactly as long as this dialog is
  // open, and this photographs it. Off-screen rather than hidden: a node with
  // `display:none` has no layout, and a picture of no layout is 0x0.
  const render = useCallback(
    () => snapshotNode(cardRef.current, { scale: (SHARE_LAYOUT[what] ?? SHARE_LAYOUT.podium).scale }),
    [what],
  )

  // Draw whichever is selected, so what you send is what you have already seen.
  const drawKey = `${what}:${boardIdx}:${board?.ranking?.length ?? 0}:${board?.winners?.length ?? 0}:${board?.entries ?? 0}:${board?.views ?? 0}`
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
        .catch((e) => { setError(e.message ?? 'The picture could not be drawn.'); setDrawing(false) })
    }, 120)
    return () => {
      dead = true
      clearTimeout(t)
      if (url) URL.revokeObjectURL(url)
      setPreview(null)
    }
  }, [open, render, drawKey])

  useEffect(() => {
    if (open) { setError(''); setNote(''); setBoardIdx(0) }
  }, [open])

  // A DEFAULT MESSAGE THAT IS WORTH SENDING. A picture posted on its own into
  // announcements arrives as a silent card; the note is what makes it read as
  // the team saying something. Prefilled and editable, never forced.
  const suggested = useMemo(() => {
    if (!challenge) return ''
    const where = board?.group ? ` (${board.group.name})` : ''
    const isFinal = challenge.results_status === 'final'
    return isFinal
      ? `The results are in for ${challenge.title}${where}. Congratulations to everyone who entered.`
      : `Here is how ${challenge.title}${where} is looking right now. Still time to climb.`
  }, [challenge, board?.group])

  async function share() {
    setBusy(true)
    setError('')
    try {
      const blob = await render()
      if (!blob) throw new Error('The image could not be drawn. Try again.')
      if (!room) throw new Error('Pick a room to post into.')
      // EVERY PUBLIC-BUCKET UPLOAD LIVES UNDER THE UPLOADER'S OWN FOLDER. The
      // proxy enforces it (`path not allowed`, 403) and this path did not, so
      // sharing a result never once succeeded - it failed at the upload, before
      // the message was written, every time.
      const path = `${user.id}/leaderboards/${challenge.id}-${what}-${Date.now()}.png`
      const image_url = await uploadFile('chat-media', path, blob, 'image/png')

      const { posted, error: postError } = await postToRooms({
        communityIds: room.community_id ? [room.community_id] : [],
        base: room.key,
        senderId: user.id,
        body: (note.trim() || suggested),
        extra: { image_url },
      })
      if (postError) throw postError

      onDone?.(posted ? `Shared to ${room.name || ROOM_LABELS[room.key]}.` : 'No matching room was found for this challenge.')
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

  const marketName = rooms?.[0]?.communities?.name ?? null

  return (
    <>
      {/* THE THING BEING PHOTOGRAPHED. Off-screen, at a fixed width, mounted
          only while the dialog is open. `aria-hidden` because it is a duplicate
          of content already on the page and a screen reader should not read the
          leaderboard twice. */}
      {open && board && (
        <div
          aria-hidden
          style={{
            position: 'fixed', top: 0, left: '-20000px', pointerEvents: 'none', zIndex: -1,
            width: `${(SHARE_LAYOUT[what] ?? SHARE_LAYOUT.podium).width}px`,
          }}
        >
          <ShareCard
            cardRef={cardRef}
            what={what}
            challenge={challenge}
            boardName={board.group?.name ?? null}
            prizes={board.prizes ?? []}
            winners={board.winners ?? []}
            ranking={board.ranking ?? []}
            entries={board.entries ?? 0}
            totalViews={board.views ?? 0}
            voucherWinners={board.voucherWinners ?? []}
            voucherPrize={board.voucherPrize ?? ''}
            subCountByCreator={subCountByCreator}
            platformsFor={platformsFor}
          />
        </div>
      )}

      <Modal open={open} onClose={onClose} title="Share the result">
        <div className="space-y-6">
          {/* WHICH BOARD. Only drawn on a split challenge, because on every
              other one it is a question with one answer. */}
          {boards.length > 1 && (
            <div>
              <p className="label">Which leaderboard</p>
              <div className="flex flex-wrap gap-2">
                {boards.map((b, i) => (
                  <button
                    key={b.group?.id ?? 'all'}
                    type="button"
                    onClick={() => setBoardIdx(i)}
                    className={cx(
                      'rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200',
                      i === boardIdx ? 'bg-brand text-white shadow-card' : 'bg-cloud text-smoke hover:-translate-y-0.5 hover:text-ink',
                    )}
                  >
                    {b.group?.name ?? 'The whole challenge'}
                    <span className={cx('ml-2 text-[11px] font-bold tabular-nums', i === boardIdx ? 'text-white/75' : 'text-smoke')}>
                      {(b.ranking ?? []).length}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="label">What to share</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { key: 'podium', title: 'The podium', hint: 'Every winning place, the vouchers and the totals.', icon: 'trophy' },
                { key: 'table', title: 'The leaderboard', hint: 'Every place in order, with the prize on each one.', icon: 'chart' },
              ].map((o) => (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => setWhat(o.key)}
                  className={cx(
                    'flex items-start gap-3 rounded-card p-4 text-left transition-all duration-200 hover:-translate-y-0.5',
                    what === o.key ? 'border-2 border-brand bg-brand-tint/40' : 'border border-gray-200 hover:border-brand',
                  )}
                >
                  <Icon name={o.icon} className={cx('mt-0.5 h-5 w-5 shrink-0', what === o.key ? 'text-brand' : 'text-smoke')} />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{o.title}</span>
                    <span className="mt-1 block text-xs leading-relaxed text-smoke">{o.hint}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* EXACTLY WHAT LANDS IN THE ROOM, at the size it lands. Framed as a
              message rather than floated on grey, because that is the thing an
              admin is deciding to send. */}
          <div>
            <p className="label">How it will look</p>
            <div className="rounded-card border border-gray-100 bg-cloud/40 p-3">
              {preview && !drawing ? (
                <img src={preview} alt="Exactly what will be shared" className="mx-auto block w-full max-w-[320px] rounded-xl shadow-card" />
              ) : (
                <div className="flex h-56 items-center justify-center text-sm text-smoke">
                  <Spinner className="mr-2 h-4 w-4" /> Drawing it…
                </div>
              )}
            </div>
          </div>

          <div>
            <p className="label">
              Where it goes{marketName ? <span className="ml-1 font-normal text-smoke">· {marketName}</span> : null}
            </p>
            {rooms === null ? (
              <div className="flex items-center gap-2 rounded-card border border-gray-100 px-4 py-5 text-sm text-smoke">
                <Spinner className="h-4 w-4" /> Finding this challenge's rooms…
              </div>
            ) : rooms.length === 0 ? (
              <p className="rounded-card border border-dashed border-gray-200 px-4 py-5 text-center text-sm text-smoke">
                This challenge's market has no rooms to post into yet.
              </p>
            ) : (
              <div className="space-y-2">
                {rooms.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setRoomId(r.id)}
                    className={cx(
                      'flex w-full items-center gap-3 rounded-card px-4 py-3 text-left transition-all duration-200 hover:-translate-y-0.5',
                      roomId === r.id ? 'border-2 border-brand bg-brand-tint/40' : 'border border-gray-200 hover:border-brand',
                    )}
                  >
                    <Icon name={r.icon || 'chat'} className={cx('h-4 w-4 shrink-0', roomId === r.id ? 'text-brand' : 'text-smoke')} />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{r.name || ROOM_LABELS[r.key]?.label}</span>
                      <span className="block text-xs text-smoke">{ROOM_LABELS[r.key]?.hint}</span>
                    </span>
                    {roomId === r.id && <Icon name="check" className="ml-auto h-4 w-4 shrink-0 text-brand" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          <label className="block">
            <span className="label">Say something</span>
            <textarea
              className="input min-h-[80px]"
              placeholder={suggested}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <span className="mt-1 block text-xs text-smoke">
              Leave it blank and we will send the line above.
            </span>
          </label>

          {error ? <p className="text-sm text-brand">{error}</p> : null}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <button type="button" className="btn-secondary !py-2 text-sm" onClick={download} disabled={busy}>
              <Icon name="arrow-down" className="h-4 w-4" />
              Download the image
            </button>
            <div className="flex gap-2">
              <button type="button" className="btn-secondary !py-2 text-sm" onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <button type="button" className="btn-primary !py-2 text-sm" onClick={share} disabled={busy || drawing || !room}>
                {busy ? <Spinner className="h-4 w-4" /> : <Icon name="share" className="h-4 w-4" />}
                {busy ? 'Sharing…' : 'Share'}
              </button>
            </div>
          </div>
        </div>
      </Modal>
    </>
  )
}
