import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useCommunity } from '../../context/CommunityContext'
import { loadLinkOrder, orderedLinks } from '../../lib/networkLinks'
import { supabase } from '../../lib/supabase'
import { Avatar } from '../ui'
import Icon from '../Icon'
import NotificationBell from './NotificationBell'
import TourGate from '../tour/TourGate'
import PullToRefresh from '../PullToRefresh'
import { showLocalNotification } from '../../lib/push'
import { startHeartbeat } from '../../lib/presence'
import { stripMarkup } from '../../lib/richText'
import { cx } from '../../lib/utils'
import { useVisualViewport } from '../../lib/useKeyboardInset'
import { applyMotion, getStoredMotion, setShellActive, syncTheme } from '../../lib/theme'

// The signed-in app shell. One shared set of icon tabs powers BOTH the
// desktop top bar and the mobile bottom bar, so they look identical.
// Secondary destinations (Creators, roles, etc.) live in the avatar dropdown.
// Five primary tabs keep the bottom bar uncramped on phones. Secondary
// destinations (Creators, Library, roles, refer) live in the avatar dropdown.
const TABS = [
  { to: '/home', label: 'Home', icon: 'home' },
  { to: '/challenges', label: 'Challenges', icon: 'flag' },
  { to: '/chat', label: 'Chat', icon: 'chat' },
  { to: '/messages', label: 'DMs', icon: 'envelope' },
  { to: '/events', label: 'Calendar', icon: 'calendar' },
]

// The same five slots, re-cut for the network.
//
// The old set plus the network's own chrome meant three overlapping ways to
// reach the same handful of pages: a Calendar tab nobody opened daily, a place
// switcher, and an avatar menu holding fourteen links. Calendar moves into
// "Across the network" on the Worldwide hub, and the slot it frees becomes the
// door to that hub, so the whole people layer is one tap from anywhere.
//
// Swapped, never appended: six items is one too many for a phone's bottom bar,
// and this set is only used when the network preview is on, so a UK creator's
// bar is byte-for-byte what it was.
// Lazy, and never rendered with the flag off. It imports `motion`, so a static
// import here would put the animation runtime back in the bundle every UK
// creator downloads. Same reason the network pages are code-split.
const CommandPalette = lazy(() => import('../network/CommandPalette'))

const NETWORK_TABS = [
  { to: '/home', label: 'Home', icon: 'home' },
  { to: '/challenges', label: 'Challenges', icon: 'flag' },
  // /rooms, not /chat. The legacy chat is one hard-coded conversation; this
  // tab has to answer "where is everyone talking", which across six markets is
  // a grouped index rather than whichever room the router happened to pick.
  { to: '/rooms', label: 'Rooms', icon: 'chat' },
  { to: '/messages', label: 'DMs', icon: 'envelope' },
  { to: '/global', label: 'Worldwide', icon: 'globe' },
]

// WHERE THE WALKTHROUGH POINTS.
//
// One name per destination, put on BOTH the desktop nav item and the mobile
// tab. Only one of the two is ever visible, and the tour resolver picks
// whichever that is - which is what lets a single set of steps cover a phone, a
// tablet and a desktop without three sets of copy drifting apart. `/rooms` and
// `/chat` are the same idea wearing different names depending on whether the
// network shell is on, so they share an anchor. See lib/tour.js.
const TOUR_ANCHORS = {
  '/home': 'nav-home',
  '/challenges': 'nav-challenges',
  '/chat': 'nav-chat',
  '/rooms': 'nav-chat',
  '/messages': 'nav-messages',
  '/events': 'nav-calendar',
  '/global': 'nav-worldwide',
}
const tourAnchor = (to) => TOUR_ANCHORS[to] || undefined

export default function AppLayout() {
  const { profile, isAdmin, impersonating, exitCreatorPreview, user, signOut } = useAuth()
  const { preview: networkPreview, exitPreview } = useCommunity()
  const { pathname } = useLocation()
  // The pill is fixed to the viewport bottom, which is exactly where a chat
  // composer sits. Padding cannot solve that (the pill is not in the flow), so
  // on the network pages it docks out of the way on the right instead. Docking
  // it under the header was the previous answer and it landed straight on top
  // of the place switcher.
  const onNetworkPage = /^\/(global|c|manage)(\/|$)/.test(pathname)
  // A network room is a full-screen overlay on mobile with its own composer.
  // Nothing may float over it: the pill would sit exactly where the send button
  // is. The room's own back link is the way out.
  const onNetworkChat = onNetworkPage && /\/chat(\/|$)/.test(pathname)
  const tabs = networkPreview ? NETWORK_TABS : TABS
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  // Same ten links, and the same order the reader dragged them into on the hub.
  const menuLinks = orderedLinks(loadLinkOrder())
  const [dmUnread, setDmUnread] = useState(0)
  const [connReqs, setConnReqs] = useState(0)
  const [newResources, setNewResources] = useState(false)
  const [exiting, setExiting] = useState(false)
  const [exitError, setExitError] = useState('')
  const [paletteOpen, setPaletteOpen] = useState(false)
  const menuRef = useRef(null)

  // EVERY PAGE OPENS AT ITS TOP.
  //
  // THE BUG THIS FIXES. React Router keeps the window's scroll offset across a
  // navigation, and this shell had no scroll restoration of its own - only
  // NetworkRoute reset it, and only for the routes underneath it. So every
  // legacy route inherited wherever the previous page happened to be scrolled
  // to. Two of Ethan's reports are the same fault seen from different pages:
  // tapping a daily puzzle in the hub's Daily puzzles section (which sits well
  // down the page) opened /game at that same offset, which lands squarely on
  // the leaderboard with the puzzle off the top; and /creators opened part-way
  // down its own grid instead of at the map.
  //
  // It is the shell's job rather than each page's, because it is true of every
  // page: arriving somewhere new means arriving at the top of it.
  //
  // `pathname` ONLY, not the whole location. A search-param change is a filter,
  // a tab or a deep link applied to the page you are already reading, and
  // yanking that page back to the top mid-read is its own bug.
  useEffect(() => {
    // `instant`. A smooth scroll here would animate the OLD page out from under
    // the reader while the new one is already rendered on top of it.
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [pathname])

  // Cmd/Ctrl+K opens the palette from anywhere, and `/` does too when you are
  // not already typing. The typing check matters: without it, `/` in a chat
  // composer would open a search box instead of a slash.
  useEffect(() => {
    if (!networkPreview) return
    const onKey = (e) => {
      const typing = /^(INPUT|TEXTAREA)$/.test(e.target?.tagName) || e.target?.isContentEditable
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setPaletteOpen((o) => !o)
      } else if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        setPaletteOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [networkPreview])
  // When the software keyboard is open (e.g. typing a message) the bottom tab
  // bar slides away so the composer can sit right above the keyboard. Uses the
  // focus-driven signal so it collapses instantly (iOS often doesn't fire the
  // viewport resize until a scroll).
  const keyboardOpen = useVisualViewport().keyboardOpen

  // Presence heartbeat: while the app is open, stamp our own row so admins can
  // see who is online and when a creator was last active.
  // The beat itself lives in lib/presence now (`startHeartbeat`), because it
  // grew three things this effect had no business owning: a throttle, an
  // interaction fallback for when the browser stops honouring the timer, and a
  // `keepalive` beat on the way out so "last active" is accurate to the moment
  // somebody closed the tab rather than up to a minute before it. The notes on
  // each are in that file.
  useEffect(() => {
    if (!user) return undefined
    return startHeartbeat(supabase)
  }, [user])

  // Community dark mode. Applied only while this shell (a logged-in page) is
  // mounted, so the public landing / auth pages always stay on the bright brand
  // palette. The saved profile preference wins; until it loads we fall back to
  // the localStorage cache so there's no bright flash for dark-mode users.
  // Dark mode is scoped to this shell so the public landing / auth pages keep
  // the bright brand palette. lib/theme owns resolution + the OS listeners, so a
  // live system light/dark flip reaches the page without a reload.
  useEffect(() => {
    setShellActive(true)
    applyMotion(getStoredMotion())
    return () => { setShellActive(false); applyMotion(false) }
  }, [])

  // Feed the saved preference in once the profile loads (and on any change).
  useEffect(() => { syncTheme(!!profile?.dark_mode) }, [profile?.dark_mode])

  // "New in the library" dot: anything published since the last time this
  // creator opened the Resources page (which stamps resources_seen_at).
  useEffect(() => {
    if (!user || !profile) return
    let alive = true
    supabase.from('resources').select('created_at').order('created_at', { ascending: false }).limit(1)
      .then(({ data }) => {
        if (!alive || !data?.[0]) return
        const latest = new Date(data[0].created_at).getTime()
        const seen = profile.resources_seen_at ? new Date(profile.resources_seen_at).getTime() : 0
        setNewResources(latest > seen)
      })
    return () => { alive = false }
  }, [user, profile])

  // READING THE THING CLEARS ITS NOTIFICATION.
  //
  // THE BUG THIS FIXES. A notification was only ever marked read by clicking it
  // in the bell. So you could open a DM, read it, reply to it, and the badge
  // would still be sitting there insisting you had not - because the app was
  // tracking "have you read this message" and "have you read this notification"
  // in two places and only one of them was being updated by reading. 370 unread
  // chat notifications and 34 unread DM notifications had piled up that way.
  //
  // Every notification already stores the route it points at, so arriving on
  // that route IS reading it. Matched exactly, server side: being on /messages
  // must not clear a thread you never opened.
  useEffect(() => {
    if (!user) return undefined
    // A beat after arrival, so a bounce through a route does not clear it and
    // so this never races the page's own first paint.
    const t = setTimeout(() => {
      supabase.rpc('mark_notifications_read_for_path', { p: pathname }).then(() => {}, () => {})
    }, 700)
    return () => clearTimeout(t)
  }, [user, pathname])

  // Unread DM badge, kept live via realtime.
  useEffect(() => {
    if (!user) return
    // GROUPS COUNT TOO. This used to filter `recipient_id = me`, and a group
    // message has no recipient - the column is null by construction - so a
    // creator who was only ever messaged in groups had a permanently silent DM
    // tab. `my_dm_unread` adds the group side, measured against each member's
    // own last_read_at watermark.
    async function count() {
      const { data } = await supabase.rpc('my_dm_unread')
      setDmUnread(data ?? 0)
    }
    count()
    const channel = supabase
      .channel(`dm-badge-${user.id}`)
      // No `recipient_id` filter: a group message would never match it. The
      // count is one cheap RPC, so recounting on any DM movement is fine.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'direct_messages' }, count)
      // Moving your own watermark in a group is what clears a group's unread.
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversation_members', filter: `profile_id=eq.${user.id}` }, count)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [user])

  // General-chat push: when backgrounded and the creator hasn't opted out, pop
  // an OS notification for new #general messages (no DB row, so it's free).
  useEffect(() => {
    if (!user || profile?.notif_prefs?.chat === false) return
    const channel = supabase
      .channel('chat-push-general')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: 'channel=eq.general' },
        (payload) => {
          const m = payload.new
          if (m.sender_id === user.id || !m.body || document.visibilityState === 'visible') return
          showLocalNotification({ title: 'New message in #general', body: stripMarkup(m.body).slice(0, 120), link: '/chat/general', tag: `chat-${m.id}` })
        })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [user, profile?.notif_prefs?.chat])

  // Pending incoming connection requests, kept live via realtime.
  useEffect(() => {
    if (!user) return
    async function count() {
      const { count } = await supabase
        .from('connections')
        .select('id', { count: 'exact', head: true })
        .eq('connected_creator_id', user.id)
        .eq('status', 'pending')
      setConnReqs(count ?? 0)
    }
    count()
    const channel = supabase
      .channel(`conn-reqs-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'connections', filter: `connected_creator_id=eq.${user.id}` }, count)
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
      <PullToRefresh />

      {/* When an admin is previewing as the sandbox creator, a persistent pill
          floats above everything so they can always exit back to their admin
          account (while previewing, the logged-in identity IS the creator). */}
      {impersonating && (
        <div className="fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 lg:bottom-6">
          <div className="flex flex-col items-center gap-1.5 rounded-2xl border border-brand/30 bg-white px-4 py-2 shadow-lift">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-2 text-xs font-medium text-ink">
                <Icon name="eye" className="h-4 w-4 text-brand" />
                Viewing as a creator
              </span>
              <button
                onClick={async () => {
                  setExiting(true)
                  const { error } = await exitCreatorPreview()
                  setExiting(false)
                  if (error) setExitError(error)
                  else navigate('/admin')
                }}
                disabled={exiting}
                className="rounded-full bg-brand px-3 py-1 text-xs font-semibold text-white transition-transform hover:scale-105 active:scale-95 disabled:opacity-60"
              >
                {exiting ? 'Exiting…' : 'Exit'}
              </button>
            </div>
            {exitError && <span className="text-[11px] font-medium text-red-500">{exitError}</span>}
          </div>
        </div>
      )}
      {/* Same pattern as the creator preview pill above, deliberately: an admin
          testing the network build should always have one obvious way out, in
          the same place, whichever preview they are in. Sits slightly higher so
          the two never overlap if both are somehow on. */}
      {networkPreview && !impersonating && !onNetworkChat && (
        <div className={cx(
          'fixed z-50 flex px-4',
          onNetworkPage
            ? 'bottom-24 right-0 justify-end lg:bottom-6'
            : 'inset-x-0 bottom-24 justify-center lg:bottom-6',
        )}>
          {/* Compact on a phone. The full pill is 260px of floating chrome over
              whatever you were reading; on a 375px screen that is most of the
              width, and the only part anyone needs on the move is the way out. */}
          <div className="flex items-center gap-2 rounded-2xl border border-brand/30 bg-white px-3 py-2 shadow-lift sm:gap-3 sm:px-4">
            <span className="flex items-center gap-2 text-xs font-medium text-ink">
              <Icon name="globe" className="h-4 w-4 text-brand" />
              <span className="hidden sm:inline">Global network preview</span>
              <span className="sm:hidden">Preview</span>
            </span>
            <Link
              to="/global"
              className="hidden text-xs font-medium text-smoke transition-colors hover:text-brand sm:block"
            >
              Worldwide
            </Link>
            <button
              onClick={() => { exitPreview(); navigate('/admin') }}
              className="rounded-full bg-brand px-3 py-1 text-xs font-semibold text-white transition-transform hover:scale-105 active:scale-95"
            >
              Exit
            </button>
          </div>
        </div>
      )}

      {/* ------- Top navbar ------- */}
      {/* data-ptr-handle: the only place a pull-to-refresh gesture arms, so
          scrolling chats never triggers a reload (see PullToRefresh). */}
      <header data-ptr-handle className="sticky top-0 z-40 border-b border-gray-100 bg-white/90 backdrop-blur">
        {/* White shield directly ABOVE the header. Normally off-screen; if iOS
            rubber-bands the page down at the top it fills that gap with clean
            white instead of letting the fixed chat overlay's tabs peek above
            the bar. Moves with the header, so it always covers the gap. */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-full h-screen bg-white" />
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-5 sm:px-8">
          <Link to="/home" className="flex items-center gap-3">
            <img src="/brand/tryp-logo.png" alt="Tryp.com" className="h-9 rounded-lg" />
            <span className="hidden text-sm font-semibold text-smoke md:block">Content Creator Program</span>
          </Link>

          <nav className="hidden items-center gap-2 lg:flex" aria-label="Main">
            {tabs.map((item) => (
              <NavLink key={item.to} to={item.to} className={navLinkClass} data-tour={tourAnchor(item.to)}>
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
            {/* Search. A visible affordance for the palette: a keyboard shortcut
                nobody is told about is a feature that does not exist. */}
            {networkPreview && (
              <button
                onClick={() => setPaletteOpen(true)}
                aria-label="Search"
                className="flex items-center gap-2 rounded-full border border-gray-200 px-2.5 py-1.5 text-smoke transition-colors hover:border-brand hover:text-brand sm:pr-2"
              >
                <Icon name="magnifier" className="h-4 w-4" />
                <kbd className="hidden text-[10px] font-medium sm:block">⌘K</kbd>
              </button>
            )}
            {/* Admin shortcut. Visible on mobile too (creators never see it) so
                admins can reach the panel straight from the top bar. */}
            {isAdmin && (
              <Link to="/admin" className="flex items-center gap-1.5 rounded-full border border-brand px-3 py-1.5 text-xs font-semibold text-brand transition-colors hover:bg-brand hover:text-white sm:px-4">
                <Icon name="shield" className="h-4 w-4" />
                <span>Admin</span>
              </Link>
            )}
            <span data-tour="bell"><NotificationBell /></span>

            {/* Avatar dropdown */}
            <div className="relative" ref={menuRef}>
              <button onClick={() => setMenuOpen((o) => !o)} aria-label="Account menu" data-tour="avatar-menu" className="relative rounded-full">
                <Avatar src={profile?.photo_url} name={profile?.name} size="sm" />
                {(connReqs > 0 || newResources) && <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-brand ring-2 ring-white" aria-label={connReqs > 0 ? `${connReqs} connection requests` : 'New resources in the library'} />}
              </button>
              {menuOpen && (
                <div data-ptr-ignore className="absolute right-0 z-40 mt-2 max-h-[calc(100dvh-9rem-env(safe-area-inset-bottom))] w-60 overflow-y-auto overscroll-contain rounded-card border border-gray-100 bg-white p-2 pb-[calc(2rem+env(safe-area-inset-bottom))] shadow-lift origin-top-right animate-menu-in lg:max-h-[calc(100dvh-5rem)]">
                  <div className="border-b border-gray-100 px-3 py-2">
                    <p className="truncate text-sm font-semibold">{profile?.name}</p>
                    <p className="truncate text-xs text-smoke">{user?.email}</p>
                  </div>
                  <Link to={`/profile/${user?.id}`} onClick={() => setMenuOpen(false)} className="block rounded-xl px-3 py-2.5 text-sm hover:bg-cloud">My profile</Link>
                  <Link to="/settings" onClick={() => setMenuOpen(false)} className="block rounded-xl px-3 py-2.5 text-sm hover:bg-cloud">Settings</Link>
                  <Link to="/rewards" onClick={() => setMenuOpen(false)} className="block rounded-xl px-3 py-2.5 text-sm hover:bg-cloud">My rewards</Link>
                  <Link to="/dashboard" onClick={() => setMenuOpen(false)} className="block rounded-xl px-3 py-2.5 text-sm hover:bg-cloud">My dashboard</Link>
                  {/* Two things that ARE about you and have no home in the nav:
                      how far along the route you are, and who to ask when
                      something goes wrong. Both belong in the menu that already
                      holds your profile and your money. */}
                  {/* The Tryp.com team link is gone: the team are creators in
                      the directory with a role on their card, not a separate
                      page you have to know about. See Directory. */}
                  {networkPreview && (
                    <Link to="/milestones" onClick={() => setMenuOpen(false)} className="block rounded-xl px-3 py-2.5 text-sm hover:bg-cloud">My route</Link>
                  )}

                  {/* EVERYWHERE ELSE, ON A PHONE.
                      These ten used to be a grid near the top of the Worldwide
                      hub. That grid was a good answer to a real problem - the
                      rail is at the BOTTOM of a long page on mobile, so the ten
                      most useful destinations in the product were a full scroll
                      away - but it solved it by putting a navigation block in
                      the middle of a content page. The menu behind your own
                      avatar is where navigation belongs, it is one thumb-reach
                      from anywhere, and it works on every page rather than only
                      on the hub.
                      AND ON A DESKTOP TOO, NOW. This used to be `lg:hidden`, on
                      the reasoning that a desktop has the rail on the Worldwide
                      hub and two lists of the same ten links on one screen is
                      duplication. That is true on the hub and false everywhere
                      else, which is most of the app: from a challenge, a chat,
                      the flight log or the admin panel there was no way to reach
                      the collab board or the community board at all without
                      going back to Worldwide first. Ethan: "as well as
                      everything showing up under explore the community on the
                      worldwide page, they should still show up on the profile
                      dropdown menu when clicked, this is for desktop as I think
                      they already do on mobile."
                      The rail and the menu read the same list from
                      lib/networkLinks, in the reader's own saved order, so the
                      two can never drift apart. */}
                  {networkPreview && (
                    <div>
                      <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Explore the community</p>
                      {menuLinks.map((l) => (
                        <Link
                          key={l.to}
                          to={l.to}
                          onClick={() => setMenuOpen(false)}
                          className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm hover:bg-cloud"
                        >
                          <Icon name={l.icon} className="h-4 w-4 shrink-0 text-smoke" />
                          <span className="min-w-0 flex-1 truncate">{l.label}</span>
                          {l.badge === 'connections' && connReqs > 0 && (
                            <span className="inline-flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-semibold text-white">
                              {connReqs > 9 ? '9+' : connReqs}
                            </span>
                          )}
                          {l.badge === 'resources' && newResources && (
                            <span className="h-2 w-2 shrink-0 rounded-full bg-brand" aria-label="New" />
                          )}
                        </Link>
                      ))}
                    </div>
                  )}

                  {/* Secondary destinations.
                      With the network on, all of these live in one place on the
                      Worldwide hub instead of a fourteen-item menu that nobody
                      could scan: the menu keeps only what is genuinely about
                      YOU (profile, settings, money) and points at the rest.
                      With it off, this is the menu the UK has today. */}
                  {/* The "Across the network" link that used to sit here is
                      gone: the Worldwide tab in the nav goes to the same page,
                      and two doors to one room in a menu this small is one door
                      too many. Its unread badge moved to the tab. */}
                  {networkPreview ? null : (
                    <>
                      <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Explore</p>
                      <Link to="/creators" onClick={() => setMenuOpen(false)} className="block rounded-xl px-3 py-2.5 text-sm hover:bg-cloud">Creators</Link>
                      <Link to="/connections" onClick={() => setMenuOpen(false)} className="flex items-center justify-between rounded-xl px-3 py-2.5 text-sm hover:bg-cloud">
                        <span>Connections</span>
                        {connReqs > 0 && <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-semibold text-white">{connReqs > 9 ? '9+' : connReqs}</span>}
                      </Link>
                      <Link to="/collab" onClick={() => setMenuOpen(false)} className="block rounded-xl px-3 py-2.5 text-sm hover:bg-cloud">Travel collab board</Link>
                      <Link to="/leaderboard" onClick={() => setMenuOpen(false)} className="block rounded-xl px-3 py-2.5 text-sm hover:bg-cloud">Leaderboard</Link>
                      <Link to="/resources" onClick={() => setMenuOpen(false)} className="flex items-center justify-between rounded-xl px-3 py-2.5 text-sm hover:bg-cloud">
                        <span>Resource library</span>
                        {newResources && <span className="rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold uppercase text-white">New</span>}
                      </Link>
                      <Link to="/jobs" onClick={() => setMenuOpen(false)} className="block rounded-xl px-3 py-2.5 text-sm hover:bg-cloud">Search roles</Link>
                      <Link to="/refer" onClick={() => setMenuOpen(false)} className="block rounded-xl px-3 py-2.5 text-sm hover:bg-cloud">Refer a creator</Link>
                      <Link to="/game" onClick={() => setMenuOpen(false)} className="block rounded-xl px-3 py-2.5 text-sm hover:bg-cloud">Travel games</Link>
                    </>
                  )}

                  <div className="my-1 border-t border-gray-100" />
                  <Link to="/feedback" onClick={() => setMenuOpen(false)} className="block rounded-xl px-3 py-2.5 text-sm hover:bg-cloud">Help us improve</Link>
                  <div className="my-1 border-t border-gray-100" />
                  {isAdmin && <Link to="/admin" onClick={() => setMenuOpen(false)} className="block rounded-xl px-3 py-2.5 text-sm font-medium text-brand hover:bg-cloud">Admin panel</Link>}
                  <button onClick={handleSignOut} className="block w-full rounded-xl px-3 py-2.5 text-left text-sm text-red-600 hover:bg-red-50">Log out</button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ------- Page content (extra bottom room for the tab bar + safe area) ------- */}
      <main className="flex-1 pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-0">
        <Outlet />
      </main>

      {/* One-off "rate the event" popup after an attended event finishes */}

      {/* "Introduce yourself" used to live here, as an app-wide popup on any
          chat path - which is why it opened every time you touched /rooms. It
          belongs to the room its answer gets posted in, so it is rendered by
          NetworkChat now (`IntroInvite`) and only over the worldwide
          introductions room. */}

      {networkPreview && paletteOpen && (
        <Suspense fallback={null}>
          <CommandPalette open onClose={() => setPaletteOpen(false)} />
        </Suspense>
      )}

      {/* The guided walkthrough. Almost always renders nothing at all, and
          the overlay it can open is lazy - see TourGate. */}
      <TourGate />

      {/* ------- Mobile bottom tab bar -------
          Bottom padding includes the iPhone home-indicator safe area so the
          tabs sit higher and stay easily tappable. */}
      <nav
        className={cx(
          'fixed inset-x-0 bottom-0 z-30 border-t border-gray-100 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur transition-transform duration-200 lg:hidden',
          keyboardOpen && 'pointer-events-none translate-y-full'
        )}
        aria-hidden={keyboardOpen}
        aria-label="Mobile"
      >
        <div className="mx-auto flex max-w-lg items-center justify-around px-0.5 pb-1.5 pt-2">
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              data-tour={tourAnchor(tab.to)}
              className={({ isActive }) =>
                cx('relative flex flex-1 flex-col items-center gap-1 rounded-xl px-1 py-1 text-[10px] font-medium', isActive ? 'text-brand' : 'text-smoke')
              }
            >
              <span className="relative">
                <Icon name={tab.icon} className="h-6 w-6" />
                {tab.to === '/messages' && dmUnread > 0 && (
                  <span className="absolute -right-1.5 -top-1 h-2.5 w-2.5 rounded-full bg-brand ring-2 ring-white" aria-label={`${dmUnread} unread`} />
                )}
              </span>
              {tab.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
