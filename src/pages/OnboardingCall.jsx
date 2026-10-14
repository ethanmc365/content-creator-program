import Icon from '../components/Icon'
import { Avatar } from '../components/ui'
import { cx } from '../lib/utils'
import { useT } from '../lib/i18n'
import { safeUrl } from '../lib/safeUrl'

// THE ONBOARDING CALL, THE LAST STEP BEFORE REVIEW (14 Oct 2026).
//
// Only for a market that has switched it on (Applications > Sign-up). Spain first: Marta, the Spanish country manager,
// meets every new creator for 15 minutes before they are accepted. We cannot see inside her calendar, so the step asks
// for two things it CAN see: that they opened the booking page, and their own tick that they booked. Continue stays
// locked until the tick. Both moments are stamped on the profile so the application card shows them.
//
// `call` is a row from `signup_calls()`; `preview` draws it for the team's editor without any writes.
export default function OnboardingCall({ call, booked, opened, onOpen, onBooked, preview = false }) {
  const tr = useT()
  const host = call.host_name || tr('the team')
  const first = (call.host_name || '').split(' ')[0] || host
  const href = safeUrl(call.call_url)
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-card animate-rise">
        <Avatar src={call.host_photo_url} name={call.host_name || 'Tryp.com'} size="lg" />
        <div className="min-w-0">
          <p className="text-base font-bold text-ink">{call.host_name || 'Tryp.com'}</p>
          {call.host_title && <p className="text-sm text-smoke">{call.host_title}</p>}
          <p className="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold text-brand">
            <Icon name="clock" className="h-3.5 w-3.5" />{tr('{n} minute video call', { n: call.call_minutes || 15 })}
          </p>
        </div>
      </div>

      <div className="rounded-2xl bg-cloud/70 p-4 text-sm leading-relaxed text-ink">
        <p className="font-semibold">{tr('Booking this call is how you get accepted into the community.')}</p>
        <p className="mt-1.5 text-smoke">
          {tr('It is a quick, friendly chat with {name}: how the community works, how the challenges and prizes work, and how to get the most out of it.', { name: first })}
        </p>
        {call.note && <p className="mt-2 text-smoke">{call.note}</p>}
      </div>

      <ol className="space-y-3">
        <li>
          <a
            href={href || undefined}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => { if (preview) e.preventDefault(); onOpen?.() }}
            className="btn-primary w-full justify-center !py-3.5 text-base"
          >
            <Icon name="calendar" className="h-5 w-5" />
            {opened ? tr('Open the booking page again') : tr('Choose a time with {name}', { name: first })}
          </a>
          <p className="mt-1.5 text-center text-xs text-smoke">{tr('Opens Google Calendar in a new tab. Come back here once you have booked.')}</p>
        </li>
        <li>
          <button
            type="button"
            onClick={() => onBooked?.(!booked)}
            aria-pressed={booked}
            className={cx(
              'flex w-full items-center gap-3 rounded-2xl border-2 px-4 py-3.5 text-left transition-colors duration-200',
              booked ? 'border-brand bg-brand text-white' : 'border-gray-200 bg-white text-ink hoverable:hover:border-brand/50',
            )}
          >
            <span className={cx('flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2', booked ? 'border-white bg-white text-brand' : 'border-gray-300')}>
              {booked && <Icon name="check" className="h-4 w-4 animate-pop-in" />}
            </span>
            <span className="text-sm font-semibold">{tr('I have booked my onboarding call')}</span>
          </button>
          {!opened && !booked && !preview && (
            <p className="mt-1.5 text-center text-xs text-smoke">{tr('Pick a time first, then tick this.')}</p>
          )}
        </li>
      </ol>
    </div>
  )
}
