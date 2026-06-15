import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { PageHeader } from '../components/ui'
import { enablePush, disablePush, pushSupported, pushPermission, showLocalNotification } from '../lib/push'
import { cx } from '../lib/utils'

// What creators can switch on and off. Keys match the notification `type`
// column and the profiles.notif_prefs JSON.
const CATEGORIES = [
  { key: 'announcement', label: 'Announcements', hint: 'Official updates from the Tryp.com Team.' },
  { key: 'challenge', label: 'New challenges', hint: 'When a fresh challenge goes live.' },
  { key: 'event', label: 'Events', hint: 'Q&As, content days and milestones on the calendar.' },
  { key: 'dm', label: 'Direct messages', hint: 'When another creator messages you directly.' },
  { key: 'chat', label: 'General chat', hint: 'New messages in the #general channel.' },
  { key: 'results', label: 'Results', hint: "When a challenge's results are published." },
  { key: 'reward', label: 'Rewards', hint: 'When a reward or payout comes your way.' },
  { key: 'connection', label: 'New connections', hint: 'When a creator connects with you.' },
]

const DEFAULT_PREFS = Object.fromEntries(CATEGORIES.map((c) => [c.key, true]))

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
  const { user, profile, refreshProfile } = useAuth()
  const [prefs, setPrefs] = useState({ ...DEFAULT_PREFS, ...(profile?.notif_prefs || {}) })
  const [emailOptIn, setEmailOptIn] = useState(profile?.email_opt_in !== false)
  const [permission, setPermission] = useState(pushPermission())
  const [busy, setBusy] = useState(false)
  const [pushMsg, setPushMsg] = useState('')

  async function toggle(key, value) {
    const next = { ...prefs, [key]: value }
    setPrefs(next)
    await supabase.from('profiles').update({ notif_prefs: next }).eq('id', user.id)
    refreshProfile()
  }

  async function toggleEmail(value) {
    setEmailOptIn(value)
    await supabase.from('profiles').update({ email_opt_in: value }).eq('id', user.id)
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

      {/* ---- Email ---- */}
      <section className="card mb-8 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">Email notifications</h2>
          <p className="mt-1 text-sm text-smoke">
            Email me about new challenges, announcements and events. Which ones you get follows the categories below.
          </p>
        </div>
        <Toggle on={emailOptIn} onChange={toggleEmail} label="Email notifications" />
      </section>

      {/* ---- Per-type preferences ---- */}
      <section className="card divide-y divide-gray-100">
        {CATEGORIES.map((c) => (
          <div key={c.key} className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
            <div className="min-w-0">
              <p className="text-sm font-semibold">{c.label}</p>
              <p className="text-xs text-smoke">{c.hint}</p>
            </div>
            <Toggle on={prefs[c.key] !== false} onChange={(v) => toggle(c.key, v)} label={c.label} />
          </div>
        ))}
      </section>

      <p className="mt-4 text-xs text-smoke">
        Turning a category off stops both in-app and push notifications for it. Account-critical messages (like your application result) are always delivered.
      </p>
    </div>
  )
}
