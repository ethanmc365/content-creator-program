import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Modal, Spinner, CopyButton } from '../ui'
import Icon from '../Icon'
import { confirm } from '../../lib/confirm'
import { toast } from '../../lib/toast'

// SUBSCRIBE ONCE, AND IT KEEPS ITSELF UP TO DATE.
//
// Ethan: "it's a pain having to just click add events... download the file and
// then click to open the file, it would be much smoother if you could build in
// a way to actually automatically show the events on the creators personal
// calendars too."
//
// This is that, and it is worth being precise about what it is and is not.
//
//   IT IS NOT the Google Calendar API. That is OAuth, an app-verification
//   review, refresh tokens to store and a write path that has to reconcile
//   edits and deletions inside somebody else's account - and it would do
//   nothing at all for Apple Calendar, which has no such API.
//
//   IT IS an iCalendar subscription, which both Apple and Google have supported
//   forever. They fetch the URL on their own schedule and re-fetch it for as
//   long as it stays subscribed. Add an event on the platform and it turns up
//   in their diary with nobody pressing anything.
//
// The endpoint is `supabase/functions/calendar-feed`; the URL carries a
// per-creator secret because the fetcher is Apple's server, not a browser with
// a session. That secret is the reason "Reset the link" exists.
//
// WHAT IT PROMISES IS "within a day", NOT "instantly". Apple checks about
// hourly, Google is slower and has been known to take most of a day. The card
// says so, because a sync feature that silently lags is worse than one that
// told you it might.

const FEED_BASE = 'https://heuhqqoxyggawuckxocp.supabase.co/functions/v1/calendar-feed'

export default function SubscribeCalendar({ open, onClose }) {
  const [token, setToken] = useState(null)
  const [busy, setBusy] = useState(false)

  const mint = useCallback(async () => {
    const { data, error } = await supabase.rpc('my_calendar_token')
    if (!error) setToken(data)
  }, [])

  useEffect(() => { if (open && !token) mint() }, [open, token, mint])

  const https = token ? `${FEED_BASE}?token=${token}` : ''
  // webcal:// is what makes a tap on a phone open the Calendar app's subscribe
  // sheet instead of downloading a file into Downloads. It is the same URL with
  // a different scheme; every reader that understands one understands the other.
  const webcal = https.replace(/^https?:\/\//, 'webcal://')
  const googleAdd = https
    ? `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(https)}`
    : ''

  async function reset() {
    if (!await confirm('Reset the link? Any calendar already subscribed to the old one will stop updating.')) return
    setBusy(true)
    const { data, error } = await supabase.rpc('rotate_calendar_token')
    setBusy(false)
    if (error) { toast('Could not reset the link'); return }
    setToken(data)
    toast('New link created')
  }

  return (
    <Modal open={open} onClose={onClose} title="Sync with your calendar" wide>
      {!token ? (
        <div className="flex justify-center py-10"><Spinner className="h-6 w-6" /></div>
      ) : (
        <div className="space-y-5">
          <p className="text-sm text-smoke">
            Subscribe once and everything on this page keeps itself up to date in your own calendar:
            events for your markets, challenge dates, your flights and your own personal days. New
            things appear on their own, usually within a day.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <a
              href={webcal}
              className="group flex items-center gap-3 rounded-card border border-gray-100 bg-white p-4 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/50 hover:shadow-lift"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand text-white transition-transform duration-200 group-hover:scale-110">
                <Icon name="device" className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-ink">Apple Calendar</span>
                <span className="block text-xs text-smoke">iPhone, iPad, Mac and Outlook</span>
              </span>
            </a>
            <a
              href={googleAdd}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-3 rounded-card border border-gray-100 bg-white p-4 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/50 hover:shadow-lift"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand text-white transition-transform duration-200 group-hover:scale-110">
                <Icon name="globe" className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-ink">Google Calendar</span>
                <span className="block text-xs text-smoke">Opens the add-by-URL screen</span>
              </span>
            </a>
          </div>

          <div>
            <p className="label">Or paste this link into any calendar app</p>
            <div className="flex items-center gap-2 rounded-xl border border-gray-100 bg-cloud/50 p-2">
              <code className="min-w-0 flex-1 truncate px-1 text-[11px] text-smoke">{https}</code>
              <CopyButton value={https} label="Copy" />
            </div>
            <p className="mt-2 flex items-start gap-1.5 text-xs text-smoke">
              <Icon name="shield" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                This link is yours alone and anyone who has it can read your calendar. Keep it private.
              </span>
            </p>
          </div>

          <button
            type="button" onClick={reset} disabled={busy}
            className="text-xs font-semibold text-smoke transition-colors hover:text-ink"
          >
            {busy ? 'Resetting…' : 'Reset the link'}
          </button>
        </div>
      )}
    </Modal>
  )
}
