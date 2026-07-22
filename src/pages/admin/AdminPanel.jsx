import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { PageHeader, StatCard, Skeleton } from '../../components/ui'
import Icon from '../../components/Icon'
import { cx, formatMoney } from '../../lib/utils'

// The admin hub: key numbers up top, then tiles linking every admin tool.
const TOOLS = [
  { to: '/admin/applications', icon: 'shield', title: 'Applications', text: 'Review new signups and approve or decline them before they can join.' },
  { to: '/admin/creators', icon: 'users', title: 'Creators', text: 'Full list with emails, activity, password resets, mute/suspend, promote.' },
  { to: '/admin/challenges', icon: 'flag', title: 'Challenges', text: 'Create, edit, close and archive challenges.' },
  { to: '/admin/rewards', icon: 'money', title: 'Rewards & invoices', text: 'Manage payouts, generate prize invoices, export for accounting.' },
  { to: '/admin/analytics', icon: 'chart', title: 'Analytics', text: 'Growth, submissions, views and spend, with CSV export.' },
  { to: '/admin/network', icon: 'users', title: 'Community network', text: 'Who is connecting with whom and the best-connected creators.' },
  { to: '/admin/email', icon: 'envelope', title: 'Email creators', text: 'Compose one message and send it to every creator.' },
  { to: '/admin/jobs', icon: 'briefcase', title: 'Jobs', text: 'Post roles you are hiring for. Every creator gets notified.' },
  { to: '/admin/referrals', icon: 'share', title: 'Referrals', text: 'See who referred whom, and follow up on leads.' },
  { to: '/admin/events', icon: 'calendar', title: 'Events', text: 'Q&As, content days and milestones on the calendar.' },
  { to: '/admin/resources', icon: 'book', title: 'Resources', text: 'Publish tips, guidelines and downloadable assets.' },
  { to: '/admin/audit', icon: 'clock', title: 'Audit log', text: 'A record of account actions taken by the Tryp.com Team.' },
  { to: '/admin/scheduled', icon: 'calendar', title: 'Scheduled announcements', text: 'Write announcements now and auto-post them later.' },
  { to: '/admin/whats-new', icon: 'bell', title: "What's new", text: "Announce a new feature. It lands in every creator's notification bell." },
  { to: '/admin/feedback', icon: 'chat', title: 'Bug reports & ideas', text: 'Bugs and feature suggestions creators have submitted.' },
  { to: '/admin/notes', icon: 'book', title: 'Notes', text: 'A private notes space for the team. Keep a bank of weekly questions, plans and playbooks.' },
]

// Admins can drag the tool cards into whatever order suits them; the order is
// remembered per device. New tools added later fall in at the end.
const ORDER_KEY = 'admin-panel-tool-order'
function loadOrder() {
  try { return JSON.parse(localStorage.getItem(ORDER_KEY)) || [] } catch { return [] }
}
function orderTools(order) {
  if (!order.length) return TOOLS
  const rank = new Map(order.map((to, i) => [to, i]))
  return [...TOOLS].sort((a, b) => (rank.has(a.to) ? rank.get(a.to) : 1e9) - (rank.has(b.to) ? rank.get(b.to) : 1e9))
}

export default function AdminPanel() {
  const { enterCreatorPreview } = useAuth()
  const navigate = useNavigate()
  const [stats, setStats] = useState(null)
  const [entering, setEntering] = useState(false)
  const [enterError, setEnterError] = useState('')

  // Drag-to-reorder the tool cards (grab dots on hover, top-right).
  const [order, setOrder] = useState(loadOrder)
  const [dragKey, setDragKey] = useState(null)
  const [overKey, setOverKey] = useState(null)
  const orderedTools = useMemo(() => orderTools(order), [order])

  function handleDrop(targetTo) {
    setOverKey(null)
    if (!dragKey || dragKey === targetTo) { setDragKey(null); return }
    const cur = orderedTools.map((t) => t.to)
    const from = cur.indexOf(dragKey)
    const to = cur.indexOf(targetTo)
    if (from === -1 || to === -1) { setDragKey(null); return }
    cur.splice(to, 0, cur.splice(from, 1)[0])
    setOrder(cur)
    localStorage.setItem(ORDER_KEY, JSON.stringify(cur))
    setDragKey(null)
  }

  // Enter "view as creator": step into the hidden sandbox creator account and
  // land on Home, experiencing the app exactly as a creator does. A floating
  // pill (in AppLayout) restores the admin session any time.
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
      const [{ count: creators }, { count: pendingRewards }, { data: active }, { data: paid }, { count: subsThisChallenge }, { count: pendingApps }, { count: newFeedback }] =
        await Promise.all([
          supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'active').eq('is_admin', false).eq('is_test', false).is('deletion_requested_at', null),
          supabase.from('rewards').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
          supabase.from('challenges').select('id, title, end_date').eq('status', 'active').limit(1).maybeSingle(),
          supabase.from('rewards').select('amount').eq('status', 'distributed'),
          supabase.from('submissions').select('id', { count: 'exact', head: true }),
          supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'pending').eq('onboarded', true),
          supabase.from('feedback').select('id', { count: 'exact', head: true }).eq('status', 'new'),
        ])
      setStats({
        creators: creators ?? 0,
        pendingRewards: pendingRewards ?? 0,
        active,
        totalPaid: (paid ?? []).reduce((s, r) => s + Number(r.amount), 0),
        submissions: subsThisChallenge ?? 0,
        pendingApps: pendingApps ?? 0,
        newFeedback: newFeedback ?? 0,
      })
    }
    load()
  }, [])

  return (
    <div className="page">
      <PageHeader title="Admin panel" subtitle="Everything you need to run the program, in one place." />

      {!stats ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4"><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /></div>
      ) : (
        <div className="mb-12 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Creators" value={stats.creators} />
          <StatCard label="Total submissions" value={stats.submissions} />
          <StatCard label="Prizes distributed" value={formatMoney(stats.totalPaid)} accent />
          <StatCard
            label="Pending rewards"
            value={stats.pendingRewards}
            hint={stats.pendingRewards > 0 ? 'Waiting to be paid out' : 'All settled ✓'}
          />
        </div>
      )}

      {stats?.pendingApps > 0 && (
        <Link to="/admin/applications" className="mb-6 flex items-center justify-between gap-4 rounded-card border border-amber-300 bg-amber-50 p-5 transition-shadow hover:shadow-lift">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700"><Icon name="shield" className="h-5 w-5" /></span>
            <div>
              <p className="font-semibold text-amber-900">{stats.pendingApps} application{stats.pendingApps === 1 ? '' : 's'} waiting for review</p>
              <p className="text-sm text-amber-700">Approve or decline new creators so they can join the program.</p>
            </div>
          </div>
          <span className="shrink-0 text-sm font-semibold text-amber-800">Review →</span>
        </Link>
      )}

      {stats?.newFeedback > 0 && (
        <Link to="/admin/feedback" className="mb-6 flex items-center justify-between gap-4 rounded-card border border-brand/30 bg-brand-tint/50 p-5 transition-shadow hover:shadow-lift">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-tint text-brand"><Icon name="chat" className="h-5 w-5" /></span>
            <div>
              <p className="font-semibold text-ink">{stats.newFeedback} new bug report{stats.newFeedback === 1 ? '' : 's'} / idea{stats.newFeedback === 1 ? '' : 's'}</p>
              <p className="text-sm text-smoke">Creators have flagged something. Take a look and triage it.</p>
            </div>
          </div>
          <span className="shrink-0 text-sm font-semibold text-brand">Review →</span>
        </Link>
      )}

      {stats?.active && (
        <Link to={`/admin/challenges/${stats.active.id}/results`} className="mb-12 block rounded-card border border-brand/30 bg-brand-tint/50 p-6 transition-shadow hover:shadow-lift sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand">Live challenge</p>
          <p className="mt-2 text-xl font-bold">{stats.active.title}</p>
          <p className="mt-1 text-sm text-smoke">Manage entries and log views when it closes →</p>
        </Link>
      )}

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {orderedTools.map((t) => (
          <Link
            key={t.to}
            to={t.to}
            draggable={false}
            onDragOver={(e) => { if (dragKey) { e.preventDefault(); if (overKey !== t.to) setOverKey(t.to) } }}
            onDrop={() => handleDrop(t.to)}
            className={cx(
              'card group relative !p-7 transition-all hover:-translate-y-0.5 hover:shadow-lift',
              dragKey === t.to && 'opacity-40',
              overKey === t.to && dragKey && dragKey !== t.to && 'ring-2 ring-brand'
            )}
          >
            {/* Grab handle: drag from here to reorder. */}
            <span
              draggable
              onDragStart={(e) => { e.stopPropagation(); setDragKey(t.to); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', t.to) }}
              onDragEnd={() => { setDragKey(null); setOverKey(null) }}
              onClick={(e) => { e.preventDefault(); e.stopPropagation() }}
              title="Drag to reorder"
              aria-label="Drag to reorder"
              className="absolute right-3 top-3 cursor-grab rounded-md p-1 text-gray-300 opacity-0 transition-opacity hover:text-smoke group-hover:opacity-100 active:cursor-grabbing"
            >
              <Icon name="grip" className="h-4 w-4" />
            </span>
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-tint text-brand">
              <Icon name={t.icon} className="h-6 w-6" />
            </span>
            <h2 className="mt-4 font-semibold group-hover:text-brand">{t.title}</h2>
            <p className="mt-2 text-xs leading-relaxed text-smoke">{t.text}</p>
          </Link>
        ))}

        {/* View-as-creator sits alongside the tools as a matching card, but it's
            an action (not a link): it hides all admin UI until you exit. */}
        <button onClick={enterCreatorView} disabled={entering} className="card group !p-7 text-left transition-all hover:-translate-y-0.5 hover:shadow-lift disabled:opacity-60">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-tint text-brand">
            <Icon name="eye" className="h-6 w-6" />
          </span>
          <h2 className="mt-4 font-semibold group-hover:text-brand">{entering ? 'Starting preview…' : 'View as creator'}</h2>
          <p className="mt-2 text-xs leading-relaxed text-smoke">Step into a sandbox creator account and see the platform as a creator does.</p>
          {enterError && <p className="mt-2 text-xs font-medium text-red-500">{enterError}</p>}
        </button>
      </div>
    </div>
  )
}
