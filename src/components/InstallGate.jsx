import { useEffect, useState } from 'react'
import Icon from './Icon'
import { Spinner } from './ui'
import {
  browserName, canPromptInstall, installSteps, isIOS, isInAppBrowser, isMobileDevice,
  isStandalone, onInstallPromptChange, promptInstall,
} from '../lib/install'
import { useT } from '../lib/i18n'

// THE FULL-SCREEN ASK TO INSTALL, ON A PHONE.
//
// See lib/install.js for what is and is not possible here. The short version:
// on Android we can open the real install prompt with one tap; on an iPhone we
// cannot, and never will be able to, so the best thing available is three clear
// steps and a picture of where the button is.
//
// It leads with the reason rather than the request. "Add us to your home
// screen" is a favour somebody is asking of you. "Notifications only work once
// it is installed" is a fact about the thing you just signed up for, and on iOS
// it is literally true - Apple does not deliver web push to a browser tab.
export default function InstallGate({ onSkip }) {
  const tr = useT()
  const [promptable, setPromptable] = useState(canPromptInstall())
  const [busy, setBusy] = useState(false)
  const ios = isIOS()
  const inApp = isInAppBrowser()
  const steps = installSteps()

  useEffect(() => onInstallPromptChange(setPromptable), [])

  async function install() {
    setBusy(true)
    const outcome = await promptInstall()
    setBusy(false)
    if (outcome === 'accepted') {
      // The page keeps running in the tab and the creator opens the icon next.
      // Nothing is recorded as "skipped" - the gate lifts when the app is
      // actually running standalone, which is the fact it is about.
      onSkip?.()
    }
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-cloud/60 px-5 py-10">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
        <div className="flex flex-col items-center text-center">
          <img src="/brand/tryp-logo.png" alt="Tryp.com" className="h-14 rounded-2xl shadow-card" />
          <h1 className="mt-6 text-2xl font-bold tracking-tight">{tr("Put Tryp.com on your home screen")}</h1>
          <p className="mt-2.5 text-sm leading-relaxed text-smoke">
            {ios
              ? 'On an iPhone, notifications only work once the app is on your home screen. That is how you hear that a challenge went live, that results are in, or that you have been paid.'
              : 'It opens full screen, it loads instantly, and it is the only way to get notifications when a challenge goes live or you get paid.'}
          </p>
        </div>

        {inApp && (
          <div className="mt-6 flex items-start gap-3 rounded-card border border-amber-200 bg-amber-50 px-4 py-3.5">
            <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <p className="text-xs leading-relaxed text-amber-800">
              You have opened this inside another app, which cannot add anything to a home screen.
              Press the menu in the corner and choose <span className="font-semibold">Open in {browserName()}</span>,
              then follow the steps below.
            </p>
          </div>
        )}

        <div className="mt-7 rounded-card bg-white p-5 shadow-card">
          {promptable && !ios ? (
            <>
              <p className="text-sm font-semibold">{tr("One tap and it is done")}</p>
              <button onClick={install} disabled={busy} className="btn-primary mt-3 w-full">
                {busy ? <Spinner className="h-4 w-4" /> : 'Install the app'}
              </button>
              <p className="mt-3 text-center text-xs text-smoke">
                {tr("Your browser will ask you to confirm.")}
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold">{tr("Three steps")}</p>
              <ol className="mt-4 space-y-3.5">
                {steps.map((s, i) => (
                  <li key={s.text} className="flex items-start gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-tint text-xs font-bold text-brand">
                      {i + 1}
                    </span>
                    <span className="min-w-0 pt-1 text-sm leading-relaxed">{s.text}</span>
                  </li>
                ))}
              </ol>
              {ios && (
                <div className="mt-5 flex items-center justify-center gap-2 rounded-xl bg-cloud px-4 py-3 text-xs text-smoke">
                  <ShareGlyph />
                  <span>{tr("Look for this at the bottom of the screen")}</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* IT IS A WALL NOW, AND THE ONLY DOOR IS THE ONE THAT ACTUALLY LEADS
            SOMEWHERE (3 Sep 2026).

            Ethan: "they should only be able to use it on their phone as an app
            on their home screen, because that's the only way we can have
            notifications and that's when they get the proper onboarding. So
            they shouldn't be able to enter the app unless they follow the steps
            to add it to their home screen."

            This used to carry "Continue in the browser for now", which was the
            right call while the gate was an ask and is the wrong one now: a
            skip link next to a wall is just a slower way through it, and the
            reason for the wall - push notifications do not exist in an iOS
            browser tab, at all, ever - does not stop applying because somebody
            pressed skip. A creator who skips is a creator who never hears that
            a challenge went live.

            WHAT IS NOT A WALL is the in-app browser. Instagram's and TikTok's
            webviews CANNOT add anything to a home screen - there is no menu
            item for it - so blocking there with no way forward would strand
            exactly the people arriving from a link in a bio. They get the one
            instruction that does work: open it in the real browser. That is a
            door, not a skip.

            There is deliberately no "I'll do it later". The app re-checks
            `isStandalone()` on every load, so the way past this screen is to
            do it. */}
        <div className="mt-8 rounded-card border border-gray-200 bg-white/70 px-4 py-3.5 text-center">
          <p className="text-xs leading-relaxed text-smoke">
            {ios
              ? tr("Once it is on your home screen, open it from there and sign in again. Notifications cannot reach a browser tab on iPhone.")
              : tr("Once it is installed, open it from your home screen. That is where notifications arrive.")}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="btn-secondary mt-3 !py-2 text-xs"
          >
            {tr("I have added it")}
          </button>
        </div>
      </div>
    </div>
  )
}

/** The iOS share glyph, drawn rather than described, because "the share button"
 *  means four different shapes depending on which phone somebody is holding. */
function ShareGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-brand" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M12 15V3m0 0L8.5 6.5M12 3l3.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" strokeLinecap="round" />
    </svg>
  )
}

/**
 * Should this device be shown the gate at all?
 *
 * ONE CONDITION NOW, AND IT IS THE ONE THAT MATTERS: is this a phone that is
 * not running the installed app? A stored "they skipped it" used to lift the
 * gate for good, which made it an ask. Ethan asked for a wall, and a wall that
 * remembers being walked around is a door.
 *
 * DESKTOP IS UNTOUCHED. Ethan: "for desktop, obviously it can always be on a
 * website, that works best there." There is no home screen to add it to and
 * push works in a desktop browser, so there is nothing to gate.
 */
export function shouldShowInstallGate() {
  if (isStandalone()) return false
  if (!isMobileDevice()) return false
  return true
}
