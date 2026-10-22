import { Suspense, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { lazyRoute } from '../../lib/lazyRoute'
import { createPortal } from 'react-dom'
import { Link, NavLink, Outlet, useLocation, useNavigate, useNavigationType } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { syncPushSubscription } from '../../lib/push'
import { useUnread } from '../../context/UnreadContext'
import { loadLinkOrder, orderedLinks } from '../../lib/networkLinks'
import { supabase } from '../../lib/supabase'
import { onResume } from '../../lib/resume'
import { useVipAccess } from '../../lib/vip'
import { warmPagesWhenIdle } from '../../lib/warmPages'
import { Avatar } from '../ui'
import Icon from '../Icon'
import NotificationBell from './NotificationBell'
import TourGate from '../tour/TourGate'
import RouteSkeleton from '../RouteSkeleton'
import PullToRefresh from '../PullToRefresh'
import BankDetailsPrompt from '../BankDetailsPrompt'
import AddToHomePrompt from '../AddToHomePrompt'
import PushBanner from '../PushBanner'
import SurveyHost from '../SurveyHost'
import GlobalChallengePrompt from '../GlobalChallengePrompt'
import BoostPrompt from '../BoostPrompt'
import VoucherDayPrompt from '../VoucherDayPrompt'
import VoucherChoicePrompt from '../VoucherChoice'
import AgreementGate from '../agreements/AgreementGate'
import { useChatSearchTarget } from '../../lib/chatSearch'
import { useChatChromeHidden, chatChromeFlipInstant } from '../../lib/chatChrome'
import { startHeartbeat } from '../../lib/presence'
import { cx } from '../../lib/utils'
import { useKeyboardOpen, useIsPhone } from '../../lib/useKeyboardInset'
import { installKeyboardFollow } from '../../lib/keyboardFollow'
import { lockedScrollY, onScrollLockChange, repairScrollLock } from '../../lib/scrollLock'
import { resetPageSettled } from '../../lib/pageSettled'
import { usePinnedToBottom } from '../../lib/pinnedBar'
import { useT } from '../../lib/i18n'
import { JoinMarketHost, openJoinMarket } from '../network/JoinMarket'
import { applyMotion, getStoredMotion, setShellActive, syncTheme } from '../../lib/theme'
import LoadTrouble from '../LoadTrouble'
import { notifications } from '../../api/notifications'
import { profilesApi } from '../../api/profiles'
import { contentApi } from '../../api/content'
import { chatApi } from '../../api/chat'

// The signed-in app shell. One set of icon tabs powers both the desktop top bar and the mobile bottom bar.
// Five tabs: Home (the worldwide hub), Challenges, Rooms (a grouped index of rooms), Messages and Calendar.
const TABS = [
  // WORLDWIDE, NOT HOME. It was renamed to Home on the cutover, on the argument that "Home is what a creator calls the
  // page they land on". The team tried it and disagreed: the page IS the worldwide network, the icon is a globe, and
  // calling it Home made the label the only part of the tab that was not about the world. Reverted at their request.
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
const CommandPalette = lazyRoute(() => import('../network/CommandPalette'))

// Walkthrough anchors: one name per destination on both the desktop nav item and the mobile tab; the tour picks
// whichever is visible (lib/tour.js).
const TOUR_ANCHORS = {
  '/global': 'nav-home',
  '/home': 'nav-home',
  '/challenges': 'nav-challenges',
  '/vip': 'nav-challenges',
  '/chat': 'nav-chat',
  '/rooms': 'nav-chat',
  '/messages': 'nav-messages',
  '/events': 'nav-calendar',
}
const tourAnchor = (to) => TOUR_ANCHORS[to] || undefined
// What a VIP is not shown: points, ranks and referrals belong to the challenges.
const VIP_HIDDEN = new Set(['/leaderboard', '/refer'])

// Which tab owns the current page. Chat paths belong to Rooms wherever they are mounted (/global/chat/... included);
// Worldwide keeps everything else under /global and /c. Exported for the test.
export function activeTab(pathname) {
  if (/^\/(rooms|chat)(\/|$)/.test(pathname)) return '/rooms'
  // /global/chat/general, /c/uk/chat/announcements - a room, not the hub.
  if (/^\/(global|c|manage)(\/|$)/.test(pathname) && /\/chat(\/|$)/.test(pathname)) return '/rooms'
  if (/^\/messages(\/|$)/.test(pathname)) return '/messages'
  if (/^\/events(\/|$)/.test(pathname)) return '/events'
  if (/^\/challenges(\/|$)/.test(pathname)) return '/challenges'
  if (/^\/vip(\/|$)/.test(pathname)) return '/vip'
  if (/^\/(global|c|manage)(\/|$)/.test(pathname)) return '/global'
  return null
}

// The header's search, while a chat room is open. Collapsed it is the same
// round button the palette uses; pressed, it becomes a field over the header's
// own row, because a phone header has no room for a permanent input beside a
// logo, an admin pill, a bell and an avatar.
function ChatSearchField({ target }) {
  const tr = useT()
  const [open, setOpen] = useState(false)
  const phone = useIsPhone()
  const inputRef = useRef(null)

  useEffect(() => { if (open) inputRef.current?.focus() }, [open])

  // Leaving the page clears the search, but only on the way out: the callback goes through a ref so the unmount effect
  // has no dependencies (otherwise every keystroke ran the cleanup and wiped the search).
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
        /*
         * JUST "SEARCH" ON A PHONE. The field is what is left of a header row after a logo, an admin pill, a bell and an
         * avatar, so a placeholder naming the room was never going to fit and was clipped mid-word on every phone. The
         * `aria-label` keeps the full sentence, which is where a name for the control actually belongs.
         */
        placeholder={phone ? tr('Search') : tr('Search {room}', { room: target.label })}
        aria-label={`Search ${target.label}`}
        className="no-ios-zoom min-w-0 flex-1 bg-transparent py-1.5 outline-none placeholder:text-gray-400 focus-visible:ring-0"
      />
      <button
        onClick={close}
        aria-label={tr("Close search")}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-smoke transition-colors hover:bg-cloud hover:text-ink"
      >
        <Icon name="close" className="h-4 w-4" />
      </button>
    </div>
  )
}

export default function AppLayout() {

  const tr = useT()
  // Bumped by LoadTrouble's "Try again": a new key remounts the page, so every load on it runs again.
  const [retryKey, setRetryKey] = useState(0)
  const chatSearch = useChatSearchTarget()
  const chromeHidden = useChatChromeHidden()
  const lockedY = useSyncExternalStore(onScrollLockChange, lockedScrollY, () => 0)
  // The frame the lock lets go, the header's push-down is removed - and with
  // its slide transition on, it would visibly glide up from where it was held.
  // `settling` keeps the transition off across that change ("adjust state
  // while rendering", so it is already set on the frame the transform goes).
  const [prevLockedY, setPrevLockedY] = useState(lockedY)
  const [settling, setSettling] = useState(false)
  if (prevLockedY !== lockedY) {
    if (prevLockedY > 0 && lockedY === 0) setSettling(true)
    setPrevLockedY(lockedY)
  }
  useEffect(() => {
    if (!settling) return undefined
    let a = 0
    let b = 0
    a = requestAnimationFrame(() => { b = requestAnimationFrame(() => setSettling(false)) })
    return () => { cancelAnimationFrame(a); cancelAnimationFrame(b) }
  }, [settling])
  // MEASURED, NOT ASSUMED. The first version pushed the header down by the whole frozen scroll distance on the theory
  // that pinning the body always carries a sticky header off the top. On iOS it does; in desktop Chrome it does NOT, so
  // the push put the bar in the middle of the screen above the scrim of every pop-up opened from a scrolled page. Now
  // the header's real position is read once the page is frozen, and it is moved by exactly as much as it actually left
  // the top - which is y on one browser and zero on another.
  const headerRef = useRef(null)
  useLayoutEffect(() => {
    const el = headerRef.current
    if (!el) return
    el.style.transform = ''
    el.removeAttribute('data-lock-pushed')
    if (!lockedY || chromeHidden) return
    const top = el.getBoundingClientRect().top
    if (top < -1) {
      el.style.transition = 'none'
      el.style.transform = `translateY(${-top}px)`
      el.setAttribute('data-lock-pushed', '')
    }
  }, [lockedY, chromeHidden])
  const { profile, isAdmin, impersonating, exitCreatorPreview, user, signOut } = useAuth()
  const { pathname } = useLocation()
  // Which market the reader was last in, so Rooms can open on its card (see Rooms).
  useEffect(() => {
    const m = pathname.match(/^\/c\/([^/]+)/)
    if (m) { try { sessionStorage.setItem('tryp_last_market', m[1]) } catch { /* private mode */ } }
  }, [pathname])
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
  // A VIP HAS A VIP TAB WHERE THE CHALLENGES WERE. They are paid by views, so they neither see nor enter challenges; the
  // tab that would have been theirs is the page that IS theirs. An admin who is also a VIP keeps the challenges.
  const isVip = !!profile?.is_vip && !isAdmin
  const vipAccess = useVipAccess(profile?.id, false)
  // The Challenges and DM tabs' first query, run ahead of the tap once the app is idle (lib/warmPages).
  useEffect(() => { warmPagesWhenIdle(profile?.id, { challenges: !isVip }) }, [profile?.id, isVip])
  // An official Tryp.com creator's tab is the same page under their own name (migration 376).
  const isOfficialCreator = isVip && profile?.vip_kind === 'official'
  const tabs = isVip ? TABS.map((t) => (t.to === '/challenges' ? (isOfficialCreator ? { to: '/vip', label: 'Official', icon: 'badge' } : { to: '/vip', label: 'VIP', icon: 'star' }) : t)) : TABS
  const navigate = useNavigate()

  // NOTHING YOU ARE TYPING IN SITS UNDER THE KEYBOARD. Installed once, here,
  // because it is a property of the app and not of any one dialog - three
  // separate reports (the schedule dialog's date and time, a poll's options, a
  // game challenge's title) were one missing behaviour. See lib/keyboardFollow.
  useEffect(() => installKeyboardFollow(), [])
  const [menuOpen, setMenuOpen] = useState(false)
  // Same ten links, and the same order the reader dragged them into on the hub.
  const menuLinks = orderedLinks(loadLinkOrder()).filter((l) => !(isVip && VIP_HIDDEN.has(l.to)))
  const [dmUnread, setDmUnread] = useState(0)
  // How many rooms have something new in them. One shared store, so the tab
  // badge, the rooms index and the chat sidebar can never disagree about it.
  // See context/UnreadContext.
  const { unread: unreadRooms } = useUnread()
  const roomsUnread = unreadRooms.size
  const [connReqs, setConnReqs] = useState(0)
  const [newUpdates, setNewUpdates] = useState(false)
  const [exiting, setExiting] = useState(false)
  const [exitError, setExitError] = useState('')
  const [paletteOpen, setPaletteOpen] = useState(false)
  const menuRef = useRef(null)

  // EVERY PAGE OPENS AT ITS TOP. The shell resets the scroll on a pathname change (not a search-param change, which is
  // a filter or tab on the same page). `behavior: 'instant'`, because `auto` means "use scroll-behavior", which is smooth
  // app-wide. A layout effect, so the first painted frame is already the top.
  // Back and forward (POP) restore the position recorded for that history entry instead, re-asserting it briefly while
  // late content lands, unless the reader has started scrolling.
  const navType = useNavigationType()
  const { key: locationKey } = useLocation()
  const scrollMemo = useRef(new Map())
  const scrollKey = useRef(locationKey)
  useEffect(() => {
    const onScroll = () => { scrollMemo.current.set(scrollKey.current, window.scrollY) }
    // Also on the tap that starts a navigation: a scroll event is only delivered with a rendered frame.
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('pointerdown', onScroll, { passive: true, capture: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('pointerdown', onScroll, { capture: true })
    }
  }, [])
  useLayoutEffect(() => {
    scrollKey.current = locationKey
    const saved = navType === 'POP' ? scrollMemo.current.get(locationKey) || 0 : 0
    window.scrollTo({ top: saved, left: 0, behavior: 'instant' })
    if (!saved) return undefined
    let touched = false
    const stop = () => { touched = true }
    window.addEventListener('touchstart', stop, { passive: true, once: true })
    window.addEventListener('wheel', stop, { passive: true, once: true })
    window.addEventListener('keydown', stop, { once: true })
    window.addEventListener('pointerdown', stop, { passive: true, once: true })
    // Up to ~3s, not 400ms: a challenge's entries arrive after a fetch, and until they do the page is too short to hold
    // the saved offset (the browser clamps it). Each beat re-asserts only if the reader has not taken over.
    const timers = [60, 180, 400, 700, 1100, 1600, 2300, 3000].map((ms) => setTimeout(() => {
      if (!touched && Math.abs(window.scrollY - saved) > 2) window.scrollTo({ top: saved, left: 0, behavior: 'instant' })
    }, ms))
    return () => {
      timers.forEach(clearTimeout)
      window.removeEventListener('touchstart', stop)
      window.removeEventListener('wheel', stop)
      window.removeEventListener('keydown', stop)
      window.removeEventListener('pointerdown', stop)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const keyboardOpen = useKeyboardOpen()

  // The tab bar is measured against the bottom of the screen and put back if it has drifted (see lib/pinnedBar).
  // `shifted` is the deliberate slide-away while the keyboard is open.
  const tabBarRef = useRef(null)
  usePinnedToBottom(tabBarRef, keyboardOpen)

  // A leaked scroll lock leaves the page frozen (lib/scrollLock fixes the body), so every route change audits it.
  // Re-register this device for push on every open and on return to the foreground (see syncPushSubscription), never
  // while viewing as a creator.
  useEffect(() => {
    if (!user?.id || impersonating) return undefined
    syncPushSubscription(user.id)
    const onVisible = () => { if (document.visibilityState === 'visible') syncPushSubscription(user.id) }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [user?.id, impersonating])

  useEffect(() => { repairScrollLock() }, [pathname])

  // A route change restarts the page-settled watch (lib/pageSettled) so Reveal animations measure the final layout.
  useEffect(() => { resetPageSettled() }, [pathname])

  // Presence heartbeat (lib/presence `startHeartbeat`): stamps our own row so admins see who is online and when a
  // creator was last active.
  useEffect(() => {
    if (!user) return undefined
    return startHeartbeat(supabase)
  }, [user])

  // Dark mode applies only inside this shell, so public pages stay on the bright palette. The saved profile preference
  // wins; the localStorage cache avoids a flash; lib/theme follows live OS changes.
  useEffect(() => {
    setShellActive(true)
    applyMotion(getStoredMotion())
    return () => { setShellActive(false); applyMotion(false) }
  }, [])

  // Feed the saved preference in once the profile loads (and on any change).
  useEffect(() => { syncTheme(!!profile?.dark_mode) }, [profile?.dark_mode])

  // "What's new" dot: the newest published update is later than the one this browser last saw on the page.
  useEffect(() => {
    if (!user) return undefined
    let alive = true
    const check = () => {
      contentApi.appUpdates().select('id, published_on').eq('published', true).order('published_on', { ascending: false }).order('created_at', { ascending: false }).limit(1)
        .then(({ data }) => {
          if (!alive || !data?.[0]) return
          let seen = ''
          try { seen = localStorage.getItem('tryp_updates_seen_v1') || '' } catch { /* private mode */ }
          // A browser that has never opened the page is not shown a dot for the whole back catalogue.
          setNewUpdates(!!seen && `${data[0].published_on}|${data[0].id}` > seen)
        })
    }
    check()
    window.addEventListener('tryp:updates-seen', check)
    return () => { alive = false; window.removeEventListener('tryp:updates-seen', check) }
  }, [user])

  // Opening the page a notification points at marks it read (matched exactly on the server).
  useEffect(() => {
    if (!user) return undefined
    // A beat after arrival, so a bounce through a route does not clear it and
    // so this never races the page's own first paint.
    const t = setTimeout(() => {
      notifications.markReadForPath(pathname).then(() => {}, () => {})
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
      const { data } = await chatApi.myDmUnread()
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
    // Read on the phone, still badged on the laptop: a socket that slept missed it, so coming back recounts.
    const off = onResume(count)
    return () => { off(); supabase.removeChannel(channel) }
  }, [user])

  // Room push notifications come from the server (`on_chat_message`, scoped to room members, throttled, respecting
  // per-room mutes) and reach a device with the app closed. There is no local push here.

  // Pending incoming connection requests, kept live via realtime.
  useEffect(() => {
    if (!user) return
    async function count() {
      const { count } = await profilesApi
        .connections()
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
      'relative flex flex-col items-center gap-0.5 whitespace-nowrap rounded-xl px-4 py-1.5 text-[11px] font-medium transition-colors',
      currentTab === to ? 'text-brand' : 'text-smoke hover:text-ink'
    )

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <PullToRefresh />
      {/* ASKED ONCE PER APP OPEN, UNTIL THERE IS SOMETHING TO ASK ABOUT.
          Mounted in the shell rather than on a page, because "every time you
          open the app" is a fact about the session and not about any route.
          See components/BankDetailsPrompt - it asks nothing of a creator who
          has already filled them in, and takes "later" for an answer. */}
      {/* AT MOST ONE OF THESE ASKS ANYTHING PER APP OPEN. They coordinate
          through lib/appNag, which also fixes the priority: home screen first
          (on iOS notifications do not work at all until it is installed), then
          notifications, then bank details. */}
      <AddToHomePrompt />
      <BankDetailsPrompt />
      {/* The live worldwide challenge, for a creator who has not entered it. */}
      <AgreementGate />
      <BoostPrompt />
      <VoucherDayPrompt />
      {/* A cash prize that can be swapped for a slightly bigger voucher (migration 453). */}
      <VoucherChoicePrompt />
      <JoinMarketHost />
      <GlobalChallengePrompt />
      {/* Surveys from the team (migration 291), last in the same queue. */}
      <SurveyHost />

      {/* When an admin is previewing as the sandbox creator, a persistent pill
          floats above everything so they can always exit back to their admin
          account (while previewing, the logged-in identity IS the creator). */}
      {impersonating && (
        // The "viewing as creator" pill docks right on pages with something at the bottom, shrinks to an icon on phones, and
        // never hides: it is the only way back.
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
                <span className="hidden sm:inline">{tr("Viewing as a creator")}</span>
              </span>
              <button
                onClick={async () => {
                  setExiting(true)
                  const { error } = await exitCreatorPreview()
                  setExiting(false)
                  if (error) setExitError(error)
                  else {
                    let back = '/admin'
                    try { back = localStorage.getItem('tryp_preview_return') || '/admin'; localStorage.removeItem('tryp_preview_return') } catch { /* ignore */ }
                    navigate(back.startsWith('/') && !back.startsWith('//') ? back : '/admin')
                  }
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
        ref={headerRef}
        data-ptr-handle
        className={cx(
          // The header uses `.glass-bar` (index.css): a blur confined to this 56px strip, dropped under reduced motion.
          'glass-bar sticky top-0 z-40 border-b border-black/[0.06]',
          // Same duration and curve as the chat overlay's top edge, so the two read as one movement. `will-change` keeps the
          // header on its own layer.
          'duration-[280ms] ease-[cubic-bezier(0.32,0.72,0,1)] [will-change:transform]',
          // A DM thread opens with the header already away: no slide for a header the reader never saw go.
          chatChromeFlipInstant() ? 'transition-none' : 'transition-transform',
          chromeHidden && '-translate-y-full',
        )}
        // UNDER THE CLOCK IN DARK MODE. The status bar is translucent there
        // (see index.html), so the app runs up behind it and the header fills
        // that strip with its own colour. Zero everywhere else.
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          // THE BAR STAYS WHILE A POP-UP IS OPEN. The push-back is measured in the layout effect above (headerRef), not
          // assumed.
          ...(lockedY || settling ? { transition: 'none' } : null),
        }}
      >
        {/* White shield directly ABOVE the header. Normally off-screen; if iOS
            rubber-bands the page down at the top it fills that gap with clean
            white instead of letting the fixed chat overlay's tabs peek above
            the bar. Moves with the header, so it always covers the gap. */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-full h-screen bg-white" />
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-5 sm:px-8">
          <Link to="/global" className="flex items-center gap-3">
            <img src="/brand/tryp-logo-360.png" alt="Tryp.com" className="h-9 rounded-lg" />
            <span className="hidden text-sm font-semibold text-smoke md:block">{tr('Content Creator Community')}</span>
          </Link>

          <nav className="hidden items-center gap-2 lg:flex" aria-label={tr("Main")}>
            {tabs.map((item) => (
              <NavLink key={item.to} to={item.to} className={navLinkClass(item.to)} data-tour={tourAnchor(item.to)}>
                {/* THE BADGE HANGS FROM THE ICON, NOT FROM THE LINK. It was positioned against the whole link
                    (`right-2`), so it sat at a fixed distance from the RIGHT EDGE - and a longer label in another
                    language ("Mensajes", "Nachrichten") pushed that edge away from the icon. The team: the orange dot
                    shows "up away from the icons because the different languages' UI are slightly different." */}
                <span className="relative inline-flex">
                  <Icon name={item.icon} className="h-5 w-5" />
                  {item.to === '/messages' && dmUnread > 0 && (
                    <span className="absolute -right-2.5 -top-2 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-brand px-1 text-[9px] font-semibold text-white ring-2 ring-white">
                      {dmUnread > 9 ? '9+' : dmUnread}
                    </span>
                  )}
                  {item.to === '/rooms' && roomsUnread > 0 && (
                    <span className="absolute -right-1.5 -top-1 flex h-2.5 w-2.5 items-center justify-center" role="status" aria-label={tr('New messages')}>
                      <span className="absolute inset-0 rounded-full bg-brand/60 animate-ping-slow" aria-hidden />
                      <span className="relative h-2.5 w-2.5 rounded-full bg-brand ring-2 ring-white" aria-hidden />
                    </span>
                  )}
                </span>
                {/* `tabs` and `menuLinks` are module-level tables, so the
                    translation happens where the label is DRAWN. Translating
                    the table would fix its language at module load - whichever
                    one the app happened to open in - and it would never change
                    when somebody switched. */}
                {tr(item.label)}
              </NavLink>
            ))}
            {/* THE VIP COMMUNITY, AS A TAB, FOR THE TEAM. And (2 Oct): "it opens a VIP in a test preview, but I want it
                to be the actual VIP view." So it no longer signs into the sandbox VIP: it is a plain link to /vip, which
                for the team draws each market's REAL VIP page (pages/VipHub, staff mode, migration 310). Desktop only -
                a phone has no room for a sixth tab, and VIP tools links to the same page there. */}
            {vipAccess && !isVip && !impersonating && (
              <NavLink to="/vip" className={navLinkClass('/vip')} title={tr('The VIP community')}>
                <span className="relative inline-flex"><Icon name="star" className="h-5 w-5" /></span>
                {tr('VIP')}
              </NavLink>
            )}
          </nav>

          <div className="flex min-w-0 items-center gap-2">
            {/* Search opens the command palette, or searches the open chat room when there is one (lib/chatSearch). */}
            {/* ONLY BELOW lg. A desktop room already has its own search bar above the thread, so the header keeps the
                platform-wide palette and its ⌘K there - swapping it for a second room search made the header jump
                narrower every time Rooms opened. */}
            {chatSearch && (
              <div className="flex min-w-0 items-center lg:hidden">
                <ChatSearchField target={chatSearch} />
              </div>
            )}
            <button
              onClick={() => setPaletteOpen(true)}
              aria-label={tr("Search")}
              data-tour={chatSearch ? undefined : 'search'}
              className={cx(
                'items-center gap-2 rounded-full border border-gray-200 px-2.5 py-1.5 text-smoke transition-colors hover:border-brand hover:text-brand sm:pr-2',
                chatSearch ? 'hidden lg:flex' : 'flex',
              )}
            >
              <Icon name="magnifier" className="h-4 w-4" />
              <kbd className="hidden text-[10px] font-medium sm:block">⌘K</kbd>
            </button>
            {/* Admin shortcut. Visible on mobile too (creators never see it) so
                admins can reach the panel straight from the top bar. */}
            {/* PHONE AND TABLET ONLY. On a desktop the VIP tab beside Calendar is the same door, so this second VIP
                button next to Admin was a duplicate and is gone there. */}
            {/* The VIP tools door: only for the owner and the people they added to the programme (migration 296).
                ON A PHONE TOO, BESIDE ADMIN. The team: the VIP tools should be "accessible on mobile for admins via a
                button at the top beside 'Admin'". It opens the VIP page on its tools view. */}
            {vipAccess && !impersonating && (
              // On a phone both doors are round icon buttons, so the avatar never gets pushed off the bar.
              <Link to="/vip?mode=tools" aria-label={tr('VIP tools')} title={tr('VIP tools')} className="flex h-8 w-8 shrink-0 items-center justify-center gap-1.5 rounded-full border border-brand text-xs font-semibold text-brand transition-all duration-200 hover:-translate-y-px hover:bg-brand hover:text-white min-[440px]:h-auto min-[440px]:w-auto min-[440px]:px-3 min-[440px]:py-1.5 sm:px-4 lg:hidden">
                <Icon name="star" className="h-4 w-4" />
                <span className="hidden min-[440px]:inline">{tr("VIP")}</span>
              </Link>
            )}
            {isAdmin && (
              <Link to="/admin" aria-label={tr('Admin')} className={cx('flex shrink-0 items-center gap-1.5 rounded-full border border-brand text-xs font-semibold text-brand transition-colors hover:bg-brand hover:text-white sm:px-4', vipAccess && !impersonating ? 'h-8 w-8 justify-center min-[440px]:h-auto min-[440px]:w-auto min-[440px]:px-3 min-[440px]:py-1.5' : 'px-3 py-1.5')}>
                <Icon name="shield" className="h-4 w-4" />
                <span className={vipAccess && !impersonating ? 'hidden min-[440px]:inline' : undefined}>{tr("Admin")}</span>
              </Link>
            )}
            <span data-tour="bell"><NotificationBell /></span>

            {/* Avatar dropdown */}
            <div className="relative" ref={menuRef}>
              {/* `aria-expanded` is what the walkthrough reads before deciding
                  whether to press this (see TourHost's `openMenu`) - and it is
                  what a screen reader needs anyway, which is why it was a
                  missing attribute rather than a new one. */}
              <button onClick={() => setMenuOpen((o) => !o)} aria-label={tr("Account menu")} aria-haspopup="menu" aria-expanded={menuOpen} data-tour="avatar-menu" className="relative rounded-full">
                <Avatar src={profile?.photo_url} name={profile?.name} size="sm" />
                {(connReqs > 0 || newUpdates) && <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-brand ring-2 ring-white" aria-label={connReqs > 0 ? `${connReqs} connection requests` : 'Something new'} />}
              </button>
              {menuOpen && (
                <div data-ptr-ignore data-tour-keepout className="absolute right-0 z-40 mt-2 max-h-[calc(100dvh-9rem-env(safe-area-inset-bottom))] w-60 overflow-y-auto overscroll-contain rounded-card border border-gray-100 bg-white p-2 pb-[calc(2rem+env(safe-area-inset-bottom))] shadow-lift origin-top-right animate-menu-in lg:max-h-[calc(100dvh-5rem)]">
                  <div className="border-b border-gray-100 px-3 py-2">
                    <p className="truncate text-sm font-semibold">{profile?.name}</p>
                    <p className="truncate text-xs text-smoke">{user?.email}</p>
                  </div>
                  <Link to={`/profile/${user?.id}`} onClick={() => setMenuOpen(false)} className="block rounded-xl px-3 py-2.5 text-sm hover:bg-cloud">{tr("Profile")}</Link>
                  <Link to="/settings" onClick={() => setMenuOpen(false)} className="block rounded-xl px-3 py-2.5 text-sm hover:bg-cloud">{tr("Settings")}</Link>
                  <Link to="/rewards" onClick={() => setMenuOpen(false)} className="block rounded-xl px-3 py-2.5 text-sm hover:bg-cloud">{tr("Rewards")}</Link>
                  {/* Beside rewards on purpose: both are the things the
                      programme has given this person, and the portfolio is the
                      one they can hand to somebody else. */}
                  <Link to="/portfolio" onClick={() => setMenuOpen(false)} className="block rounded-xl px-3 py-2.5 text-sm hover:bg-cloud">{tr("Portfolio")}</Link>
                  <Link to="/dashboard" onClick={() => setMenuOpen(false)} className="block rounded-xl px-3 py-2.5 text-sm hover:bg-cloud">{tr("Dashboard")}</Link>
                  {/* Two things that ARE about you and have no home in the nav:
                      how far along the route you are, and who to ask when
                      something goes wrong. Both belong in the menu that already
                      holds your profile and your money. */}
                  {/* The Tryp.com team link is gone: the team are creators in
                      the directory with a role on their card, not a separate
                      page you have to know about. See Directory. */}
                  {!isVip && <Link to="/milestones" onClick={() => setMenuOpen(false)} className="block rounded-xl px-3 py-2.5 text-sm hover:bg-cloud">{tr("Milestones")}</Link>}
                  {/* THE VIP COMMUNITY, FOR EVERYONE TO SEE. The team wanted the general community to know it exists. A
                      creator who is not a VIP gets the locked page with how places are earned; the team gets the VIP
                      page itself. */}
                  {!isVip && (
                    <Link to="/vip" onClick={() => setMenuOpen(false)} className="flex items-center justify-between rounded-xl px-3 py-2.5 text-sm hover:bg-cloud">
                      {tr("VIP community")}
                      {!vipAccess && <Icon name="lock" className="h-3.5 w-3.5 shrink-0 text-brand" />}
                    </Link>
                  )}
                  {isVip && <Link to="/vip?tab=payouts" onClick={() => setMenuOpen(false)} className="block rounded-xl px-3 py-2.5 text-sm hover:bg-cloud">{isOfficialCreator ? tr('Payouts') : tr("VIP payouts")}</Link>}
                  {/* CREATING FOR ANOTHER MARKET. The team: the request to join another market was "quite hidden". It is
                      one press here now, for every approved creator who is not on a paid programme (their market is set
                      by the team). */}
                  {!isVip && !isAdmin && ['active', 'muted'].includes(profile?.status) && (
                    <button type="button" onClick={() => { setMenuOpen(false); openJoinMarket() }} className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm hover:bg-cloud">
                      {tr('Join another market')}
                      <Icon name="globe" className="h-3.5 w-3.5 shrink-0 text-brand" />
                    </button>
                  )}

                  {/* The network links (lib/networkLinks) in the avatar menu on every device, in the reader's saved order; the hub rail
                     reads the same list. */}
                  <div>
                      <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{tr("Explore the community")}</p>
                      {menuLinks.map((l) => (
                        <Link
                          key={l.to}
                          to={l.to}
                          onClick={() => setMenuOpen(false)}
                          className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm hover:bg-cloud"
                        >
                          {/* Brand orange, not grey: "those icons, which are really grey, might be better if they were
                              just orange to make them stand out more." */}
                          <Icon name={l.icon} className="h-4 w-4 shrink-0 text-brand" />
                          <span className="min-w-0 flex-1 truncate">{tr(l.label)}</span>
                          {l.badge === 'connections' && connReqs > 0 && (
                            <span className="inline-flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-semibold text-white">
                              {connReqs > 9 ? '9+' : connReqs}
                            </span>
                          )}
                        </Link>
                      ))}
                  </div>

                  <div className="my-1 border-t border-gray-100" />
                  {/* TWO DIFFERENT THINGS, NEXT TO EACH OTHER ON PURPOSE. "Help us improve" is a suggestion box that
                      points AT us; "Get help" is a person who answers, and until now the platform had only the first
                      one. Get help leads, because somebody stuck is in more of a hurry than somebody with an idea. */}
                  <Link to="/updates" onClick={() => setMenuOpen(false)} className="flex items-center justify-between rounded-xl px-3 py-2.5 text-sm hover:bg-cloud">
                    {tr("What's new")}
                    {newUpdates && <span className="h-2 w-2 shrink-0 rounded-full bg-brand" aria-label={tr("New")} />}
                  </Link>
                  <Link to="/help" onClick={() => setMenuOpen(false)} className="block rounded-xl px-3 py-2.5 text-sm hover:bg-cloud">{tr("Get help")}</Link>
                  <Link to="/feedback" onClick={() => setMenuOpen(false)} className="block rounded-xl px-3 py-2.5 text-sm hover:bg-cloud">{tr("Help us improve")}</Link>
                  <div className="my-1 border-t border-gray-100" />
                  {isAdmin && <Link to="/admin" onClick={() => setMenuOpen(false)} className="block rounded-xl px-3 py-2.5 text-sm font-medium text-brand hover:bg-cloud">{tr("Admin panel")}</Link>}
                  {vipAccess && <Link to="/vip?mode=tools" onClick={() => setMenuOpen(false)} className="block rounded-xl px-3 py-2.5 text-sm font-medium text-brand hover:bg-cloud">{tr("VIP tools")}</Link>}
                  {/* ORANGE LIKE THE TWO ABOVE IT. The team: a red Log out under two orange links "kind of flashes, and
                      it looks really odd". It stands apart by its icon and its place at the foot, not by a second
                      colour. */}
                  <button onClick={handleSignOut} className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-medium text-brand hover:bg-cloud">
                    {tr("Log out")}
                    <Icon name="exit" className="h-4 w-4 shrink-0" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Page content. The Suspense boundary is inside <main>, so the header and tab bar stay while a route chunk loads
         (see components/RouteSkeleton). */}
      <main className="flex-1 pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-0">
        <PushBanner />
        <Suspense fallback={<RouteSkeleton />}>
          <Outlet key={retryKey} />
        </Suspense>
      </main>
      <LoadTrouble onRetry={() => setRetryKey((k) => k + 1)} />

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

      {/* Mobile bottom tab bar. Bottom padding includes the home-indicator safe area.
         Kept pinned to the screen three ways: portalled to the body (a transformed ancestor would make `fixed` scroll with
         it), opaque white with no backdrop-filter (WebKit fails to re-pin a blurred fixed element), and its own compositing
         layer (`translateZ(0)`, composed with the keyboard slide into one transform). */}
      {createPortal(
        <nav
        ref={tabBarRef}
        className={cx(
          'fixed inset-x-0 bottom-0 z-30 border-t border-gray-100 bg-white pb-[env(safe-area-inset-bottom)] transition-transform duration-200 lg:hidden',
          keyboardOpen && 'pointer-events-none'
        )}
        style={{ transform: keyboardOpen ? 'translate3d(0, 100%, 0)' : 'translate3d(0, 0, 0)' }}
        aria-hidden={keyboardOpen}
        aria-label={tr("Mobile")}
      >
        {/* EXACTLY 4.5rem. Every phone layout over this bar (the DM list, the rooms, the chat overlays) leaves 4.5rem +
            the safe area for it, and the bar itself came out 66px, so each of them stopped 6px above its top line: the
            team saw DM rows "cutting out just before it reaches the line above the footer". The bar is now the height
            everything else already assumes (the 1px border included). */}
        <div className="mx-auto flex h-[calc(4.5rem-1px)] max-w-lg items-center justify-around px-0.5 pb-1 pt-1.5">
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              data-tour={tourAnchor(tab.to)}
              className={cx(
                'relative flex min-w-0 flex-1 flex-col items-center gap-1 whitespace-nowrap rounded-xl px-1 py-1 text-[10px] font-medium',
                currentTab === tab.to ? 'text-brand' : 'text-smoke',
              )}
            >
              <span className="relative">
                <Icon name={tab.icon} className="h-6 w-6" />
                {/* The unread mark on both Messages and Rooms (components/UnreadDot). */}
                {((tab.to === '/messages' && dmUnread > 0) || (tab.to === '/rooms' && roomsUnread > 0)) && (
                  <span
                    className="absolute -right-1.5 -top-1 flex h-2.5 w-2.5 items-center justify-center"
                    role="status"
                    aria-label={tab.to === '/messages' ? `${dmUnread} unread` : `${roomsUnread} unread`}
                  >
                    <span className="absolute inset-0 rounded-full bg-brand/60 animate-ping-slow" aria-hidden />
                    <span className="relative h-2.5 w-2.5 rounded-full bg-brand ring-2 ring-white" aria-hidden />
                  </span>
                )}
              </span>
              {/* ONE LINE, ALWAYS. Romanian's "La nivel mondial" wrapped every tab onto two lines (Maxi). The label is cut
                  with an ellipsis rather than ever wrapping; navLabels.test.js keeps every translation short enough. */}
              <span className="block max-w-full truncate">{tr(tab.label)}</span>
            </NavLink>
          ))}
        </div>
      </nav>,
        document.body,
      )}
    </div>
  )
}
