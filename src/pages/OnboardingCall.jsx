import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Icon from '../components/Icon'
import { Avatar, Spinner } from '../components/ui'
import { cx, dateTag } from '../lib/utils'
import { useT } from '../lib/i18n'
import { safeUrl } from '../lib/safeUrl'

// THE ONBOARDING CALL, THE LAST STEP BEFORE REVIEW (14 Oct 2026, migrations 413 and 420).
//
// Only for a market (and audience: the general community or VIPs) that has switched it on in Applications > Sign-up.
// Spain first: new Spanish creators meet Marta for 15 minutes before they are accepted.
//
// WITH CAL.COM THE BOOKING IS A FACT. The button opens Cal's booking page inside the app, already filled in with the
// applicant's name and email, and Cal tells the page the moment a booking is made (its `bookingSuccessfulV2` message:
// `{ originator: 'CAL', type, data: { uid, startTime } }`). Continue unlocks on that, and the time is saved on the
// profile for the team. Any other booking link (a Google calendar page) opens in a new tab and the applicant ticks that
// they booked, which is the best that can be known there.
//
// `call` is a row from `signup_calls()`; `preview` draws it for the team's editor without any writes.
export const isCalLink = (url) => /^https:\/\/(app\.)?cal\.com\//i.test(String(url || ''))

function calEmbedUrl(url, { name, email, profileId }) {
  const u = new URL(url)
  u.searchParams.set('embed', '')
  u.searchParams.set('embedType', 'inline')
  u.searchParams.set('layout', 'month_view')
  if (name) u.searchParams.set('name', name)
  if (email) u.searchParams.set('email', email)
  if (profileId) u.searchParams.set('metadata[profile_id]', profileId)
  return u.toString()
}

const BOOKED_EVENTS = new Set(['bookingSuccessfulV2', 'bookingSuccessful', 'rescheduleBookingSuccessfulV2', 'dryRunBookingSuccessfulV2'])

export default function OnboardingCall({ call, booked, bookedAt = null, opened, onOpen, onBooked, preview = false, prefill = {} }) {
  const tr = useT()
  const host = call.host_name || tr('the team')
  const first = (call.host_name || '').split(' ')[0] || host
  const href = safeUrl(call.call_url)
  const cal = isCalLink(call.call_url)
  const [sheet, setSheet] = useState(false)

  function schedule() {
    if (preview || !href) return
    onOpen?.()
    if (cal) { setSheet(true); return }
    window.open(href, '_blank', 'noopener,noreferrer')
  }

  const when = bookedAt ? new Date(bookedAt) : null
  const whenText = when && !Number.isNaN(when.getTime())
    ? when.toLocaleString(dateTag(), { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div className="space-y-5">
      {/* ONE CARD: who you meet, then why (15 Oct 2026, the team: "put that in the card rather than just as plain text"). */}
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-card animate-rise">
        <div className="flex items-center gap-4 p-4">
          <span className="relative shrink-0">
            <Avatar src={call.host_photo_url} name={call.host_name || 'Tryp.com'} size="lg" />
            <span aria-hidden className="absolute -bottom-0.5 -right-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-brand text-white ring-[3px] ring-white">
              <Icon name="video" className="h-3.5 w-3.5" />
            </span>
          </span>
          <div className="min-w-0">
            <p className="text-base font-bold text-ink">{call.host_name || 'Tryp.com'}</p>
            {call.host_title && <p className="text-sm text-smoke">{call.host_title}</p>}
            <p className="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold text-brand">
              <Icon name="clock" className="h-3.5 w-3.5" />{tr('{n} minute video call', { n: call.call_minutes || 15 })}
            </p>
          </div>
        </div>
        <div className="border-t border-gray-100 bg-gradient-to-b from-brand-tint/40 to-white px-4 py-3.5 text-sm leading-relaxed text-ink">
          <p className="flex items-start gap-2 font-semibold">
            <Icon name="sparkles" className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
            {tr('Booking this call is how you get accepted into the community.')}
          </p>
          <p className="mt-1.5 text-smoke">
            {tr('It is a quick, friendly chat with {name}: how the community works, how the challenges and prizes work, and how to get the most out of it.', { name: first })}
          </p>
          {call.note && <p className="mt-2 text-smoke">{call.note}</p>}
        </div>
      </div>

      {booked ? (
        <div key="booked" className="flex items-center gap-3 rounded-2xl border-2 border-brand bg-white p-4 animate-pop-in">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-white"><Icon name="check" className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-ink">{tr('Your call is booked')}</p>
            <p className="text-[13px] text-smoke">{whenText ? tr('{when}, with {name}. The invite is in your email.', { when: whenText, name: first }) : tr('With {name}. The invite is in your email.', { name: first })}</p>
          </div>
          <button type="button" onClick={() => (cal ? schedule() : onBooked?.(false))} className="shrink-0 text-xs font-semibold text-smoke transition-colors hover:text-brand">{tr('Change')}</button>
        </div>
      ) : (
        <div key="ask" className="space-y-3 animate-rise [animation-delay:120ms]">
          <button type="button" onClick={schedule} className="btn-primary w-full justify-center !py-3.5 text-base transition-transform duration-200 active:scale-[0.98] hoverable:hover:scale-[1.01]">
            <Icon name="calendar" className="h-5 w-5" />
            {opened && !cal ? tr('Open the booking page again') : tr('Schedule my call with {name}', { name: first })}
          </button>
          {cal ? (
            <p className="text-center text-xs text-smoke">{tr('Pick a time that suits you. Continue opens once your call is booked.')}</p>
          ) : (
            <>
              <p className="text-center text-xs text-smoke">{tr('Opens the booking page in a new tab. Come back here once you have booked.')}</p>
              <button
                type="button"
                disabled={!opened && !preview}
                onClick={() => onBooked?.(true)}
                className="flex w-full items-center gap-3 rounded-2xl border-2 border-gray-200 bg-white px-4 py-3.5 text-left text-ink transition-colors duration-200 disabled:opacity-50 hoverable:enabled:hover:border-brand/50"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 border-gray-300" />
                <span className="text-sm font-semibold">{tr('I have booked my onboarding call')}</span>
              </button>
              {!opened && !preview && <p className="text-center text-xs text-smoke">{tr('Pick a time first, then tick this.')}</p>}
            </>
          )}
        </div>
      )}

      {sheet && (
        <CalSheet
          src={calEmbedUrl(href, prefill)}
          title={tr('Schedule my call with {name}', { name: first })}
          onClose={() => setSheet(false)}
          onBooked={(d) => { onBooked?.(true, { when: d?.startTime || null, ref: d?.uid || null }); setTimeout(() => setSheet(false), 1400) }}
        />
      )}
    </div>
  )
}

// Cal's booking page in a sheet over the step. It is Cal's own page (their calendar, their confirmation emails); the app
// only listens for the one message that says a booking was made.
function CalSheet({ src, title, onClose, onBooked }) {
  const tr = useT()
  const [loaded, setLoaded] = useState(false)
  const [done, setDone] = useState(false)
  useEffect(() => {
    const onMsg = (e) => {
      if (!/^https:\/\/(app\.)?cal\.com$/.test(e.origin)) return
      const m = e.data
      if (!m || m.originator !== 'CAL') return
      const type = m.type || m.method || ''
      if (BOOKED_EVENTS.has(type) && !done) { setDone(true); onBooked(m.data || {}) }
    }
    const esc = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('message', onMsg)
    document.addEventListener('keydown', esc)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('message', onMsg); document.removeEventListener('keydown', esc); document.body.style.overflow = prev }
  }, [onBooked, onClose, done])
  return createPortal(
    <div className="fixed inset-0 z-[95] flex items-end justify-center bg-ink/45 animate-page-in sm:items-center sm:p-6" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div role="dialog" aria-modal="true" aria-label={title} className="flex h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-[28px] bg-white shadow-lift animate-pop-in sm:h-[86vh] sm:rounded-[28px]">
        <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-3.5">
          <Icon name="calendar" className="h-5 w-5 text-brand" />
          <p className="min-w-0 flex-1 truncate text-sm font-bold text-ink">{title}</p>
          <button type="button" onClick={onClose} aria-label={tr('Close')} className="rounded-full p-2 text-smoke transition-colors hover:bg-cloud hover:text-ink">
            <Icon name="close" className="h-5 w-5" />
          </button>
        </div>
        <div className="relative min-h-0 flex-1">
          {!loaded && <div className="absolute inset-0 flex items-center justify-center bg-white"><Spinner className="h-6 w-6 text-brand" /></div>}
          <iframe src={src} title={title} onLoad={() => setLoaded(true)} className={cx('h-full w-full border-0 transition-opacity duration-300', loaded ? 'opacity-100' : 'opacity-0')} allow="payment" />
          {done && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/95 animate-page-in">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand text-white shadow-lift animate-pop-in"><Icon name="check" className="h-8 w-8" /></span>
              <p className="text-lg font-bold text-ink">{tr('Your call is booked')}</p>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
