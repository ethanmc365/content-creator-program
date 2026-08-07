import { useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useCommunity } from '../context/CommunityContext'

// Gate for every global-network route. TWO conditions, both required.
//
//   1. The preview flag is on for this device.
//   2. You are an admin.
//
// The flag alone is not a security boundary: it lives in localStorage, so a
// creator who set it by hand would otherwise walk straight in. While a UK
// challenge is running, nothing about this build should be reachable by the 44
// creators using the app, so admin is checked as well.
//
// Neither check is the REAL boundary, which is RLS. If someone patched the
// client past both of these, the policies added in 074 still limit them to the
// communities they belong to: no other creator's data, no DMs, no emails, and
// no staff channels. This gate is what keeps the build out of sight; the
// database is what keeps it safe.
export default function NetworkRoute() {
  const { isAdmin, profileLoaded } = useAuth()
  const { preview } = useCommunity()
  const { pathname } = useLocation()

  // React Router keeps the scroll position across navigations and this app has
  // no global scroll restoration. Arriving at /global from a scrolled /admin
  // therefore lands you part-way down the hero, which reads as a broken page.
  // Scoped to the network routes deliberately: adding it app-wide would change
  // behaviour on pages creators use today, which is out of bounds while a
  // challenge is running.
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])

  // Wait for the profile before deciding. Treating "not loaded yet" as "not an
  // admin" would bounce a genuine admin to Home on every hard refresh.
  if (!profileLoaded) return null
  if (!preview || !isAdmin) return <Navigate to="/home" replace />
  return <Outlet />
}
