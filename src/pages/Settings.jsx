import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { PageHeader, Toggle } from '../components/ui'
import Icon from '../components/Icon'
import { applyTheme, storeDark } from '../lib/theme'

// The creator-facing Settings hub: appearance (dark mode), privacy (community
// map visibility) and quick links to the other preference pages. Each toggle
// saves on change - no separate Save button - matching Notification settings.
export default function Settings() {
  const { user, profile, refreshProfile } = useAuth()

  // Optimistic local mirrors so the switches feel instant; the profile refresh
  // reconciles them with the saved truth.
  const [darkMode, setDarkMode] = useState(!!profile?.dark_mode)
  const [showOnMap, setShowOnMap] = useState(profile?.show_on_map !== false)
  const [savingMap, setSavingMap] = useState(false)

  async function toggleDark(next) {
    setDarkMode(next)
    // Apply + cache immediately so the whole app flips without waiting on the
    // round-trip; then persist so it follows the creator across devices.
    applyTheme(next)
    storeDark(next)
    await supabase.from('profiles').update({ dark_mode: next }).eq('id', user.id)
    refreshProfile()
  }

  async function toggleMap(next) {
    setShowOnMap(next)
    setSavingMap(true)
    await supabase.from('profiles').update({ show_on_map: next }).eq('id', user.id)
    setSavingMap(false)
    refreshProfile()
  }

  return (
    <div className="page max-w-2xl">
      <PageHeader title="Settings" subtitle="Manage how the community looks and what you share. Changes save automatically." />

      {/* ---- Appearance ---- */}
      <section className="card mb-8">
        <div className="mb-1 flex items-center gap-2">
          <Icon name="bulb" className="h-5 w-5 text-brand" />
          <h2 className="text-lg font-semibold">Appearance</h2>
        </div>
        <p className="text-sm text-smoke">Personalise how the community looks on your devices.</p>

        <div className="mt-5 flex items-center gap-4 border-t border-gray-100 pt-5">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Dark mode</p>
            <p className="text-xs text-smoke">
              Switch the community to a darker, easier-on-the-eyes theme. Only changes it for you.
            </p>
          </div>
          <Toggle on={darkMode} onChange={toggleDark} label="Dark mode" />
        </div>
      </section>

      {/* ---- Privacy ---- */}
      <section className="card mb-8">
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
              Turn this off to hide yourself from that public map. You'll still show on the community
              map inside the app.
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

      {/* ---- Notifications (lives on its own page) ---- */}
      <section className="card mb-8">
        <div className="mb-1 flex items-center gap-2">
          <Icon name="bell" className="h-5 w-5 text-brand" />
          <h2 className="text-lg font-semibold">Notifications</h2>
        </div>
        <p className="text-sm text-smoke">Choose what you hear about and how, plus push and reminders.</p>
        <Link to="/settings/notifications" className="btn-secondary mt-4 !py-2.5 text-sm">
          Open notification settings
        </Link>
      </section>

      {/* ---- Account quick links ---- */}
      <section className="card">
        <div className="mb-1 flex items-center gap-2">
          <Icon name="users" className="h-5 w-5 text-brand" />
          <h2 className="text-lg font-semibold">Account</h2>
        </div>
        <p className="text-sm text-smoke">Update your profile details and public information.</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link to="/profile/edit" className="btn-secondary !py-2.5 text-sm">Edit profile</Link>
          <Link to={`/profile/${user?.id}`} className="btn-ghost !py-2.5 text-sm">View my profile</Link>
        </div>
      </section>

      <p className="mt-4 text-xs text-smoke">
        More settings will appear here over time. Have an idea for one? Let us know via Help us improve.
      </p>
    </div>
  )
}
