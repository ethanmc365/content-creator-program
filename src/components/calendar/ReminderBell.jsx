import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { toast } from '../../lib/toast'
import Icon from '../Icon'
import { cx } from '../../lib/utils'

// "REMIND ME BEFORE THIS."
//
// A bell on any entry. Pick a lead time, and a row goes into `event_reminders`;
// a five-minute cron turns the due ones into notifications, and migration 010's
// trigger already turns a notification into a push. So this reuses the whole
// existing pipeline and adds no new delivery path - which is the reason it is a
// row in a table rather than a scheduled job per person.
//
// IT WORKS ON THINGS THAT ARE NOT EVENTS. The key is text ('flight:<id>',
// 'challenge:<id>:end'), because half of what is on this calendar is derived
// and has no `events.id` to point at. A bell on a challenge deadline is
// arguably the most useful one on the page and it would be impossible with a
// foreign key.
//
// THE TITLE AND TIME ARE COPIED IN. The cron must be able to write the
// notification without knowing how to rebuild a flight or an invoice.

const CHOICES = [
  { minutes: 15, label: '15 minutes before' },
  { minutes: 60, label: '1 hour before' },
  { minutes: 180, label: '3 hours before' },
  { minutes: 1440, label: 'The day before' },
  { minutes: 4320, label: '3 days before' },
]

// See the note in the component: a flight is a date, not a time.
const FLIGHT_CHOICES = [
  { minutes: 720, label: 'The morning of' },
  { minutes: 1440, label: 'The day before' },
  { minutes: 2880, label: '2 days before' },
  { minutes: 4320, label: '3 days before' },
  { minutes: 10080, label: 'A week before' },
]

// `now` is passed in rather than read here: `react-hooks/purity` bans a clock
// call during render, and the calendar page already keeps one slow-ticking
// clock so that every "in 3 days" on the page agrees with every other one.
export default function ReminderBell({ item, now, className = '', onOpenDeadlinePrefs }) {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [set, setSet] = useState(null)   // the saved minutes_before, or null
  const [busy, setBusy] = useState(false)
  const boxRef = useRef(null)

  const startsAt = new Date(item.date)
  const nowMs = (now ? now.getTime() : 0)
  const past = nowMs > 0 && startsAt.getTime() <= nowMs

  useEffect(() => {
    // A deadline never has a row (see below), so it must not ask for one - that
    // would be one wasted query per deadline card on the page.
    if (!user || past || item.kind === 'deadline') return undefined
    let alive = true
    supabase.from('event_reminders')
      .select('minutes_before')
      .eq('user_id', user.id).eq('event_key', item.key)
      .maybeSingle()
      .then(({ data }) => { if (alive) setSet(data?.minutes_before ?? null) })
    return () => { alive = false }
  }, [user, item.key, past, item.kind])

  // Close on an outside press. A `<details>` would do this for free but cannot
  // be closed from inside a click handler without reaching for the DOM, and
  // this menu has to close itself after saving.
  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => { if (!boxRef.current?.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // A lead time longer than the time remaining would be saved and never fire.
  // Offering it is worse than hiding it, because the bell would look armed.
  // A FLIGHT HAS NO DEPARTURE TIME, so its lead times are day-scale only.
  //
  // The log stores a DATE, and `calendarSources` stamps it at midday so it
  // cannot drift across the date line when rendered in another zone. Offering
  // "15 minutes before" against a made-up midday would fire at 11:45 on a
  // flight that might leave at 06:00 - a reminder that is wrong is worse than
  // no reminder. Days out is the honest resolution, and it is also the useful
  // one: what you want warning about is packing, not boarding.
  const scale = item.kind === 'flight' || item.kind === 'trip' ? FLIGHT_CHOICES : CHOICES
  const usable = scale.filter((c) => startsAt.getTime() - c.minutes * 60_000 > nowMs)

  if (past || !user) return null

  // A DEADLINE'S BELL OPENS THE STANDING SETTING, NOT A ONE-OFF ROW.
  //
  // Every other entry on this calendar happens once, so a bell on it is a row
  // in `event_reminders` pinned to that entry. A challenge deadline is not like
  // that: the programme runs a new challenge every few weeks and nobody wants
  // to re-arm a bell each time. There is already a standing preference for it
  // (`profiles.challenge_reminder_days`, driven by the nightly
  // `send_challenge_reminders` cron), so the bell opens THAT instead of
  // creating a row that would fire once and then be wrong for the next
  // challenge. See components/NotificationPreferences.
  if (item.kind === 'deadline') {
    return (
      <button
        type="button"
        onClick={() => onOpenDeadlinePrefs?.()}
        aria-label="Choose when to be reminded about deadlines"
        title="Choose when to be reminded about deadlines"
        className={cx(
          'flex h-8 w-8 items-center justify-center rounded-full text-smoke transition-all duration-200 hover:bg-brand-tint hover:text-brand active:scale-90',
          className,
        )}
      >
        <Icon name="bell" className="h-4 w-4" />
      </button>
    )
  }

  async function choose(minutes) {
    if (busy) return
    setBusy(true)
    const remindAt = new Date(startsAt.getTime() - minutes * 60_000).toISOString()
    const { error } = await supabase.from('event_reminders').upsert({
      user_id: user.id,
      event_key: item.key,
      title: item.title,
      starts_at: startsAt.toISOString(),
      remind_at: remindAt,
      minutes_before: minutes,
      link: item.link || '/events',
      // Re-arming a bell that already fired has to clear the mark or the cron
      // will skip it.
      sent_at: null,
    }, { onConflict: 'user_id,event_key' })
    setBusy(false)
    setOpen(false)
    if (error) { toast('Could not set that reminder'); return }
    setSet(minutes)
    toast(`Reminder set: ${(scale.find((c) => c.minutes === minutes)?.label || '').toLowerCase()}`)
  }

  async function clear() {
    if (busy) return
    setBusy(true)
    await supabase.from('event_reminders').delete().eq('user_id', user.id).eq('event_key', item.key)
    setBusy(false)
    setOpen(false)
    setSet(null)
    toast('Reminder removed')
  }

  const label = set ? scale.find((c) => c.minutes === set)?.label : null

  return (
    <span ref={boxRef} className={cx('relative inline-flex', className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={set ? `Reminder set: ${label}` : 'Remind me before this'}
        title={set ? `Reminder set: ${label}` : 'Remind me before this'}
        className={cx(
          'flex h-8 w-8 items-center justify-center rounded-full transition-all duration-200 active:scale-90',
          set
            ? 'bg-brand text-white shadow-card hover:scale-110'
            : 'text-smoke hover:bg-brand-tint hover:text-brand',
        )}
      >
        <Icon name="bell" className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-9 z-40 w-52 overflow-hidden rounded-card border border-gray-100 bg-white p-1 shadow-lift animate-menu-in">
          <p className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-smoke">Remind me</p>
          {usable.length === 0 && (
            <p className="px-3 pb-2 text-xs text-smoke">This one is too close to set a reminder for.</p>
          )}
          {usable.map((c) => (
            <button
              key={c.minutes}
              type="button"
              onClick={() => choose(c.minutes)}
              className={cx(
                'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-cloud',
                set === c.minutes ? 'font-semibold text-brand' : 'text-ink',
              )}
            >
              {set === c.minutes ? <Icon name="check" className="h-3.5 w-3.5" /> : <span className="w-3.5" />}
              {c.label}
            </button>
          ))}
          {set != null && (
            <button
              type="button"
              onClick={clear}
              className="mt-1 flex w-full items-center gap-2 rounded-lg border-t border-gray-50 px-3 py-2 text-left text-sm text-smoke transition-colors hover:bg-cloud hover:text-ink"
            >
              <Icon name="close" className="h-3.5 w-3.5" />
              Turn it off
            </button>
          )}
        </div>
      )}
    </span>
  )
}
