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
// `emailable` marks the few categories that are worth an email. Everything else
// is push + the in-app bell only. The rule: email is for things a creator would
// be annoyed to MISS (a challenge opening, an event they'd attend, an official
// announcement). Chatter - DMs, general chat, reactions - stays in the app, and
// rewards/connections are timely enough as push.
export const CATEGORIES = [
  { key: 'announcement', label: 'Announcements', hint: 'Official updates from the Tryp.com Team.', emailable: true },
  { key: 'challenge', label: 'New challenges', hint: 'When a fresh challenge goes live.', emailable: true },
  { key: 'event', label: 'Events', hint: 'Q&As, content days and milestones on the calendar.', emailable: true },
  { key: 'dm', label: 'Direct messages', hint: 'When another creator messages you directly.' },
  { key: 'chat', label: 'General chat', hint: 'New messages in the #general channel.', pushOnly: true },
  { key: 'results', label: 'Results', hint: "When a challenge's results are published." },
  { key: 'reward', label: 'Rewards', hint: 'When a reward or payout comes your way.' },
  { key: 'connection', label: 'New connections', hint: 'When a creator connects with you.' },
]

// Admin-only alerts (hidden from regular creators).
export const ADMIN_CATEGORIES = [
  { key: 'application', label: 'New creator applications', hint: 'When a creator submits their profile for review.' },
  { key: 'submission', label: 'New challenge entries', hint: 'When a creator submits a video to a challenge.' },
  { key: 'new_member', label: 'New creators joined', hint: 'When a creator is approved and becomes active.' },
  { key: 'referral', label: 'New referrals', hint: 'When a creator logs a referral lead.' },
  { key: 'deletion', label: 'Account deletion requests', hint: 'When a creator schedules their account for deletion.' },
  { key: 'inactive', label: 'Inactive creators', hint: 'When a creator has not logged in for 30+ days.' },
  { key: 'feedback', label: 'Bug reports & ideas', hint: 'When a creator reports a bug or suggests a feature.' },
]

const DEFAULT_PREFS = Object.fromEntries(CATEGORIES.map((c) => [c.key, true]))
// Only the emailable categories default to on; everything else is push-only.
const DEFAULT_EMAIL = { announcement: true, challenge: true, event: true, dm: false, chat: false, connection: false, results: false, reward: false }

// Email delivery is live (custom SMTP on Supabase Auth + the SMTP secrets on the
// notify-dispatch function). The Email column only renders for the categories
// marked `emailable` above.
const EMAIL_ENABLED = true

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

// The creator-facing notification sections (device push, per-type prefs,
// deadline reminders, daily puzzle reminders).
export function CreatorNotifications({ state }) {
  const supported = pushSupported()
  return (
    <div className="space-y-6">
      {/* ---- Device push ---- */}
      <section className="card space-y-4">
        <div className="flex items-center gap-2">
          <Icon name="bell" className="h-5 w-5 text-brand" />
          <h2 className="text-lg font-semibold">Notifications</h2>
        </div>
        <p className="-mt-2 text-sm text-smoke">
          Get alerts on this device even when the app is in the background. Add the app to your home screen for the best experience.
        </p>
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
      </section>

      {/* ---- Per-type preferences ---- */}
      <section className="card">
        {!EMAIL_ENABLED && (
          <div className="mb-3 flex items-start gap-2 rounded-xl bg-cloud px-4 py-3 text-xs text-smoke">
            <Icon name="clock" className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
            <span>Email notifications are coming soon and are turned off for now. You'll still get everything through the app and push notifications.</span>
          </div>
        )}
        <div className="flex items-center justify-end gap-3 border-b border-gray-100 pb-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
          <span className="w-11 text-center">Push</span>
          {EMAIL_ENABLED && <span className="w-11 text-center">Email</span>}
        </div>
        {CATEGORIES.map((c) => <PrefRow key={c.key} c={c} state={state} />)}
      </section>

      <p className="text-xs text-smoke">
        Push sends to your devices. Your in-app notification bell always keeps a record. Account-critical messages (like your application result) are always delivered.
      </p>
    </div>
  )
}

// The reminder sections (deadline + daily puzzle). Kept separate so Settings can
// lay them out full-width below the two columns, balancing the page.
// `stacked` keeps the two reminder cards in a single column, for when they sit
// directly under the Notifications card in a narrow settings column.
export function CreatorReminders({ state, stacked = false }) {
  return (
    <div className={stacked ? 'space-y-6' : 'grid gap-6 md:grid-cols-2'}>
      {/* ---- Challenge deadline reminders ---- */}
      <section className="card">
        <h2 className="text-lg font-semibold">Challenge deadline reminders</h2>
        <p className="mt-1 text-sm text-smoke">Get reminded before a live challenge closes so you can get your entries in. Choose when:</p>
        <div className="mt-4 flex flex-wrap gap-2">
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
      </section>

      {/* ---- Daily puzzle reminders ---- */}
      <section className="card">
        <h2 className="text-lg font-semibold">Daily puzzle reminders</h2>
        <p className="mt-1 text-sm text-smoke">Never break a run on Guess the Country or Flight Path. These are push notifications.</p>
        <div className="mt-4">
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
      </section>
    </div>
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
    </>
  )
}
