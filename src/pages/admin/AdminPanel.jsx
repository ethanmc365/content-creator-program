import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
const FAMILY = {
  people: { label: 'People', dot: 'bg-sky-500' },
  programme: { label: 'The programme', dot: 'bg-brand' },
  money: { label: 'Money', dot: 'bg-emerald-500' },
  comms: { label: 'Talking to everyone', dot: 'bg-violet-500' },
  platform: { label: 'The platform', dot: 'bg-slate-400' },
}

const TOOLS = [
  { id: 'creators', to: '/admin/creators', icon: 'users', family: 'people', title: 'Creators', text: 'The full roster: details, activity, notes and account actions.' },
  { id: 'applications', to: '/admin/applications', icon: 'shield', family: 'people', title: 'Applications', text: 'Approve or decline the people asking to join, by market.' },
  { id: 'referrals', to: '/admin/referrals', icon: 'share', family: 'people', title: 'Referrals', text: 'Who brought whom in, and which leads to follow up.' },
  { id: 'reports', to: '/admin/reports', icon: 'flag', family: 'people', title: 'Reported messages', short: 'Reports', text: 'What creators flagged in the rooms and their DMs.' },
  { id: 'team', to: '/admin/team', icon: 'shield', family: 'people', title: 'Tryp.com team', short: 'Team', text: 'Who runs the programme, and the title each of them carries.', globalOnly: true },

  { id: 'challenges', to: '/admin/challenges', icon: 'flag', family: 'programme', title: 'Challenges', text: 'Write, edit, run and close briefs across every market.' },
  { id: 'milestones', to: '/admin/milestones', icon: 'plane', family: 'programme', title: 'Milestones', text: 'The route every creator flies, and what unlocks each stop.' },

  { id: 'rewards', to: '/admin/rewards', icon: 'money', family: 'money', title: 'Rewards & invoices', short: 'Rewards', text: 'Payouts, invoices, approvals and payment details.' },
  { id: 'analytics', to: '/admin/analytics', icon: 'chart', family: 'money', title: 'Analytics', text: 'Views, spend, CPM, community health and the challenge log.' },

  { id: 'email', to: '/admin/email', icon: 'envelope', family: 'comms', title: 'Email', text: 'Approve what goes out, copy address lists, read the log.' },
  { id: 'feedback', to: '/admin/feedback', icon: 'chat', family: 'comms', title: 'Bugs & ideas', text: 'What creators have flagged, waiting to be triaged.' },
  { id: 'notes', to: '/admin/notes', icon: 'pencil', family: 'comms', title: 'Notes', text: 'Your own space for plans and playbooks, shared or private.' },

  // HELD BACK ON PURPOSE, and both come out the moment their replacement ships.
  //
  // Events, Resources and Roles left this grid because each already has another
  // door: "Manage" on /events, "Manage resources" on /resources, "Manage jobs"
  // on /jobs. These two do not yet. Scheduled announcements is moving into the
  // chat composer beside the poll button, and Community network is folding into
  // Analytics - until then, taking the card away would leave a live feature with
  // no way in at all, which is worse than one extra card.
  { id: 'scheduled', to: '/admin/scheduled', icon: 'clock', family: 'comms', title: 'Scheduled announcements', short: 'Scheduled', text: 'Write now, post later. Moving into each chat room.' },
  { id: 'network', to: '/admin/network', icon: 'heart', family: 'people', title: 'Community network', short: 'Network', text: 'Who is connecting with whom. Folding into Analytics.' },

  { id: 'testing', to: '/admin/testing', icon: 'joystick', family: 'platform', title: 'Testing Centre', short: 'Testing', text: 'Every feature and automation, running on invented people.' },
  { id: 'connections', to: '/admin/connections', icon: 'link', family: 'platform', title: 'Platform connections', short: 'Connections', text: 'What automatic view counts needs to read each platform.' },
  { id: 'network-settings', to: '/global/settings', icon: 'globe', family: 'platform', title: 'Network settings', short: 'Network', text: 'The worldwide network itself.', globalOnly: true },
  { id: 'markets', to: '/global/markets', icon: 'flag', family: 'platform', title: 'All markets', text: 'Every market, open and closed, and how to open another.', globalOnly: true },
  { id: 'audit', to: '/admin/audit', icon: 'eye', family: 'platform', title: 'Audit log', short: 'Audit', text: 'A record of account actions taken by the team.', globalOnly: true },
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
const NETWORK_PATH = (to) => to.startsWith('/manage/') || to.startsWith('/global/')

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
function ToolCard({ tool, onOpen, editing, dragging, dropTarget, onGrab }) {
  const family = FAMILY[tool.family]
  const body = (
    <>
      <span className="flex items-start justify-between gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-tint text-brand transition-transform duration-200 group-hover:scale-105">
          <Icon name={tool.icon} className="h-5 w-5" />
        </span>
        {editing ? (
          // The six dots. They only exist in arrange mode, because a drag
          // handle on a page you are not arranging is a button that does
          // nothing but make you wonder what it does.
          //
          // `touch-none` is not decoration: without it the browser claims the
          // gesture for scrolling the moment your finger moves, and the card
          // never picks up.
          <button
            type="button"
            aria-label={`Move ${tool.title}`}
            className="-mr-1 -mt-1 cursor-grab touch-none rounded-lg p-1 text-gray-300 transition-colors hover:text-brand active:cursor-grabbing active:text-brand"
            onPointerDown={(e) => onGrab(e, tool.id)}
          >
            <GripDots />
          </button>
        ) : (
          <span className="-mr-1 -mt-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-smoke opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            <span className={cx('h-1.5 w-1.5 rounded-full', family?.dot)} />
            {family?.label}
          </span>
        )}
      </span>
      <span className="mt-4 block text-[15px] font-semibold leading-tight transition-colors group-hover:text-brand">
        {tool.title}
      </span>
      <span className="mt-1.5 block text-xs leading-relaxed text-smoke">{tool.text}</span>
    </>
  )

  const className = cx(
    'card group relative flex h-full w-full flex-col !p-5 text-left transition-all duration-200',
    editing
      ? 'cursor-default select-none'
      : 'hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-lift active:scale-[0.99]',
    dragging && 'scale-[0.97] opacity-40',
    dropTarget && 'ring-2 ring-brand',
  )

  // In arrange mode a card is furniture, not a link: tapping it should not
  // navigate away from the layout you are in the middle of setting.
  if (editing) {
    return <div className={className} data-tool-id={tool.id}>{body}</div>
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
function DeskRow({ to, icon, count, label, hint }) {
  return (
    <Link
      to={to}
      className="group flex items-center gap-3 rounded-xl bg-white/70 px-3.5 py-3 transition-all duration-200 hover:bg-white hover:shadow-card"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand text-white">
        <Icon name={icon} className="h-[18px] w-[18px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold leading-snug">
          <span className="text-brand tabular-nums">{count}</span> {label}
        </span>
        <span className="mt-0.5 block truncate text-xs text-smoke">{hint}</span>
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

  const persist = useCallback(async (next) => {
    if (!profile?.id) return
    savedOnce.current = true
    await supabase
      .from('profiles')
      .update({ admin_prefs: { ...(profile.admin_prefs || {}), panel_order: next } })
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

  const handleGrab = useCallback((e, id) => {
    if (!editing) return
    e.preventDefault()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    dragRef.current = { id, pointerId: e.pointerId, over: id }
    setDragId(id)
    setOverId(id)

    const move = (ev) => {
      const drag = dragRef.current
      if (!drag || ev.pointerId !== drag.pointerId) return
      const under = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-tool-id]')
      const id2 = under?.getAttribute('data-tool-id') ?? null
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
      setOrder((cur) => {
        const next = reorder(cur ?? [], drag.id, drag.over)
        persist(next)
        return next
      })
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
  }, [editing, persist])

  function resetOrder() {
    const next = visibleTools.map((t) => t.id)
    setOrder(next)
    persist(next)
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
      ] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'pending').eq('onboarded', true),
        supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('stage', 'awaiting_approval'),
        supabase.from('message_reports').select('id', { count: 'exact', head: true }).in('status', ['new', 'reviewing']),
        supabase.from('feedback').select('id', { count: 'exact', head: true }).eq('status', 'new'),
        supabase.from('event_suggestions').select('id', { count: 'exact', head: true }).eq('status', 'new'),
        supabase.from('rewards').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      ])
      setStats({
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
        supabase.from('community_members')
          .select('community_id, profiles!inner(is_admin, is_test, status)')
          .eq('status', 'active').eq('profiles.is_admin', false).eq('profiles.is_test', false).eq('profiles.status', 'active'),
        supabase.from('challenges').select('id, community_id').eq('status', 'active'),
      ])
      if (!alive) return
      const managed = new Set((mine || []).filter((m) => m.role === 'manager').map((m) => m.community_id))
      const tally = {}
      for (const c of counts || []) tally[c.community_id] = (tally[c.community_id] || 0) + 1
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
    stats.pendingApps > 0 && { to: '/admin/applications', icon: 'shield', count: stats.pendingApps, label: `application${stats.pendingApps === 1 ? '' : 's'} to review`, hint: 'Nobody can post until they are approved.' },
    stats.toApprove > 0 && { to: '/admin/rewards?tab=queue', icon: 'money', count: stats.toApprove, label: `invoice${stats.toApprove === 1 ? '' : 's'} to approve`, hint: 'Money does not go out until somebody signs these off.' },
    stats.openReports > 0 && { to: '/admin/reports', icon: 'flag', count: stats.openReports, label: `reported message${stats.openReports === 1 ? '' : 's'}`, hint: 'Somebody flagged something in a room or a DM.' },
    stats.newFeedback > 0 && { to: '/admin/feedback', icon: 'chat', count: stats.newFeedback, label: `bug report${stats.newFeedback === 1 ? '' : 's'} and ideas`, hint: 'Creators have flagged something.' },
    stats.newSuggestions > 0 && { to: '/events#suggestions', icon: 'bulb', count: stats.newSuggestions, label: `event idea${stats.newSuggestions === 1 ? '' : 's'} from creators`, hint: 'Somebody asked for a workshop, Q&A or meet-up.' },
    stats.pendingRewards > 0 && { to: '/admin/rewards?tab=payouts', icon: 'wallet', count: stats.pendingRewards, label: `reward${stats.pendingRewards === 1 ? '' : 's'} still to pay`, hint: 'Awarded but not yet distributed.' },
  ].filter(Boolean) : []

  // THE PAGE ARRIVES IN THE ORDER IT WILL STAY IN. Both queries in before
  // anything that can change the shape of the article renders, so nothing below
  // ever gets shoved down the screen and every entrance plays once, in place.
  const ready = !!stats && !!markets

  return (
    <div className="page">
      <PageHeader
        title="Admin panel"
        subtitle="What is waiting on you, then everything you need to run the programme."
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
          <Reveal from="down">
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
          <Reveal from="down">
            <section>
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-semibold">{isGlobal ? 'Markets' : 'Your markets'}</h2>
                {isGlobal && (
                  <button type="button" onClick={() => openInNetwork('/global/markets')}
                    className="shrink-0 text-sm font-medium text-brand transition-transform duration-200 hover:scale-105">
                    Open another →
                  </button>
                )}
              </div>
              <Reveal className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" stagger={0.06}>
                {markets.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => openInNetwork(`/manage/${m.slug}`)}
                    className={cx(
                      'card flex w-full items-center gap-3 !p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift',
                      m.retired_at && 'opacity-60',
                    )}
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
                        <span>{m.members} {m.members === 1 ? 'creator' : 'creators'}</span>
                        {m.live && (
                          <>
                            <span aria-hidden>•</span>
                            <span className="font-medium text-brand">Challenge running</span>
                          </>
                        )}
                      </span>
                    </span>
                    <Icon name="chevronRight" className="h-4 w-4 shrink-0 text-gray-300" />
                  </button>
                ))}
              </Reveal>
            </section>
          </Reveal>
        ) : null}

        {/* ---------- The tools ----------
            ONE grid, one heading, every card the same size, phone and desktop
            alike. Two columns on a phone and four on a wide screen, which keeps
            a card roughly the same physical size on both. */}
        <Reveal from="down">
          <section>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">Tools</h2>
              {editing && (
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-smoke">Drag the dots. Saved to your account.</span>
                  <button type="button" onClick={resetOrder} className="font-medium text-brand hover:underline">
                    Reset
                  </button>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4">
              {tools.map((t) => (
                <ToolCard
                  key={t.id}
                  tool={t}
                  onOpen={openInNetwork}
                  editing={editing}
                  dragging={dragId === t.id}
                  dropTarget={editing && overId === t.id && dragId !== t.id}
                  onGrab={handleGrab}
                />
              ))}
            </div>
          </section>
        </Reveal>

        {/* ---------- Seeing it as somebody else ----------
            Both change what YOU see and nothing about the platform, so they sit
            at the bottom rather than pretending to be tools. */}
        <Reveal from="down">
          <section className="rounded-card border border-gray-200 bg-white p-5">
            <h2 className="text-sm font-semibold">See it as somebody else</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <button onClick={enterCreatorView} disabled={entering}
                className="flex items-start gap-3 rounded-xl border border-gray-100 p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-card disabled:opacity-60">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand">
                  <Icon name="eye" className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{entering ? 'Starting preview…' : 'View as creator'}</span>
                  <span className="mt-0.5 block text-xs text-smoke">Step into a sandbox creator account and use the platform as they do.</span>
                  {enterError && <span className="mt-1 block text-xs font-medium text-red-500">{enterError}</span>}
                </span>
              </button>

              <button onClick={() => { enterPreview(); navigate('/global') }}
                className="flex items-start gap-3 rounded-xl border border-gray-100 p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-card">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand">
                  <Icon name="globe" className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">Global network preview</span>
                  <span className="mt-0.5 block text-xs text-smoke">The worldwide shell, with the markets sitting inside it.</span>
                </span>
              </button>
            </div>
          </section>
        </Reveal>
      </div>
    </div>
  )
}
