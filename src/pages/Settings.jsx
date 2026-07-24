import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { confirm, notice } from '../lib/confirm'
import { PageHeader, Toggle, Spinner } from '../components/ui'
import Icon from '../components/Icon'
import PaymentDetailsFields from '../components/PaymentDetails'
import { EMPTY_PAYEE, payeeFromPrivate, payeeToPrivate, payeeStarted, validatePayee } from '../lib/invoice'
import {
  applyTheme, storeDark, effectiveMode, resolveDark, storeMode,
  applyMotion, storeMotion, getStoredMotion,
} from '../lib/theme'
import { useNotificationPrefs, CreatorNotifications, CreatorReminders, AdminNotifications } from '../components/NotificationPreferences'

// The three appearance choices. "System" tracks the OS colour scheme live.
const THEME_MODES = [
  { key: 'light', label: 'Light', icon: 'sun' },
  { key: 'dark', label: 'Dark', icon: 'moon' },
  { key: 'system', label: 'System', icon: 'device' },
]

// The creator-facing Settings hub - one wide page. Appearance, privacy, payment
// and account sit on the left; notifications (formerly a separate page) are
// inlined on the right; admin-only settings sit at the very bottom. Every
// control saves on change - no Save button (payment details are the exception:
// they must be validated as a set before we store them).
export default function Settings() {
  const { user, profile, refreshProfile, isAdmin, sendPasswordReset, signOutEverywhere } = useAuth()
  const navigate = useNavigate()

  // Optimistic local mirrors so the switches feel instant; the profile refresh
  // reconciles them with the saved truth.
  const [themeMode, setThemeMode] = useState(() => effectiveMode(!!profile?.dark_mode))
  const [reduceMotion, setReduceMotion] = useState(getStoredMotion())
  const [showOnMap, setShowOnMap] = useState(profile?.show_on_map !== false)
  const [savingMap, setSavingMap] = useState(false)
  const [pwMsg, setPwMsg] = useState('')
  const [pwBusy, setPwBusy] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [signingOutAll, setSigningOutAll] = useState(false)

  // Payment details live in the private row (only the creator + admins read it).
  const [payee, setPayee] = useState(EMPTY_PAYEE)
  const [payLoaded, setPayLoaded] = useState(false)
  const [paySaving, setPaySaving] = useState(false)
  const [paySaved, setPaySaved] = useState(false)
  useEffect(() => {
    supabase.from('creator_private').select('*').eq('id', user.id).maybeSingle()
      .then(({ data }) => { if (data) setPayee(payeeFromPrivate(data)); setPayLoaded(true) })
  }, [user.id])

  // One shared notification-prefs state for both the creator sections and the
  // admin section, so neither clobbers the other's keys in notif_prefs.
  const notif = useNotificationPrefs()

  // Change the theme mode: apply instantly, cache the mode per-device, and
  // mirror the resolved dark boolean to the profile so other devices fall back
  // sensibly. The custom event nudges AppLayout to (re)wire its system watcher.
  async function chooseTheme(mode) {
    setThemeMode(mode)
    storeMode(mode)
    const dark = resolveDark(mode)
    applyTheme(dark)
    storeDark(dark)
    window.dispatchEvent(new Event('tryp-theme-change'))
    await supabase.from('profiles').update({ dark_mode: dark }).eq('id', user.id)
    refreshProfile()
  }

  // Reduce motion is a per-device preference (localStorage only).
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
    setPwMsg(error ? `Couldn't send: ${error.message}` : `We've emailed a password reset link to ${user.email}. It can take a couple of minutes to arrive - check your spam folder too.`)
  }

  async function savePayment() {
    if (payeeStarted(payee)) {
      const problems = validatePayee(payee)
      if (problems.length) return notice(`Please check your payment details:\n\n${problems.join('\n')}`)
    }
    setPaySaving(true)
    const { error } = await supabase.from('creator_private').upsert({
      id: user.id,
      ...payeeToPrivate(payee),
      updated_at: new Date().toISOString(),
    })
    setPaySaving(false)
    if (error) return notice("Couldn't save your payment details: " + error.message)
    setPaySaved(true)
    setTimeout(() => setPaySaved(false), 2500)
  }

  async function signOutAll() {
    if (!await confirm('Sign out everywhere?\n\nYou will be logged out of Tryp.com on every device, including this one. Use this if you lost a device or think someone else has access to your account.')) return
    setSigningOutAll(true)
    await signOutEverywhere()
    navigate('/')
  }

  // GDPR data export: bundle everything tied to this account into a JSON file.
  async function exportData() {
    setExporting(true)
    const uid = user.id
    const own = (t, col) => supabase.from(t).select('*').eq(col, uid)
    const [prof, priv, photos, subs, conns, reacts, votes, refs, rewards, notifs, msgs, dmA, dmB] = await Promise.all([
      own('profiles', 'id'), own('creator_private', 'id'), own('creator_photos', 'creator_id'),
      own('submissions', 'creator_id'), own('connections', 'creator_id'), own('reactions', 'creator_id'),
      own('poll_votes', 'voter_id'), own('referrals', 'referrer_id'), own('rewards', 'creator_id'),
      own('notifications', 'recipient_id'), own('messages', 'sender_id'),
      supabase.from('direct_messages').select('*').eq('sender_id', uid),
      supabase.from('direct_messages').select('*').eq('recipient_id', uid),
    ])
    const data = {
      exported_at: new Date().toISOString(),
      account: { id: uid, email: user.email },
      profile: prof.data?.[0] ?? null,
      private_contact: priv.data?.[0] ?? null,
      travel_photos: photos.data ?? [],
      submissions: subs.data ?? [],
      connections: conns.data ?? [],
      reactions: reacts.data ?? [],
      poll_votes: votes.data ?? [],
      referrals: refs.data ?? [],
      rewards: rewards.data ?? [],
      notifications: notifs.data ?? [],
      chat_messages: msgs.data ?? [],
      direct_messages: [...(dmA.data ?? []), ...(dmB.data ?? [])],
    }
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `tryp-my-data-${uid}.json`
    a.click()
    URL.revokeObjectURL(url)
    setExporting(false)
  }

  // GDPR erasure: schedule deletion (30-day grace). ProtectedRoute then shows
  // the restore screen; a daily job purges anything past 30 days.
  async function deleteAccount() {
    if (!await confirm('Delete your account?\n\nYour profile and content will be hidden immediately and permanently deleted after 30 days. You can restore it by logging back in within 30 days.')) return
    setDeleting(true)
    const { error } = await supabase.from('profiles').update({ deletion_requested_at: new Date().toISOString() }).eq('id', user.id)
    setDeleting(false)
    if (error) return notice("Couldn't schedule deletion: " + error.message)
    await refreshProfile()
  }

  return (
    <div className="page max-w-5xl">
      <PageHeader title="Settings" subtitle="Manage how the community looks, what you share, how you get paid, and what you hear about. Changes save automatically." />

      <div className="grid items-start gap-6 lg:grid-cols-2">
        {/* ------- Left column: appearance, privacy, payment, account ------- */}
        <div className="space-y-6">
          {/* ---- Appearance ---- */}
          <section className="card">
            <div className="mb-1 flex items-center gap-2">
              <Icon name="bulb" className="h-5 w-5 text-brand" />
              <h2 className="text-lg font-semibold">Appearance</h2>
            </div>
            <p className="text-sm text-smoke">Personalise how the community looks on your devices.</p>

            <div className="mt-5 border-t border-gray-100 pt-5">
              <p className="text-sm font-semibold">Theme</p>
              <p className="text-xs text-smoke">Choose a light or dark look, or match whatever your device is set to.</p>
              <div className="mt-3 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Theme">
                {THEME_MODES.map((m) => {
                  const active = themeMode === m.key
                  return (
                    <button
                      key={m.key}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => chooseTheme(m.key)}
                      className={`flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-xs font-semibold transition-all hover:-translate-y-0.5 hover:shadow-card ${
                        active ? 'border-brand bg-brand/5 text-brand' : 'border-gray-200 bg-white text-smoke'
                      }`}
                    >
                      <Icon name={m.icon} className="h-5 w-5" />
                      {m.label}
                    </button>
                  )
                })}
              </div>
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

          {/* ---- Payment details ---- */}
          <section className="card">
            <div className="mb-1 flex items-center gap-2">
              <Icon name="wallet" className="h-5 w-5 text-brand" />
              <h2 className="text-lg font-semibold">Payment details</h2>
            </div>
            <p className="text-sm text-smoke">Where we send your cash prizes when you win a challenge. These are used automatically on your invoices, so double-check every digit.</p>
            <div className="mt-5 border-t border-gray-100 pt-5">
              {!payLoaded ? (
                <div className="flex justify-center py-6"><Spinner /></div>
              ) : (
                <>
                  <PaymentDetailsFields value={payee} onChange={setPayee} />
                  <div className="mt-5 flex items-center justify-end gap-3">
                    {paySaved && <span className="text-sm font-medium text-green-600">Saved</span>}
                    <button type="button" onClick={savePayment} disabled={paySaving} className="btn-primary !py-2.5 text-sm">
                      {paySaving ? <Spinner /> : 'Save payment details'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </section>

          {/* ---- Account ---- */}
          <section className="card">
            <div className="mb-1 flex items-center gap-2">
              <Icon name="users" className="h-5 w-5 text-brand" />
              <h2 className="text-lg font-semibold">Account</h2>
            </div>
            <p className="text-sm text-smoke">Manage your profile, password and sign-in, plus your data.</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link to="/profile/edit" className="btn-secondary !py-2.5 text-sm">Edit profile</Link>
              <Link to={`/profile/${user?.id}`} className="btn-ghost !py-2.5 text-sm">View my profile</Link>
              <button onClick={changePassword} disabled={pwBusy} className="btn-ghost !py-2.5 text-sm">
                {pwBusy ? 'Sending…' : 'Change password'}
              </button>
            </div>
            {pwMsg && <p className="mt-3 text-xs text-smoke">{pwMsg}</p>}

            <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-gray-100 pt-5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Sign out everywhere</p>
                <p className="text-xs text-smoke">Log out of Tryp.com on every device, including this one. Handy if you lost a device.</p>
              </div>
              <button onClick={signOutAll} disabled={signingOutAll} className="btn-secondary !py-2.5 text-sm shrink-0">
                {signingOutAll ? 'Signing out…' : 'Sign out everywhere'}
              </button>
            </div>

            {/* Your data (GDPR) */}
            <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-gray-100 pt-5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Download my data</p>
                <p className="text-xs text-smoke">Get a JSON file of everything we hold about you.</p>
              </div>
              <button type="button" onClick={exportData} disabled={exporting} className="btn-secondary !py-2.5 text-sm shrink-0">
                {exporting ? <Spinner /> : 'Download my data'}
              </button>
            </div>

            {/* Delete account (destructive - kept visually distinct at the bottom) */}
            <div className="mt-5 rounded-xl border border-red-100 bg-red-50/50 p-4">
              <p className="text-sm font-semibold text-red-600">Delete account</p>
              <p className="mb-3 mt-1 text-xs leading-relaxed text-smoke">
                Your profile and content are hidden right away and permanently deleted after 30 days.
                You can restore your account by logging back in within those 30 days.
              </p>
              <button type="button" onClick={deleteAccount} disabled={deleting} className="btn-danger !py-2 text-xs">
                {deleting ? <Spinner /> : 'Delete my account'}
              </button>
            </div>
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
