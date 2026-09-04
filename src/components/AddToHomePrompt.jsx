import { useEffect, useState, useSyncExternalStore } from 'react'
import { Modal, Spinner } from './ui'
import Icon from './Icon'
import { claimNag, onTourRunning, releaseNag, tourRunning } from '../lib/appNag'
import { useAuth } from '../context/AuthContext'
import {
  ANDROID_STEPS, IOS_STEPS,
  canPromptInstall, isIOS, isInAppBrowser, isMobileDevice, isStandalone,
  onInstallPromptChange, promptInstall,
} from '../lib/install'
import { enablePush as requestPush, pushPermission, pushSupported } from '../lib/push'
import { useT } from '../lib/i18n'
import { cx } from '../lib/utils'

// PUT IT ON YOUR HOME SCREEN, AND THEN TURN NOTIFICATIONS ON.
//
// Ethan: "we need to identify whenever someone opens the website on Safari or
// whether it's an app. If they open it on Safari, viewing the landing page,
// that's fine - but once they have finished signing up and their application is
// accepted, they'll probably first open it in Safari, and from then we want a
// prompt with instructions on how to add it to the home screen, a visual little
// thing for Apple, and also a button they can click to show the Android way to
// do it. Once they add it to the home screen and open it, obviously it will
// know and it will work properly... Also ensure that notifications are enabled.
// Any time they fully close the app, next time they open it there should be
// that pop up if their notifications aren't done. Remember that for desktop
// this isn't the case, they can always view it as a web app."
//
// SO THIS IS TWO ASKS AND EXACTLY ONE OF THEM SHOWS AT A TIME:
//
//   install       a phone, in a BROWSER, not yet installed
//   notifications installed (or a desktop), and permission not granted
//
// THE ORDER IS NOT A PREFERENCE, IT IS A CONSTRAINT. iOS does not deliver web
// push to a Safari tab at all - only to an installed app - so asking for
// notifications first on an iPhone is asking for something the browser cannot
// give. Home screen first, notifications once it is there.
//
// DESKTOP IS EXPLICITLY EXEMPT from the install half, exactly as Ethan says: a
// laptop is a perfectly good way to use this and there is nothing to install.
// It still gets the notifications ask, because a browser notification on a
// desktop works fine and is the whole point of the feature.
//
// THE INSTALL HALF IS A WALL NOW; THE NOTIFICATIONS HALF IS STILL AN ASK
// (4 Sep 2026). Ethan: "there should be no not-now button, this pop up is
// persistent even if they click out of it - they should not be able to use the
// mobile view on the website." So on a phone, in a browser, there is no close
// button, no scrim press and no Escape, and the only way past it is doing the
// thing. The notifications ask is unchanged: dismissible, once per app open,
// coordinated through `lib/appNag` so nobody meets three dialogs in a row.
// `InstallGate` is the older, flag-gated version of the same wall and is still
// off; this is the one that runs.
//
// WHY IT WAITS FOR `status === 'active'`: a pending applicant has nothing to be
// notified about and no reason to install anything - they are waiting on a
// person. The moment they are approved, this is the first thing that matters.

const NAG = 'home-screen'
// Dismissed for this app open only. The next open asks again, which is what
// Ethan asked for, and it is why there is no "never show me this" - the two
// things being asked for are the two things the product does not work without.
const DISMISSED = 'tryp_home_prompt_dismissed'

export default function AddToHomePrompt() {
  const tr = useT()
  const { profile } = useAuth()
  const [mode, setMode] = useState(null)          // null | 'install' | 'browser' | 'push'
  const [promptable, setPromptable] = useState(canPromptInstall())
  const [busy, setBusy] = useState(false)
  // Which platform's steps are on screen. Starts on the one they are actually
  // using; the other is one press away, because a creator often reads this on
  // one device and does it on another.
  const [showing, setShowing] = useState(() => (isIOS() ? 'ios' : 'android'))
  // "I have already added it", pressed while still standing in the browser.
  const [hint, setHint] = useState(false)
  // IS THE WALKTHROUGH ON SCREEN RIGHT NOW. See lib/appNag: it asks for
  // notifications on its own step, so the modal must not open over it - and
  // because both start from the same profile load, "did it start first" is a
  // race that only a live signal can settle.
  const walking = useSyncExternalStore(onTourRunning, tourRunning, () => false)

  useEffect(() => onInstallPromptChange(setPromptable), [])

  useEffect(() => {
    if (!profile || profile.status !== 'active') return

    const phone = isMobileDevice()
    const installed = isStandalone()
    const inApp = isInAppBrowser()
    const wantsPush = pushSupported() && pushPermission() !== 'granted'
                      // iOS gives a browser tab no push at all, so there is
                      // nothing to ask for until it is installed.
                      && (installed || !isIOS())

    // ON A PHONE, IN A BROWSER, THIS IS NOW A WALL (4 Sep 2026).
    //
    // Ethan: "there should be no not-now button. It should always be there,
    // persistent, because that's what they have to do - otherwise there's no
    // way of contacting them. This pop up is persistent even if they click out
    // of it. They should not be able to use the mobile view on the website, it
    // always has to be through the app."
    //
    // The reasoning is a product decision and it is a sound one: on iOS a
    // browser tab gets NO push at all, so a creator using the website on a
    // phone is a creator who cannot be told a challenge went live, which is the
    // one thing the whole programme runs on. A dismissible ask produces exactly
    // the people it was meant to reach and then lets them out of it.
    //
    // ONE EXCEPTION, AND IT IS NOT A LOOPHOLE. An Instagram or TikTok webview
    // physically cannot add anything to a home screen, and most creators arrive
    // from precisely those links. Walling them would lock an approved account
    // out of the product with no action available to them. They get their own
    // card - "open this in Safari" - which is a door rather than a skip.
    // Desktop is untouched: a laptop is a perfectly good way to use this and
    // there is nothing to install.
    const next = phone && !installed
      ? (inApp ? 'browser' : 'install')
      : (wantsPush ? 'push' : null)
    if (!next) return
    // THE INSTALL WALL COMES BEFORE THE WALKTHROUGH, AND THE WALKTHROUGH THEN
    // HAPPENS INSIDE THE APP. Ethan described the good path himself: "if the
    // first thing you do is enter on the mobile website, then it prompts you to
    // open it on the app, and then once you're on the app the interactive
    // tutorial shows up." Walking somebody round the mobile WEBSITE and then
    // telling them the website is not the product wastes the one walkthrough
    // they get - and the per-layout flag means it would not run again inside
    // the app. So the wall does not wait for the tour; TourGate declines to
    // auto-start on a phone that is not running the installed app.
    // The NOTIFICATIONS ask still waits for it, because the walkthrough asks
    // for notifications itself and is a worse experience interrupted.
    if (next === 'push' && !profile.tour_completed_at) return
    // AND NOT WHILE THE WALKTHROUGH IS ACTUALLY ON SCREEN - see `walking`
    // below, which also covers the case where the walk starts AFTER this has
    // already decided to show.
    // A wall does not queue behind other asks; it IS the screen. The nag
    // coordination still applies to the dismissible notifications ask.
    if (next === 'push' && !claimNag(NAG)) return
    if (next === 'push') {
      try { if (sessionStorage.getItem(DISMISSED)) return } catch { /* private mode */ }
    }
    setMode(next)
  }, [profile])

  function dismiss() {
    try { sessionStorage.setItem(DISMISSED, '1') } catch { /* private mode */ }
    releaseNag(NAG)
    setMode(null)
  }

  async function install() {
    setBusy(true)
    const outcome = await promptInstall()
    setBusy(false)
    // ACCEPTING THE PROMPT DOES NOT PUT THEM IN THE APP. Chrome installs it and
    // leaves the tab exactly where it was, so closing the wall here would drop
    // somebody back into the mobile website - which is the thing this screen
    // exists to prevent. The icon is on their home screen now; the hint says
    // so, and `isStandalone()` clears this screen the moment they use it.
    if (outcome === 'accepted') setHint(true)
  }

  async function turnOnPush() {
    setBusy(true)
    // `enablePush` asks for the permission AND registers the subscription, so
    // a creator who says yes is actually reachable rather than merely allowed.
    try { await requestPush(profile?.id) } catch { /* the permission state is the answer */ }
    setBusy(false)
    if (pushPermission() === 'granted') dismiss()
  }

  if (!mode) return null
  // The walk owns the screen while it is running. This comes back by itself
  // when it ends, because `walking` is a live subscription rather than a
  // decision taken once.
  if (mode === 'push' && walking) return null

  if (mode === 'push') {
    return (
      <Modal open onClose={dismiss} title={tr('Turn notifications on')}>
        <div className="space-y-5">
          <div className="flex items-start gap-3 rounded-card bg-brand-tint/50 px-4 py-3.5">
            <Icon name="bell" className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
            <p className="text-sm leading-relaxed text-ink">
              {tr('This is how you hear that a challenge went live, that results are in, or that you have been paid. Briefs run to a deadline, so without it you will miss them.')}
            </p>
          </div>
          {pushPermission() === 'denied' && (
            <p className="rounded-xl bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-800">
              {tr('Notifications are blocked for this site, so we cannot ask from here. Turn them on in your browser or phone settings and they will start working straight away.')}
            </p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <button
              onClick={turnOnPush}
              disabled={busy || pushPermission() === 'denied'}
              className="btn-primary flex-1 justify-center disabled:opacity-50"
            >
              {busy ? <Spinner /> : tr('Turn them on')}
            </button>
            <button onClick={dismiss} className="btn-secondary flex-1 justify-center">{tr('Not now')}</button>
          </div>
        </div>
      </Modal>
    )
  }

  // AN IN-APP BROWSER GETS A DOOR, NOT A WALL. Nothing inside an Instagram or
  // TikTok webview can add anything to a home screen, so the only useful
  // instruction is "leave this webview". Copying the address is the one action
  // available from inside one, and it is offered rather than described.
  if (mode === 'browser') {
    return (
      <Modal open onClose={() => {}} dismissible={false} title={tr('Open Tryp.com in your browser')}>
        <div className="space-y-5">
          <Blurb icon="globe">
            {tr('You are in an app\'s built-in browser, which cannot add anything to your home screen. Open Tryp.com in Safari or Chrome and this will take ten seconds.')}
          </Blurb>
          <ol className="space-y-2.5">
            {[
              ['dotsVertical', 'Tap the menu in this window'],
              ['exit', 'Choose "Open in browser" or "Open in Safari"'],
              ['addToHome', 'Add Tryp.com to your home screen from there'],
            ].map(([icon, text], n) => <Step key={text} n={n} icon={icon} text={tr(text)} />)}
          </ol>
          <button
            type="button"
            onClick={() => { try { navigator.clipboard?.writeText(window.location.origin) } catch { /* no clipboard in this webview */ } }}
            className="btn-secondary w-full justify-center"
          >
            {tr('Copy the web address')}
          </button>
        </div>
      </Modal>
    )
  }

  return (
    // NO CLOSE, NO SCRIM PRESS, NO ESCAPE. See the note on `mode` above: on a
    // phone the app IS the product, and this is the one screen between the two.
    <Modal open onClose={() => {}} dismissible={false} title={tr('Add Tryp.com to your home screen')}>
      <div className="space-y-5">
        {/* A SOLID BRAND CARD, AND SHORTER (4 Sep 2026). Ethan: "the card that
            says it opens full screen and loads instantly and is the only way to
            get notified the moment a challenge goes live - I would shorten
            that, and also change the colour of that card. I like the design."
            Tint-on-white was the same weight as everything else on the screen,
            so the one sentence that says WHY read as a footnote. Solid brand is
            the loudest thing the palette has and this is the loudest thing on
            the screen. */}
        <div className="flex items-start gap-3 rounded-card bg-brand px-4 py-3.5 text-white">
          <Icon name="bell" className="mt-0.5 h-5 w-5 shrink-0" />
          <p className="text-sm font-medium leading-relaxed">
            {tr('The app is the only way to hear the moment a challenge goes live.')}
          </p>
        </div>

        {/* THE REAL PROMPT WHERE THERE IS ONE. Android and desktop Chrome fire
            `beforeinstallprompt`, so this is one tap. iOS never has and never
            will, which is why the steps below exist at all. */}
        {promptable && (
          <button onClick={install} disabled={busy} className="btn-primary w-full justify-center">
            {busy ? <Spinner /> : tr('Add it now')}
          </button>
        )}

        {/* TWO SETS OF STEPS, ONE SHOWING, AND THE CARD DOES NOT RESIZE.
            Ethan: "when clicking from Android to iPhone the card jumps in size
            a bit - I would have it always the same size." iOS is five steps and
            Android is four, so the list reserves the height of the taller one
            and the shorter one simply has a gap at the bottom. A dialog that
            grows and shrinks under your thumb while you are reading it is the
            thing being complained about; a little white space is not. */}
        <div>
          <div className="mb-3 flex gap-1.5 rounded-full bg-cloud p-1">
            {[['ios', 'iPhone'], ['android', 'Android']].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setShowing(key)}
                aria-pressed={showing === key}
                className={
                  showing === key
                    ? 'flex-1 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-ink shadow-card'
                    : 'flex-1 rounded-full px-3 py-1.5 text-xs font-semibold text-smoke transition-colors hover:text-ink'
                }
              >
                {label}
              </button>
            ))}
          </div>

          {/* BOTH LISTS OCCUPY THE SAME GRID CELL, so the box is always as tall
              as the taller one and the toggle changes the words and nothing
              else. A reserved min-height was the first attempt and it is a
              magic number that is only right at one screen width: iOS measured
              268px at 375px and more again on a 320px phone, where two of the
              five steps wrap to a third line. Stacking them means the browser
              works it out at whatever width it is actually being read on. */}
          <div className="grid">
            {[['ios', IOS_STEPS], ['android', ANDROID_STEPS]].map(([key, list]) => (
              <ol
                key={key}
                className={cx('col-start-1 row-start-1 space-y-2.5', showing !== key && 'invisible')}
                aria-hidden={showing !== key}
              >
                {list.map((st, n) => <Step key={st.text} n={n} icon={st.icon} text={tr(st.text)} />)}
              </ol>
            ))}
          </div>
        </div>

        {/* NOT A WAY OUT - A WAY IN. Ethan: "maybe someone opens it on the
            website but they already have the app, so there'd be a button to
            just open the app."
            THERE IS NO WEB API THAT LAUNCHES AN INSTALLED PWA FROM A TAB, on
            any platform, and there is no way to fake one: the OS owns app
            launching and a link to our own origin opens in this same browser.
            So this is the honest version of that button - it says where the
            icon is and it re-checks, because somebody who installs it in
            another tab and comes back should not be stuck here. `isStandalone`
            is the only fact that clears this screen, and it answers itself the
            moment the app is opened from the icon. */}
        <button
          type="button"
          onClick={() => { if (isStandalone()) setMode(null); else setHint(true) }}
          className="btn-secondary w-full justify-center"
        >
          {tr('I have already added it')}
        </button>
        {hint && (
          <p className="rounded-xl bg-cloud px-3 py-2.5 text-center text-xs leading-relaxed text-smoke">
            {tr('Then close this tab and open Tryp.com from the icon on your home screen. It cannot be launched from inside the browser.')}
          </p>
        )}
      </div>
    </Modal>
  )
}

// The blurb card at the top of an install screen.
function Blurb({ icon, children }) {
  return (
    <div className="flex items-start gap-3 rounded-card bg-brand px-4 py-3.5 text-white">
      <Icon name={icon} className="mt-0.5 h-5 w-5 shrink-0" />
      <p className="text-sm font-medium leading-relaxed">{children}</p>
    </div>
  )
}

// One numbered step, with the glyph the button it names actually wears.
function Step({ n, icon, text }) {
  return (
    <li className="flex items-start gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand text-[11px] font-bold text-white">
        {n + 1}
      </span>
      {/* `items-start` and a nudge, not `items-center`. Two of these wrap to a
          second line at 375px, and a centred glyph then floats in the middle of
          the block instead of sitting against the sentence it belongs to. */}
      <span className="flex min-w-0 flex-1 items-start gap-2 pt-0.5 text-sm leading-relaxed text-ink">
        <Icon name={icon} className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
        <span className="min-w-0">{text}</span>
      </span>
    </li>
  )
}
