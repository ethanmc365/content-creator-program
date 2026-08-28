import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// The network shell is THE app now. This route used to gate every global-network
// path behind a device-local preview flag AND admin, because the build was being
// assembled underneath a running UK challenge. That challenge is over and the
// worldwide network is live for every creator, so the gate is gone.
//
// What is left is the scroll reset, which is not ceremony: React Router keeps
// scroll position across navigations, so arriving at /global from a scrolled
// page lands you part-way down the hero and reads as a broken page.
//
// The REAL boundary was never this component, it is RLS. The policies added in
// 074 limit every creator to the communities they actually belong to: a UK
// creator can open the worldwide hub and cannot read Spain's rooms, standings
// or challenges, because they are not a member of Spain.
export default function NetworkRoute() {
  const { profileLoaded } = useAuth()
  const { pathname } = useLocation()

  useEffect(() => { window.scrollTo(0, 0) }, [pathname])

  // Still wait for the profile. CommunityContext keys its whole load off the
  // session, and rendering the shell before the profile lands flashes an empty
  // network at somebody who is in six markets.
  if (!profileLoaded) return null
  return <Outlet />
}
