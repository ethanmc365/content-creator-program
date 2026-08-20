import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useCommunity } from '../../context/CommunityContext'
import { PageHeader, StatCard, Skeleton } from '../../components/ui'
import Icon from '../../components/Icon'
import Reveal from '../../components/network/Reveal'
import { useIsPhone } from '../../lib/useKeyboardInset'
import { cx, formatMoney, PRIZE_BASELINE } from '../../lib/utils'

// The admin hub.
//
// WHAT WAS WRONG WITH IT
//
// Seventeen identical tiles in one flat grid, in whatever order you had dragged
// them into on this particular device. That is the same problem the avatar
// dropdown had before the network hub fixed it: a list you scan by hunting
// rather than navigation you read. Nothing on the page said which tools were
// about people and which were about money, three separate coloured banners
// competed to be the thing you noticed first, and there was no route at all to
// the per-market pages - so the person who runs Germany had to know that
// /manage/germany existed and type it.
//
// WHAT IT IS NOW
//
//   1. ON YOUR DESK   - only the things actually waiting for a decision, in one
//                       block, with counts. Empty when there is nothing, which
//                       is the point: an empty desk is information.
//   2. The numbers.
//   3. YOUR MARKETS   - every market you manage, as a door to its own settings.
//   4. The tools, GROUPED. The grouping IS the information.
//
// The manual drag-to-reorder is gone with the flat grid it existed to survive.
// Ordering seventeen things by hand is a workaround for not being able to find
// them, and five named groups of three or four is the actual fix.

const GROUPS = [
  {
    name: 'People',
    hint: 'Who is in the community and who runs it.',
    tools: [
      { to: '/admin/creators', icon: 'users', title: 'Creators', text: 'The full roster: emails, activity, password resets, mute, suspend, promote.' },
      { to: '/admin/applications', icon: 'shield', title: 'Applications', text: 'Approve or decline the people asking to join.' },
      { to: '/admin/referrals', icon: 'share', title: 'Referrals', text: 'Who brought whom in, and which leads to follow up.' },
      { to: '/admin/reports', icon: 'flag', title: 'Reported messages', short: 'Reports', text: 'What creators have flagged in the rooms and their DMs, and what was done.' },
      { to: '/admin/network', icon: 'heart', title: 'Community network', short: 'Network', text: 'Who is connecting with whom, and the best-connected creators.' },
      { to: '/admin/team', icon: 'shield', title: 'Tryp.com team', short: 'Team', text: 'Who runs the programme, what they can do, and their titles.', globalOnly: true },
    ],
  },
  {
    name: 'The programme',
    hint: 'The work creators are here to do.',
    tools: [
      { to: '/admin/challenges', icon: 'flag', title: 'Challenges', text: 'Create, edit, close and archive briefs.' },
      { to: '/admin/milestones', icon: 'plane', title: 'Milestones', text: 'The route every creator flies. Thresholds, rewards and order.' },
      { to: '/admin/events', icon: 'calendar', title: 'Events', text: 'Q&As, content days and meetups on the calendar.' },
      { to: '/admin/resources', icon: 'book', title: 'Resources', text: 'Guides, guidelines and downloadable assets.' },
      { to: '/admin/jobs', icon: 'briefcase', title: 'Roles', text: 'Paid work you are hiring for. Every creator is notified.' },
    ],
  },
  {
    name: 'Money',
    hint: 'Nothing is paid without a second pair of eyes.',
    tools: [
      { to: '/admin/rewards', icon: 'money', title: 'Rewards & invoices', short: 'Rewards', text: 'The approval queue, payouts, invoices and payment details.' },
      { to: '/admin/analytics', icon: 'chart', title: 'Analytics', text: 'Growth, submissions, views and spend, with CSV export.' },
    ],
  },
  {
    name: 'Talking to everyone',
    hint: 'Anything that lands in a creator’s inbox or notifications.',
    tools: [
      { to: '/admin/email', icon: 'envelope', title: 'Email', text: 'Approve welcome emails, copy the address list, see what went out.' },
      { to: '/admin/scheduled', icon: 'clock', title: 'Scheduled announcements', short: 'Scheduled', text: 'Write now, post later.' },
      { to: '/admin/whats-new', icon: 'bell', title: "What's new", text: 'Announce a feature. It lands in every notification bell.' },
      { to: '/admin/feedback', icon: 'chat', title: 'Bugs & ideas', text: 'What creators have flagged, waiting to be triaged.' },
      { to: '/admin/notes', icon: 'pencil', title: 'Notes', text: 'The team’s private space for plans, playbooks and question banks.' },
    ],
  },
  {
    name: 'The platform',
    hint: 'Settings and records that apply to everything.',
    globalOnly: true,
    tools: [
      { to: '/global/settings', icon: 'globe', title: 'Network settings', short: 'Network', text: 'The worldwide network itself.' },
      { to: '/global/markets', icon: 'flag', title: 'All markets', text: 'Every market, open and closed, and how to open another.' },
      { to: '/admin/audit', icon: 'eye', title: 'Audit log', text: 'A record of account actions taken by the team.' },
    ],
  },
]

// SOME OF THESE LIVE INSIDE THE NETWORK SHELL, WHICH IS BEHIND A FLAG.
//
// `/manage/:slug`, `/global/settings` and `/global/markets` are all under
// NetworkRoute, which redirects to /home unless the device-local preview flag
// is on. So a plain <Link> to any of them from here is a link that silently
// bounces you to the home page - which is exactly how a market's settings came
// to be reachable only by typing the URL. Anything network-scoped turns the
// flag on first; it is device-local, it affects no creator, and an admin
// pressing "market settings" has unambiguously asked to go there.
const NETWORK_PATH = (to) => to.startsWith('/manage/') || to.startsWith('/global/')

function ToolCard({ tool, onNetworkOpen }) {
  const props = NETWORK_PATH(tool.to)
    ? { as: 'button', onClick: () => onNetworkOpen(tool.to) }
    : { as: 'link' }
  const inner = (
    <>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand">
        <Icon name={tool.icon} className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <span className="block font-semibold transition-colors group-hover:text-brand">{tool.title}</span>
        <span className="mt-1 block text-xs leading-relaxed text-smoke">{tool.text}</span>
      </span>
    </>
  )
  const className = 'card group flex w-full items-start gap-3 !p-5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift'
  if (props.as === 'button') {
    return <button type="button" onClick={props.onClick} className={className}>{inner}</button>
  }
  return <Link to={tool.to} className={className}>{inner}</Link>
}

// THE SAME TOOL, ON A PHONE.
//
// Ethan: two side by side, the title is enough, drop the descriptions, and put
// them all under one heading. He is right about all four. At 375px a described
// card is a full-width block about 96px tall, so seventeen of them plus five
// group headings is roughly two thousand pixels of scrolling to reach a button
// you already knew the name of. The description is orientation, and orientation
// is what you need the FIRST time; every time after that it is furniture.
//
// The icon does the work the group heading used to: a wallet, a flag and a
// megaphone are read at a glance where "Money" had to be read, matched to a
// tile and then read again.
function ToolTile({ tool, onNetworkOpen }) {
  const inner = (
    <>
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-tint text-brand transition-transform duration-200 group-hover:scale-105">
        <Icon name={tool.icon} className="h-5 w-5" />
      </span>
      {/* Two lines of room, centred, so "Scheduled announcements" and "Email"
          both sit in a tile of the same height and the grid stays a grid. */}
      <span className="flex min-h-[2.25rem] items-center text-center text-[13px] font-semibold leading-tight transition-colors group-hover:text-brand">
        {tool.short || tool.title}
      </span>
    </>
  )
  const className = 'card group flex h-full w-full flex-col items-center justify-start gap-2.5 !p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift active:scale-[0.98]'
  if (NETWORK_PATH(tool.to)) {
    return <button type="button" onClick={() => onNetworkOpen(tool.to)} className={className}>{inner}</button>
  }
  return <Link to={tool.to} className={className}>{inner}</Link>
}

// ON YOUR DESK.
//
// One row per thing that is genuinely waiting for a person. This replaces three
// separate full-width coloured banners that each claimed to be the most urgent
// thing on the page - and which, between them, pushed the actual tools below
// the fold on a laptop. A count and a verb is enough.
function DeskRow({ to, icon, count, label, hint }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-white"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-brand">
        <Icon name={icon} className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{count} {label}</span>
        <span className="block truncate text-xs text-smoke">{hint}</span>
      </span>
      <Icon name="chevronRight" className="h-4 w-4 shrink-0 text-gray-300" />
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

  const isGlobal = profile?.platform_role === 'global_admin' || profile?.platform_role === 'owner'
  const isPhone = useIsPhone()

  // The same tools in the same order, flattened out of their groups.
  const phoneTools = GROUPS
    .filter((g) => !g.globalOnly || isGlobal)
    .flatMap((g) => g.tools.filter((t) => !t.globalOnly || isGlobal))

  // Turn the network shell on, then go. See NETWORK_PATH above.
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

  useEffect(() => {
    async function load() {
      const [
        { count: creators }, { count: pendingRewards }, { data: active }, { data: paid },
        { count: submissions }, { count: pendingApps }, { count: newFeedback }, { count: toApprove },
        { count: openReports }, { count: newSuggestions },
      ] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'active').eq('is_admin', false).eq('is_test', false).is('deletion_requested_at', null),
        supabase.from('rewards').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('challenges').select('id, title, end_date').eq('status', 'active').limit(1).maybeSingle(),
        supabase.from('rewards').select('amount, reward_type').eq('status', 'distributed'),
        supabase.from('submissions').select('id', { count: 'exact', head: true }),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'pending').eq('onboarded', true),
        supabase.from('feedback').select('id', { count: 'exact', head: true }).eq('status', 'new'),
        // The queue built in migration 091. This is the number that decides
        // whether anybody gets paid this week.
        supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('stage', 'awaiting_approval'),
        // A reported message is somebody waiting on a person, which is the only
        // thing the desk is for.
        supabase.from('message_reports').select('id', { count: 'exact', head: true }).in('status', ['new', 'reviewing']),
        // EVENT SUGGESTIONS LANDED NOWHERE. A creator suggesting a workshop got
        // a "the team has been notified" confirmation, a row in
        // `event_suggestions`, and a DB trigger writing a notification - and
        // then the only place the list was ever rendered was at the foot of the
        // calendar page, which is not somewhere an admin goes to find work. So
        // the answer to "does anybody read these" was: only by accident.
        // It is a desk row now, like every other thing waiting on somebody.
        supabase.from('event_suggestions').select('id', { count: 'exact', head: true }).eq('status', 'new'),
      ])
      const cashPaid = (paid ?? []).filter((r) => r.reward_type !== 'voucher').reduce((s, r) => s + Number(r.amount), 0)
      const voucherPaid = (paid ?? []).filter((r) => r.reward_type === 'voucher').reduce((s, r) => s + Number(r.amount), 0)
      setStats({
        creators: creators ?? 0,
        pendingRewards: pendingRewards ?? 0,
        active,
        cashPaid: PRIZE_BASELINE + cashPaid,
        voucherPaid,
        totalPaid: PRIZE_BASELINE + cashPaid + voucherPaid,
        submissions: submissions ?? 0,
        pendingApps: pendingApps ?? 0,
        newFeedback: newFeedback ?? 0,
        toApprove: toApprove ?? 0,
        openReports: openReports ?? 0,
        newSuggestions: newSuggestions ?? 0,
      })
    }
    load()
  }, [])

  // THE MARKETS ARE QUERIED HERE RATHER THAN READ FROM CommunityContext.
  //
  // That context deliberately issues no queries at all unless the network
  // preview flag is on, so on this page it is usually empty - and a "your
  // markets" section that is blank for everybody who has not turned on a
  // device-local flag is worse than not having one. Two small queries.
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

  // Both queries in. Until then the article draws its shape in skeletons rather
  // than drawing a SHORTER article that is about to grow two sections at the
  // top - see the note in the markup.
  const ready = !!stats && !!markets

  return (
    <div className="page">
      <PageHeader
        title="Admin panel"
        subtitle="What is waiting on you, then everything you need to run the programme."
      />

      <div className="space-y-10">
        {/* THE PAGE ARRIVES IN THE ORDER IT WILL STAY IN.
            THE BUG THIS FIXES. "On your desk" and "Your markets" were gated on
            `desk.length > 0` and `markets?.length > 0` - both of which are
            false until their queries land - while the stats skeleton and the
            whole tool grid rendered on the first frame. So the first paint was
            a page with two sections MISSING FROM THE TOP, and a moment later
            they appeared and shoved everything below them down the screen,
            each running its own entrance on the way. Ethan: "when the admin
            page first loads it shows up something else or the cards in a
            different order and then it plays the animation and looks correct."

            The rule this page was breaking is one the rest of the app already
            follows: an empty state is a CLAIM, and a claim needs the data
            first. A section that might exist reserves its space with a
            skeleton, so nothing below it ever moves and every entrance plays
            once, in place.

            `ready` is the whole condition: both queries in, nothing left that
            can change the shape of the article. */}

        {/* ---------- On your desk ---------- */}
        {!ready ? (
          <Skeleton className="h-36" />
        ) : desk.length > 0 ? (
          <Reveal from="down">
            <section className="rounded-card border border-brand/25 bg-brand-tint/25 p-4">
              <h2 className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-widest text-brand">On your desk</h2>
              <div className="space-y-0.5">
                {desk.map((r) => <DeskRow key={r.to} {...r} />)}
              </div>
            </section>
          </Reveal>
        ) : null}

        {/* ---------- The numbers ---------- */}
        {!ready ? (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" />
          </div>
        ) : (
          <Reveal className="grid grid-cols-2 gap-4 lg:grid-cols-4" stagger={0.06}>
            <StatCard label="Creators" value={stats.creators} />
            <StatCard label="Total submissions" value={stats.submissions} />
            <StatCard
              label="Prizes distributed"
              value={formatMoney(stats.totalPaid)}
              hint={`${formatMoney(stats.cashPaid)} cash · ${formatMoney(stats.voucherPaid)} vouchers`}
              accent
            />
            <StatCard
              label="Rewards to pay"
              value={stats.pendingRewards}
              hint={stats.pendingRewards > 0 ? 'Awarded, not yet distributed' : 'All settled'}
            />
          </Reveal>
        )}

        {/* ---------- The live challenge ---------- */}
        {stats?.active && (
          <Reveal from="down">
            <Link to={`/admin/challenges/${stats.active.id}/results`}
              className="block rounded-card border border-brand/30 bg-brand-tint/50 p-6 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift sm:p-8">
              <p className="text-xs font-semibold uppercase tracking-wider text-brand">Live challenge</p>
              <p className="mt-2 text-xl font-bold">{stats.active.title}</p>
              <p className="mt-1 text-sm text-smoke">Manage entries and log views when it closes →</p>
            </Link>
          </Reveal>
        )}

        {/* ---------- Your markets ----------
            THE MISSING DOOR. Per-market settings have existed at /manage/:slug
            for a while and nothing anywhere linked to them, so running a market
            meant knowing the URL. A market is the unit of work for everybody
            except the owner; it belongs above the platform-wide tools, not
            hidden behind them. */}
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
                <div>
                  <h2 className="text-lg font-semibold">
                    {isGlobal ? 'Markets' : 'Your markets'}
                  </h2>
                  <p className="mt-0.5 text-sm text-smoke">
                    Rooms, members, standings, join policy and the market’s own settings.
                  </p>
                </div>
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
            ONE LIST ON A PHONE, FIVE NAMED GROUPS ON A DESKTOP. The grouping is
            genuinely useful information when there is room to lay it out; on a
            phone it is five headings and five hints costing about a screen and a
            half between them, in front of the tools they describe. The order is
            preserved, so a tool is in the same relative place either way. */}
        {isPhone ? (
          <Reveal from="down">
            <section>
              <h2 className="text-lg font-semibold">Admin tools</h2>
              <Reveal className="mt-3 grid grid-cols-2 gap-3" stagger={0.03}>
                {phoneTools.map((t) => <ToolTile key={t.to} tool={t} onNetworkOpen={openInNetwork} />)}
              </Reveal>
            </section>
          </Reveal>
        ) : (
          GROUPS.filter((g) => !g.globalOnly || isGlobal).map((group) => {
            const tools = group.tools.filter((t) => !t.globalOnly || isGlobal)
            if (!tools.length) return null
            return (
              <Reveal from="down" key={group.name}>
                <section>
                  <h2 className="text-lg font-semibold">{group.name}</h2>
                  <p className="mb-3 mt-0.5 text-sm text-smoke">{group.hint}</p>
                  <Reveal className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" stagger={0.05}>
                    {tools.map((t) => <ToolCard key={t.to} tool={t} onNetworkOpen={openInNetwork} />)}
                  </Reveal>
                </section>
              </Reveal>
            )
          })
        )}

        {/* ---------- Seeing it as somebody else ----------
            Both of these change what YOU see and nothing about the platform, so
            they sit together at the bottom rather than pretending to be tools. */}
        <Reveal from="down">
          <section className="rounded-card border border-gray-200 bg-white p-5">
            <h2 className="text-sm font-semibold">See it as somebody else</h2>
            <p className="mt-0.5 text-xs text-smoke">
              Both are local to this device. No creator is affected and you can come back any time.
            </p>
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
