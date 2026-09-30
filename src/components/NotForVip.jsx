import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// A VIP is paid by views and does not see or enter the challenges (2 Oct 2026). The database already hides
// the challenges from them and refuses an entry; this is the other half, so they are never walked to a page
// that would be empty. An admin who happens to be a VIP still sees everything.
export default function NotForVip() {
  const { profile, isAdmin } = useAuth()
  if (profile?.is_vip && !isAdmin) return <Navigate to="/vip" replace />
  return <Outlet />
}
