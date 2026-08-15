import { useEffect, useState } from 'react'
import { Avatar, Modal, Spinner } from './ui'
import Icon from './Icon'
import { REPORT_REASONS, reportMessage } from '../lib/messageActions'
import { cx, formatMessageTime } from '../lib/utils'

// "Report this message", for every chat.
//
// WHY THIS EXISTS. Moderation on this platform was entirely one-directional:
// admins could delete a message and mute its author, and a creator on the
// receiving end of something had no control at all - the best they could do was
// find an admin and DM them. That is not a moderation system, it is a hope. A
// report is the missing half: the person who saw it says so, in two taps, and
// somebody who can act on it is told.
//
// DELIBERATELY NOT MOTION. Chat.jsx is eagerly routed, so anything it imports
// lands in every creator's first paint - the same call ToastHost and
// ReactionPicker made. `ui/Modal` already carries its own entrance.
//
// THE MODAL SAYS WHAT WILL HAPPEN. A report that disappears into a void gets
// sent once and never again, so the card is explicit: a person reads it, the
// author is not told who reported them, and nothing about the message changes
// in the meantime.
// WHAT IS BEING REPORTED HAS TO BE LEGIBLE.
//
// The snapshot used to be `line-clamp-3` on 12px grey text with no attribution:
// a three-line grey stub of the thing you are about to accuse somebody of.
// Ethan: "when it shows the snapshot of the message it doesn't show it all
// clearly and it's kind of cut off." Two things were wrong with it and both
// matter for the same reason - a report is only useful if the reporter is sure
// they picked the right message.
//
//   * IT WAS CUT OFF WITH NO WAY TO SEE THE REST. A clamp hides text and says
//     nothing about hiding it. It is a SCROLLING box now, capped at a sensible
//     height, so a long message is all there and visibly all there.
//   * IT DID NOT SAY WHOSE IT WAS. The name was in the paragraph above and the
//     quote was anonymous, which on a fast-moving room is exactly how you
//     report the reply instead of the thing it replied to. The snapshot is a
//     real message card now: face, name, time, then the words, at readable
//     size, with a thumbnail when the message was a photo or a video.
function MessageSnapshot({ authorName, authorPhoto, sentAt, body, imageUrl, videoUrl }) {
  const hasMedia = !!(imageUrl || videoUrl)
  if (!body && !hasMedia) return null
  return (
    <figure className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-cloud/50">
      <figcaption className="flex items-center gap-2 border-b border-gray-200/70 px-3 py-2">
        <Avatar src={authorPhoto} name={authorName} size="xs" />
        <span className="min-w-0 truncate text-xs font-semibold text-ink">{authorName || 'This message'}</span>
        {sentAt && <span className="ml-auto shrink-0 text-[11px] text-smoke">{formatMessageTime(sentAt)}</span>}
      </figcaption>
      <div className="px-3 py-2.5">
        {body && (
          // SCROLLS, NEVER CLAMPS. `max-h` plus `overflow-y-auto` shows as much
          // as fits and lets the reporter read the rest; `whitespace-pre-wrap`
          // keeps the line breaks the author actually typed, because a message
          // reflowed into one paragraph can read very differently from the one
          // that was sent.
          <p className="max-h-40 overflow-y-auto overscroll-contain whitespace-pre-wrap break-words text-[13px] leading-relaxed text-ink [overflow-wrap:anywhere]">
            {body}
          </p>
        )}
        {hasMedia && (
          <div className={cx('flex items-center gap-2.5', body && 'mt-2.5 border-t border-gray-200/70 pt-2.5')}>
            {imageUrl ? (
              // Contained, not cropped, for the same reason the chat bubble
              // stopped cropping: a report about a photo needs the photo.
              <img src={imageUrl} alt="" className="h-20 w-20 shrink-0 rounded-lg bg-white object-contain ring-1 ring-black/5" />
            ) : (
              <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-white text-smoke ring-1 ring-black/5">
                <Icon name="video" className="h-6 w-6" />
              </span>
            )}
            <span className="text-xs text-smoke">
              {imageUrl ? 'This message was a photo.' : 'This message was a video.'}
              {' '}The team can open the original.
            </span>
          </div>
        )}
      </div>
    </figure>
  )
}

export default function ReportMessage({
  open, onClose, kind, messageId, authorName, authorPhoto, sentAt,
  preview, imageUrl, videoUrl, onDone,
}) {
  const [reason, setReason] = useState('')
  const [details, setDetails] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  // Reset between openings. A dialog that remembers the last thing you accused
  // somebody of is a dialog that will file the wrong report eventually.
  useEffect(() => {
    if (open) { setReason(''); setDetails(''); setError(''); setSent(false); setBusy(false) }
  }, [open, messageId])

  async function submit(e) {
    e.preventDefault()
    if (!reason || busy) return
    setBusy(true)
    setError('')
    try {
      await reportMessage(kind, messageId, reason, details)
      setSent(true)
      onDone?.()
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  return (
    <Modal open={open} onClose={onClose} title={sent ? 'Report sent' : 'Report this message'} sheet={false}>
      {sent ? (
        <div className="text-center">
          <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-green-50 text-green-700">
            <Icon name="check" className="h-6 w-6" />
          </span>
          <p className="text-base font-semibold">Thanks, that is with the team</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-smoke">
            A member of the Tryp.com team will look at it. {authorName ? authorName.split(' ')[0] : 'They'} will not be told who reported it.
          </p>
          <button type="button" onClick={onClose} className="btn-primary mt-6 w-full justify-center">Done</button>
        </div>
      ) : (
        <form onSubmit={submit}>
          {/* No heading of its own: `ui/Modal` already draws "Report this
              message" in its own title bar, and the dialog was saying it twice
              in two different sizes, one above the other. */}
          <p className="text-sm text-smoke">
            It goes to the Tryp.com team for review. {authorName ? authorName.split(' ')[0] : 'The sender'} is not told who reported it.
          </p>

          {/* What was actually said, so nobody reports the wrong message. */}
          <MessageSnapshot
            authorName={authorName}
            authorPhoto={authorPhoto}
            sentAt={sentAt}
            body={preview}
            imageUrl={imageUrl}
            videoUrl={videoUrl}
          />
          <p className="mt-1.5 text-[11px] text-gray-400">
            This exact wording is stored with the report, so editing or deleting the message afterwards does not change it.
          </p>

          <fieldset className="mt-5">
            <legend className="label mb-2">What is wrong with it?</legend>
            <div className="space-y-2">
              {REPORT_REASONS.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => setReason(r.key)}
                  aria-pressed={reason === r.key}
                  className={cx(
                    'flex w-full items-start gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-all duration-200',
                    reason === r.key
                      ? 'border-brand bg-brand-tint/40'
                      : 'border-gray-200 hover:border-brand/40 hover:bg-cloud/60 active:scale-[0.99]',
                  )}
                >
                  <span className={cx(
                    'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                    reason === r.key ? 'border-brand' : 'border-gray-300',
                  )}>
                    {reason === r.key && <span className="h-2 w-2 rounded-full bg-brand" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{r.label}</span>
                    <span className="mt-0.5 block text-xs text-smoke">{r.hint}</span>
                  </span>
                </button>
              ))}
            </div>
          </fieldset>

          <label htmlFor="report-details" className="label mt-5">
            Anything else? <span className="font-normal text-smoke">(optional)</span>
          </label>
          <textarea
            id="report-details"
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="Context helps: is this the first time, is it aimed at someone, has it happened elsewhere?"
            className="input w-full resize-y"
          />

          {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} className="btn-ghost w-full justify-center sm:w-auto">Cancel</button>
            <button type="submit" disabled={!reason || busy} className="btn-primary w-full justify-center sm:w-auto">
              {busy ? <><Spinner className="h-4 w-4" /> Sending…</> : 'Send report'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}
