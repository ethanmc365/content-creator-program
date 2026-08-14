import { useEffect, useState } from 'react'
import { Modal, Spinner } from './ui'
import Icon from './Icon'
import { REPORT_REASONS, reportMessage } from '../lib/messageActions'
import { cx } from '../lib/utils'

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
export default function ReportMessage({ open, onClose, kind, messageId, authorName, preview, onDone }) {
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
          <h2 className="text-lg font-semibold">Thanks, that is with the team</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-smoke">
            A member of the Tryp.com team will look at it. {authorName ? authorName.split(' ')[0] : 'They'} will not be told who reported it.
          </p>
          <button type="button" onClick={onClose} className="btn-primary mt-6 w-full justify-center">Done</button>
        </div>
      ) : (
        <form onSubmit={submit}>
          <h2 className="text-lg font-semibold">Report this message</h2>
          <p className="mt-1 text-sm text-smoke">
            It goes to the Tryp.com team for review. {authorName ? authorName.split(' ')[0] : 'The sender'} is not told who reported it.
          </p>

          {/* What was actually said, so nobody reports the wrong message. */}
          {preview && (
            <p className="mt-4 line-clamp-3 rounded-xl border-l-2 border-gray-200 bg-cloud/70 px-3 py-2 text-xs text-smoke [overflow-wrap:anywhere]">
              {preview}
            </p>
          )}

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
