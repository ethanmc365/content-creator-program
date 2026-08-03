import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Toggle } from './ui'
import Icon from './Icon'
import { enablePush, disablePush, pushSupported, pushPermission, showLocalNotification } from '../lib/push'
import { cx } from '../lib/utils'

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
  async function turnOffPush() {
    setBusy(true); await disablePush(); setBusy(false)
    setPushMsg('Push notifications turned off for this device.')
  }

  return { prefs, emailPrefs, reminderDays, permission, busy, pushMsg, togglePush, toggleEmail, toggleReminderDay, turnOnPush, turnOffPush }
}

// A single per-type row with a push toggle (and, once email is live, an email one).
function PrefRow({ c, state }) {
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
            : <span className="text-[11px] text-gray-300" title="This one is in-app and push only">-</span>}
        </div>
      )}
    </div>
  )
}

// A labelled divider between blocks inside the single notifications card.
function Divider({ title, hint }) {
  return (
    <div className="border-t border-gray-100 pt-6">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {hint && <p className="mt-0.5 text-xs text-smoke">{hint}</p>}
    </div>
  )
}

// EVERY notification setting in ONE card: this device, what you're notified
// about, challenge deadline reminders and daily puzzle reminders. Previously
// four separate cards, which read as unrelated settings when they're all the
// same thing.
export function CreatorNotifications({ state }) {
  const supported = pushSupported()
  return (
    <section className="card">
      <div className="flex items-center gap-2">
        <Icon name="bell" className="h-5 w-5 text-brand" />
        <h2 className="text-lg font-semibold">Notifications</h2>
      </div>
      <p className="mt-1 text-sm text-smoke">
        Choose how you hear about what's happening. Your in-app bell always keeps a record.
      </p>

      {/* ---- This device ---- */}
      <div className="mt-6 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-ink">This device</h3>
          <p className="mt-0.5 text-xs text-smoke">
            Get alerts even when the app is closed. Add the app to your home screen for the best experience.
          </p>
        </div>
        {!supported ? (
          <p className="rounded-xl bg-cloud px-4 py-3 text-sm text-smoke">
            This browser does not support push notifications. Try Chrome, Edge or installing the app to your home screen.
          </p>
        ) : state.permission === 'granted' ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-full bg-green-50 px-3 py-1.5 text-sm font-medium text-green-700">
              <span className="h-2 w-2 rounded-full bg-green-500" /> On for this device
            </span>
            <button onClick={() => showLocalNotification({ title: 'Tryp.com', body: 'Test notification - you are all set!', link: '/notifications' })} className="btn-secondary !py-2 text-xs">
              Send a test
            </button>
            <button onClick={state.turnOffPush} disabled={state.busy} className="btn-ghost !py-2 text-xs">Turn off</button>
          </div>
        ) : (
          <button onClick={state.turnOnPush} disabled={state.busy} className="btn-primary">
            {state.busy ? 'Enabling…' : 'Enable notifications on this device'}
          </button>
        )}
        {state.pushMsg && <p className="text-sm text-smoke">{state.pushMsg}</p>}
      </div>

      {/* ---- What you're notified about ---- */}
      <div className="mt-6">
        <Divider
          title="What you're notified about"
          hint={EMAIL_ENABLED ? 'Email is reserved for the things worth leaving the app for. A dash means in-app and push only.' : 'Push notifications and your in-app bell. Email notifications are coming soon.'}
        />
        <div className="mt-3 flex items-center justify-end gap-3 border-b border-gray-100 pb-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
          <span className="w-11 text-center">Push</span>
          {EMAIL_ENABLED && <span className="w-11 text-center">Email</span>}
        </div>
        {CATEGORIES.map((c) => <PrefRow key={c.key} c={c} state={state} />)}
      </div>

      {/* ---- Challenge deadline reminders ---- */}
      <div className="mt-6">
        <Divider title="Challenge deadline reminders" hint="Get reminded before a live challenge closes so you can get your entries in." />
        <div className="mt-3 flex flex-wrap gap-2">
          {[14, 7, 5, 3].map((d) => {
            const on = state.reminderDays.includes(d)
            return (
              <button
                key={d}
                type="button"
                onClick={() => state.toggleReminderDay(d)}
                aria-pressed={on}
                className={cx('rounded-full px-4 py-1.5 text-xs font-medium transition-colors', on ? 'bg-brand text-white' : 'border border-gray-200 text-smoke hover:border-brand hover:text-brand')}
              >
                {d} day{d > 1 ? 's' : ''} before
              </button>
            )
          })}
        </div>
        {state.reminderDays.length === 0 && (
          <p className="mt-3 text-xs text-amber-600">No reminders selected, so you won't be reminded about deadlines.</p>
        )}
      </div>

      {/* ---- Daily puzzle reminders ---- */}
      <div className="mt-6">
        <Divider title="Daily puzzle reminders" hint="Never break a run on Guess the Country or Flight Path. Push only." />
        <div className="mt-1">
          <div className="flex items-center gap-4 border-b border-gray-100 py-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Streak reminder</p>
              <p className="text-xs text-smoke">If your streak is at risk, we'll nudge you around 6pm to play before midnight.</p>
            </div>
            <div className="flex w-11 justify-center">
              <Toggle on={state.prefs.daily_streak !== false} onChange={(v) => state.togglePush('daily_streak', v)} label="Daily streak reminder" />
            </div>
          </div>
          <div className="flex items-center gap-4 py-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Remind me to play</p>
              <p className="text-xs text-smoke">A gentle reminder around 10am each day to play the daily puzzles.</p>
            </div>
            <div className="flex w-11 justify-center">
              <Toggle on={state.prefs.daily_reminder === true} onChange={(v) => state.togglePush('daily_reminder', v)} label="Daily puzzle reminder" />
            </div>
          </div>
        </div>
      </div>

      <p className="mt-5 border-t border-gray-100 pt-4 text-xs text-smoke">
        Account-critical email, like a password reset link, is always sent whatever you choose here.
      </p>
    </section>
  )
}


// Admin-only alert toggles. Rendered at the very bottom of Settings, only for
// admins. Shares the same prefs state as the creator section above.
export function AdminNotifications({ state }) {
  return (
    <>
      <div className="flex items-center justify-end gap-3 border-b border-gray-100 pb-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
        <span className="w-11 text-center">Push</span>
        {EMAIL_ENABLED && <span className="w-11 text-center">Email</span>}
      </div>
      {ADMIN_CATEGORIES.map((c) => <PrefRow key={c.key} c={c} state={state} />)}
      <p className="mt-4 text-xs text-smoke">
        These alerts only ever go to the Tryp.com Team. Creators never receive them, even by mistake.
      </p>
    </>
  )
}
