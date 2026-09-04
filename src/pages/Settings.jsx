import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { confirm, notice } from '../lib/confirm'
import { Panel, PageHeader, Toggle, Spinner, Select, CopyButton } from '../components/ui'
import Icon from '../components/Icon'
import { cx } from '../lib/utils'
import { useTimezone, allZones, zoneCity } from '../lib/timezone'
import { LOCALES, getLocale, loadLocale, setLocale, useT } from '../lib/i18n'
import Reveal from '../components/network/Reveal'
import AppIconPicker from '../components/AppIconPicker'
import PaymentDetailsFields from '../components/PaymentDetails'
import Turnstile from '../components/Turnstile'
import { EMPTY_PAYEE, payeeFromPrivate, payeeToPrivate, payeeStarted, validatePayee } from '../lib/invoice'
import {
  effectiveMode, storeMode, syncTheme, resolveDark,
  applyMotion, storeMotion, getStoredMotion,
} from '../lib/theme'
import { useNotificationPrefs, CreatorNotifications, AdminNotifications } from '../components/NotificationPreferences'
import { appSoundOn, setAppSoundOn, playDmArrival } from '../lib/appSounds'
import { startTour } from '../components/tour/TourGate'
import { soundOn, setSoundOn, playCoin } from '../lib/gameSounds'

// Light or dark, explicitly. A "match system" option was tried and removed:
// following the OS colour scheme was unreliable across real devices.
const THEME_MODES = [
  { key: 'light', label: 'Light', icon: 'sun' },
  { key: 'dark', label: 'Dark', icon: 'moon' },
]

// The settings page is a MENU of sections at every width: tap one, get just
// that section with a back arrow. There is no second desktop layout - see the
// note on the render below for why the wide screen wants the same thing.
const SECTIONS = [
  { key: 'display', label: 'Display', icon: 'bulb', hint: 'Theme and motion' },
  { key: 'appicon', label: 'Home screen icon', icon: 'device', hint: 'Which icon your phone installs' },
  { key: 'sound', label: 'Sound', icon: 'megaphone', hint: 'Chat and game sounds' },
  { key: 'notifications', label: 'Notifications', icon: 'bell', hint: 'Alerts and reminders' },
  { key: 'account', label: 'Account', icon: 'users', hint: 'Profile, privacy, password, your data' },
  { key: 'payment', label: 'Payment details', icon: 'wallet', hint: 'Where your prizes get paid' },
  // LANGUAGE IS ITS OWN SECTION, not a row inside Display. Ethan: "there should
  // be a different settings page, or you can incorporate it under a certain
  // place - maybe just a new languages page would work best." He is right that
  // it is not a display preference: Display is about how this DEVICE looks
  // (theme, motion, timezone) and is per device, while the language is a fact
  // about the person and follows their account between devices.
  { key: 'language', label: 'Language', icon: 'globe', hint: 'The language the app is in' },
]

// The creator-facing Settings hub. Everything saves on change - no Save button
// (payment details are the exception: they're validated as a set before saving).
export default function Settings() {
  const { user, profile, refreshProfile, isAdmin, sendPasswordReset, signOutEverywhere } = useAuth()
  const tr = useT()
  // The language in state as well as in the module, so choosing one re-renders
  // this page. `useT` already subscribes, but the radio group reads the value
  // directly and a module variable is not something React can watch.
  const [langCode, setLangCode] = useState(getLocale)
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  // WHICH SECTION IS OPEN, AND IT IS IN THE URL (3 Sep 2026).
  //
  // It was local state only, so `/settings?section=notifications` landed on the
  // menu - which is what the guided walkthrough had been linking to for its one
  // mandatory step, and what the "add your bank details" prompt needed to be
  // able to link to at all. A section you cannot address is a section nothing
  // else in the product can send somebody to.
  //
  // The URL is the source of truth and `setSection` writes to it, so Back comes
  // out of a section to the menu rather than off the page, and a link into one
  // survives a reload.
  const section = SECTIONS.some((x) => x.key === params.get('section')) ? params.get('section') : null
  const setSection = (key) => {
    const next = new URLSearchParams(params)
    if (key) next.set('section', key)
    else next.delete('section')
    setParams(next, { replace: !key })
  }
  // See the Timezone block in the Display section.
  const tz = useTimezone(profile)

  // Optimistic local mirrors so the switches feel instant; the profile refresh
  // reconciles them with the saved truth.
  const [themeMode, setThemeMode] = useState(() => effectiveMode(!!profile?.dark_mode))
  const [reduceMotion, setReduceMotion] = useState(getStoredMotion())
  // Read once on mount. Both live in localStorage, and the games' own speaker
  // button can change the second one while this page is open in another tab -
  // which is what the `tryp-sound-pref` / `storage` listener below is for.
  const [appSound, setAppSound] = useState(() => appSoundOn())
  const [gameSound, setGameSound] = useState(() => soundOn())
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

  // SO ARE THE TWO SOUND SWITCHES, and turning one ON plays its own sound as
  // the confirmation. A switch for something you cannot hear from the settings
  // page is a switch you flick twice to check it did anything.
  function toggleAppSound(next) {
    setAppSound(next)
    setAppSoundOn(next)
    if (next) playDmArrival()
  }

  function toggleGameSound(next) {
    setGameSound(next)
    setSoundOn(next)
    if (next) playCoin()
  }

  // The games carry their own speaker button, so this page can be looking at a
  // stale answer within seconds of somebody using it. `storage` covers other
  // tabs; the custom event covers this one.
  useEffect(() => {
    const sync = () => { setAppSound(appSoundOn()); setGameSound(soundOn()) }
    window.addEventListener('storage', sync)
    window.addEventListener('tryp-sound-pref', sync)
    return () => {
      window.removeEventListener('storage', sync)
      window.removeEventListener('tryp-sound-pref', sync)
    }
  }, [])

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

  // NO CARD AND NO SECOND HEADING, HERE OR IN ANY SECTION BELOW.
  //
  // The settings page is a MENU now: you press "Display" and land on a page
  // whose own heading is "Display". Every section then drew a card with a
  // brand icon and an <h2> saying "Display" again, plus a line explaining what
  // Display means - a title, a subtitle and a border, all restating the button
  // you had just pressed. Ethan: "we now have specific buttons for display,
  // sound etc, we don't need to have a card inside them or another heading."
  // What is left is the settings themselves, on the page, with air around them.
  const DisplaySection = (
    <Panel>
      <div>
        <p className="text-sm font-semibold">{tr('Theme')}</p>
        <p className="text-xs text-smoke">{tr('Choose how the community looks on this device.')}</p>
        <div className="mt-3 grid grid-cols-2 gap-2" role="radiogroup" aria-label={tr('Theme')}>
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
                {tr(m.label)}
              </button>
            )
          })}
        </div>
      </div>

      {/* SHOW ME ROUND AGAIN.
          The walkthrough runs once, on a new creator's first visit, and then
          never again - which is right, and which also means the only people who
          can find it afterwards are the ones who know it existed. This is the
          door back to it, next to the other two settings about how the app
          behaves on this particular device. */}
      <div className="mt-5 flex items-center gap-4 border-t border-gray-100 pt-5">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{tr('Show me round again')}</p>
          <p className="text-xs text-smoke">
            {tr('A short walk through the platform, pointing at where everything is. Takes about two minutes and you can stop at any point.')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => { if (!startTour()) notice('Open the app first, then try again.') }}
          className="btn-secondary shrink-0 !py-2 text-xs"
        >
          {tr('Start')}
        </button>
      </div>

      <div className="mt-5 flex items-center gap-4 border-t border-gray-100 pt-5">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{tr('Reduce motion')}</p>
          <p className="text-xs text-smoke">{tr('Dial down animations and transitions across the app. Great if motion makes you queasy or you just want it calmer.')}</p>
        </div>
        <Toggle on={reduceMotion} onChange={toggleMotion} label={tr('Reduce motion')} />
      </div>

      {/* ---- TIMEZONE ----
          THE ONE PLACE A CREATOR CAN OVERRULE THEIR OWN DEVICE.
          Everything on this platform is stored as an instant and rendered in
          the device's zone, which is right and silent. Somebody who travels for
          a living needs to be able to say "I do not care where this phone
          thinks it is, show me Lisbon" - most often because they are planning
          against home while away. Automatic stays the default and is what
          almost everybody should leave it on.
          Choosing a fixed zone does NOT stop the calendar noticing a move: the
          prompt still appears the first time the device reports somewhere new,
          because a pin is a preference and not an instruction to stop paying
          attention. See lib/timezone. */}
      <div className="mt-5 border-t border-gray-100 pt-5">
        <p className="text-sm font-semibold">{tr('Timezone')}</p>
        <p className="text-xs text-smoke">
          {tr('Which clock event times, deadlines and your flights are shown on.')}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2" role="radiogroup" aria-label={tr("Timezone mode")}>
          {[
            { key: 'auto', label: tr('Automatic'), icon: 'globe', hint: tz.device ? zoneCity(tz.device) : tr('This device') },
            { key: 'fixed', label: tr('Always this one'), icon: 'pin', hint: tz.pinned ? zoneCity(tz.pinned) : tr('Pick a zone') },
          ].map((m) => {
            const active = m.key === 'auto' ? !tz.pinned : !!tz.pinned
            return (
              <button
                key={m.key}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => tz.save(m.key === 'auto' ? null : (tz.pinned || tz.device), { ackDevice: false })}
                className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-3 text-xs font-semibold transition-all hover:-translate-y-0.5 hover:shadow-card ${
                  active ? 'border-brand bg-brand/5 text-brand' : 'border-gray-200 bg-white text-smoke'
                }`}
              >
                <Icon name={m.icon} className="h-5 w-5" />
                {m.label}
                <span className="max-w-full truncate text-[10px] font-normal opacity-70">{m.hint}</span>
              </button>
            )
          })}
        </div>
        {tz.pinned && (
          <label className="mt-3 block">
            <span className="label">{tr('Timezone')}</span>
            {/* The device's own zone first, always, even if it is also further
                down the list: it is the one somebody is most likely to want, and
                four hundred rows is exactly why this control has a search box. */}
            <Select
              variant="field"
              ariaLabel="Timezone"
              value={tz.pinned}
              onChange={(v) => tz.save(v, { ackDevice: false })}
              options={[
                ...(tz.device ? [{ value: tz.device, label: `${tz.device} (this device)` }] : []),
                ...allZones().filter((z) => z !== tz.device).map((z) => ({ value: z, label: z })),
              ]}
            />
          </label>
        )}
        <p className="mt-2 text-[11px] text-smoke">
          {tz.pinned
            ? `Times are shown in ${zoneCity(tz.pinned)} wherever you are. We will still ask if you land somewhere new.`
            : 'Times follow whatever device you are on. If you travel, the calendar asks once whether to switch.'}
        </p>
      </div>
    </Panel>
  )

  // SOUND. Two switches, not one.
  //
  // They are genuinely different decisions and bundling them would force the
  // wrong answer on somebody: a quiz is something you opened on purpose and it
  // is duller silent, while chat is a tab that is already open next to other
  // people. So the games default ON, the app defaults OFF, and each can be
  // turned off without taking the other with it.
  //
  // Both are per DEVICE, not per account, and the card says so. Phone in a
  // pocket and laptop in an office are not the same room.
  const SoundSection = (
    <Panel>
      {/* NO DESCRIPTIONS ON THIS CARD AT ALL.
          There were three: one under the heading and one under each switch,
          the longest of them forty words listing every individual sound the
          games make. Ethan asked for all of them gone, and a toggle is the one
          control that genuinely does not need explaining - you turn it on, and
          within about four seconds you either like what you hear or you turn it
          off again. Explaining a sound in prose is slower than playing it, and
          turning one ON plays its own sound, which is the demonstration.
          Both switches are still per DEVICE rather than per account (phone in a
          pocket and laptop in an office are not the same room); that is worth
          knowing and is not worth a paragraph on the page you set it from. */}
      <div className="mt-5 flex items-center gap-4 border-t border-gray-100 pt-5">
        <p className="min-w-0 flex-1 text-sm font-semibold">{tr("Chats and Connections")}</p>
        <Toggle on={appSound} onChange={toggleAppSound} label={tr("Chat and connection sounds")} />
      </div>

      <div className="mt-5 flex items-center gap-4 border-t border-gray-100 pt-5">
        <p className="min-w-0 flex-1 text-sm font-semibold">{tr("Travel games")}</p>
        <Toggle on={gameSound} onChange={toggleGameSound} label={tr("Game sounds")} />
      </div>
    </Panel>
  )

  const NotificationsSection = <CreatorNotifications state={notif} />

  // THE ACCOUNT PAGE, WHICH WAS THREE MISMATCHED BUTTONS AND A RED BOX.
  //
  // Ethan: "on account, the change password buttons, view my profile buttons,
  // edit profile - they're like, really weird the way they are. So just
  // improving that UI... everything seems a bit clustered there."
  //
  // What was wrong is that three DIFFERENT kinds of control were drawn in a
  // row as though they were the same kind: two links that go somewhere else, a
  // button that starts a flow ON this page, and all three in three different
  // button weights (secondary, ghost, ghost) so the row read as one important
  // thing and two afterthoughts. None of them is more important than the
  // others.
  //
  // They are rows now, which is what every other setting on this page is: a
  // name, a line saying what it does, and one control on the right. The page
  // reads down a single column instead of starting with a huddle.
  //
  // AND IT OPENS WITH WHO YOU ARE. Ethan asked for "the actual email they used
  // to sign up, so they can view it" - it was nowhere on the platform, and it
  // is the one fact that makes "change password" and "sign out everywhere"
  // mean anything.
  const accountRow = (title, hint, control, key) => (
    <div key={key} className="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-5 first:border-t-0 first:pt-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-smoke">{hint}</p>
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  )

  const AccountSection = (
    <div className="space-y-6">
      <Panel>
        {/* WHO YOU ARE SIGNED IN AS. Not a row with a control - there is
            nothing to press, because an email address on this platform is the
            login and changing it is a support job. It is a fact, so it is drawn
            as one, at the top, where identity belongs. */}
        <div className="mb-5 flex items-center gap-3 rounded-xl bg-cloud/50 px-4 py-3">
          <Icon name="envelope" className="h-5 w-5 shrink-0 text-brand" />
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-smoke">{tr('Signed in as')}</p>
            <p className="truncate text-sm font-semibold text-ink">{user?.email || '—'}</p>
          </div>
          <CopyButton value={user?.email || ''} label={tr("Copy")} className="ml-auto shrink-0" />
        </div>

        <div className="space-y-5">
          {accountRow(
            tr('Your profile'),
            tr('How the rest of the community sees you.'),
            <div className="flex gap-2">
              <Link to="/profile/edit" className="btn-secondary !py-2 text-xs">{tr('Edit')}</Link>
              <Link to={`/profile/${user?.id}`} className="btn-ghost !py-2 text-xs">{tr('View')}</Link>
            </div>,
            'profile',
          )}
          {accountRow(
            tr('Password'),
            tr('We email a reset link to the address above.'),
            <button
              onClick={() => { setPwVerifying(true); setPwMsg('') }}
              disabled={pwVerifying}
              className="btn-secondary !py-2 text-xs"
            >
              {tr('Change password')}
            </button>,
            'password',
          )}
        </div>

        {/* Human check, then send. Mirrors the public forgot-password page. */}
        {pwVerifying && (
          <div className="mt-4 rounded-xl border border-gray-100 bg-cloud/40 p-4">
            <p className="mb-3 text-xs text-smoke">
              {tr("Quick check that you're human, then we'll email a reset link to")} <span className="font-medium text-ink">{user.email}</span>.
            </p>
            <Turnstile key={pwCaptchaKey} onToken={setPwToken} />
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <button onClick={() => { setPwVerifying(false); setPwToken('') }} className="btn-ghost !py-2 text-xs">{tr("Cancel")}</button>
              <button onClick={changePassword} disabled={pwBusy || !pwToken} className="btn-primary !py-2 text-xs">
                {pwBusy ? <Spinner className="h-4 w-4" /> : pwToken ? 'Send reset link' : 'Verifying…'}
              </button>
            </div>
          </div>
        )}
        {pwMsg && <p className="mt-3 text-xs text-smoke">{pwMsg}</p>}

        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-gray-100 pt-5">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{tr('Sign out everywhere')}</p>
            <p className="text-xs text-smoke">{tr('Log out of Tryp.com on every device, including this one. Handy if you lost a device.')}</p>
          </div>
          <button onClick={signOutAll} disabled={signingOutAll} className="btn-secondary shrink-0 !py-2 text-xs">
            {signingOutAll ? tr('Signing out…') : tr('Sign out everywhere')}
          </button>
        </div>

        {/* Your data (GDPR) */}
        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-gray-100 pt-5">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{tr('Download my data')}</p>
            <p className="text-xs text-smoke">{tr('Get a JSON file of everything we hold about you.')}</p>
          </div>
          <button type="button" onClick={exportData} disabled={exporting} className="btn-secondary shrink-0 !py-2 text-xs">
            {exporting ? <Spinner /> : tr('Download my data')}
          </button>
        </div>

      </Panel>

      {/* Privacy now lives under Account. */}
      {/* Privacy KEEPS a heading, and only Privacy. It is a second subject on
          the Account page rather than the page's own subject, so without a name
          it would read as more account settings. */}
      {/* On a phone this is a second block under a rule; on a desktop it is a
          second card, so the rule would be a line drawn inside a border. */}
      <Panel className="border-t border-gray-100 pt-6 sm:border-t sm:pt-6">
        <h2 className="mb-4 text-base font-semibold">{tr('Privacy')}</h2>
        <div className="flex items-center gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{tr('Show my profile on the community map')}</p>
            <p className="text-xs text-smoke">
              {tr("Your city and profile appear on the public map on the Tryp.com sign-up and login pages. Turn this off to hide yourself from that public map. You'll still show on the community map inside the app.")}
            </p>
          </div>
          <Toggle on={showOnMap} onChange={toggleMap} label={tr("Show my profile on the community map")} disabled={savingMap} />
        </div>
        {!showOnMap && (
          <p className="mt-3 flex items-center gap-2 rounded-xl bg-cloud px-4 py-2.5 text-xs text-smoke">
            <Icon name="eye" className="h-4 w-4 shrink-0 text-brand" />
            {tr("You're hidden from the public landing-page map. Fellow creators can still find you in the app.")}
          </p>
        )}
      </Panel>

      {/* DELETING YOUR ACCOUNT IS ITS OWN CARD, AT THE VERY BOTTOM.
          Ethan: "the delete account section, I would move it to a card at the
          very bottom below the privacy thing. And I don't really like the way
          it's a red colour, which is still not matched to the Tryp.com
          platform."
          Both are right. It was a red inset box in the MIDDLE of the account
          card, above Privacy - so the most destructive thing on the platform
          sat between "download my data" and a toggle about a map, shouting.
          Last is where an ending belongs, and a card of its own is what stops
          it reading as one more account setting.
          NOT RED. Red is nowhere else in this product's palette, and a warning
          colour used for a thing nobody has done yet is an alarm with no event
          behind it. The weight comes from the words and from the confirmation
          that follows; the button is quiet until you mean it. */}
      <Panel>
        <h2 className="mb-1 text-base font-semibold">{tr('Delete account')}</h2>
        <p className="mb-4 text-xs leading-relaxed text-smoke">
          {tr("Your profile and content are hidden right away and permanently deleted after 30 days. You can restore your account by logging back in within those 30 days.")}
        </p>
        <button
          type="button"
          onClick={deleteAccount}
          disabled={deleting}
          className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2 text-xs font-semibold text-smoke transition-all duration-200 hover:-translate-y-0.5 hover:border-brand hover:text-brand"
        >
          {deleting ? <Spinner className="h-4 w-4" /> : <><Icon name="trash" className="h-4 w-4" /> {tr('Delete my account')}</>}
        </button>
      </Panel>
    </div>
  )

  const PaymentSection = (
    <Panel>
      {/* The one strapline that survives, because it is a WARNING rather than a
          restatement of the heading: these digits go straight onto an invoice. */}
      <p className="mb-5 text-sm text-smoke">{tr("Where we send your cash prizes when you win a challenge. These are used automatically on your invoices, so double-check every digit.")}</p>
      <div>
        {!payLoaded ? (
          <div className="flex justify-center py-6"><Spinner /></div>
        ) : (
          <>
            <PaymentDetailsFields value={payee} onChange={setPayee} />
            <div className="mt-5 flex items-center justify-end gap-3">
              {paySaved && <span className="text-sm font-medium text-green-600">{tr("Saved")}</span>}
              <button type="button" onClick={savePayment} disabled={paySaving} className="btn-primary !py-2.5 text-sm">
                {paySaving ? <Spinner /> : tr('Save payment details')}
              </button>
            </div>
          </>
        )}
      </div>
    </Panel>
  )

  const AdminSection = isAdmin && (
    <Panel>
      <p className="mb-5 text-sm text-smoke">
        {tr("Only the Tryp.com Team sees this. Choose which admin alerts you want to receive, and jump into the admin tools.")}
      </p>
      <AdminNotifications state={notif} />
      <div className="mt-5 border-t border-gray-100 pt-4">
        <Link to="/admin" className="btn-secondary !py-2.5 text-sm">{tr("Open admin panel")}</Link>
      </div>
    </Panel>
  )

  // A whole card for one preference, and it earns it: the previews are the
  // control (you are choosing a picture, so you have to see the pictures) and
  // the "your phone already copied the old one" caveat has nowhere else to live.
  const AppIconSection = <AppIconPicker />

  // ---- LANGUAGE ----
  //
  // THE PREVIEW IS THE CONTROL. You are choosing something you cannot read the
  // name of yet, so each option says its language IN that language ("Español",
  // not "Spanish") with the English name underneath. Picking one changes the
  // screen you are standing on immediately - `setLocale` is synchronous and the
  // whole app re-renders through `useLocale` - so the choice is confirmed by
  // the thing itself rather than by a toast.
  //
  // WRITTEN TO THE DEVICE FIRST, THEN TO THE ACCOUNT. The device write is what
  // makes it instant; the profile write is what makes it follow you to a
  // laptop. If the profile write fails the setting still holds here, which is
  // the right way round - a language that reverted because a request timed out
  // would be far worse than one that is briefly only on this device.
  async function chooseLanguage(code) {
    // AWAITED, so the screen changes in one step. `setLocale` alone would flip
    // the language before its dictionary had arrived and the page would redraw
    // twice - once in English, once in Spanish - which reads as a bug rather
    // than as a setting taking effect.
    await loadLocale(code)
    setLangCode(setLocale(code))
    if (!user?.id) return
    await supabase.from('profiles').update({ locale: code }).eq('id', user.id)
    refreshProfile?.()
  }

  // JUST THE CHOICE (1 Sep 2026).
  //
  // Ethan: "on the actual language settings page, remove this copy 'Anything a
  // person wrote stays exactly as they wrote it: messages, captions, challenge
  // briefs and names' and this copy 'The language the app is in. Your own words
  // - messages, captions and names - are never translated.' It's not needed, we
  // just need the simple ui to choose the language."
  //
  // He is right and the reason is worth keeping: both lines explained a rule
  // nobody is going to be surprised by. Two sentences of caveat around two
  // buttons is a page that reads as an apology for a feature. The rule itself
  // has not changed - `t()` is only ever called on literals in this repository,
  // and never on anything a person wrote - it just does not need announcing.
  const LanguageSection = (
    <Panel>
      <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={tr('Language')}>
        {LOCALES.map((l) => {
          const on = l.code === langCode
          return (
            <button
              key={l.code}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => chooseLanguage(l.code)}
              className={cx(
                'flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all duration-200 hover:-translate-y-0.5',
                on ? 'border-brand bg-brand text-white shadow-card' : 'border-gray-200 bg-white hover:border-brand/40',
              )}
            >
              <span className="text-xl leading-none" aria-hidden>{l.flag}</span>
              <span className="min-w-0 flex-1">
                {/* THE NATIVE NAME LEADS, ALWAYS. You are choosing a language
                    you may not be able to read the English name of, so
                    "Español" is the title and the name in the language you are
                    currently reading is the subtitle - and it is dropped when
                    the two are the same word, because "Español / Español" is
                    not a second piece of information. */}
                <span className="block text-sm font-semibold">{l.native}</span>
                {tr(l.label) !== l.native && (
                  <span className={cx('block text-xs', on ? 'text-white/80' : 'text-smoke')}>{tr(l.label)}</span>
                )}
              </span>
              {on && <Icon name="check" className="h-4 w-4 shrink-0" />}
            </button>
          )
        })}
      </div>
    </Panel>
  )

  const BODIES = {
    display: DisplaySection,
    appicon: AppIconSection,
    sound: SoundSection,
    notifications: NotificationsSection,
    account: AccountSection,
    payment: PaymentSection,
    language: LanguageSection,
    admin: AdminSection,
  }

  // ---------------- ONE SETTINGS PAGE, AT EVERY WIDTH ---------------------
  //
  // This used to be two: a menu of section cards that opened one section at a
  // time on a phone, and a three-column wall of every card at once on a desktop.
  // Ethan: "I prefer the design on mobile where it shows an initial page of the
  // settings and you click in for what you actually want, build this for the
  // desktop view too."
  //
  // He is right, and the reason is not screen size. A settings page is not read,
  // it is VISITED - you arrive knowing the one thing you came to change. Six
  // cards side by side makes you scan all six to find it; a menu names all six
  // in one glance and then gets out of the way. The width a desktop has spare is
  // better spent on breathing room around the thing you actually opened than on
  // showing you five things you did not.
  //
  // It also deletes the second implementation, which is the real prize: every
  // setting added from here on is added once.
  const open = section ? (SECTIONS.find((s) => s.key === section) || { key: 'admin', label: 'Admin settings' }) : null

  if (open) {
    return (
      <div className="page max-w-3xl">
        {/* THE ARROW SITS BESIDE THE TITLE, NOT ABOVE IT.
            A labelled "All settings" row above the heading cost a whole line of
            a phone screen to say something the arrow already says, and it pushed
            the actual settings further down on the one device where vertical
            space is scarcest. Inline, it costs nothing: the row was going to
            exist for the heading anyway. The label lives on as the accessible
            name. */}
        <div className="mb-6 flex items-center gap-1.5">
          <button
            onClick={() => setSection(null)}
            aria-label={tr('All settings')}
            className="-ml-2.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-smoke transition-all hover:bg-cloud hover:text-ink active:scale-95"
          >
            <Icon name="chevronLeft" className="h-5 w-5" />
          </button>
          <h1 className="min-w-0 truncate text-2xl font-bold tracking-tight sm:text-3xl">{tr(open.label)}</h1>
        </div>
        {/* `space-y-5` because a section body is one or more `Panel`s, and on
            a desktop those are separate cards that need air between them. On a
            phone a Panel draws nothing, so this is the gap between blocks. */}
        <Reveal from="down" className="space-y-5">{BODIES[open.key]}</Reveal>
      </div>
    )
  }

  return (
    <div className="page max-w-4xl">
      <Reveal from="down">
        {/* NO STRAPLINE. It listed the four sections that are already listed
            underneath it as cards. */}
        <PageHeader title={tr('Settings')} />
      </Reveal>
      {/* One across on a phone, two from `sm`. Three would make each card
          narrower than its own hint line, which is the point at which a menu
          stops being scannable and becomes a grid you have to read. */}
      <Reveal className="grid grid-cols-1 gap-3 sm:grid-cols-2" stagger={0.05} delay={0.06}>
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            // The walkthrough spotlights the payment row. An anchor is a name,
            // never a position - see lib/tour.
            data-tour={s.key === 'payment' ? 'settings-payment' : undefined}
            onClick={() => setSection(s.key)}
            className="card flex w-full items-center gap-4 !p-5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-lift active:translate-y-0"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand transition-transform duration-200 group-hover:scale-110">
              <Icon name={s.icon} className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              {/* SECTIONS is data, so the translation happens where it is
                  drawn rather than in the table. A table of translated strings
                  would be built once, at module load, in whatever language the
                  page happened to open in - and would then never change when
                  somebody switched. */}
              <span className="block font-semibold">{tr(s.label)}</span>
              <span className="block text-xs text-smoke">{tr(s.hint)}</span>
            </span>
            <Icon name="chevronRight" className="h-4 w-4 shrink-0 text-gray-300" />
          </button>
        ))}
        {isAdmin && (
          <button
            onClick={() => setSection('admin')}
            className="card flex w-full items-center gap-4 border-brand/20 bg-brand-tint/30 !p-5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift active:translate-y-0"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand">
              <Icon name="shield" className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{tr('Admin settings')}</span>
              <span className="block text-xs text-smoke">{tr('Team alerts and admin tools')}</span>
            </span>
            <Icon name="chevronRight" className="h-4 w-4 shrink-0 text-gray-300" />
          </button>
        )}
      </Reveal>
      <p className="mt-6 text-xs text-smoke">
        {tr('Have an idea for another setting? Let us know via')}{' '}
        <Link to="/feedback" className="font-medium text-brand hover:underline">{tr('Help us improve')}</Link>.
      </p>
    </div>
  )
}
