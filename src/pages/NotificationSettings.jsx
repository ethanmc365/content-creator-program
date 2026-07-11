import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { PageHeader } from '../components/ui'
import Icon from '../components/Icon'
import { enablePush, disablePush, pushSupported, pushPermission, showLocalNotification } from '../lib/push'
import { cx } from '../lib/utils'

// What creators can switch on and off. Keys match the notification `type`
// column and the profiles.notif_prefs JSON.
const CATEGORIES = [
  { key: 'announcement', label: 'Announcements', hint: 'Official updates from the Tryp.com Team.' },
  { key: 'challenge', label: 'New challenges', hint: 'When a fresh challenge goes live.' },
  { key: 'event', label: 'Events', hint: 'Q&As, content days and milestones on the calendar.' },
  { key: 'dm', label: 'Direct messages', hint: 'When another creator messages you directly.' },
  { key: 'chat', label: 'General chat', hint: 'New messages in the #general channel.', pushOnly: true },
  { key: 'results', label: 'Results', hint: "When a challenge's results are published." },
  { key: 'reward', label: 'Rewards', hint: 'When a reward or payout comes your way.' },
  { key: 'connection', label: 'New connections', hint: 'When a creator connects with you.' },
]

// Admin-only alerts (hidden from regular creators). Keys match the notification
// `type` column + the same notif_prefs / email_prefs JSON.
const ADMIN_CATEGORIES = [
  { key: 'application', label: 'New creator applications', hint: 'When a creator submits their profile for review.' },
  { key: 'submission', label: 'New challenge entries', hint: 'When a creator submits a video to a challenge.' },
  { key: 'new_member', label: 'New creators joined', hint: 'When a creator is approved and becomes active.' },
  { key: 'referral', label: 'New referrals', hint: 'When a creator logs a referral lead.' },
  { key: 'deletion', label: 'Account deletion requests', hint: 'When a creator schedules their account for deletion.' },
  { key: 'inactive', label: 'Inactive creators', hint: 'When a creator has not logged in for 30+ days.' },
  { key: 'feedback', label: 'Bug reports & ideas', hint: 'When a creator reports a bug or suggests a feature.' },
]

// Push defaults on; email defaults on only for the big moments.
const DEFAULT_PREFS = Object.fromEntries(CATEGORIES.map((c) => [c.key, true]))
const DEFAULT_EMAIL = { announcement: true, challenge: true, event: true, results: true, reward: true, application: true, dm: false, chat: false, connection: false }

function Toggle({ on, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={cx('relative h-6 w-11 shrink-0 rounded-full transition-colors', on ? 'bg-brand' : 'bg-gray-300')}
    >
      <span className={cx('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', on ? 'left-[22px]' : 'left-0.5')} />
    </button>
  )
}

export default function NotificationSettings() {
  const { user, profile, refreshProfile, isAdmin } = useAuth()
  const [prefs, setPrefs] = useState({ ...DEFAULT_PREFS, ...(profile?.notif_prefs || {}) })
  const [emailPrefs, setEmailPrefs] = useState({ ...DEFAULT_EMAIL, ...(profile?.email_prefs || {}) })
  const [reminderDays, setReminderDays] = useState(profile?.challenge_reminder_days ?? [3, 1])

  async function toggleReminderDay(d) {
    const next = reminderDays.includes(d) ? reminderDays.filter((x) => x !== d) : [...reminderDays, d].sort((a, b) => b - a)
    setReminderDays(next)
    await supabase.from('profiles').update({ challenge_reminder_days: next }).eq('id', user.id)
    refreshProfile()
  }
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

  async function turnOnPush() {
    setBusy(true)
    setPushMsg('')
    const result = await enablePush(user.id)
    setPermission(pushPermission())
    setBusy(false)
    if (result === 'granted') setPushMsg('Notifications are on for this device.')
    else if (result === 'denied') setPushMsg('Your browser is blocking notifications. Enable them in your browser settings, then try again.')
    else if (result === 'unsupported') setPushMsg('This browser does not support push notifications.')
    else setPushMsg('Something went wrong turning on notifications. Please try again.')
  }

  async function turnOffPush() {
    setBusy(true)
    await disablePush()
    setBusy(false)
    setPushMsg('Push notifications turned off for this device.')
  }

  const supported = pushSupported()

  return (
    <div className="page max-w-2xl">
      <PageHeader title="Notification settings" subtitle="Choose what you hear about and how. Changes save automatically." />

      {/* ---- Device push ---- */}
      <section className="card mb-8 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Push notifications</h2>
          <p className="mt-1 text-sm text-smoke">
            Get alerts on this device even when the app is in the background. Add the app to your home screen for the best experience.
          </p>
        </div>

        {!supported ? (
          <p className="rounded-xl bg-cloud px-4 py-3 text-sm text-smoke">
            This browser does not support push notifications. Try Chrome, Edge or installing the app to your home screen.
          </p>
        ) : permission === 'granted' ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-full bg-green-50 px-3 py-1.5 text-sm font-medium text-green-700">
              <span className="h-2 w-2 rounded-full bg-green-500" /> On for this device
            </span>
            <button onClick={() => showLocalNotification({ title: 'Tryp.com', body: 'Test notification - you are all set!', link: '/notifications' })} className="btn-secondary !py-2 text-xs">
              Send a test
            </button>
            <button onClick={turnOffPush} disabled={busy} className="btn-ghost !py-2 text-xs">Turn off</button>
          </div>
        ) : (
          <button onClick={turnOnPush} disabled={busy} className="btn-primary">
            {busy ? 'Enabling…' : 'Enable notifications on this device'}
          </button>
        )}
        {pushMsg && <p className="text-sm text-smoke">{pushMsg}</p>}
      </section>

      {/* ---- Per-type preferences: a push toggle and an email toggle each ---- */}
      <section className="card">
        <div className="flex items-center justify-end gap-3 border-b border-gray-100 pb-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
          <span className="w-11 text-center">Push</span>
          <span className="w-11 text-center">Email</span>
        </div>
        {CATEGORIES.map((c) => (
          <div key={c.key} className="flex items-center gap-4 border-b border-gray-100 py-4 last:border-0">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{c.label}</p>
              <p className="text-xs text-smoke">{c.hint}</p>
            </div>
            <div className="w-11 flex justify-center">
              <Toggle on={prefs[c.key] !== false} onChange={(v) => togglePush(c.key, v)} label={`${c.label} push`} />
            </div>
            <div className="w-11 flex justify-center">
              {c.pushOnly
                ? <span className="text-[11px] text-gray-300">-</span>
                : <Toggle on={emailPrefs[c.key] === true} onChange={(v) => toggleEmail(c.key, v)} label={`${c.label} email`} />}
            </div>
          </div>
        ))}
      </section>

      {/* ---- Challenge deadline reminders ---- */}
      <section className="card mt-8">
        <h2 className="text-lg font-semibold">Challenge deadline reminders</h2>
        <p className="mt-1 text-sm text-smoke">
          Get reminded before a live challenge closes so you can get your entries in. Choose when:
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {[14, 7, 5, 3].map((d) => {
            const on = reminderDays.includes(d)
            return (
              <button
                key={d}
                type="button"
                onClick={() => toggleReminderDay(d)}
                aria-pressed={on}
                className={cx(
                  'rounded-full px-4 py-1.5 text-xs font-medium transition-colors',
                  on ? 'bg-brand text-white' : 'border border-gray-200 text-smoke hover:border-brand hover:text-brand'
                )}
              >
                {d} day{d > 1 ? 's' : ''} before
              </button>
            )
          })}
        </div>
        {reminderDays.length === 0 && (
          <p className="mt-3 text-xs text-amber-600">No reminders selected, so you won't be reminded about deadlines.</p>
        )}
      </section>

      {/* ---- Admin-only alerts (regular creators never see this) ---- */}
      {isAdmin && (
        <section className="card mt-8 border-brand/20 bg-brand-tint/30">
          <div className="mb-1 flex items-center gap-2">
            <Icon name="shield" className="h-4 w-4 text-brand" />
            <h2 className="text-lg font-semibold">Admin alerts</h2>
          </div>
          <p className="mb-3 text-xs text-smoke">Only the Tryp.com Team sees these. Toggle the admin notifications you want to receive.</p>
          <div className="flex items-center justify-end gap-3 border-b border-gray-100 pb-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            <span className="w-11 text-center">Push</span>
            <span className="w-11 text-center">Email</span>
          </div>
          {ADMIN_CATEGORIES.map((c) => (
            <div key={c.key} className="flex items-center gap-4 border-b border-gray-100 py-4 last:border-0">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{c.label}</p>
                <p className="text-xs text-smoke">{c.hint}</p>
              </div>
              <div className="w-11 flex justify-center">
                <Toggle on={prefs[c.key] !== false} onChange={(v) => togglePush(c.key, v)} label={`${c.label} push`} />
              </div>
              <div className="w-11 flex justify-center">
                <Toggle on={emailPrefs[c.key] === true} onChange={(v) => toggleEmail(c.key, v)} label={`${c.label} email`} />
              </div>
            </div>
          ))}
        </section>
      )}

      <p className="mt-4 text-xs text-smoke">
        Push sends to your devices; email sends to your inbox. Your in-app notification bell always keeps a record. Account-critical messages (like your application result) are always delivered.
      </p>
    </div>
  )
}
