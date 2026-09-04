import { useEffect, useState } from 'react'
import { Modal, Spinner } from './ui'
import Icon from './Icon'
import { claimNag, releaseNag } from '../lib/appNag'
import { useAuth } from '../context/AuthContext'
import {
  canPromptInstall, isIOS, isInAppBrowser, isMobileDevice, isStandalone,
  onInstallPromptChange, promptInstall,
} from '../lib/install'
import { enablePush as requestPush, pushPermission, pushSupported } from '../lib/push'
import { useT } from '../lib/i18n'

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
// IT IS AN ASK, NOT A GATE. `InstallGate` is the hard version, behind its own
// switch and off; this is dismissible, once per app open, and it coordinates
// with the other dialogs through `lib/appNag` so nobody meets three in a row.
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
  const [mode, setMode] = useState(null)          // null | 'install' | 'push'
  const [promptable, setPromptable] = useState(canPromptInstall())
  const [busy, setBusy] = useState(false)
  // Which platform's steps are on screen. Starts on the one they are actually
  // using; the other is one press away, because a creator often reads this on
  // one device and does it on another.
  const [showing, setShowing] = useState(() => (isIOS() ? 'ios' : 'android'))

  useEffect(() => onInstallPromptChange(setPromptable), [])

  useEffect(() => {
    if (!profile || profile.status !== 'active') return
    // The walkthrough asks for notifications itself and is a worse experience
    // interrupted. Somebody who has not finished it gets asked afterwards.
    if (!profile.tour_completed_at) return
    try { if (sessionStorage.getItem(DISMISSED)) return } catch { /* private mode */ }

    const phone = isMobileDevice()
    const installed = isStandalone()
    // AN IN-APP BROWSER CANNOT ADD ANYTHING TO A HOME SCREEN. Somebody who
    // arrived from an Instagram or TikTok link is in one, and telling them to
    // press a Share button that is not there is worse than saying nothing.
    const canInstall = phone && !installed && !isInAppBrowser()
    const wantsPush = pushSupported() && pushPermission() !== 'granted'
                      // iOS gives a browser tab no push at all, so there is
                      // nothing to ask for until it is installed.
                      && (installed || !isIOS())

    const next = canInstall ? 'install' : (wantsPush ? 'push' : null)
    if (!next) return
    if (!claimNag(NAG)) return
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
    // The page keeps running in the tab either way - the app opens from the
    // icon next. Nothing is recorded as done: `isStandalone()` is the fact, and
    // it answers itself on the next open.
    if (outcome === 'accepted') dismiss()
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

  const ios = showing === 'ios'
  return (
    <Modal open onClose={dismiss} title={tr('Add Tryp.com to your home screen')}>
      <div className="space-y-5">
        <div className="flex items-start gap-3 rounded-card bg-brand-tint/50 px-4 py-3.5">
          <Icon name="device" className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
          <p className="text-sm leading-relaxed text-ink">
            {tr('It opens full screen, it loads instantly, and it is the only way to get notified the moment a challenge goes live or you get paid.')}
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

        {/* TWO SETS OF STEPS, ONE SHOWING. Ethan asked for the Apple version
            plus "a button that can click to show the Android way to do it".
            They are genuinely different - a Share sheet against an overflow
            menu - so a single set of words would be wrong on one of them. */}
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

          <ol className="space-y-2.5">
            {(ios
              ? [
                ['share', 'Press the Share button at the bottom of Safari'],
                ['plus', 'Scroll down and choose "Add to Home Screen"'],
                ['check', 'Press Add, then open Tryp.com from your home screen'],
              ]
              : [
                ['dots', 'Open the menu in the top right of Chrome'],
                ['plus', 'Choose "Install app" or "Add to Home screen"'],
                ['check', 'Open Tryp.com from your home screen'],
              ]
            ).map(([icon, text], n) => (
              <li key={text} className="flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand text-[11px] font-bold text-white">
                  {n + 1}
                </span>
                <span className="flex min-w-0 flex-1 items-center gap-2 text-sm leading-relaxed text-ink">
                  <Icon name={icon} className="h-4 w-4 shrink-0 text-brand" />
                  {tr(text)}
                </span>
              </li>
            ))}
          </ol>
        </div>

        <button onClick={dismiss} className="btn-secondary w-full justify-center">{tr('Not now')}</button>
      </div>
    </Modal>
  )
}
