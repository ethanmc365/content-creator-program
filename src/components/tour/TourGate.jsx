import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useIsPhone } from '../../lib/useKeyboardInset'
import { useCommunity } from '../../context/CommunityContext'
import {
  clearStep, clearWalkOpen, markSeenLocally, markTourComplete, markWalkOpen,
  shouldAutoStart, tourEnabled, walkIsOpen,
} from '../../lib/tour'
import { isMobileDevice, isStandalone } from '../../lib/install'

// WHETHER THE WALKTHROUGH RUNS, DECIDED IN ONE PLACE.
//
// This is mounted in the app shell and it is deliberately almost nothing: it
// asks one question and, nearly always, the answer is no and the overlay is
// never downloaded at all. The overlay itself is lazy for exactly that reason -
// forty five existing creators must not pay for a feature none of them will
// ever see.
//
// It also exposes a way to start it deliberately, which is what the Settings
// entry and the Testing Centre both use.
const TourHost = lazy(() => import('./TourHost'))

let openDeliberately = null

// WHETHER THE OPEN WALK IS A FIRST RUN, kept beside the "is it open" flag so a
// reload restores both. localStorage rather than state for the same reason
// `walkIsOpen` is: the whole point is surviving the page going away.
const REQUIRED_KEY = 'tryp_tour_required'
const REQUIRED_HINT = () => {
  try { return localStorage.getItem(REQUIRED_KEY) === '1' } catch { return false }
}
const setRequiredHint = (on) => {
  try {
    if (on) localStorage.setItem(REQUIRED_KEY, '1')
    else localStorage.removeItem(REQUIRED_KEY)
  } catch { /* private mode */ }
}

/** Start the walkthrough from anywhere. Returns false if the shell is not up. */
export function startTour() {
  if (!openDeliberately) return false
  openDeliberately()
  return true
}

export default function TourGate() {
  const { profile, user } = useAuth()
  const isPhone = useIsPhone()
  // CLOSING IT IS NOT FINISHING IT (4 Sep 2026).
  //
  // Ethan: "on desktop it should always show up the interactive tutorial as
  // soon as you open the site for the first time, or until you've actually
  // completed the tutorial - maybe you opened it and then closed it
  // immediately."
  //
  // `finish` took a reason and ignored it, so pressing the X wrote
  // `tour_completed_at` exactly as reaching the last card did. One tap on the
  // close button and the one thing every new creator is meant to see was gone
  // for good, on every device, for ever.
  //
  // A dismissal is scoped to THIS APP OPEN instead: a ref, not a stored flag.
  // The walk goes away when you close it and does not come back while you are
  // still here - a `refreshProfile` re-running the auto-start effect would
  // otherwise reopen it under you - and the next time the app is opened it
  // resumes at the step it was left on, because `savedStep` is untouched.
  const dismissedHere = useRef(false)
  // WHICH PLATFORM WE ARE WALKING SOMEBODY ROUND.
  //
  // The network shell has the worldwide hub, the board, the flight log and the
  // games; the legacy shell has none of them. Rather than two step lists that
  // drift apart, the steps declare which shell they belong to and the ones that
  // do not exist yet are dropped. The percentage counts the steps that are
  // actually going to run, so nobody tops out at sixty per cent.
  const { preview: network } = useCommunity()
  const layout = isPhone ? 'mobile' : 'desktop'
  // REOPEN A WALK THAT WAS STILL OPEN. See `walkIsOpen` in lib/tour: this is
  // the state that survives a reload, and it is deliberately read here in the
  // initialiser rather than in an effect, so a resumed walk is on the first
  // painted frame instead of appearing a beat later over a page somebody has
  // already started reading.
  const [open, setOpen] = useState(() => walkIsOpen(isPhone ? 'mobile' : 'desktop'))
  // WAS THIS WALK STARTED BY US OR ASKED FOR. The first run is not skippable -
  // see `required` in TourHost - and a re-run from Settings is. Restored from
  // the same flag, so a resumed first run is still a first run.
  const [required, setRequired] = useState(() => walkIsOpen(isPhone ? 'mobile' : 'desktop') && REQUIRED_HINT())

  useEffect(() => {
    // Asking for it explicitly (Settings, the Testing Centre) undoes a
    // dismissal - otherwise "Show me round again" would do nothing at all for
    // anybody who had closed it earlier in the same session. A walk somebody
    // asked for is always escapable, whatever the first run was.
    openDeliberately = () => {
      dismissedHere.current = false
      setRequired(false)
      setRequiredHint(false)
      markWalkOpen(layout)
      setOpen(true)
    }
    return () => { openDeliberately = null }
  }, [layout])

  // AUTO-START, WHICH IS OFF UNTIL SOMEBODY TURNS IT ON.
  //
  // Three gates and every one of them has to pass: the app setting, the
  // creator's own flag in the database, and a per-layout flag in this browser.
  // Migration 107 backfilled every creator who was already here as done, so the
  // existing community cannot be walked round by accident even if the setting
  // is flipped.
  useEffect(() => {
    let alive = true
    if (dismissedHere.current) return undefined
    // A PHONE IN A BROWSER IS ABOUT TO BE WALLED, SO DO NOT WALK IT ROUND.
    // AddToHomePrompt shows a non-dismissible "add it to your home screen"
    // screen there, and the walkthrough is per-layout and runs once - spending
    // it on the mobile website, behind a wall, is spending it on nothing. It
    // starts on the first open of the installed app instead, which is the
    // order Ethan asked for. Desktop is untouched.
    if (isMobileDevice() && !isStandalone()) return undefined
    if (!profile || profile.tour_completed_at || profile.is_admin) return undefined
    tourEnabled().then((enabled) => {
      if (!alive) return
      if (!shouldAutoStart({ profile, enabled, layout })) return
      // THE FIRST RUN IS THE ONE THAT CANNOT BE WALKED AWAY FROM. Ethan: "the
      // tutorial is non-skippable the very first time you do it. If you redo
      // it, yes, you can exit out of it."
      setRequired(true)
      setRequiredHint(true)
      markWalkOpen(layout)
      setOpen(true)
    })
    return () => { alive = false }
  }, [profile, layout])

  const finish = useCallback(async (reason) => {
    setOpen(false)
    // The overlay is down, so it must not be restored by the next reload.
    clearWalkOpen(layout)
    setRequiredHint(false)
    // DISMISSED: away for this app open, back where they left it next time.
    if (reason === 'dismissed') {
      dismissedHere.current = true
      return
    }
    markSeenLocally(layout)
    // The resume point is only meaningful while the walk is unfinished.
    // Leaving it behind would put somebody who restarts it from Settings back
    // at the step they abandoned a month ago.
    clearStep(layout)
    await markTourComplete(user?.id)
  }, [layout, user?.id])

  if (!open) return null
  return (
    <Suspense fallback={null}>
      <TourHost onFinish={finish} network={network} layout={layout} required={required} />
    </Suspense>
  )
}
