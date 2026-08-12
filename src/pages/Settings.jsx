import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { confirm, notice } from '../lib/confirm'
import { PageHeader, Toggle, Spinner } from '../components/ui'
import Icon from '../components/Icon'
import Reveal from '../components/network/Reveal'
import PaymentDetailsFields from '../components/PaymentDetails'
import Turnstile from '../components/Turnstile'
import { EMPTY_PAYEE, payeeFromPrivate, payeeToPrivate, payeeStarted, validatePayee } from '../lib/invoice'
import {
  effectiveMode, storeMode, syncTheme, resolveDark,
  applyMotion, storeMotion, getStoredMotion,
} from '../lib/theme'
import { useNotificationPrefs, CreatorNotifications, AdminNotifications } from '../components/NotificationPreferences'

// Light or dark, explicitly. A "match system" option was tried and removed:
// following the OS colour scheme was unreliable across real devices.
const THEME_MODES = [
  { key: 'light', label: 'Light', icon: 'sun' },
  { key: 'dark', label: 'Dark', icon: 'moon' },
]

// On phones the settings page is a menu of sections rather than one very long
// scroll: tap a section, get just that section with a Back button. Desktop shows
// everything at once across three columns.
const SECTIONS = [
  { key: 'display', label: 'Display', icon: 'bulb', hint: 'Theme and motion' },
  { key: 'notifications', label: 'Notifications', icon: 'bell', hint: 'Alerts and reminders' },
  { key: 'account', label: 'Account', icon: 'users', hint: 'Profile, privacy, password, your data' },
  { key: 'payment', label: 'Payment details', icon: 'wallet', hint: 'Where your prizes get paid' },
]

function useIsMobile() {
  const [mobile, setMobile] = useState(() => {
    try { return window.matchMedia('(max-width: 1023px)').matches } catch { return false }
  })
  useEffect(() => {
    let mq
    try { mq = window.matchMedia('(max-width: 1023px)') } catch { return }
    const on = () => setMobile(mq.matches)
    on()
    if (mq.addEventListener) mq.addEventListener('change', on)
    else mq.addListener?.(on)
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', on)
      else mq.removeListener?.(on)
    }
  }, [])
  return mobile
}

// The creator-facing Settings hub. Everything saves on change - no Save button
// (payment details are the exception: they're validated as a set before saving).
export default function Settings() {
  const { user, profile, refreshProfile, isAdmin, sendPasswordReset, signOutEverywhere } = useAuth()
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const [section, setSection] = useState(null) // mobile only: which section is open

  // Optimistic local mirrors so the switches feel instant; the profile refresh
  // reconciles them with the saved truth.
  const [themeMode, setThemeMode] = useState(() => effectiveMode(!!profile?.dark_mode))
  const [reduceMotion, setReduceMotion] = useState(getStoredMotion())
  const [showOnMap, setShowOnMap] = useState(profile?.show_on_map !== false)
  const [savingMap, setSavingMap] = useState(false)
  const [pwMsg, setPwMsg] = useState('')
  const [pwBusy, setPwBusy] = useState(false)
  // Password reset goes through the same Turnstile check as the public
  // forgot-password page. Without a token Supabase Auth rejects the request
  // with "captcha protection: request disallowed" and no email is ever sent.
  const [pwVerifying, setPwVerifying] = useState(false)
  const [pwToken, setPwToken] = useState('')
  const [pwCaptchaKey, setPwCaptchaKey] = useState(0)
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

  // Change the theme mode. lib/theme resolves and applies it (and keeps
  // following the OS while on "System"); we mirror the resolved dark boolean to
  // the profile so a new device falls back sensibly.
  async function chooseTheme(mode) {
    setThemeMode(mode)
    storeMode(mode)
    syncTheme()
    const dark = resolveDark(mode)
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
    if (!pwToken) return
    setPwBusy(true)
    setPwMsg('')
    const { error } = await sendPasswordReset(user.email, pwToken)
    setPwBusy(false)
    // Turnstile tokens are single-use: reset the widget either way.
    setPwToken(''); setPwCaptchaKey((k) => k + 1)
    if (error) {
      setPwMsg(`Couldn't send: ${error.message}`)
    } else {
      setPwVerifying(false)
      setPwMsg(`We've emailed a password reset link to ${user.email}. It can take a couple of minutes to arrive - check your spam folder too.`)
    }
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

  // ---------------- Section bodies (shared by mobile + desktop) -------------

  const DisplaySection = (
    <section className="card">
      <div className="mb-1 flex items-center gap-2">
        <Icon name="bulb" className="h-5 w-5 text-brand" />
        <h2 className="text-lg font-semibold">Display</h2>
      </div>
      <p className="text-sm text-smoke">Personalise how the community looks on your devices.</p>

      <div className="mt-5 border-t border-gray-100 pt-5">
        <p className="text-sm font-semibold">Theme</p>
        <p className="text-xs text-smoke">Choose how the community looks on this device.</p>
        <div className="mt-3 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Theme">
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
  )

  const NotificationsSection = <CreatorNotifications state={notif} />

  const AccountSection = (
    <div className="space-y-6">
      <section className="card">
        <div className="mb-1 flex items-center gap-2">
          <Icon name="users" className="h-5 w-5 text-brand" />
          <h2 className="text-lg font-semibold">Account</h2>
        </div>
        <p className="text-sm text-smoke">Manage your profile, password and sign-in, plus your data.</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link to="/profile/edit" className="btn-secondary !py-2.5 text-sm">Edit profile</Link>
          <Link to={`/profile/${user?.id}`} className="btn-ghost !py-2.5 text-sm">View my profile</Link>
          <button
            onClick={() => { setPwVerifying(true); setPwMsg('') }}
            disabled={pwVerifying}
            className="btn-ghost !py-2.5 text-sm"
          >
            Change password
          </button>
        </div>

        {/* Human check, then send. Mirrors the public forgot-password page. */}
        {pwVerifying && (
          <div className="mt-4 rounded-xl border border-gray-100 bg-cloud/40 p-4">
            <p className="mb-3 text-xs text-smoke">
              Quick check that you're human, then we'll email a reset link to <span className="font-medium text-ink">{user.email}</span>.
            </p>
            <Turnstile key={pwCaptchaKey} onToken={setPwToken} />
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <button onClick={() => { setPwVerifying(false); setPwToken('') }} className="btn-ghost !py-2 text-xs">Cancel</button>
              <button onClick={changePassword} disabled={pwBusy || !pwToken} className="btn-primary !py-2 text-xs">
                {pwBusy ? <Spinner className="h-4 w-4" /> : pwToken ? 'Send reset link' : 'Verifying…'}
              </button>
            </div>
          </div>
        )}
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

      {/* Privacy now lives under Account. */}
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
    </div>
  )

  const PaymentSection = (
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
  )

  const AdminSection = isAdmin && (
    <section className="card border-brand/20 bg-brand-tint/30">
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
  )

  const BODIES = {
    display: DisplaySection,
    notifications: NotificationsSection,
    account: AccountSection,
    payment: PaymentSection,
    admin: AdminSection,
  }

  // ---------------- Mobile: menu, then one section at a time ---------------
  if (isMobile) {
    const open = section ? (SECTIONS.find((s) => s.key === section) || { key: 'admin', label: 'Admin settings' }) : null
    if (open) {
      return (
        <div className="page max-w-3xl">
          {/* THE ARROW SITS BESIDE THE TITLE, NOT ABOVE IT.
              A labelled "All settings" row above the heading cost a whole line
              of a phone screen to say something the arrow already says, and it
              pushed the actual settings further down on the one device where
              vertical space is scarcest. Inline, it costs nothing: the row was
              going to exist for the heading anyway. The label lives on as the
              accessible name. */}
          <div className="mb-6 flex items-center gap-1.5">
            <button
              onClick={() => setSection(null)}
              aria-label="All settings"
              className="-ml-2.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-smoke transition-all hover:bg-cloud hover:text-ink active:scale-95"
            >
              <Icon name="chevronLeft" className="h-5 w-5" />
            </button>
            <h1 className="min-w-0 truncate text-2xl font-bold tracking-tight">{open.label}</h1>
          </div>
          <Reveal from="down">{BODIES[open.key]}</Reveal>
        </div>
      )
    }
    return (
      <div className="page max-w-3xl">
        <Reveal from="down"><PageHeader title="Settings" subtitle="Manage how the community looks, what you share, how you get paid, and what you hear about." /></Reveal>
        <Reveal className="space-y-3" stagger={0.05} delay={0.06}>
          {SECTIONS.map((s) => (
            <button
              key={s.key}
              onClick={() => setSection(s.key)}
              className="card flex w-full items-center gap-4 !p-5 text-left transition-all hover:-translate-y-0.5 hover:shadow-lift active:translate-y-0"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand">
                <Icon name={s.icon} className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{s.label}</span>
                <span className="block text-xs text-smoke">{s.hint}</span>
              </span>
              <Icon name="chevronRight" className="h-4 w-4 shrink-0 text-smoke" />
            </button>
          ))}
          {isAdmin && (
            <button
              onClick={() => setSection('admin')}
              className="card flex w-full items-center gap-4 border-brand/20 bg-brand-tint/30 !p-5 text-left transition-all hover:-translate-y-0.5 hover:shadow-lift active:translate-y-0"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand">
                <Icon name="shield" className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">Admin settings</span>
                <span className="block text-xs text-smoke">Team alerts and admin tools</span>
              </span>
              <Icon name="chevronRight" className="h-4 w-4 shrink-0 text-smoke" />
            </button>
          )}
        </Reveal>
        <p className="mt-6 text-xs text-smoke">
          Have an idea for another setting? Let us know via{' '}
          <Link to="/feedback" className="font-medium text-brand hover:underline">Help us improve</Link>.
        </p>
      </div>
    )
  }

  // ---------------- Desktop: wide, three columns, minimal scrolling --------
  return (
    <div className="page max-w-7xl">
      <Reveal from="down"><PageHeader title="Settings" subtitle="Manage how the community looks, what you share, how you get paid, and what you hear about. Changes save automatically." /></Reveal>

      {/* THREE COLUMNS THAT ARRIVE AS THREE COLUMNS.
          One Reveal per column, each with its own small head start, so the page
          assembles left to right rather than blinking on as a wall of six
          cards. The cards inside a column stagger against each other, which is
          what makes a column read as a column. */}
      <div className="grid items-start gap-6 xl:grid-cols-3">
        {/* Column 1: display + payment */}
        <Reveal className="space-y-6" from="down" stagger={0.06}>
          {DisplaySection}
          {PaymentSection}
        </Reveal>

        {/* Column 2: account + privacy */}
        <Reveal className="space-y-6" from="down" stagger={0.06} delay={0.07}>
          {AccountSection}
        </Reveal>

        {/* Column 3: notifications, with the reminder cards directly beneath */}
        <Reveal className="space-y-6" from="down" stagger={0.06} delay={0.14}>
          {NotificationsSection}
        </Reveal>
      </div>

      {isAdmin && <Reveal from="down" className="mt-6">{AdminSection}</Reveal>}

      <p className="mt-6 text-xs text-smoke">
        More settings will appear here over time. Have an idea for one? Let us know via{' '}
        <Link to="/feedback" className="font-medium text-brand hover:underline">Help us improve</Link>.
      </p>
    </div>
  )
}
