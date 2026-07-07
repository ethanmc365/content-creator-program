import { useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { PlaneLoader, Spinner } from './ui'
import { formatDate } from '../lib/utils'

// Route guards.
//  <ProtectedRoute>  - must be signed in (and not suspended).
//  <AdminRoute>      - must be signed in AND an admin.
//  Also nudges brand-new users into onboarding before anything else.

function FullPageSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <PlaneLoader />
    </div>
  )
}

async function signOutAndGoHome(signOut) {
  await signOut()
  window.location.href = '/'
}

// Shown while a new creator's application is awaiting admin approval.
function ReviewPending({ name, signOut }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-cloud/40 px-6 text-center">
      <PlaneLoader />
      <div className="max-w-md space-y-3">
        <h1 className="text-2xl font-bold">Thanks{name ? `, ${name.split(' ')[0]}` : ''}! Your application is being reviewed</h1>
        <p className="text-smoke">
          The Tryp.com Team is reviewing your profile and socials right now. This usually does not take long.
          We will notify you by email and in the app as soon as you are approved.
        </p>
      </div>
      <button onClick={() => signOutAndGoHome(signOut)} className="btn-ghost text-sm">Log out</button>
    </div>
  )
}

// Shown if an application was declined.
function ReviewDeclined({ signOut }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 px-6 text-center">
      <p className="text-4xl">✈️</p>
      <div className="max-w-md space-y-3">
        <h1 className="text-2xl font-bold">Application not approved</h1>
        <p className="text-smoke">
          Thanks so much for your interest in the Tryp.com Content Creator Program. Unfortunately your
          application was not successful this time. We're sorry, and we truly appreciate you taking the time to apply.
        </p>
      </div>
      <button onClick={() => signOutAndGoHome(signOut)} className="btn-ghost text-sm">Log out</button>
    </div>
  )
}

// Shown when the profile fetch keeps failing on a flaky connection. The session
// is valid, so we offer a retry rather than treating the user as logged out.
function ConnectionSlow({ onRetry, signOut }) {
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
        <h1 className="text-2xl font-bold">Taking longer than usual</h1>
        <p className="text-smoke">
          We're having trouble reaching the server. Your connection might be slow. Give it another try.
        </p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <button onClick={retry} disabled={busy} className="btn-primary">{busy ? <Spinner /> : 'Try again'}</button>
        <button onClick={() => signOutAndGoHome(signOut)} className="btn-ghost text-sm">Log out</button>
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
        <h1 className="text-2xl font-bold">Your account is scheduled for deletion</h1>
        <p className="text-smoke">
          It will be permanently deleted on <strong>{purgeOn}</strong>. Changed your mind? You can
          restore it any time before then and pick up right where you left off.
        </p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <button onClick={restore} disabled={busy} className="btn-primary">{busy ? <Spinner /> : 'Restore my account'}</button>
        <button onClick={() => signOutAndGoHome(signOut)} className="btn-ghost text-sm">Log out</button>
      </div>
    </div>
  )
}

export function ProtectedRoute() {
  const { user, profile, profileLoaded, profileError, loading, isSuspended, signOut, refreshProfile, retryProfile } = useAuth()
  const location = useLocation()

  if (loading) return <FullPageSpinner />
  if (!user) return <Navigate to="/login" replace />
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
        <h1 className="text-2xl font-bold">Account suspended</h1>
        <p className="max-w-md text-smoke">
          Your account has been suspended by the Tryp.com team. If you think this is a mistake,
          please email the program team.
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
  if (profile.status === 'pending') return <ReviewPending name={profile.name} signOut={signOut} />
  // Default-deny: only active/muted members (or admins) get the app.
  if (!ALLOWED_STATUSES.includes(profile.status) && !profile.is_admin) {
    return <ReviewPending name={profile.name} signOut={signOut} />
  }

  return <Outlet />
}

export function AdminRoute() {
  const { user, profile, profileLoaded, isAdmin, loading } = useAuth()
  if (loading) return <FullPageSpinner />
  if (!user) return <Navigate to="/login" replace />
  // Wait until the profile has resolved before deciding, otherwise a hard
  // refresh on an admin URL can briefly bounce to /home.
  if (!profileLoaded) return <FullPageSpinner />
  if (!profile) return <Navigate to="/login" replace />
  if (!isAdmin) return <Navigate to="/home" replace />
  return <Outlet />
}
