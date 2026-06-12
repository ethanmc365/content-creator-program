import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { Avatar } from '../ui'
import NotificationBell from './NotificationBell'
import { cx } from '../../lib/utils'

// The signed-in app shell:
//  * Desktop — top navbar with all destinations.
//  * Mobile  — slim top bar + bottom tab bar (creators are mostly on phones).
const NAV = [
  { to: '/home', label: 'Home' },
  { to: '/challenges', label: 'Challenges' },
  { to: '/creators', label: 'Creators' },
  { to: '/chat', label: 'Chat' },
  { to: '/messages', label: 'Messages' },
  { to: '/wall-of-fame', label: 'Wall of Fame' },
  { to: '/resources', label: 'Resources' },
  { to: '/events', label: 'Events' },
]

const MOBILE_TABS = [
  { to: '/home', label: 'Home', icon: 'M3 12l9-9 9 9M5 10v10a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1V10' },
  { to: '/challenges', label: 'Challenges', icon: 'M5 3v18M5 4h13l-2.5 4L18 12H5' },
  { to: '/creators', label: 'Creators', icon: 'M17 20h5v-1a4 4 0 00-5-3.87M9 20H4v-1a5 5 0 015-5h0a5 5 0 015 5v1H9zm3-9a4 4 0 100-8 4 4 0 000 8zm8 1a3 3 0 100-6' },
  { to: '/chat', label: 'Chat', icon: 'M8 12h8m-8-3h5m7 3a9 9 0 11-4.2-7.6A9 9 0 0121 12zm-9 9l-3-3' },
  { to: '/messages', label: 'DMs', icon: 'M3 8l9 6 9-6M4 6h16a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V7a1 1 0 011-1z' },
]

export default function AppLayout() {
  const { profile, isAdmin, user, signOut } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [dmUnread, setDmUnread] = useState(0)
  const menuRef = useRef(null)

  // Unread DM badge, kept live via realtime.
  useEffect(() => {
    if (!user) return
    async function count() {
      const { count } = await supabase
        .from('direct_messages')
        .select('id', { count: 'exact', head: true })
        .eq('recipient_id', user.id)
        .eq('read', false)
      setDmUnread(count ?? 0)
    }
    count()
    const channel = supabase
      .channel(`dm-badge-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'direct_messages', filter: `recipient_id=eq.${user.id}` }, count)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [user])

  useEffect(() => {
    if (!menuOpen) return
    const onClick = (e) => menuRef.current && !menuRef.current.contains(e.target) && setMenuOpen(false)
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [menuOpen])

  async function handleSignOut() {
    await signOut()
    navigate('/')
  }

  const navLinkClass = ({ isActive }) =>
    cx(
      'rounded-full px-4 py-2 text-sm font-medium transition-colors',
      isActive ? 'bg-brand-tint text-brand' : 'text-smoke hover:bg-cloud hover:text-ink'
    )

  return (
    <div className="flex min-h-screen flex-col bg-white">
      {/* ------- Top navbar ------- */}
      <header className="sticky top-0 z-30 border-b border-gray-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-5 sm:px-8">
          <Link to="/home" className="flex items-center gap-3">
            <img src="/brand/tryp-logo.png" alt="Tryp.com" className="h-9 rounded-lg" />
            <span className="hidden text-sm font-semibold text-smoke md:block">Creator Program</span>
          </Link>

          <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
            {NAV.map((item) => (
              <NavLink key={item.to} to={item.to} className={navLinkClass}>
                {item.label}
                {item.to === '/messages' && dmUnread > 0 && (
                  <span className="ml-1.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand px-1 text-[10px] font-semibold text-white">
                    {dmUnread > 9 ? '9+' : dmUnread}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            {isAdmin && (
              <Link to="/admin" className="hidden rounded-full border border-brand px-4 py-1.5 text-xs font-semibold text-brand transition-colors hover:bg-brand hover:text-white sm:block">
                Admin
              </Link>
            )}
            <NotificationBell />

            {/* Avatar dropdown */}
            <div className="relative" ref={menuRef}>
              <button onClick={() => setMenuOpen((o) => !o)} aria-label="Account menu" className="rounded-full">
                <Avatar src={profile?.photo_url} name={profile?.name} size="sm" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 z-40 mt-2 w-56 rounded-card border border-gray-100 bg-white p-2 shadow-lift animate-fade-up">
                  <div className="border-b border-gray-100 px-3 py-2">
                    <p className="truncate text-sm font-semibold">{profile?.name}</p>
                    <p className="truncate text-xs text-smoke">{user?.email}</p>
                  </div>
                  <Link to={`/profile/${user?.id}`} onClick={() => setMenuOpen(false)} className="block rounded-xl px-3 py-2.5 text-sm hover:bg-cloud">My profile</Link>
                  <Link to="/profile/edit" onClick={() => setMenuOpen(false)} className="block rounded-xl px-3 py-2.5 text-sm hover:bg-cloud">Edit profile</Link>
                  <Link to="/rewards" onClick={() => setMenuOpen(false)} className="block rounded-xl px-3 py-2.5 text-sm hover:bg-cloud">My rewards</Link>
                  <Link to="/dashboard" onClick={() => setMenuOpen(false)} className="block rounded-xl px-3 py-2.5 text-sm hover:bg-cloud">My dashboard</Link>
                  {isAdmin && <Link to="/admin" onClick={() => setMenuOpen(false)} className="block rounded-xl px-3 py-2.5 text-sm font-medium text-brand hover:bg-cloud sm:hidden">Admin panel</Link>}
                  <button onClick={handleSignOut} className="block w-full rounded-xl px-3 py-2.5 text-left text-sm text-red-600 hover:bg-red-50">Log out</button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ------- Page content (pb-24 leaves room for the mobile tab bar) ------- */}
      <main className="flex-1 pb-24 lg:pb-0">
        <Outlet />
      </main>

      {/* ------- Mobile bottom tab bar ------- */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-100 bg-white/95 backdrop-blur lg:hidden" aria-label="Mobile">
        <div className="mx-auto flex max-w-md items-center justify-around py-2">
          {MOBILE_TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) =>
                cx('relative flex flex-col items-center gap-0.5 rounded-xl px-3 py-1.5 text-[10px] font-medium', isActive ? 'text-brand' : 'text-smoke')
              }
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d={tab.icon} />
              </svg>
              {tab.label}
              {tab.to === '/messages' && dmUnread > 0 && (
                <span className="absolute -top-0.5 right-1 h-2.5 w-2.5 rounded-full bg-brand" aria-label={`${dmUnread} unread`} />
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
