import { useEffect, useState } from 'react'
import { Modal, Avatar } from './ui'
import Icon from './Icon'
import { cx } from '../lib/utils'
import { toast } from '../lib/toast'
import { CREATOR_REPORT_REASONS, reportCreator } from '../lib/creatorReports'

// REPORTING A PERSON.
//
// Built to the same shape as ReportMessage, deliberately: somebody who has
// reported a message once should not have to learn a second dialog. Pick a
// reason, optionally say more, send.
//
// TWO THINGS IT DOES THAT THE MESSAGE VERSION DOES NOT.
//
// IT SHOWS WHO. A message report shows a snapshot of the message, because that
// is the evidence. Here the evidence is a person, so the card at the top is
// their face and name - and it is there to stop the one mistake this dialog can
// cause, which is reporting the wrong creator after tapping through a list.
//
// IT SAYS WHAT HAPPENS NEXT, IN ONE LINE. Reporting somebody you are in a small
// community with is a socially expensive thing to do, and the fear is that they
// will find out. They will not, and the dialog says so, because leaving it
// unsaid is what stops people using it.
export default function ReportCreator({ open, onClose, creator }) {
  const [reason, setReason] = useState(null)
  const [details, setDetails] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) { setReason(null); setDetails(''); setError(''); setBusy(false) }
  }, [open])

  async function send() {
    if (!reason || busy) return
    // "Something else" with nothing written is a report an admin cannot act on.
    if (reason === 'other' && !details.trim()) {
      setError('Tell us what is wrong, so somebody can look into it.')
      return
    }
    setBusy(true)
    setError('')
    const res = await reportCreator(creator.id, reason, details)
    setBusy(false)
    if (!res.ok) { setError(res.message); return }
    onClose()
    toast('Reported. Thank you, we will look into it.')
  }

  if (!creator) return null

  return (
    <Modal open={open} onClose={onClose} title="Report this creator">
      <div className="space-y-5">
        <div className="flex items-center gap-3 rounded-card border border-gray-100 bg-cloud/50 p-3.5">
          <Avatar src={creator.photo_url} name={creator.name} size="sm" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{creator.name}</span>
            <span className="block truncate text-xs text-smoke">
              {[creator.city, creator.country].filter(Boolean).join(', ') || 'Creator'}
            </span>
          </span>
        </div>

        <div>
          <p className="label">What is wrong?</p>
          <div className="space-y-2">
            {CREATOR_REPORT_REASONS.map((r) => {
              const on = reason === r.key
              return (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => { setReason(r.key); setError('') }}
                  className={cx(
                    'flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors',
                    on ? 'border-brand bg-brand-tint/40' : 'border-gray-200 hover:border-brand/40',
                  )}
                >
                  <span className={cx(
                    'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2',
                    on ? 'border-brand bg-brand' : 'border-gray-300',
                  )}>
                    {on && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-ink">{r.label}</span>
                    <span className="block text-xs text-smoke">{r.hint}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <label htmlFor="report-details" className="label">
            Anything else? {reason !== 'other' && <span className="font-normal text-smoke">(optional)</span>}
          </label>
          <textarea
            id="report-details"
            rows={3}
            maxLength={600}
            value={details}
            onChange={(e) => { setDetails(e.target.value); setError('') }}
            placeholder="Where it happened, and anything that would help somebody look into it."
            className="input w-full resize-none"
          />
        </div>

        <p className="flex items-start gap-2 rounded-xl bg-cloud/60 px-3.5 py-2.5 text-xs leading-relaxed text-smoke">
          <Icon name="shield" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" />
          This goes to the Tryp.com team only. {creator.name?.split(' ')[0] || 'They'} will not be
          told who reported them.
        </p>

        {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="btn-ghost w-full justify-center sm:w-auto">Cancel</button>
          <button
            type="button"
            onClick={send}
            disabled={!reason || busy}
            className="btn-primary w-full justify-center disabled:opacity-50 sm:w-auto"
          >
            {busy ? 'Sending…' : 'Report'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
