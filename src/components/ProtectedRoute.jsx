import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { PlaneLoader } from './ui'

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
          Thanks for your interest in the Tryp.com Content Creator Program. After review, your application
          was not approved at this time. If you think this was a mistake, please reach out to the program team.
        </p>
      </div>
      <button onClick={() => signOutAndGoHome(signOut)} className="btn-ghost text-sm">Log out</button>
    </div>
  )
}

export function ProtectedRoute() {
  const { user, profile, loading, isSuspended, signOut } = useAuth()
  const location = useLocation()

  if (loading) return <FullPageSpinner />
  if (!user) return <Navigate to="/login" replace />

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
  // review a complete profile.
  if (profile && !profile.onboarded && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />
  }

  // Onboarded but still awaiting (or refused) admin approval → gate the app.
  if (profile?.status === 'declined') return <ReviewDeclined signOut={signOut} />
  if (profile?.status === 'pending' && profile?.onboarded) {
    return <ReviewPending name={profile?.name} signOut={signOut} />
  }

  return <Outlet />
}

export function AdminRoute() {
  const { user, profile, isAdmin, loading } = useAuth()
  if (loading) return <FullPageSpinner />
  if (!user) return <Navigate to="/login" replace />
  // The profile loads just after the session does; wait for it before deciding,
  // otherwise a hard refresh on an admin URL can briefly bounce to /home.
  if (!profile) return <FullPageSpinner />
  if (!isAdmin) return <Navigate to="/home" replace />
  return <Outlet />
}
