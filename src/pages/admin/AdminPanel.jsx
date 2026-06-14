import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { PageHeader, StatCard, Skeleton } from '../../components/ui'
import Icon from '../../components/Icon'
import { formatMoney } from '../../lib/utils'

// The admin hub: key numbers up top, then tiles linking every admin tool.
const TOOLS = [
  { to: '/admin/creators', icon: 'users', title: 'Creators', text: 'Full list with emails, activity, password resets, mute/suspend, promote.' },
  { to: '/admin/challenges', icon: 'flag', title: 'Challenges', text: 'Create, edit, close and archive challenges.' },
  { to: '/admin/rewards', icon: 'money', title: 'Rewards', text: 'Manage payouts, mark distributed, export for accounting.' },
  { to: '/admin/analytics', icon: 'chart', title: 'Analytics', text: 'Growth, submissions, views and spend, with CSV export.' },
  { to: '/chat/announcements', icon: 'megaphone', title: 'Announcements', text: 'Post official updates. Every creator gets notified.' },
  { to: '/admin/email', icon: 'envelope', title: 'Email creators', text: 'Compose one message and send it to every creator.' },
  { to: '/admin/jobs', icon: 'briefcase', title: 'Jobs', text: 'Post roles you are hiring for. Every creator gets notified.' },
  { to: '/admin/referrals', icon: 'share', title: 'Referrals', text: 'See who referred whom, and follow up on leads.' },
  { to: '/admin/events', icon: 'calendar', title: 'Events', text: 'Q&As, content days and milestones on the calendar.' },
  { to: '/admin/resources', icon: 'book', title: 'Resources', text: 'Publish tips, guidelines and downloadable assets.' },
  { to: '/chat/general', icon: 'shield', title: 'Chat moderation', text: 'Delete messages and mute disruptive creators in any channel.' },
]

export default function AdminPanel() {
  const [stats, setStats] = useState(null)

  useEffect(() => {
    async function load() {
      const [{ count: creators }, { count: pendingRewards }, { data: active }, { data: paid }, { count: subsThisChallenge }] =
        await Promise.all([
          supabase.from('profiles').select('id', { count: 'exact', head: true }),
          supabase.from('rewards').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
          supabase.from('challenges').select('id, title, end_date').eq('status', 'active').limit(1).maybeSingle(),
          supabase.from('rewards').select('amount').eq('status', 'distributed'),
          supabase.from('submissions').select('id', { count: 'exact', head: true }),
        ])
      setStats({
        creators: creators ?? 0,
        pendingRewards: pendingRewards ?? 0,
        active,
        totalPaid: (paid ?? []).reduce((s, r) => s + Number(r.amount), 0),
        submissions: subsThisChallenge ?? 0,
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

      {stats?.active && (
        <Link to={`/admin/challenges/${stats.active.id}/results`} className="mb-12 block rounded-card border border-brand/30 bg-brand-tint/50 p-6 transition-shadow hover:shadow-lift sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand">Live challenge</p>
          <p className="mt-2 text-xl font-bold">{stats.active.title}</p>
          <p className="mt-1 text-sm text-smoke">Manage entries and log views when it closes →</p>
        </Link>
      )}

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {TOOLS.map((t) => (
          <Link key={t.to} to={t.to} className="card group !p-7 transition-all hover:-translate-y-0.5 hover:shadow-lift">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-tint text-brand">
              <Icon name={t.icon} className="h-6 w-6" />
            </span>
            <h2 className="mt-4 font-semibold group-hover:text-brand">{t.title}</h2>
            <p className="mt-2 text-xs leading-relaxed text-smoke">{t.text}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
