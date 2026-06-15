import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { PlaneLoader } from './ui'

// Route guards.
//  <ProtectedRoute>  — must be signed in (and not suspended).
//  <AdminRoute>      — must be signed in AND an admin.
//  Also nudges brand-new users into onboarding before anything else.

function FullPageSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <PlaneLoader />
    </div>
  )
}

export function ProtectedRoute() {
  const { user, profile, loading, isSuspended } = useAuth()
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

  // First login → finish onboarding before using the app.
  if (profile && !profile.onboarded && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />
  }

  return <Outlet />
}

export function AdminRoute() {
  const { user, isAdmin, loading } = useAuth()
  if (loading) return <FullPageSpinner />
  if (!user) return <Navigate to="/login" replace />
  if (!isAdmin) return <Navigate to="/home" replace />
  return <Outlet />
}
