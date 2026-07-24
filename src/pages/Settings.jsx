import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { PageHeader, Toggle } from '../components/ui'
import Icon from '../components/Icon'
import { applyTheme, storeDark, applyMotion, storeMotion, getStoredMotion } from '../lib/theme'
import { useNotificationPrefs, CreatorNotifications, CreatorReminders, AdminNotifications } from '../components/NotificationPreferences'

// The creator-facing Settings hub - now a single wide page. Appearance, privacy
// and account sit on the left; notifications (formerly a separate page) are
// inlined on the right; admin-only settings sit at the very bottom, visible to
// admins only. Every control saves on change - no Save button.
export default function Settings() {
  const { user, profile, refreshProfile, isAdmin, sendPasswordReset } = useAuth()

  // Optimistic local mirrors so the switches feel instant; the profile refresh
  // reconciles them with the saved truth.
  const [darkMode, setDarkMode] = useState(!!profile?.dark_mode)
  const [reduceMotion, setReduceMotion] = useState(getStoredMotion())
  const [showOnMap, setShowOnMap] = useState(profile?.show_on_map !== false)
  const [savingMap, setSavingMap] = useState(false)
  const [pwMsg, setPwMsg] = useState('')
  const [pwBusy, setPwBusy] = useState(false)

  // One shared notification-prefs state for both the creator sections and the
  // admin section, so neither clobbers the other's keys in notif_prefs.
  const notif = useNotificationPrefs()

  async function toggleDark(next) {
    setDarkMode(next)
    applyTheme(next)
    storeDark(next)
    await supabase.from('profiles').update({ dark_mode: next }).eq('id', user.id)
    refreshProfile()
  }

  // Reduce motion is a per-device preference (localStorage only), so it applies
  // instantly and doesn't need a profile round-trip.
  function toggleMotion(next) {
    setReduceMotion(next)
    applyMotion(next)
    storeMotion(next)
  }

  async function toggleMap(next) {
    setShowOnMap(next)
    setSavingMap(true)
    await supabase.from('profiles').update({ show_on_map: next }).eq('id', user.id)
    setSavingMap(false)
    refreshProfile()
  }

  async function changePassword() {
    setPwBusy(true)
    setPwMsg('')
    const { error } = await sendPasswordReset(user.email)
    setPwBusy(false)
    setPwMsg(error ? `Couldn't send: ${error.message}` : `We've emailed a password reset link to ${user.email}.`)
  }

  return (
    <div className="page max-w-5xl">
      <PageHeader title="Settings" subtitle="Manage how the community looks, what you share, and what you hear about. Changes save automatically." />

      <div className="grid items-start gap-6 lg:grid-cols-2">
        {/* ------- Left column: appearance, privacy, account ------- */}
        <div className="space-y-6">
          {/* ---- Appearance ---- */}
          <section className="card">
            <div className="mb-1 flex items-center gap-2">
              <Icon name="bulb" className="h-5 w-5 text-brand" />
              <h2 className="text-lg font-semibold">Appearance</h2>
            </div>
            <p className="text-sm text-smoke">Personalise how the community looks on your devices.</p>

            <div className="mt-5 flex items-center gap-4 border-t border-gray-100 pt-5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Dark mode</p>
                <p className="text-xs text-smoke">Switch the community to a darker, easier-on-the-eyes theme. Only changes it for you.</p>
              </div>
              <Toggle on={darkMode} onChange={toggleDark} label="Dark mode" />
            </div>

            <div className="mt-5 flex items-center gap-4 border-t border-gray-100 pt-5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Reduce motion</p>
                <p className="text-xs text-smoke">Dial down animations and transitions across the app. Great if motion makes you queasy or you just want it calmer.</p>
              </div>
              <Toggle on={reduceMotion} onChange={toggleMotion} label="Reduce motion" />
            </div>
          </section>

          {/* ---- Privacy ---- */}
          <section className="card">
            <div className="mb-1 flex items-center gap-2">
              <Icon name="globe" className="h-5 w-5 text-brand" />
              <h2 className="text-lg font-semibold">Privacy</h2>
            </div>
            <p className="text-sm text-smoke">Control where your profile appears.</p>

            <div className="mt-5 flex items-center gap-4 border-t border-gray-100 pt-5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Show my profile on the community map</p>
                <p className="text-xs text-smoke">
                  Your city and profile appear on the public map on the Tryp.com sign-up and login pages.
                  Turn this off to hide yourself from that public map. You'll still show on the community map inside the app.
                </p>
              </div>
              <Toggle on={showOnMap} onChange={toggleMap} label="Show my profile on the community map" disabled={savingMap} />
            </div>
            {!showOnMap && (
              <p className="mt-3 flex items-center gap-2 rounded-xl bg-cloud px-4 py-2.5 text-xs text-smoke">
                <Icon name="eye" className="h-4 w-4 shrink-0 text-brand" />
                You're hidden from the public landing-page map. Fellow creators can still find you in the app.
              </p>
            )}
          </section>

          {/* ---- Account ---- */}
          <section className="card">
            <div className="mb-1 flex items-center gap-2">
              <Icon name="users" className="h-5 w-5 text-brand" />
              <h2 className="text-lg font-semibold">Account</h2>
            </div>
            <p className="text-sm text-smoke">Update your profile details, public information and password.</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link to="/profile/edit" className="btn-secondary !py-2.5 text-sm">Edit profile</Link>
              <Link to={`/profile/${user?.id}`} className="btn-ghost !py-2.5 text-sm">View my profile</Link>
              <button onClick={changePassword} disabled={pwBusy} className="btn-ghost !py-2.5 text-sm">
                {pwBusy ? 'Sending…' : 'Change password'}
              </button>
            </div>
            {pwMsg && <p className="mt-3 text-xs text-smoke">{pwMsg}</p>}
            <p className="mt-4 border-t border-gray-100 pt-4 text-xs text-smoke">
              Need to download your data or delete your account? Those live on your{' '}
              <Link to="/profile/edit" className="font-medium text-brand hover:underline">Edit profile</Link> page.
            </p>
          </section>
        </div>

        {/* ------- Right column: notifications (inlined, no separate page) ------- */}
        <CreatorNotifications state={notif} />
      </div>

      {/* ------- Reminders, full-width below the two columns ------- */}
      <div className="mt-6">
        <CreatorReminders state={notif} />
      </div>

      {/* ------- Admin-only settings, at the very bottom ------- */}
      {isAdmin && (
        <section className="card mt-6 border-brand/20 bg-brand-tint/30">
          <div className="mb-1 flex items-center gap-2">
            <Icon name="shield" className="h-5 w-5 text-brand" />
            <h2 className="text-lg font-semibold">Admin settings</h2>
          </div>
          <p className="mb-4 text-sm text-smoke">
            Only the Tryp.com Team sees this. Choose which admin alerts you want to receive, and jump into the admin tools.
          </p>
          <AdminNotifications state={notif} />
          <div className="mt-5 border-t border-gray-100 pt-4">
            <Link to="/admin" className="btn-secondary !py-2.5 text-sm">Open admin panel</Link>
          </div>
        </section>
      )}

      <p className="mt-6 text-xs text-smoke">
        More settings will appear here over time. Have an idea for one? Let us know via{' '}
        <Link to="/feedback" className="font-medium text-brand hover:underline">Help us improve</Link>.
      </p>
    </div>
  )
}
