import { useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { PlaneLoader, Spinner } from './ui'
import RouteSkeleton from './RouteSkeleton'
import InstallGate, { shouldShowInstallGate } from './InstallGate'
import { useAppFlag } from '../lib/appFlags'
import SubmittedCard from './SubmittedCard'
import { formatDate } from '../lib/utils'
import { useT } from '../lib/i18n'

// Route guards.
//  <ProtectedRoute>  - must be signed in (and not suspended).
//  <AdminRoute>      - must be signed in AND an admin.
//  Also nudges brand-new users into onboarding before anything else.

// Session or profile still resolving.
//
// THE LAST FULL-SCREEN LOADER IN THE SIGNED-IN APP, AND IT IS A SKELETON NOW
// (4 Sep 2026). Ethan: "I don't want a loading screen, only the skeleton layout
// loading." This guard sits ABOVE `AppLayout`, so when it drew `AppLoader` the
// entire app - header, tab bar, page - was replaced by a white screen with a
// flying plane and the word "Loading". Every other transition in the product
// had already been taken off that; these two guards and ConnectGate were the
// three that were missed, and they are the ones most likely to fire on a phone
// that has just been woken up.
//
// `RouteSkeleton` keeps the same contract `AppLoader` had - it draws NOTHING
// while `index.html`'s own layer owns the screen and holds that layer up until
// it unmounts (see lib/bootLoader) - so there is still never more than one
// loading surface at a time. What changed is only what it looks like when it is
// the one on screen.
function FullPageSpinner() {
  return <RouteSkeleton />
}

async function signOutAndGoHome(signOut) {
  await signOut()
  window.location.href = '/'
}

// Shown while a new creator's application is awaiting review, and it is the
// SAME CARD the onboarding form finishes on - see components/SubmittedCard.
//
// It used to be a branded flying-plane scene, and so did the screen Onboarding
// drew while the save was in flight, so applying meant watching two full-screen
// animations with a navigation between them. Ethan: "I would just skip that
// automated plane page and jump to the page that says application submitted."
// One card, one state change, nothing flies.
function ReviewPending({ signOut }) {
  return <SubmittedCard pending onSignOut={() => signOutAndGoHome(signOut)} />
}

// Shown if an application was declined.
function ReviewDeclined({ signOut }) {
  const tr = useT()
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 px-6 text-center">
      <p className="text-4xl">✈️</p>
      <div className="max-w-md space-y-3">
        <h1 className="text-2xl font-bold">{tr("Application not approved")}</h1>
        <p className="text-smoke">
          {tr("Thanks so much for your interest in the Tryp.com Content Creator Community. Unfortunately your application was not successful this time. We're sorry, and we truly appreciate you taking the time to apply.")}
        </p>
      </div>
      <button onClick={() => signOutAndGoHome(signOut)} className="btn-ghost text-sm">{tr("Log out")}</button>
    </div>
  )
}

// Shown when the profile fetch keeps failing on a flaky connection. The session
// is valid, so we offer a retry rather than treating the user as logged out.
function ConnectionSlow({ onRetry, signOut }) {
  const tr = useT()
  const [busy, setBusy] = useState(false)
  async function retry() {
    setBusy(true)
    await onRetry()
    setBusy(false)
  }
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <PlaneLoader />
      <div className="max-w-md space-y-3">
        <h1 className="text-2xl font-bold">{tr("Taking longer than usual")}</h1>
        <p className="text-smoke">
          {tr("We're having trouble reaching the server. Your connection might be slow. Give it another try.")}
        </p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <button onClick={retry} disabled={busy} className="btn-primary">{busy ? <Spinner /> : 'Try again'}</button>
        <button onClick={() => signOutAndGoHome(signOut)} className="btn-ghost text-sm">{tr("Log out")}</button>
      </div>
    </div>
  )
}

// Statuses that are allowed to use the app. Everything else is gated to a
// review/declined/suspended screen. Default-deny: an unknown status never
// reaches the app.
const ALLOWED_STATUSES = ['active', 'muted']

// Shown when the account is scheduled for deletion (30-day grace). The creator
// can restore it themselves here; an admin can also restore it.
function DeletionScheduled({ profile, signOut, onRestore }) {
  const tr = useT()
  const [busy, setBusy] = useState(false)
  const purgeOn = formatDate(new Date(new Date(profile.deletion_requested_at).getTime() + 30 * 86400000))
  async function restore() {
    setBusy(true)
    await supabase.from('profiles').update({ deletion_requested_at: null }).eq('id', profile.id)
    await onRestore()
  }
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-cloud/40 px-6 text-center">
      <p className="text-4xl">🗑️</p>
      <div className="max-w-md space-y-3">
        <h1 className="text-2xl font-bold">{tr("Your account is scheduled for deletion")}</h1>
        <p className="text-smoke">
          {tr("It will be permanently deleted on")} <strong>{purgeOn}</strong>. Changed your mind? You can
          restore it any time before then and pick up right where you left off.
        </p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <button onClick={restore} disabled={busy} className="btn-primary">{busy ? <Spinner /> : 'Restore my account'}</button>
        <button onClick={() => signOutAndGoHome(signOut)} className="btn-ghost text-sm">{tr("Log out")}</button>
      </div>
    </div>
  )
}

export function ProtectedRoute() {
  const tr = useT()
  const { user, profile, profileLoaded, profileError, loading, sessionChecked, storedSession, isSuspended, signOut, refreshProfile, retryProfile } = useAuth()
  const location = useLocation()
  // Starts false and never blocks a render: a full-screen gate that appears a
  // beat AFTER the app has painted is worse than one that arrives a beat late.
  const installGate = useAppFlag('install_gate_enabled')

  if (loading) return <FullPageSpinner />
  // NOBODY IS LOGGED IN HERE, OR WE JUST DO NOT KNOW YET? THEY ARE NOT THE SAME.
  //
  // This used to be `if (!user) return <Navigate to="/login" />`, and `user`
  // is null both when the visitor is a stranger AND for as long as the session
  // is still being read. A five-second watchdog in AuthContext could end the
  // spinner while the answer was still in flight, and this line then threw a
  // signed-in creator at the login form - "it takes ages to load and doesn't
  // load at all, it will then just go back to the login page".
  //
  // So: a stranger (no saved login in this browser) still goes straight to
  // /login, and now without waiting on the watchdog at all. Somebody holding a
  // saved login is never sent there on a guess - either the session arrives, or
  // they get the retry screen, which is the honest description of the state.
  if (!user) {
    if (sessionChecked || !storedSession) return <Navigate to="/login" replace />
    return <ConnectionSlow onRetry={() => window.location.reload()} signOut={signOut} />
  }
  // Profile fetch failed on the network (not "no row"). The session is valid, so
  // offer a retry instead of bouncing a real user to /login.
  if (profileError && !profile) return <ConnectionSlow onRetry={retryProfile} signOut={signOut} />
  // CRITICAL: never render the app until we know this user's status. Without
  // this wait the guard used to fall through to <Outlet /> with a null profile,
  // letting brand-new / unapproved accounts see everything.
  if (!profileLoaded) return <FullPageSpinner />
  // Signed in but no profile row exists (corrupt/ghost session). Fail closed -
  // AuthContext also signs this session out.
  if (!profile) return <Navigate to="/login" replace />

  // Account scheduled for deletion → lock the app, offer self-restore.
  if (profile.deletion_requested_at) return <DeletionScheduled profile={profile} signOut={signOut} onRestore={refreshProfile} />

  if (isSuspended) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-4xl">🚫</p>
        <h1 className="text-2xl font-bold">{tr("Account suspended")}</h1>
        <p className="max-w-md text-smoke">
          {tr("Your account has been suspended by the Tryp.com team. If you think this is a mistake, please email the community team.")}
        </p>
      </div>
    )
  }

  // First login → finish onboarding before anything else, so admins always
  // review a complete profile. Only the onboarding route is reachable until then.
  if (!profile.onboarded) {
    return location.pathname === '/onboarding' ? <Outlet /> : <Navigate to="/onboarding" replace />
  }

  // Onboarded but still awaiting (or refused) admin approval → gate the app.
  if (profile.status === 'declined') return <ReviewDeclined signOut={signOut} />
  if (profile.status === 'pending') return <ReviewPending signOut={signOut} />
  // Default-deny: only active/muted members (or admins) get the app.
  if (!ALLOWED_STATUSES.includes(profile.status) && !profile.is_admin) {
    return <ReviewPending signOut={signOut} />
  }

  // ON A PHONE, ASK FOR THE HOME SCREEN FIRST.
  //
  // Behind its own switch (off), so nobody currently using the platform meets
  // it. It is an ASK and not a wall - see InstallGate for why hard-blocking
  // locks out exactly the people most likely to arrive from an Instagram or
  // TikTok link, whose in-app browser cannot install anything at all.
  if (installGate && profile.status === 'active' && !profile.is_admin && shouldShowInstallGate()) {
    return <InstallGate onSkip={refreshProfile} />
  }

  // THE CONNECT WALL IS RETIRED, AND IT IS WHY THE TUTORIAL "STILL DIDN'T SHOW
  // UP WHEN A NEW USER FIRST OPENS THE APP" (4 Sep 2026).
  //
  // `connect_gate_done` DEFAULTS TO FALSE, so every newly approved creator was
  // sent to `ConnectGate` and had to send three connection requests before the
  // app shell rendered at all. `TourGate` is mounted INSIDE that shell. So the
  // walkthrough could not be the first thing anybody saw, by construction - the
  // auto-start logic was correct and never got the chance to run.
  //
  // THE REAL FAULT IS THAT THERE WERE TWO FIRST-RUN EXPERIENCES. This wall was
  // built before the walkthrough existed and does a version of the same job -
  // get somebody meeting people - as a hard gate with no explanation, in front
  // of a person who has been a member for four seconds and knows nobody.
  // Ethan: "the tutorial should automatically start immediately after someone's
  // accepted and they first open the platform." Both cannot be first.
  //
  // The walkthrough wins because it explains itself, it ends on "say hello in
  // the chat", and the empty DM pane now offers exactly the people this gate
  // was pushing (see pages/Messages). NOTHING IS DELETED: the component, the
  // column and the grandfathering all stay, so this is one `if` away from
  // coming back if the connection numbers say it should.
  //
  // if (profile.status === 'active' && !profile.is_admin && !profile.connect_gate_done) {
  //   return <ConnectGate />
  // }

  return <Outlet />
}

export function AdminRoute() {
  const { user, profile, profileLoaded, isAdmin, loading, sessionChecked, storedSession, signOut } = useAuth()
  if (loading) return <FullPageSpinner />
  // Same rule as ProtectedRoute: never mistake "not resolved yet" for "logged
  // out". An admin deep-linking to /admin on a slow phone was the same bounce.
  if (!user) {
    if (sessionChecked || !storedSession) return <Navigate to="/login" replace />
    return <ConnectionSlow onRetry={() => window.location.reload()} signOut={signOut} />
  }
  // Wait until the profile has resolved before deciding, otherwise a hard
  // refresh on an admin URL can briefly bounce to /home.
  if (!profileLoaded) return <FullPageSpinner />
  if (!profile) return <Navigate to="/login" replace />
  if (!isAdmin) return <Navigate to="/home" replace />
  return <Outlet />
}
