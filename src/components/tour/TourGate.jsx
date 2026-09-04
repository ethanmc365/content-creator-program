import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useIsPhone } from '../../lib/useKeyboardInset'
import { useCommunity } from '../../context/CommunityContext'
import { clearStep, markSeenLocally, markTourComplete, shouldAutoStart, tourEnabled } from '../../lib/tour'

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

/** Start the walkthrough from anywhere. Returns false if the shell is not up. */
export function startTour() {
  if (!openDeliberately) return false
  openDeliberately()
  return true
}

export default function TourGate() {
  const { profile, user } = useAuth()
  const isPhone = useIsPhone()
  // WHICH PLATFORM WE ARE WALKING SOMEBODY ROUND.
  //
  // The network shell has the worldwide hub, the board, the flight log and the
  // games; the legacy shell has none of them. Rather than two step lists that
  // drift apart, the steps declare which shell they belong to and the ones that
  // do not exist yet are dropped. The percentage counts the steps that are
  // actually going to run, so nobody tops out at sixty per cent.
  const { preview: network } = useCommunity()
  const [open, setOpen] = useState(false)
  const layout = isPhone ? 'mobile' : 'desktop'

  useEffect(() => {
    openDeliberately = () => setOpen(true)
    return () => { openDeliberately = null }
  }, [])

  // AUTO-START, WHICH IS OFF UNTIL SOMEBODY TURNS IT ON.
  //
  // Three gates and every one of them has to pass: the app setting, the
  // creator's own flag in the database, and a per-layout flag in this browser.
  // Migration 107 backfilled every creator who was already here as done, so the
  // existing community cannot be walked round by accident even if the setting
  // is flipped.
  useEffect(() => {
    let alive = true
    if (!profile || profile.tour_completed_at || profile.is_admin) return undefined
    tourEnabled().then((enabled) => {
      if (!alive) return
      if (shouldAutoStart({ profile, enabled, layout })) setOpen(true)
    })
    return () => { alive = false }
  }, [profile, layout])

  const finish = useCallback(async () => {
    setOpen(false)
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
      <TourHost onFinish={finish} network={network} layout={layout} />
    </Suspense>
  )
}
