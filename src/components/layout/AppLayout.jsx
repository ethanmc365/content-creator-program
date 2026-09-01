import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { loadLinkOrder, orderedLinks } from '../../lib/networkLinks'
import { supabase } from '../../lib/supabase'
import { Avatar } from '../ui'
import Icon from '../Icon'
import NotificationBell from './NotificationBell'
import TourGate from '../tour/TourGate'
import PullToRefresh from '../PullToRefresh'
import { useChatSearchTarget } from '../../lib/chatSearch'
import { useChatChromeHidden } from '../../lib/chatChrome'
import { showLocalNotification } from '../../lib/push'
import { startHeartbeat } from '../../lib/presence'
import { stripMarkup } from '../../lib/richText'
import { cx } from '../../lib/utils'
import { useVisualViewport, useIsPhone } from '../../lib/useKeyboardInset'
import { applyMotion, getStoredMotion, setShellActive, syncTheme } from '../../lib/theme'

// The signed-in app shell. One shared set of icon tabs powers BOTH the
// desktop top bar and the mobile bottom bar, so they look identical.
//
// FIVE TABS, AND WHY THESE FIVE.
//
// The UK-only build had Home / Challenges / Chat / DMs / Calendar, where Home
// was a personal dashboard and Chat was one hard-coded conversation. Neither
// survives contact with six markets: the dashboard could not answer "what is
// happening across the network", and a single chat cannot answer "where is
// everyone talking".
//
// So Home IS the worldwide hub now. It keeps the name, because that is what a
// creator calls the page they land on, and takes the globe, because that is
// what the page actually is. There is no separate "Worldwide" tab any more -
// having both was two doors into one room. Chat becomes Rooms, which is a
// grouped index rather than whichever room the router picked, and Calendar
// comes back into the slot Worldwide vacated.
const TABS = [
  // WORLDWIDE, NOT HOME. It was renamed to Home on the cutover, on the argument
  // that "Home is what a creator calls the page they land on". Ethan tried it
  // and disagreed: the page IS the worldwide network, the icon is a globe, and
  // calling it Home made the label the only part of the tab that was not about
  // the world. Reverted at his request.
  { to: '/global', label: 'Worldwide', icon: 'globe' },
  { to: '/challenges', label: 'Challenges', icon: 'flag' },
  // /rooms, not /chat. On desktop it forwards straight into the worldwide
  // General; on a phone it is the index, because a phone cannot show a sidebar
  // and a conversation at once.
  { to: '/rooms', label: 'Rooms', icon: 'chat' },
  { to: '/messages', label: 'DMs', icon: 'envelope' },
  { to: '/events', label: 'Calendar', icon: 'calendar' },
]

// Lazy, and imported only here. It pulls in `motion`, so a static import would
// put the animation runtime into the eagerly-loaded shell bundle.
const CommandPalette = lazy(() => import('../network/CommandPalette'))

// WHERE THE WALKTHROUGH POINTS.
//
// One name per destination, put on BOTH the desktop nav item and the mobile
// tab. Only one of the two is ever visible, and the tour resolver picks
// whichever that is - which is what lets a single set of steps cover a phone, a
// tablet and a desktop without three sets of copy drifting apart. `/rooms` and
// `/chat` are the same idea wearing different names depending on whether the
// network shell is on, so they share an anchor. See lib/tour.js.
const TOUR_ANCHORS = {
  '/global': 'nav-home',
  '/home': 'nav-home',
  '/challenges': 'nav-challenges',
  '/chat': 'nav-chat',
  '/rooms': 'nav-chat',
  '/messages': 'nav-messages',
  '/events': 'nav-calendar',
}
const tourAnchor = (to) => TOUR_ANCHORS[to] || undefined

// WHICH TAB OWNS THE PAGE YOU ARE ON.
//
// NavLink's own `isActive` is a path-prefix test, and the rooms do not live
// under /rooms: on a desktop that tab forwards straight into the worldwide
// General, so the address becomes /global/chat/general - which /global matches
// and /rooms does not. Press Rooms, land in a room, and the globe lights up
// while the rooms icon stays grey. Ethan: "clicking the rooms button still
// shows it in a way that I'm on worldwide, it doesn't highlight the rooms
// icon."
//
// A chat path belongs to Rooms wherever it is mounted, and Worldwide keeps
// everything else under /global and /c. Exported for the test.
export function activeTab(pathname) {
  if (/^\/(rooms|chat)(\/|$)/.test(pathname)) return '/rooms'
  // /global/chat/general, /c/uk/chat/announcements - a room, not the hub.
  if (/^\/(global|c|manage)(\/|$)/.test(pathname) && /\/chat(\/|$)/.test(pathname)) return '/rooms'
  if (/^\/messages(\/|$)/.test(pathname)) return '/messages'
  if (/^\/events(\/|$)/.test(pathname)) return '/events'
  if (/^\/challenges(\/|$)/.test(pathname)) return '/challenges'
  if (/^\/(global|c|manage)(\/|$)/.test(pathname)) return '/global'
  return null
}

// The header's search, while a chat room is open. Collapsed it is the same
// round button the palette uses; pressed, it becomes a field over the header's
// own row, because a phone header has no room for a permanent input beside a
// logo, an admin pill, a bell and an avatar.
function ChatSearchField({ target }) {
  const [open, setOpen] = useState(false)
  const phone = useIsPhone()
  const inputRef = useRef(null)

  useEffect(() => { if (open) inputRef.current?.focus() }, [open])

  // LEAVING THE ROOM CLEARS WHATEVER WAS TYPED, so a filter can never outlive
  // the screen that explains it - but ONLY on the way out.
  //
  // THE BUG THIS FIXES: this was `useEffect(() => () => target.onChange(''),
  // [target])`, and `target` is rebuilt every time the search value changes.
  // So every keystroke changed the identity, React ran the cleanup, and the
  // cleanup wiped the search that had just been typed. The field worked and
  // filtered nothing. The callback goes through a ref so the unmount effect can
  // have an empty dependency list and still call the current one.
  const onChangeRef = useRef(target.onChange)
  useEffect(() => { onChangeRef.current = target.onChange })
  useEffect(() => () => onChangeRef.current(''), [])

  const close = () => { target.onChange(''); setOpen(false) }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label={`Search ${target.label}`}
        data-tour="search"
        className="flex items-center gap-2 rounded-full border border-gray-200 px-2.5 py-1.5 text-smoke transition-colors hover:border-brand hover:text-brand"
      >
        <Icon name="magnifier" className="h-4 w-4" />
      </button>
    )
  }
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-full border border-brand/40 bg-white pl-3 pr-1">
      <Icon name="magnifier" className="h-4 w-4 shrink-0 text-brand" />
      <input
        ref={inputRef}
        value={target.value}
        onChange={(e) => target.onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') close() }}
        /* JUST "SEARCH" ON A PHONE. Ethan: "the text that shows inside says
           'search this' and then the next word is cut off. I would make the
           text that appears just say search, because that will fit in."
           The field is what is left of a header row after a logo, an admin
           pill, a bell and an avatar, so a placeholder naming the room was
           never going to fit and was clipped mid-word on every phone. The
           `aria-label` keeps the full sentence, which is where a name for the
           control actually belongs. */
        placeholder={phone ? 'Search' : `Search ${target.label}`}
        aria-label={`Search ${target.label}`}
        className="no-ios-zoom min-w-0 flex-1 bg-transparent py-1.5 outline-none placeholder:text-gray-400"
      />
      <button
        onClick={close}
        aria-label="Close search"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-smoke transition-colors hover:bg-cloud hover:text-ink"
      >
        <Icon name="close" className="h-4 w-4" />
      </button>
    </div>
  )
}

export default function AppLayout() {
  const chatSearch = useChatSearchTarget()
  const chromeHidden = useChatChromeHidden()
  const { profile, isAdmin, impersonating, exitCreatorPreview, user, signOut } = useAuth()
  const { pathname } = useLocation()
  // Which of the five tabs the current URL belongs to. See activeTab above.
  const currentTab = activeTab(pathname)
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
  // Pages that put something at the bottom of the viewport: a chat composer, a
  // DM composer. Anything floating there lands on the send button.
  const hasBottomBar = /^\/(chat|messages|rooms)(\/|$)/.test(pathname) || onNetworkChat
  const tabs = TABS
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
  }, [])
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
  const navLinkClass = (to) =>
    cx(
      'relative flex flex-col items-center gap-0.5 rounded-xl px-4 py-1.5 text-[11px] font-medium transition-colors',
      currentTab === to ? 'text-brand' : 'text-smoke hover:text-ink'
    )

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <PullToRefresh />

      {/* When an admin is previewing as the sandbox creator, a persistent pill
          floats above everything so they can always exit back to their admin
          account (while previewing, the logged-in identity IS the creator). */}
      {impersonating && (
        // IT GETS OUT OF THE WAY BY ITSELF.
        //
        // This pill was pinned to the centre of the viewport bottom - which is
        // exactly where a chat composer sits, and where the send button is on a
        // phone. The network-preview pill below already docked aside on pages
        // that have one; this one never learned. On any page with something at
        // the bottom it now docks right, and on a phone it drops to the icon and
        // the way out, because 260px of floating chrome over a 375px screen is
        // most of what you were trying to read.
        //
        // It never hides, whatever the page: while previewing, the logged-in
        // identity IS the creator, so this is the only route back.
        <div className={cx(
          'fixed z-50 flex px-4',
          hasBottomBar
            ? 'bottom-24 right-0 justify-end lg:bottom-6'
            : 'inset-x-0 bottom-24 justify-center lg:bottom-6',
        )}>
          <div className="flex flex-col items-center gap-1.5 rounded-2xl border border-brand/30 bg-white px-3 py-2 shadow-lift sm:px-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <span className="flex items-center gap-2 text-xs font-medium text-ink">
                <Icon name="eye" className="h-4 w-4 shrink-0 text-brand" />
                <span className="hidden sm:inline">Viewing as a creator</span>
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
      {/* ------- Top navbar ------- */}
      {/* data-ptr-handle: the only place a pull-to-refresh gesture arms, so
          scrolling chats never triggers a reload (see PullToRefresh). */}
      {/* IT SLIDES AWAY WHILE YOU ARE READING A CHAT. See lib/chatChrome: the
          room asks, the shell obeys, and every other page is untouched. The
          transform is on the header itself so it composites, and the chat
          overlay grows into the space in the same 300ms. */}
      <header
        data-ptr-handle
        className={cx(
          'sticky top-0 z-40 border-b border-gray-100 bg-white/90 backdrop-blur',
          // SAME DURATION AND SAME CURVE AS THE CHAT OVERLAY'S TOP EDGE.
          // They are one movement - the header goes up and the conversation
          // grows into the space it leaves - so a different easing on each half
          // reads as two things happening near each other. `will-change` keeps
          // the header on its own layer so the slide never waits on a paint of
          // the page behind it.
          'transition-transform duration-[280ms] ease-[cubic-bezier(0.32,0.72,0,1)] [will-change:transform]',
          chromeHidden && '-translate-y-full',
        )}
      >
        {/* White shield directly ABOVE the header. Normally off-screen; if iOS
            rubber-bands the page down at the top it fills that gap with clean
            white instead of letting the fixed chat overlay's tabs peek above
            the bar. Moves with the header, so it always covers the gap. */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-full h-screen bg-white" />
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-5 sm:px-8">
          <Link to="/global" className="flex items-center gap-3">
            <img src="/brand/tryp-logo.png" alt="Tryp.com" className="h-9 rounded-lg" />
            <span className="hidden text-sm font-semibold text-smoke md:block">Content Creator Community</span>
          </Link>

          <nav className="hidden items-center gap-2 lg:flex" aria-label="Main">
            {tabs.map((item) => (
              <NavLink key={item.to} to={item.to} className={navLinkClass(item.to)} data-tour={tourAnchor(item.to)}>
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

          <div className="flex min-w-0 items-center gap-2">
            {/* SEARCH. THE SAME BUTTON, POINTED AT WHATEVER IS OPEN.
                Everywhere else it opens the command palette, which is what a
                keyboard shortcut nobody is told about needs. Inside a chat room
                it searches THAT ROOM instead - because the room's own search bar
                is gone from the phone layout, where a permanent 40px band of
                chrome above a conversation was costing more than it earned. See
                lib/chatSearch: the room registers itself while it is open, so
                this is a chat search only while there is a chat to search. */}
            {chatSearch ? (
              <ChatSearchField target={chatSearch} />
            ) : (
              <button
                onClick={() => setPaletteOpen(true)}
                aria-label="Search"
                data-tour="search"
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
                  <Link to="/milestones" onClick={() => setMenuOpen(false)} className="block rounded-xl px-3 py-2.5 text-sm hover:bg-cloud">Milestones</Link>

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

      {paletteOpen && (
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
              className={cx(
                'relative flex flex-1 flex-col items-center gap-1 rounded-xl px-1 py-1 text-[10px] font-medium',
                currentTab === tab.to ? 'text-brand' : 'text-smoke',
              )}
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
