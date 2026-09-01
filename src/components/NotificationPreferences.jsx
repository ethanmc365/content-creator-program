import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Modal, Panel, Toggle } from './ui'
import Icon from './Icon'
import { enablePush, pushSupported, pushPermission, showLocalNotification } from '../lib/push'
import { cx } from '../lib/utils'
import { useT } from '../lib/i18n'

// Whether this device has EVER had push granted. Local, because it is a fact
// about the device rather than about the account: the same creator on a laptop
// and a phone can honestly answer differently, and the point of it is to tell
// "you switched these off" apart from "you never switched these on".
const PUSH_EVER_KEY = 'tryp-push-granted-once'

// Notification preferences, extracted from the old standalone page so they can
// live INLINE inside the Settings page (one place, no click-through). The state
// hook is owned once by the parent and shared by both the creator sections and
// the admin section, so toggling one never clobbers the other's keys in the
// single profiles.notif_prefs JSON blob.

// What creators can switch on and off. Keys match the notification `type`
// column and the profiles.notif_prefs JSON.
//
// `emailable` used to mark the categories that also went out by email. Email
// notifications are OFF across the board as of Jul 27 2026 (see EMAIL_ENABLED
// below), so the flag currently does nothing but is left in place: it records
// which categories are worth an email if and when they come back.
export const CATEGORIES = [
  { key: 'announcement', label: 'Announcements', hint: 'Official updates from the Tryp.com Team.', emailable: true },
  { key: 'challenge', label: 'New challenges', hint: 'When a fresh challenge goes live.', emailable: true },
  { key: 'event', label: 'Events', hint: 'Q&As, content days and milestones on the calendar.', emailable: true },
  { key: 'dm', label: 'Direct messages', hint: 'When another creator messages you directly.' },
  // Chat notifications are throttled server-side (one per channel every 15
  // minutes, and never while you're actively in the app), so a busy #general
  // costs a nudge rather than a stream of buzzes. See migration 067.
  { key: 'chat', label: 'Community chat', hint: 'New messages in #general and #content-tips, at most one nudge every 15 minutes.', pushOnly: true },
  { key: 'results', label: 'Results', hint: "When a challenge's results are published." },
  { key: 'reward', label: 'Rewards', hint: 'When a reward or payout comes your way.' },
  { key: 'connection', label: 'New connections', hint: 'When a creator connects with you.' },
]

// Admin-only alerts (hidden from regular creators). Push and the in-app bell
// only, same as everything else while email notifications are off.
export const ADMIN_CATEGORIES = [
  { key: 'application', label: 'New creator applications', hint: 'When a creator submits their profile for review.', emailable: true },
  { key: 'submission', label: 'New challenge entries', hint: 'When a creator submits a video to a challenge.', emailable: true },
  { key: 'new_member', label: 'New creators joined', hint: 'When a creator is approved and becomes active.', emailable: true },
  { key: 'referral', label: 'New referrals', hint: 'When a creator logs a referral lead.', emailable: true },
  { key: 'deletion', label: 'Account deletion requests', hint: 'When a creator schedules their account for deletion.', emailable: true },
  { key: 'inactive', label: 'Inactive creators', hint: 'When a creator has not logged in for 30+ days.', emailable: true },
  { key: 'feedback', label: 'Bug reports & ideas', hint: 'When a creator reports a bug or suggests a feature.', emailable: true },
]

const DEFAULT_PREFS = Object.fromEntries(CATEGORIES.map((c) => [c.key, true]))
// Only the emailable categories default to on; everything else is push-only.
const DEFAULT_EMAIL = { announcement: true, challenge: true, event: true, dm: false, chat: false, connection: false, results: false, reward: false }

// Email notifications are OFF (Jul 27 2026).
//
// Mailing the whole community from a shared mailbox got the platform flagged as
// a bulk sender, and Gmail started blocking the messages. Rather than ship
// toggles for something that does not reliably arrive, the Email column is
// hidden and notify-dispatch no longer sends email at all. The platform now
// emails only password resets and one welcome message per new creator.
//
// Everything behind this flag (the toggles, the email_prefs writes, DEFAULT_EMAIL)
// is left intact, so flipping it back to true is all it takes once there is a
// verified sending domain.
const EMAIL_ENABLED = false

// Shared state owned once by the parent (Settings). Both the creator and admin
// sections read/write the SAME prefs object, so writes always carry every key.
export function useNotificationPrefs() {
  const { user, profile, refreshProfile } = useAuth()
  const [prefs, setPrefs] = useState({ ...DEFAULT_PREFS, ...(profile?.notif_prefs || {}) })
  const [emailPrefs, setEmailPrefs] = useState({ ...DEFAULT_EMAIL, ...(profile?.email_prefs || {}) })
  const [reminderDays, setReminderDays] = useState(profile?.challenge_reminder_days ?? [3, 1])
  const [permission, setPermission] = useState(pushPermission())
  const [busy, setBusy] = useState(false)
  const [pushMsg, setPushMsg] = useState('')

  async function togglePush(key, value) {
    const next = { ...prefs, [key]: value }
    setPrefs(next)
    await supabase.from('profiles').update({ notif_prefs: next }).eq('id', user.id)
    refreshProfile()
  }
  async function toggleEmail(key, value) {
    const next = { ...emailPrefs, [key]: value }
    setEmailPrefs(next)
    await supabase.from('profiles').update({ email_prefs: next }).eq('id', user.id)
    refreshProfile()
  }
  async function toggleReminderDay(d) {
    const next = reminderDays.includes(d) ? reminderDays.filter((x) => x !== d) : [...reminderDays, d].sort((a, b) => b - a)
    setReminderDays(next)
    await supabase.from('profiles').update({ challenge_reminder_days: next }).eq('id', user.id)
    refreshProfile()
  }
  async function turnOnPush() {
    setBusy(true); setPushMsg('')
    const result = await enablePush(user.id)
    setPermission(pushPermission()); setBusy(false)
    if (result === 'granted') setPushMsg('Notifications are on for this device.')
    else if (result === 'denied') setPushMsg('Your browser is blocking notifications. Enable them in your browser settings, then try again.')
    else if (result === 'unsupported') setPushMsg('This browser does not support push notifications.')
    else setPushMsg('Something went wrong turning on notifications. Please try again.')
  }
  // THERE IS NO "TURN OFF" BUTTON, AND THAT IS DELIBERATE (1 Sep 2026).
  //
  // Ethan: "remove the turn off push notifications button, we shouldn't have
  // this button, once they enabled they enabled but creators can obviously turn
  // them off on the actual settings on their phone."
  //
  // He is right, and the reason is that this button never did what it looked
  // like it did. It dropped the SUBSCRIPTION but it cannot touch the browser
  // PERMISSION, so pressing it left the device permanently permitted and
  // silently unsubscribed - a state no operating system setting explains and
  // which reads as "notifications are broken". The switch that genuinely turns
  // them off lives in iOS and Android settings, is one somebody already knows
  // how to find, and is honest about what it does.
  //
  // What is left in here is per-TYPE control, which is the thing a creator
  // actually wants ("stop telling me about new members, keep telling me about
  // challenges"), and which this page has always had.

  // AND THE APP NOTICES WHEN THEY DO TURN THEM OFF THERE.
  //
  // Ethan: "ensure the app notices if they do this and prompts them to
  // re-enable them again." The permission is only read on mount, so a creator
  // who switched it off in iOS settings and came back saw "On for this device"
  // for ever. It is re-read whenever the tab is shown again, which is exactly
  // when they get back from the settings app.
  useEffect(() => {
    const recheck = () => setPermission(pushPermission())
    document.addEventListener('visibilitychange', recheck)
    window.addEventListener('focus', recheck)
    return () => {
      document.removeEventListener('visibilitychange', recheck)
      window.removeEventListener('focus', recheck)
    }
  }, [])

  // Whether this device HAD a subscription. A creator who has been turned off
  // at the OS level is not the same as one who never switched it on, and the
  // prompt has to be able to tell them apart - "turn these back on" is the
  // wrong sentence for somebody who has never had them.
  const [hadPush, setHadPush] = useState(() => {
    try { return localStorage.getItem(PUSH_EVER_KEY) === '1' } catch { return false }
  })
  useEffect(() => {
    if (permission !== 'granted') return
    try { localStorage.setItem(PUSH_EVER_KEY, '1') } catch { /* private mode */ }
    setHadPush(true)
  }, [permission])

  return { prefs, emailPrefs, reminderDays, permission, hadPush, busy, pushMsg, togglePush, toggleEmail, toggleReminderDay, turnOnPush }
}

// A single per-type row with a push toggle (and, once email is live, an email one).
function PrefRow({ c, state }) {
  const tr = useT()
  return (
    <div className="flex items-center gap-4 border-b border-gray-100 py-4 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{c.label}</p>
        <p className="text-xs text-smoke">{c.hint}</p>
      </div>
      <div className="flex w-11 justify-center">
        <Toggle on={state.prefs[c.key] !== false} onChange={(v) => state.togglePush(c.key, v)} label={`${c.label} push`} />
      </div>
      {EMAIL_ENABLED && (
        <div className="flex w-11 justify-center">
          {/* Only a few categories are worth emailing; the rest show a dash so
              it's clear they're in-app/push only rather than switched off. */}
          {c.emailable
            ? <Toggle on={state.emailPrefs[c.key] === true} onChange={(v) => state.toggleEmail(c.key, v)} label={`${c.label} email`} />
            : <span className="text-[11px] text-gray-300" title={tr("This one is in-app and push only")}>-</span>}
        </div>
      )}
    </div>
  )
}

// The heading of one block. It used to be a `border-t` divider inside a single
// tall card; now each block IS a card on a desktop, so the rule is the card's
// own edge and this is just the title.
function BlockTitle({ title, hint }) {
  return (
    <div className="mb-1">
      {/* HEAVIER THAN THE ROWS UNDER IT. Ethan: "notification settings,
          everything seems a bit clustered there." On a desktop each block is a
          card and the card's edge does the separating; on a PHONE a Panel draws
          nothing at all, so a `text-sm font-semibold` block title sat at exactly
          the same weight as the `text-sm font-semibold` name of every setting
          below it - four headings and eighteen rows, all the same size, with no
          edges. It read as one undifferentiated wall of switches, which is the
          clustering. */}
      <h3 className="text-base font-bold text-ink">{title}</h3>
      {hint && <p className="mt-0.5 text-xs leading-relaxed text-smoke">{hint}</p>}
    </div>
  )
}

// FOUR BLOCKS, NOT ONE WALL.
//
// Ethan: "for the notification settings, I feel like it's hard to read, and it
// doesn't really make sense. I would change the UI and improve it."
//
// It was one `card` about nine hundred pixels tall holding four unrelated
// decisions - whether this browser may buzz you, which of eight categories you
// want, when to be reminded about a deadline, and when to be reminded about a
// puzzle - separated by hairlines and introduced by an <h2> reading
// "Notifications" directly under a page heading reading "Notifications". So the
// first thing on the page was a repetition and the rest was a scroll.
//
// Each block is its own `Panel` now: a card on a desktop, a plain block on a
// phone (see the note there). The duplicate heading and its strapline are gone,
// and so is the "PUSH" column label - email is off across the board, so it was
// a heading over the only column there is.
export function CreatorNotifications({ state }) {
  const tr = useT()
  const supported = pushSupported()
  return (
    // `divide-y` under `sm` is the card edge a Panel does not draw on a phone.
    // Above `sm` every block IS a card, so the rule would be a line inside a
    // border - hence the breakpoint on both halves.
    <div className="max-sm:divide-y max-sm:divide-gray-100 max-sm:[&>*:not(:first-child)]:pt-6 max-sm:[&>*:not(:last-child)]:pb-6 sm:space-y-5">
      {/* ---- This device ---- */}
      <Panel className="space-y-4">
        <BlockTitle
          title={tr("This device")}
          hint={tr("Alerts even when the app is closed. Add the app to your home screen for the best experience.")}
        />
        {!supported ? (
          <p className="rounded-xl bg-cloud px-4 py-3 text-sm text-smoke">
            {tr("This browser does not support push notifications. Try Chrome, Edge or installing the app to your home screen.")}
          </p>
        ) : state.permission === 'granted' ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-full bg-green-50 px-3 py-1.5 text-sm font-medium text-green-700">
              <span className="h-2 w-2 rounded-full bg-green-500" /> {tr("On for this device")}
            </span>
            <button onClick={() => showLocalNotification({ title: 'Tryp.com', body: 'Test notification - you are all set!', link: '/notifications' })} className="btn-secondary !py-2 text-xs">
              {tr("Send a test")}
            </button>
            {/* No "Turn off". See the note beside `turnOnPush`: it could never
                do what it looked like it did, and the switch that can is in the
                phone's own settings. */}
          </div>
        ) : state.permission === 'denied' ? (
          // BLOCKED AT THE OPERATING SYSTEM, AND SAID SO.
          //
          // `Notification.requestPermission()` resolves instantly with 'denied'
          // once a device has been told no - it does not re-prompt - so an
          // "Enable notifications" button here is a button that cannot work.
          // What it needs is the two sentences that tell somebody where the
          // real switch is. `hadPush` picks which two: a creator who had them
          // and lost them is being told something changed, and a creator who
          // never turned them on is being told how.
          <div className="flex items-start gap-3 rounded-xl border border-brand/20 bg-brand-tint/30 px-4 py-3.5">
            <Icon name="mute" className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-brand">
                {state.hadPush ? tr('Notifications were switched off on this device') : tr('This device is blocking notifications')}
              </p>
              <p className="mt-0.5 text-sm text-smoke">
                {state.hadPush
                  ? tr('You had these on. Your phone is blocking them now, so you are missing challenge deadlines, replies and results.')
                  : tr('We cannot ask again from here once a device has said no.')}
              </p>
              <p className="mt-2 text-xs text-smoke">
                {tr('Turn them back on in Settings → Notifications → Tryp.com (iPhone), or by pressing the padlock beside the address bar and allowing notifications (browser).')}
              </p>
              <button
                onClick={state.turnOnPush}
                disabled={state.busy}
                className="btn-secondary mt-3 !py-2 text-xs"
              >
                {tr('I have turned them on - check again')}
              </button>
            </div>
          </div>
        ) : (
          <button onClick={state.turnOnPush} disabled={state.busy} className="btn-primary"
            data-tour="enable-push">
            {state.busy ? 'Enabling…' : 'Enable notifications on this device'}
          </button>
        )}
        {state.pushMsg && <p className="text-sm text-smoke">{state.pushMsg}</p>}
      </Panel>

      {/* ---- What you're notified about ---- */}
      <Panel>
        <BlockTitle
          title={tr("What you're notified about")}
          hint={EMAIL_ENABLED
            ? 'Email is reserved for the things worth leaving the app for. A dash means in-app and push only.'
            : 'Your in-app bell always keeps a record, whatever you turn off here.'}
        />
        {EMAIL_ENABLED && (
          <div className="mt-3 flex items-center justify-end gap-3 border-b border-gray-100 pb-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            <span className="w-11 text-center">{tr("Push")}</span>
            <span className="w-11 text-center">{tr("Email")}</span>
          </div>
        )}
        <div className="mt-2">
          {CATEGORIES.map((c) => <PrefRow key={c.key} c={c} state={state} />)}
        </div>
      </Panel>

      {/* ---- Challenge deadline reminders ---- */}
      <Panel>
        <BlockTitle title={tr("Challenge deadline reminders")} hint={tr("A nudge before a live challenge closes, so you can get your entries in.")} />
        <DeadlineReminderDays state={state} />
      </Panel>

      {/* ---- Daily puzzle reminders ---- */}
      <Panel>
        <BlockTitle title={tr("Daily puzzle reminders")} hint={tr("Never break a run on Guess the Country or Flight Path. Push only.")} />
        <div className="mt-2">
          <div className="flex items-center gap-4 border-b border-gray-100 py-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{tr("Streak reminder")}</p>
              <p className="text-xs text-smoke">{tr("If your streak is at risk, we’ll nudge you around 6pm to play before midnight.")}</p>
            </div>
            <div className="flex w-11 justify-center">
              <Toggle on={state.prefs.daily_streak !== false} onChange={(v) => state.togglePush('daily_streak', v)} label={tr("Daily streak reminder")} />
            </div>
          </div>
          <div className="flex items-center gap-4 py-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{tr("Remind me to play")}</p>
              <p className="text-xs text-smoke">{tr("A gentle reminder around 10am each day to play the daily puzzles.")}</p>
            </div>
            <div className="flex w-11 justify-center">
              <Toggle on={state.prefs.daily_reminder === true} onChange={(v) => state.togglePush('daily_reminder', v)} label={tr("Daily puzzle reminder")} />
            </div>
          </div>
        </div>
      </Panel>

      <p className="px-1 text-xs text-smoke">
        {tr("Account-critical email, like a password reset link, is always sent whatever you choose here.")}
      </p>
    </div>
  )
}


// Admin-only alert toggles. Rendered at the very bottom of Settings, only for
// admins. Shares the same prefs state as the creator section above.
export function AdminNotifications({ state }) {
  const tr = useT()
  return (
    <>
      <div className="flex items-center justify-end gap-3 border-b border-gray-100 pb-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
        <span className="w-11 text-center">{tr("Push")}</span>
        {EMAIL_ENABLED && <span className="w-11 text-center">{tr("Email")}</span>}
      </div>
      {ADMIN_CATEGORIES.map((c) => <PrefRow key={c.key} c={c} state={state} />)}
      <p className="mt-4 text-xs text-smoke">
        {tr("These alerts only ever go to the Tryp.com Team. Creators never receive them, even by mistake.")}
      </p>
    </>
  )
}


// ---------------------------------------------------------------- deadlines
//
// THE SAME CONTROL IN TWO PLACES, WHICH IS THE WHOLE POINT.
//
// The lead times for a challenge deadline lived only in Settings, three taps
// from the calendar where the deadline is actually being looked at. The owner:
// "for the deadlines, the reminder should open up the settings page where you
// can select what reminders you want for deadlines, or instead even just open
// this particular section as a popup card, like the deadline notification
// section from settings still appears in settings but also as a popup here when
// you click the bell."
//
// So it is one component. Settings renders it inline; the calendar's bell
// renders it in a modal. Not two forms writing the same column - that is how
// the notification bell and the notifications page ended up disagreeing with
// each other, which took a rewrite to undo.
//
// WHY A DEADLINE IS DIFFERENT FROM EVERYTHING ELSE ON THE CALENDAR. Every other
// entry gets a one-off reminder pinned to that entry (`event_reminders`, keyed
// by the thing). A challenge deadline is not a one-off: the programme runs a
// new challenge every few weeks and nobody wants to re-arm a bell each time.
// The answer there is a STANDING preference - "always warn me three days out" -
// which is what `profiles.challenge_reminder_days` and the nightly
// `send_challenge_reminders` cron already implement. The bell on a deadline
// therefore opens the standing setting rather than creating a row.
export function DeadlineReminderDays({ state }) {
  const tr = useT()
  return (
    <>
      <div className="mt-3 flex flex-wrap gap-2">
        {[14, 7, 5, 3, 1].map((d) => {
          const on = state.reminderDays.includes(d)
          return (
            <button
              key={d}
              type="button"
              onClick={() => state.toggleReminderDay(d)}
              aria-pressed={on}
              className={cx(
                'inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold transition-all duration-200 active:scale-95',
                on
                  ? 'bg-brand text-white shadow-card'
                  : 'border border-gray-200 text-smoke hover:-translate-y-0.5 hover:border-brand hover:text-brand',
              )}
            >
              {on && <Icon name="check" className="h-3.5 w-3.5" />}
              {d} day{d > 1 ? 's' : ''} before
            </button>
          )
        })}
      </div>
      {state.reminderDays.length === 0 && (
        // NOT AMBER. The palette here is brand orange and charcoal, and this is
        // not a warning anyway - it is a consequence of a choice somebody just
        // made deliberately.
        <p className="mt-3 text-xs text-smoke">
          {tr("Nothing selected, so we will not remind you before a challenge closes.")}
        </p>
      )}
    </>
  )
}

/** The same control, as a card over the calendar. See DeadlineReminderDays. */
export function DeadlineReminderModal({ open, onClose }) {
  const tr = useT()
  const state = useNotificationPrefs()
  return (
    <Modal open={open} onClose={onClose} title={tr("Remind me before a deadline")}>
      <div className="space-y-4">
        <p className="text-sm text-smoke">
          {tr("This is a standing setting, not a one-off: it applies to every challenge the programme runs, so you never have to arm it again.")}
        </p>
        <DeadlineReminderDays state={state} />
        <p className="flex items-start gap-2 rounded-xl bg-cloud/60 p-3 text-xs text-smoke">
          <Icon name="bell" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" />
          <span>
            {tr("Reminders arrive as a push notification.")}
          </span>
        </p>
        <div className="flex justify-end">
          <button onClick={onClose} className="btn-primary">{tr("Done")}</button>
        </div>
      </div>
    </Modal>
  )
}
