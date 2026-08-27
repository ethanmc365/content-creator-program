import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { isRealMember } from '../../lib/members'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useCommunity } from '../../context/CommunityContext'
import { PageHeader, Skeleton } from '../../components/ui'
import Icon from '../../components/Icon'
import Reveal from '../../components/network/Reveal'
import { cx } from '../../lib/utils'

// The admin hub.
//
// WHAT CHANGED, 25 Aug 2026, and why
//
// Ethan's brief: keep "on your desk" but make it look like Tryp; the stat boxes
// belong in Analytics, not here; the live-challenge banner is noise; the Testing
// Centre does not need a full-width billboard; and "there are too many headings
// and sub-headings, all similar things but split", with cards of different sizes
// that make the thing you want hard to find.
//
// All four are the same complaint. The page had five named groups, each with a
// heading AND a hint line, plus three coloured full-width bands and a stat row -
// about eleven separate pieces of furniture in front of seventeen buttons. So:
//
//   1. ON YOUR DESK   - the only thing that is genuinely urgent, in real Tryp
//                       orange rather than a wash of it. Absent when empty.
//   2. YOUR MARKETS   - one line, no hint.
//   3. THE TOOLS      - ONE flat grid. Every card the same size. No group
//                       headings at all: the grid is short enough now that
//                       naming five sections costs more than it explains.
//
// The grouping is not gone, it moved: each card carries a small coloured dot
// keyed to its family, which does the same job as a heading without spending a
// row of the page on it.
//
// WHAT CHANGED AGAIN, 26 Aug 2026
//
// Two notes from Ethan, and they pull the same direction. The first: the panel
// had stopped looking like Tryp. Five families meant five hues - sky, brand,
// emerald, violet, slate - so the grid read as a Google product, not as a page
// of the platform it administers. It is now five INTENSITIES of the one brand
// orange (solid #d94407, solid #f5853f, a filled tint, an outline, and a
// neutral for the things that are not really tools), which sorts the grid
// exactly as well as five hues did while looking like it belongs here.
//
// The second: bigger titles, and the sentences under them gone. Both halves of
// that are one idea - the description was never read. "Creators / The full
// roster: details, activity, notes and account actions" tells an admin who
// opens this page daily nothing they do not know, and fourteen of them buried
// the fourteen words that actually navigate. The names are now 17px and alone.
// Same for the desk rows' hints and the two preview cards at the bottom.
//
// REORDERING IS BACK, AND IT IS PER ADMIN. It was removed once, on the argument
// that hand-ordering seventeen tiles is a workaround for not being able to find
// them. That was right about the flat grid it existed to survive and wrong about
// the need: the person who runs Spain opens Challenges and Rewards every day and
// Audit log twice a year, and no fixed order I choose is right for both of them
// and for Ethan. Grab the six dots, drag, and it saves to `profiles.admin_prefs`
// - so it follows the person to their phone rather than living in one browser.

// ---------------------------------------------------------------- the tools
//
// `id` is what gets saved in a person's saved order, so it must never be reused
// for a different tool. A tool that is removed simply stops matching, and one
// that is added appears at the end of everybody's existing arrangement.
// ONE ORANGE, AND A DIFFERENT ICON FOR EVERY DOOR.
//
// The tiles were tinted by family - five hues once, then five INTENSITIES of
// brand orange. Ethan's read on the second version: the ramp was still five
// different-looking things, and the one he liked was the solid deep orange on
// Creators, Applications and Referrals. So there is no ramp. Every tile is
// `bg-brand text-white`, and the grid reads as one set of controls belonging to
// one product.
//
// WHICH MAKES THE ICON THE ONLY THING THAT DISTINGUISHES A TILE, and three of
// them were duplicated: Applications and Tryp.com team both drew a shield,
// Reported messages and Challenges both drew a flag. With the colour gone that
// is two pairs of tiles that look identical apart from their names, which is
// the whole thing the icon exists to prevent. Every icon below is now used
// exactly once - keep it that way. Two that changed after the tiles lost their
// filled squares: `eye` now belongs to View as Creator (looking through
// somebody's eyes) and the audit log took `book`, which is what a log is; and
// the Testing Centre swapped the joystick for the gamepad, because at 22px an
// unfilled joystick reads as an arrow dropping into a tray.

const TOOLS = [
  { id: 'creators', to: '/admin/creators', icon: 'users', title: 'Creators' },
  { id: 'applications', to: '/admin/applications', icon: 'check', title: 'Applications' },
  { id: 'referrals', to: '/admin/referrals', icon: 'share', title: 'Referrals' },
  { id: 'reports', to: '/admin/reports', icon: 'flag', title: 'Reported Messages' },
  { id: 'team', to: '/admin/team', icon: 'shield', title: 'Tryp.com Team', globalOnly: true },

  { id: 'milestones', to: '/admin/milestones', icon: 'plane', title: 'Milestones' },

  { id: 'rewards', to: '/admin/rewards', icon: 'money', title: 'Rewards & Invoices' },
  { id: 'analytics', to: '/admin/analytics', icon: 'chart', title: 'Analytics' },

  { id: 'email', to: '/admin/email', icon: 'envelope', title: 'Email' },
  { id: 'feedback', to: '/admin/feedback', icon: 'bug', title: 'Bugs & Ideas' },
  { id: 'notes', to: '/admin/notes', icon: 'pencil', title: 'Notes' },

  { id: 'testing', to: '/admin/testing', icon: 'gamepad', title: 'Testing Centre' },

  // NOT A LINK - it mints a session in the sandbox account and moves you into
  // it. It sits in the grid anyway because from where an admin stands it is
  // one more door on the same wall, and keeping it out cost the grid an even
  // row for the sake of a distinction only the code cares about.
  { id: 'view-as', action: 'creator', icon: 'eye', title: 'View as Creator' },
  // PLATFORM CONNECTIONS IS NOT A CARD ANY MORE, and it is not deleted either.
  //
  // Ethan is right that it earns no space here: Instagram needs no credential
  // at all now, and the YouTube key does not expire, so on a good day the page
  // has nothing to say. But it is the break-glass for the two things that WILL
  // eventually break - Meta renumbers its saved queries every so often, and a
  // Google key can be revoked - and without it, the fix for either is a code
  // change and a deploy instead of pasting a value into a box.
  //
  // So it keeps its route and loses its tile. The only way in is from the view
  // counts panel on a challenge, which links here when something is actually
  // wrong. A door you are shown at the moment you need it beats a door you walk
  // past every day.
  { id: 'network-settings', to: '/global/settings', icon: 'globe', title: 'Manage Markets', globalOnly: true },
  { id: 'audit', to: '/admin/audit', icon: 'book', title: 'Audit Log', globalOnly: true },
]

// SOME OF THESE LIVE INSIDE THE NETWORK SHELL, WHICH IS BEHIND A FLAG.
//
// `/manage/:slug`, `/global/settings` and `/global/markets` are all under
// NetworkRoute, which redirects to /home unless the device-local preview flag
// is on. So a plain <Link> to any of them is a link that silently bounces you to
// the home page - which is how a market's settings came to be reachable only by
// typing the URL. Anything network-scoped turns the flag on first; it is
// device-local, it affects no creator, and an admin pressing it has
// unambiguously asked to go there.
const NETWORK_PATH = (to) => !!to && (to.startsWith('/manage/') || to.startsWith('/global/'))

// --------------------------------------------------------------- the layout
//
// A saved order is a list of ids and nothing else, which is what makes it
// survive this file changing. Unknown ids (a tool that has since been removed)
// are dropped; tools with no saved position keep their shipped order and go on
// the end. So neither adding a tool nor deleting one can leave somebody with a
// broken or half-empty panel.
export function applyOrder(tools, savedOrder) {
  const order = Array.isArray(savedOrder) ? savedOrder : []
  const rank = new Map(order.map((id, i) => [id, i]))
  return [...tools].sort((a, b) => {
    const ra = rank.has(a.id) ? rank.get(a.id) : Infinity
    const rb = rank.has(b.id) ? rank.get(b.id) : Infinity
    if (ra !== rb) return ra - rb
    return tools.indexOf(a) - tools.indexOf(b)
  })
}

// Move `fromId` so that it sits where `toId` currently is.
export function reorder(ids, fromId, toId) {
  if (fromId === toId) return ids
  const from = ids.indexOf(fromId)
  const to = ids.indexOf(toId)
  if (from < 0 || to < 0) return ids
  const next = [...ids]
  next.splice(from, 1)
  next.splice(to, 0, fromId)
  return next
}

// ----------------------------------------------------------------- one card
//
// Every card is the same height, whatever the length of its description, so the
// grid reads as a grid. The old one sized itself to its text, which is why a row
// of them looked ragged.
function ToolCard({ tool, onOpen, onAct, busy, editing, dragging, dropTarget, onGrab }) {
  const body = (
    <>
      {/* NO TILE. Just the icon.
          The filled square was doing the work a colour used to do - marking
          the family - and once every tile was the same orange it was fourteen
          identical orange squares carrying fourteen different glyphs, which
          made the glyph harder to read rather than easier. Ethan: "we don't
          really need that big square box... just the icon in Tryp.com orange,
          I think this design will look cleaner". It does. */}
      <span className="flex h-10 w-10 shrink-0 items-center justify-center text-brand transition-transform duration-200 group-hover:scale-110">
        <Icon name={tool.icon} className="h-[22px] w-[22px]" />
      </span>

      {/* THE NAME IS THE CARD.
          Every tile used to carry a sentence under its title - "the full
          roster: details, activity, notes and account actions" - and fourteen
          of those is forty lines of grey text with the names, the only part
          anybody scans for, marooned in the middle of it. Ethan asked for the
          descriptions gone and the titles bigger, which are the same request:
          he already knows what Creators is, he is looking for the word. */}
      <span className="min-w-0 flex-1 truncate text-[17px] font-semibold leading-snug tracking-[-0.01em] transition-colors group-hover:text-brand">
        {busy ? 'Starting preview…' : tool.title}
      </span>

      {editing ? (
        // The six dots. They only exist in arrange mode, because a drag handle
        // on a page you are not arranging is a button that does nothing but
        // make you wonder what it does.
        //
        // `touch-none` is not decoration: without it the browser claims the
        // gesture for scrolling the moment your finger moves, and the card
        // never picks up.
        <button
          type="button"
          aria-label={`Move ${tool.title}`}
          className="shrink-0 cursor-grab touch-none rounded-lg p-1 text-gray-300 transition-colors hover:text-brand active:cursor-grabbing active:text-brand"
          onPointerDown={(e) => onGrab(e, tool.id, 'tool')}
        >
          <GripDots />
        </button>
      ) : (
        <Icon
          name="chevronRight"
          className="h-4 w-4 shrink-0 text-gray-200 transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-brand"
        />
      )}
    </>
  )

  const className = cx(
    'card group relative flex h-full w-full items-center gap-3.5 !p-4 text-left transition-all duration-200',
    editing
      ? 'cursor-default select-none'
      : 'hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-lift active:scale-[0.99]',
    dragging && 'scale-[0.97] opacity-40',
    dropTarget && 'ring-2 ring-brand',
  )

  // In arrange mode a card is furniture, not a link: tapping it should not
  // navigate away from the layout you are in the middle of setting.
  if (editing) {
    return <div className={className} data-drag-kind="tool" data-drag-id={tool.id}>{body}</div>
  }
  if (tool.action) {
    return <button type="button" onClick={onAct} disabled={busy} className={className}>{body}</button>
  }
  if (NETWORK_PATH(tool.to)) {
    return <button type="button" onClick={() => onOpen(tool.to)} className={className}>{body}</button>
  }
  return <Link to={tool.to} className={className}>{body}</Link>
}

function GripDots() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor">
      {[4, 8, 12].flatMap((y) => [5, 11].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.4" />))}
    </svg>
  )
}

// ------------------------------------------------------------ on your desk
//
// Real Tryp orange, not a wash of it: a solid brand rule down the left edge, the
// count set in brand at a size you read from across the room, and white rows on
// the tint so each item is its own object. The old one was a tinted box with
// tinted rows inside it, which made the whole block one grey-orange smudge.
function DeskRow({ to, icon, count, label }) {
  return (
    <Link
      to={to}
      className="group flex items-center gap-3 rounded-xl bg-white/70 px-3.5 py-3 transition-all duration-200 hover:bg-white hover:shadow-card"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand text-white">
        <Icon name={icon} className="h-[18px] w-[18px]" />
      </span>
      <span className="min-w-0 flex-1 truncate text-[15px] font-semibold leading-snug">
        <span className="text-brand tabular-nums">{count}</span> {label}
      </span>
      <Icon
        name="chevronRight"
        className="h-4 w-4 shrink-0 text-brand/40 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-brand"
      />
    </Link>
  )
}

export default function AdminPanel() {
  const { enterCreatorPreview, profile } = useAuth()
  const { enterPreview } = useCommunity()
  const navigate = useNavigate()
  const [stats, setStats] = useState(null)
  const [markets, setMarkets] = useState(null)
  const [entering, setEntering] = useState(false)
  const [enterError, setEnterError] = useState('')

  const [editing, setEditing] = useState(false)
  const [order, setOrder] = useState(null)
  const [dragId, setDragId] = useState(null)
  const [overId, setOverId] = useState(null)
  const savedOnce = useRef(false)

  const isGlobal = profile?.platform_role === 'global_admin' || profile?.platform_role === 'owner'

  const visibleTools = useMemo(
    () => TOOLS.filter((t) => !t.globalOnly || isGlobal),
    [isGlobal],
  )

  // The saved order arrives with the profile, so there is no second query and no
  // frame where the panel is in the shipped order before jumping into the
  // person's own.
  useEffect(() => {
    if (order !== null) return
    const saved = profile?.admin_prefs?.panel_order
    setOrder(applyOrder(visibleTools, saved).map((t) => t.id))
  }, [profile?.admin_prefs, visibleTools, order])

  const tools = useMemo(() => {
    if (!order) return visibleTools
    const byId = new Map(visibleTools.map((t) => [t.id, t]))
    const listed = order.map((id) => byId.get(id)).filter(Boolean)
    const missing = visibleTools.filter((t) => !order.includes(t.id))
    return [...listed, ...missing]
  }, [order, visibleTools])

  // MARKETS ARE ARRANGEABLE TOO.
  //
  // Same reasoning as the tools, and more so: the tools list is the same for
  // everybody, but the person who runs Spain opens Spain every day and the
  // Nordics never. Their own order is saved beside the tool order under a key
  // of its own, so neither can disturb the other.
  const [marketOrder, setMarketOrder] = useState(null)

  useEffect(() => {
    if (marketOrder !== null || !markets) return
    const saved = profile?.admin_prefs?.market_order
    const ids = markets.map((m) => m.id)
    const rank = new Map((Array.isArray(saved) ? saved : []).map((id, i) => [id, i]))
    setMarketOrder([...ids].sort((a, b) => (rank.get(a) ?? Infinity) - (rank.get(b) ?? Infinity)))
  }, [markets, profile?.admin_prefs, marketOrder])

  const orderedMarkets = useMemo(() => {
    if (!markets) return markets
    if (!marketOrder) return markets
    const byId = new Map(markets.map((m) => [m.id, m]))
    const listed = marketOrder.map((id) => byId.get(id)).filter(Boolean)
    const missing = markets.filter((m) => !marketOrder.includes(m.id))
    return [...listed, ...missing]
  }, [markets, marketOrder])

  const persist = useCallback(async (patch) => {
    if (!profile?.id) return
    savedOnce.current = true
    await supabase
      .from('profiles')
      .update({ admin_prefs: { ...(profile.admin_prefs || {}), ...patch } })
      .eq('id', profile.id)
  }, [profile?.id, profile?.admin_prefs])

  // POINTER EVENTS, NOT HTML5 DRAG-AND-DROP.
  //
  // The obvious implementation is `draggable` + dragstart/drop, and it is the
  // wrong one here: HTML5 drag-and-drop does not fire on touch at all. It would
  // have worked perfectly on a laptop and done literally nothing on the phone
  // half the team arranges this on. Pointer events are one API for mouse,
  // trackpad and finger, and `setPointerCapture` keeps the gesture attached to
  // the handle even when the finger leaves the card it started on.
  //
  // The card under the pointer is found with elementFromPoint rather than by
  // hit-testing rectangles ourselves, so a grid that reflows between two and
  // four columns needs no special case.
  const dragRef = useRef(null)
  // The pointerup handler is registered once per gesture and closes over the
  // orders as they were at grab time. Refs keep it reading the live ones.
  const orderRef = useRef(null)
  const marketOrderRef = useRef(null)
  useEffect(() => { orderRef.current = order }, [order])
  useEffect(() => { marketOrderRef.current = marketOrder }, [marketOrder])

  const handleGrab = useCallback((e, id, kind = 'tool') => {
    if (!editing) return
    e.preventDefault()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    dragRef.current = { id, kind, pointerId: e.pointerId, over: id }
    setDragId(id)
    setOverId(id)

    const move = (ev) => {
      const drag = dragRef.current
      if (!drag || ev.pointerId !== drag.pointerId) return
      // Scoped to the list the drag STARTED in, so a market cannot be dropped
      // into the tool grid or the other way round. They are two orders.
      const under = document.elementFromPoint(ev.clientX, ev.clientY)
        ?.closest(`[data-drag-kind="${drag.kind}"]`)
      const id2 = under?.getAttribute('data-drag-id') ?? null
      if (id2 && id2 !== drag.over) {
        drag.over = id2
        setOverId(id2)
      }
    }

    const end = (ev) => {
      const drag = dragRef.current
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      dragRef.current = null
      setDragId(null)
      setOverId(null)
      if (!drag || (ev && ev.pointerId !== drag.pointerId)) return
      if (!drag.over || drag.over === drag.id) return
      // THE SAVE HAPPENS OUT HERE. It used to be called from inside the
      // `setOrder` updater, which React may run twice - so a single drag could
      // fire two writes. An updater returns the next state and does nothing
      // else; same rule that the DM reaction crash was about.
      if (drag.kind === 'market') {
        const next = reorder(marketOrderRef.current ?? [], drag.id, drag.over)
        setMarketOrder(next)
        persist({ market_order: next })
      } else {
        const next = reorder(orderRef.current ?? [], drag.id, drag.over)
        setOrder(next)
        persist({ panel_order: next })
      }
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
  }, [editing, persist])

  function resetOrder() {
    const next = visibleTools.map((t) => t.id)
    const nextMarkets = (markets || []).map((m) => m.id)
    setOrder(next)
    setMarketOrder(nextMarkets)
    persist({ panel_order: next, market_order: nextMarkets })
  }

  function openInNetwork(path) {
    enterPreview()
    navigate(path)
  }

  async function enterCreatorView() {
    setEntering(true)
    setEnterError('')
    const { error } = await enterCreatorPreview()
    setEntering(false)
    if (error) { setEnterError(error); return }
    navigate('/home')
  }

  // ONLY WHAT IS WAITING ON A PERSON.
  //
  // The counts that used to sit in stat cards here (creators, submissions,
  // prizes distributed) are not decisions, they are reporting, and reporting
  // belongs on the Analytics page where it can be filtered, compared and
  // exported. This query now asks only about work.
  useEffect(() => {
    async function load() {
      const [
        { count: pendingApps }, { count: toApprove }, { count: openReports },
        { count: newFeedback }, { count: newSuggestions }, { count: pendingRewards },
        { data: blockedRows },
      ] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'pending').eq('onboarded', true),
        supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('stage', 'awaiting_approval'),
        supabase.from('message_reports').select('id', { count: 'exact', head: true }).in('status', ['new', 'reviewing']),
        supabase.from('feedback').select('id', { count: 'exact', head: true }).eq('status', 'new'),
        supabase.from('event_suggestions').select('id', { count: 'exact', head: true }).eq('status', 'new'),
        supabase.from('rewards').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        // A PRIZE NOBODY CAN PAY IS WORK, and it is work of a different kind:
        // an invoice waiting for approval needs a decision from an admin, an
        // invoice with no bank details on it needs somebody to go and ask the
        // creator. Counted here rather than with a filter because `payment` is
        // jsonb and PostgREST cannot express "name is a non-empty string" in a
        // head-only count.
        supabase.from('invoices').select('id, payment').eq('stage', 'draft'),
      ])
      const blocked = (blockedRows ?? []).filter(
        (i) => !(i.payment?.name && (i.payment?.iban || i.payment?.accountNumber))).length
      setStats({
        blocked,
        pendingApps: pendingApps ?? 0,
        toApprove: toApprove ?? 0,
        openReports: openReports ?? 0,
        newFeedback: newFeedback ?? 0,
        newSuggestions: newSuggestions ?? 0,
        pendingRewards: pendingRewards ?? 0,
      })
    }
    load()
  }, [])

  // THE MARKETS ARE QUERIED HERE RATHER THAN READ FROM CommunityContext.
  //
  // That context deliberately issues no queries unless the network preview flag
  // is on, so on this page it is usually empty - and a "your markets" section
  // blank for everybody who has not turned on a device-local flag is worse than
  // not having one.
  useEffect(() => {
    let alive = true
    async function load() {
      const [{ data: comms }, { data: mine }, { data: counts }, { data: live }] = await Promise.all([
        supabase.from('communities').select('id, name, slug, kind, country_codes, is_active, retired_at').eq('kind', 'chapter').order('name'),
        supabase.from('community_members').select('community_id, role').eq('profile_id', profile?.id ?? '00000000-0000-0000-0000-000000000000').eq('status', 'active'),
        // A THIRD SPELLING OF "MEMBER", now the same one as everywhere else.
        // This one excluded admins, the market page did not, and the manage
        // page filtered nothing at all - so one market had three different
        // sizes depending on which screen you asked. See lib/members.
        supabase.from('community_members')
          .select('community_id, profiles!inner(is_admin, is_test, is_sandbox, status, deletion_requested_at)')
          .eq('status', 'active'),
        supabase.from('challenges').select('id, community_id').eq('status', 'active'),
      ])
      if (!alive) return
      const managed = new Set((mine || []).filter((m) => m.role === 'manager').map((m) => m.community_id))
      const tally = {}
      for (const c of counts || []) {
        if (!isRealMember(c.profiles)) continue
        tally[c.community_id] = (tally[c.community_id] || 0) + 1
      }
      const liveIn = new Set((live || []).map((c) => c.community_id))
      setMarkets(
        (comms || [])
          .filter((c) => (isGlobal ? true : managed.has(c.id)))
          .map((c) => ({ ...c, members: tally[c.id] || 0, live: liveIn.has(c.id) })),
      )
    }
    if (profile?.id) load()
    return () => { alive = false }
  }, [profile?.id, isGlobal])

  const desk = stats ? [
    stats.pendingApps > 0 && { to: '/admin/applications', icon: 'check', count: stats.pendingApps, label: `application${stats.pendingApps === 1 ? '' : 's'} to review` },
    stats.toApprove > 0 && { to: '/admin/rewards?tab=queue', icon: 'money', count: stats.toApprove, label: `invoice${stats.toApprove === 1 ? '' : 's'} to approve` },
    stats.openReports > 0 && { to: '/admin/reports', icon: 'flag', count: stats.openReports, label: `reported message${stats.openReports === 1 ? '' : 's'}` },
    stats.newFeedback > 0 && { to: '/admin/feedback', icon: 'bug', count: stats.newFeedback, label: `bug report${stats.newFeedback === 1 ? '' : 's'} and ideas` },
    stats.newSuggestions > 0 && { to: '/events#suggestions', icon: 'bulb', count: stats.newSuggestions, label: `event idea${stats.newSuggestions === 1 ? '' : 's'} from creators` },
    stats.pendingRewards > 0 && { to: '/admin/rewards?tab=payouts', icon: 'wallet', count: stats.pendingRewards, label: `reward${stats.pendingRewards === 1 ? '' : 's'} still to pay` },
    stats.blocked > 0 && { to: '/admin/rewards?tab=invoices', icon: 'alert', count: stats.blocked, label: `prize${stats.blocked === 1 ? '' : 's'} waiting on bank details` },
  ].filter(Boolean) : []

  // THE PAGE ARRIVES IN THE ORDER IT WILL STAY IN. Both queries in before
  // anything that can change the shape of the article renders, so nothing below
  // ever gets shoved down the screen and every entrance plays once, in place.
  const ready = !!stats && !!markets

  return (
    <div className="page">
      <PageHeader
        title="Admin panel"
        action={
          <button
            type="button"
            onClick={() => { setEditing((v) => !v); setDragId(null); setOverId(null) }}
            className={cx(
              'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all duration-200',
              editing
                ? 'bg-brand text-white shadow-card'
                : 'border border-gray-200 text-smoke hover:border-brand/40 hover:text-brand',
            )}
          >
            <GripDots />
            {editing ? 'Done' : 'Arrange'}
          </button>
        }
      />

      <div className="space-y-8">
        {/* ---------- On your desk ---------- */}
        {!ready ? (
          <Skeleton className="h-36" />
        ) : desk.length > 0 ? (
          <Reveal from="down" delay={0}>
            <section className="overflow-hidden rounded-card border border-brand/20 bg-brand-tint/60 shadow-card">
              <div className="flex items-center gap-2.5 border-b border-brand/15 px-4 py-3 sm:px-5">
                <span className="h-4 w-1 rounded-full bg-brand" aria-hidden />
                <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand">On your desk</h2>
                <span className="ml-auto rounded-full bg-brand px-2 py-0.5 text-[11px] font-bold tabular-nums text-white">
                  {desk.length}
                </span>
              </div>
              <div className="space-y-1 p-2 sm:p-2.5">
                {desk.map((r) => <DeskRow key={r.to} {...r} />)}
              </div>
            </section>
          </Reveal>
        ) : null}

        {/* ---------- Your markets ----------
            One heading, no hint line. What a market card is for is obvious from
            the card; the sentence under the heading was furniture. */}
        {!ready ? (
          <div>
            <Skeleton className="mb-3 h-6 w-40" />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Skeleton className="h-[4.5rem]" /><Skeleton className="h-[4.5rem]" /><Skeleton className="h-[4.5rem]" />
            </div>
          </div>
        ) : markets?.length > 0 ? (
          <Reveal from="down" delay={0.07}>
            <section>
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-xl font-semibold tracking-[-0.01em]">{isGlobal ? 'Markets' : 'Your markets'}</h2>
                {isGlobal && (
                  <button type="button" onClick={() => openInNetwork('/global/markets')}
                    className="shrink-0 text-sm font-medium text-brand transition-transform duration-200 hover:scale-105">
                    Open another →
                  </button>
                )}
              </div>
              <Reveal className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" stagger={0.06}>
                {orderedMarkets.map((m) => {
                  const cardClass = cx(
                    'card group flex w-full items-center gap-3 !p-4 text-left transition-all duration-200',
                    editing ? 'cursor-default select-none' : 'hover:-translate-y-0.5 hover:shadow-lift',
                    m.retired_at && 'opacity-60',
                    dragId === m.id && 'scale-[0.97] opacity-40',
                    editing && overId === m.id && dragId !== m.id && 'ring-2 ring-brand',
                  )
                  const Tag = editing ? 'div' : 'button'
                  return (
                  <Tag
                    key={m.id}
                    {...(editing
                      ? { 'data-drag-kind': 'market', 'data-drag-id': m.id }
                      : { type: 'button', onClick: () => openInNetwork(`/manage/${m.slug}`) })}
                    className={cardClass}
                  >
                    <span className="text-lg" aria-hidden>
                      {(m.country_codes || []).slice(0, 2).map((c) =>
                        String.fromCodePoint(...[...c.toUpperCase()].map((ch) => 127397 + ch.charCodeAt(0)))).join('') || '🌍'}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate font-semibold">{m.name}</span>
                        {m.retired_at
                          ? <span className="shrink-0 rounded-full bg-cloud px-2 py-0.5 text-[10px] font-semibold text-smoke">Retired</span>
                          : !m.is_active && <span className="shrink-0 rounded-full bg-cloud px-2 py-0.5 text-[10px] font-semibold text-smoke">Closed</span>}
                      </span>
                      <span className="mt-0.5 flex items-center gap-2 text-xs text-smoke">
                        {/* "Members", not "creators". The count now includes the
                            admins who run the market - Ethan asked to be in his
                            own market's number and he is right to be, he is in
                            its rooms - so the word has to cover both. */}
                        <span>{m.members} {m.members === 1 ? 'member' : 'members'}</span>
                        {m.live && (
                          <>
                            <span aria-hidden>•</span>
                            <span className="font-medium text-brand">Challenge running</span>
                          </>
                        )}
                      </span>
                    </span>
                    {editing ? (
                      <button
                        type="button"
                        aria-label={`Move ${m.name}`}
                        className="shrink-0 cursor-grab touch-none rounded-lg p-1 text-gray-300 transition-colors hover:text-brand active:cursor-grabbing active:text-brand"
                        onPointerDown={(e) => handleGrab(e, m.id, 'market')}
                      >
                        <GripDots />
                      </button>
                    ) : (
                      <Icon name="chevronRight" className="h-4 w-4 shrink-0 text-gray-300" />
                    )}
                  </Tag>
                  )
                })}
              </Reveal>
            </section>
          </Reveal>
        ) : null}

        {/* ---------- The tools ----------
            ONE grid, one heading, every card the same size, phone and desktop
            alike. Two columns on a phone and four on a wide screen, which keeps
            a card roughly the same physical size on both. */}
        <Reveal from="down" delay={0.14}>
          <section>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-xl font-semibold tracking-[-0.01em]">Tools</h2>
              {editing && (
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-smoke">Drag the dots on a tool or a market. Saved to your account.</span>
                  <button type="button" onClick={resetOrder} className="font-medium text-brand hover:underline">
                    Reset
                  </button>
                </div>
              )}
            </div>
            {/* THREE ACROSS AT MOST. Four fitted, and "Reported messages"
                became "Reported messa…" - a card whose whole job is to be
                recognised at a glance, truncated in the middle of the word that
                identifies it. Three columns is fourteen tools in five rows and
                every name readable. */}
            {/* THE CARDS ARRIVE ONE AFTER ANOTHER.
                This was a plain grid inside a Reveal, so the whole block faded
                as one - which next to the markets grid above it (which does
                stagger) read as the animation being broken below the fold.
                Tight stagger: fifteen cards at 45ms would still be drawing
                after two thirds of a second. */}
            <Reveal className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" stagger={0.03}>
              {tools.map((t) => (
                <ToolCard
                  key={t.id}
                  tool={t}
                  onOpen={openInNetwork}
                  onAct={t.action === 'creator' ? enterCreatorView : undefined}
                  busy={t.action === 'creator' && entering}
                  editing={editing}
                  dragging={dragId === t.id}
                  dropTarget={editing && overId === t.id && dragId !== t.id}
                  onGrab={handleGrab}
                />
              ))}
            </Reveal>
          </section>
        </Reveal>

        {/* ---------- The global network preview ----------
            The last thing left down here. "View as creator" moved up into the
            grid (it is one more door on the same wall, and keeping it out cost
            the grid an even row); this one is on its way out with the old UK
            view, so it waits alone rather than earning a heading. */}
        <Reveal from="down" delay={0.18}>
          <section>
            <button onClick={() => { enterPreview(); navigate('/global') }}
              className="card group flex w-full items-center gap-3.5 !p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-lift sm:w-1/2">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center text-brand transition-transform duration-200 group-hover:scale-110">
                <Icon name="globe" className="h-[22px] w-[22px]" />
              </span>
              <span className="min-w-0 flex-1 truncate text-[17px] font-semibold leading-snug tracking-[-0.01em] transition-colors group-hover:text-brand">
                Global Network Preview
              </span>
            </button>
            {enterError && <p className="mt-2 text-xs font-medium text-red-500">{enterError}</p>}
          </section>
        </Reveal>
      </div>
    </div>
  )
}
