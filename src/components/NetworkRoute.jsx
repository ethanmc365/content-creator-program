import { Outlet } from 'react-router-dom'
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

  // THE SCROLL RESET LIVED HERE TOO, AND TWO OF THEM IS ONE TOO MANY.
  //
  // `AppLayout` already resets the scroll on every pathname change - it is the
  // shell's job, because it is true of every page. This was a second copy for
  // the network routes only, so navigating to /global, /rooms or a market ran
  // BOTH. And the two-argument `window.scrollTo(0, 0)` honours
  // `html { scroll-behavior: smooth }` exactly like the object form does, so
  // what actually happened on a phone was two animated scrolls racing each
  // other over one document. That is most of "everything jumps about the
  // place".
  //
  // Deleted rather than fixed. One mechanism, in the shell, doing it instantly
  // inside the commit. See AppLayout.

  // Still wait for the profile. CommunityContext keys its whole load off the
  // session, and rendering the shell before the profile lands flashes an empty
  // network at somebody who is in six markets.
  if (!profileLoaded) return null
  return <Outlet />
}
