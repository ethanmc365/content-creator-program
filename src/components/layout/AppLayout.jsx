import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { Avatar } from '../ui'
import Icon from '../Icon'
import NotificationBell from './NotificationBell'
import { cx } from '../../lib/utils'

// The signed-in app shell. One shared set of icon tabs powers BOTH the
// desktop top bar and the mobile bottom bar, so they look identical.
// Secondary destinations (Creators, roles, etc.) live in the avatar dropdown.
const TABS = [
  { to: '/home', label: 'Home', icon: 'home' },
  { to: '/challenges', label: 'Challenges', icon: 'flag' },
  { to: '/creators', label: 'Creators', icon: 'users' },
  { to: '/chat', label: 'Chat', icon: 'chat' },
  { to: '/messages', label: 'DMs', icon: 'envelope' },
  { to: '/events', label: 'Calendar', icon: 'calendar' },
  { to: '/resources', label: 'Library', icon: 'book' },
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

  // Desktop nav item: icon on top of label, matching the mobile tab bar.
  const navLinkClass = ({ isActive }) =>
    cx(
      'relative flex flex-col items-center gap-0.5 rounded-xl px-4 py-1.5 text-[11px] font-medium transition-colors',
      isActive ? 'text-brand' : 'text-smoke hover:text-ink'
    )

  return (
    <div className="flex min-h-screen flex-col bg-white">
      {/* ------- Top navbar ------- */}
      <header className="sticky top-0 z-30 border-b border-gray-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-5 sm:px-8">
          <Link to="/home" className="flex items-center gap-3">
            <img src="/brand/tryp-logo.png" alt="Tryp.com" className="h-9 rounded-lg" />
            <span className="hidden text-sm font-semibold text-smoke md:block">Content Creator Program</span>
          </Link>

          <nav className="hidden items-center gap-2 lg:flex" aria-label="Main">
            {TABS.map((item) => (
              <NavLink key={item.to} to={item.to} className={navLinkClass}>
                <Icon name={item.icon} className="h-5 w-5" />
                {item.label}
                {item.to === '/messages' && dmUnread > 0 && (
                  <span className="absolute right-2 top-0 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-brand px-1 text-[9px] font-semibold text-white">
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
                <div className="absolute right-0 z-40 mt-2 max-h-[80vh] w-60 overflow-y-auto rounded-card border border-gray-100 bg-white p-2 shadow-lift animate-fade-up">
                  <div className="border-b border-gray-100 px-3 py-2">
                    <p className="truncate text-sm font-semibold">{profile?.name}</p>
                    <p className="truncate text-xs text-smoke">{user?.email}</p>
                  </div>
                  <Link to={`/profile/${user?.id}`} onClick={() => setMenuOpen(false)} className="block rounded-xl px-3 py-2.5 text-sm hover:bg-cloud">My profile</Link>
                  <Link to="/profile/edit" onClick={() => setMenuOpen(false)} className="block rounded-xl px-3 py-2.5 text-sm hover:bg-cloud">Edit profile</Link>
                  <Link to="/rewards" onClick={() => setMenuOpen(false)} className="block rounded-xl px-3 py-2.5 text-sm hover:bg-cloud">My rewards</Link>
                  <Link to="/dashboard" onClick={() => setMenuOpen(false)} className="block rounded-xl px-3 py-2.5 text-sm hover:bg-cloud">My dashboard</Link>

                  {/* Explore — secondary destinations not in the main tab bar */}
                  <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Explore</p>
                  <Link to="/jobs" onClick={() => setMenuOpen(false)} className="block rounded-xl px-3 py-2.5 text-sm hover:bg-cloud">Search roles</Link>
                  <Link to="/refer" onClick={() => setMenuOpen(false)} className="block rounded-xl px-3 py-2.5 text-sm hover:bg-cloud">Refer a creator</Link>

                  <div className="my-1 border-t border-gray-100" />
                  {isAdmin && <Link to="/admin" onClick={() => setMenuOpen(false)} className="block rounded-xl px-3 py-2.5 text-sm font-medium text-brand hover:bg-cloud">Admin panel</Link>}
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
        <div className="mx-auto flex max-w-lg items-center justify-around px-0.5 py-2">
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) =>
                cx('relative flex flex-1 flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 text-[9px] font-medium', isActive ? 'text-brand' : 'text-smoke')
              }
            >
              <Icon name={tab.icon} className="h-5 w-5" />
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
