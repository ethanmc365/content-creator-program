import { Link } from 'react-router-dom'
import { Avatar, Badge, CopyButton, Spinner } from '../../components/ui'
import { onboardingProgress } from '../../lib/onboardingProgress'
import Icon from '../../components/Icon'
import { cx, timeAgo, formatDate } from '../../lib/utils'
import { PickTick, EmailRow } from './AdminApplicationsParts'

// SOMEBODY WHO STARTED AND STOPPED.
//
// There is nothing to approve here - they have not asked for anything yet - so
// this card answers a different question: how far did they get, and how do we
// reach them. `onboardingProgress` derives the step from the columns the flow
// fills in, in the order it asks for them.
export function UnfinishedCard({ app, email, phone, onFollowUp, onDecline, busy, onZoom, selected, onSelect }) {
  const progress = onboardingProgress(app, phone ? { phone } : null)
  return (
    <div className={cx(
      'card !p-0 overflow-hidden transition-all duration-200 hoverable:hover:shadow-lift',
      selected && 'ring-2 ring-brand/40',
    )}>
      {/* The same grid as ApplicationCard, for the same reason. */}
      <div className="grid grid-cols-[auto_auto_minmax(0,1fr)] items-start gap-x-3 gap-y-3 p-4 sm:grid-cols-[auto_auto_minmax(0,1fr)_auto] sm:gap-x-4 sm:gap-y-0 sm:p-6">
        <PickTick selected={selected} onSelect={onSelect} name={app.name} />
        <div className="sm:row-span-2">
          {app.photo_url ? (
            <button type="button" onClick={onZoom} aria-label={`See ${app.name}'s photo full size`}
              className="shrink-0 rounded-full transition-transform duration-200 hoverable:hover:scale-105">
              <Avatar src={app.photo_url} name={app.name} size="lg" className="!h-14 !w-14 sm:!h-20 sm:!w-20" />
            </button>
          ) : <Avatar src={app.photo_url} name={app.name} size="lg" className="!h-14 !w-14 sm:!h-20 sm:!w-20" />}
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h2 className="min-w-0 break-words text-base font-bold leading-snug sm:text-lg">{app.name?.trim() || 'No name yet'}</h2>
            {app.is_vip && <Badge tone="brand">VIP link</Badge>}
            {app.followed_up_at
              ? <Badge tone="green">Followed up {timeAgo(app.followed_up_at)}</Badge>
              : <Badge tone="grey">Never finished</Badge>}
          </div>
          <p className="truncate text-sm text-smoke">
            {[app.city, app.country].filter(Boolean).join(', ') || 'No location given'}
          </p>
          <p className="mt-0.5 text-[11px] text-gray-400 sm:hidden">
            <span className="font-bold text-brand">{progress.done}/{progress.total}</span> · Signed up {timeAgo(app.created_at)}
          </p>
        </div>

        <div className="hidden shrink-0 text-right sm:row-span-2 sm:block">
          <p className="text-sm font-bold tabular-nums text-brand">{progress.done}/{progress.total}</p>
          <p className="text-xs text-gray-400">Signed up {timeAgo(app.created_at)}</p>
          <p className="text-[11px] text-gray-300">{formatDate(app.created_at)}</p>
        </div>

        <div className="col-span-3 min-w-0 sm:col-span-1 sm:col-start-3">
          <EmailRow email={email} />
          <p className="mt-1.5 text-sm font-medium text-ink">{progress.summary}</p>

          {/* THE STEPS, AS A ROW OF TICKS. A percentage says how much; this
              says WHICH, which is the thing somebody writing them a message
              actually needs. */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {progress.steps.map((st) => (
              <span
                key={st.key}
                className={cx(
                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
                  st.done ? 'bg-green-50 text-green-700' : 'bg-cloud text-gray-400',
                )}
              >
                {st.done && <Icon name="check" className="h-2.5 w-2.5" />}
                {st.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-3 border-t border-gray-100 px-4 py-4 sm:px-6">
        {/* THE EMAIL MOVED UP to the summary, where it is reachable without
            reading the footer - see `EmailRow`. The phone stays here: it is far
            less often what somebody wants, and duplicating both would make the
            card twice as tall for no gain. */}
        {phone && (
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-xs text-smoke">{phone}</span>
            <CopyButton value={phone} label="Copy phone number" className="!h-6 !w-6 shrink-0" />
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 pt-1 sm:flex sm:flex-wrap sm:items-center sm:justify-end">
          <Link to={`/profile/${app.id}`} className="btn-secondary justify-center !py-2 text-xs">Full profile</Link>
          {/* DELETE, NOT "REMOVE". Ethan: "rather than the Remove, it should be
              a Delete button to actually delete the creator permanently."
              It always did delete permanently - `admin_decline_application`
              records the decision and then removes the account - so "Remove"
              was the softer of two words for the same irreversible thing. */}
          <button onClick={onDecline} disabled={busy} className="btn-danger justify-center !py-2 text-xs">Delete</button>
          {/* A MARK, NOT A SEND. There is no email automation - all outbound
              mail is paused - so a "Send" button would either lie or queue
              something nobody receives. A manager writes the mail from their
              own mailbox and ticks it here, and the next manager can see it has
              been done. Pressing it again un-ticks it. */}
          <button
            onClick={onFollowUp}
            disabled={busy}
            className={cx(
              'col-span-2 inline-flex items-center justify-center gap-1.5 !py-2 text-xs',
              app.followed_up_at ? 'btn-secondary' : 'btn-primary',
            )}
          >
            {busy ? <Spinner className="h-3.5 w-3.5" />
              : <Icon name={app.followed_up_at ? 'check' : 'envelope'} className="h-3.5 w-3.5" />}
            {app.followed_up_at ? 'Followed up' : 'Follow-up email'}
          </button>
        </div>
      </div>
    </div>
  )
}
