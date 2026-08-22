import { useEffect, useState } from 'react'
import Icon from './Icon'
import { Spinner } from './ui'
import {
  browserName, canPromptInstall, installSteps, isIOS, isInAppBrowser, isMobileDevice,
  isStandalone, onInstallPromptChange, promptInstall, skipInstall, skippedInstall,
} from '../lib/install'

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
      // The page keeps running in the tab; the creator opens the icon next.
      skipInstall()
      onSkip?.()
    }
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-cloud/60 px-5 py-10">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
        <div className="flex flex-col items-center text-center">
          <img src="/brand/tryp-logo.png" alt="Tryp.com" className="h-14 rounded-2xl shadow-card" />
          <h1 className="mt-6 text-2xl font-bold tracking-tight">Put Tryp.com on your home screen</h1>
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
              <p className="text-sm font-semibold">One tap and it is done</p>
              <button onClick={install} disabled={busy} className="btn-primary mt-3 w-full">
                {busy ? <Spinner className="h-4 w-4" /> : 'Install the app'}
              </button>
              <p className="mt-3 text-center text-xs text-smoke">
                Your browser will ask you to confirm.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold">Three steps</p>
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
                  <span>Look for this at the bottom of the screen</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* THE ESCAPE HATCH, AND IT IS NOT HIDDEN.
            A hard block locks out anybody in an in-app browser, anybody whose
            phone will not install it, and anybody who deletes the icon later -
            all of whom already have an approved account. The ask is strong; the
            wall is not there. */}
        <button
          onClick={() => { skipInstall(); onSkip?.() }}
          className="mx-auto mt-8 text-sm font-medium text-smoke underline-offset-4 transition-colors hover:text-brand hover:underline"
        >
          Continue in the browser for now
        </button>
        <p className="mt-2 text-center text-xs text-smoke">
          You can add it later from Settings.
        </p>
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

/** Should this device be shown the gate at all? */
export function shouldShowInstallGate() {
  if (isStandalone()) return false
  if (!isMobileDevice()) return false
  if (skippedInstall()) return false
  return true
}
