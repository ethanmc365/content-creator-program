import { useEffect, useMemo, useState } from 'react'
import {
  Bar, BarChart, CartesianGrid, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { format, startOfMonth } from 'date-fns'
import { supabase } from '../../lib/supabase'
import { PageHeader, Skeleton, StatCard } from '../../components/ui'
import { downloadCsv, formatMoney, formatViews } from '../../lib/utils'

// Admin analytics: the program's health in five calm charts.
// All charts are Recharts (free) and every dataset is exportable to CSV.
const BRAND = '#d94407'
const BRAND_LIGHT = '#f5853f'

const tooltipStyle = {
  borderRadius: 12, border: '1px solid #F1F1F2', fontFamily: 'Poppins',
  fontSize: 12, boxShadow: '0 4px 16px rgba(26,26,26,0.08)',
}

function ChartCard({ title, subtitle, onExport, children }) {
  return (
    <section className="card">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">{title}</h2>
          {subtitle && <p className="mt-1 text-xs text-smoke">{subtitle}</p>}
        </div>
        {onExport && <button onClick={onExport} className="btn-ghost !py-1.5 !px-3 text-xs">CSV ↓</button>}
      </div>
      <div className="h-64">{children}</div>
    </section>
  )
}

export default function AdminAnalytics() {
  const [raw, setRaw] = useState(null)

  useEffect(() => {
    async function load() {
      const [{ data: profiles }, { data: challenges }, { data: submissions }, { data: rewards }, { data: messages }] =
        await Promise.all([
          supabase.from('profiles').select('id, name, created_at'),
          supabase.from('challenges').select('id, title, status, start_date').neq('status', 'draft').order('start_date'),
          supabase.from('submissions').select('id, challenge_id, creator_id, logged_views'),
          supabase.from('rewards').select('amount, status, challenge_id, reward_type'),
          supabase.from('messages').select('id, sender_id, channel').eq('deleted', false),
        ])
      setRaw({ profiles, challenges, submissions, rewards, messages })
    }
    load()
  }, [])

  // ---------- Derived datasets ----------
  const derived = useMemo(() => {
    if (!raw) return null
    const { profiles, challenges, submissions, rewards, messages } = raw

    // 1. Creator growth: cumulative sign-ups per month.
    const byMonth = {}
    for (const p of profiles) {
      const key = format(startOfMonth(new Date(p.created_at)), 'yyyy-MM')
      byMonth[key] = (byMonth[key] || 0) + 1
    }
    let running = 0
    const growth = Object.keys(byMonth).sort().map((key) => {
      running += byMonth[key]
      return { month: format(new Date(key + '-01'), 'MMM yy'), creators: running }
    })

    // 2 & 3. Per-challenge: submissions + total/average logged views.
    const perChallenge = challenges.map((c) => {
      const subs = submissions.filter((s) => s.challenge_id === c.id)
      const viewed = subs.filter((s) => s.logged_views != null)
      const totalViews = viewed.reduce((sum, s) => sum + s.logged_views, 0)
      return {
        name: c.title.length > 18 ? c.title.slice(0, 18) + '…' : c.title,
        fullTitle: c.title,
        submissions: subs.length,
        totalViews,
        avgViews: viewed.length ? Math.round(totalViews / viewed.length) : 0,
        prizesPaid: rewards
          .filter((r) => r.challenge_id === c.id && r.status === 'distributed')
          .reduce((sum, r) => sum + Number(r.amount), 0),
      }
    })

    // 4. Most active creators (submissions + chat messages).
    const nameById = Object.fromEntries(profiles.map((p) => [p.id, p.name]))
    const activity = {}
    for (const s of submissions) activity[s.creator_id] = (activity[s.creator_id] || 0) + 3 // a submission is worth more
    for (const m of messages) activity[m.sender_id] = (activity[m.sender_id] || 0) + 1
    const mostActive = Object.entries(activity)
      .map(([id, score]) => ({
        name: (nameById[id] || '?').split(' ')[0],
        fullName: nameById[id],
        score,
        submissions: submissions.filter((s) => s.creator_id === id).length,
        chatMessages: messages.filter((m) => m.sender_id === id).length,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)

    // 5. Chat activity per channel.
    const chat = ['general', 'announcements', 'content_tips'].map((ch) => ({
      name: { general: 'General', announcements: 'Announcements', content_tips: 'Content Tips' }[ch],
      messages: messages.filter((m) => m.channel === ch).length,
    }))

    const totalPaid = rewards.filter((r) => r.status === 'distributed').reduce((s, r) => s + Number(r.amount), 0)

    return { growth, perChallenge, mostActive, chat, totalPaid, totals: {
      creators: profiles.length,
      submissions: submissions.length,
      challenges: challenges.length,
    } }
  }, [raw])

  if (!derived) {
    return (
      <div className="page space-y-6">
        <Skeleton className="h-10 w-72" />
        <div className="grid gap-4 sm:grid-cols-4"><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /></div>
        <div className="grid gap-6 lg:grid-cols-2"><Skeleton className="h-80" /><Skeleton className="h-80" /></div>
      </div>
    )
  }

  return (
    <div className="page">
      <PageHeader title="Analytics" subtitle="The program's pulse: growth, output, reach and spend." />

      <div className="mb-10 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Creators" value={derived.totals.creators} />
        <StatCard label="Challenges run" value={derived.totals.challenges} />
        <StatCard label="Total submissions" value={derived.totals.submissions} />
        <StatCard label="Prize money paid" value={formatMoney(derived.totalPaid)} accent />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard
          title="Creator growth"
          subtitle="Cumulative sign-ups over time"
          onExport={() => downloadCsv('creator-growth.csv', derived.growth)}
        >
          <ResponsiveContainer>
            <LineChart data={derived.growth} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F1F2" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#6B7280' }} />
              <YAxis tick={{ fontSize: 11, fill: '#6B7280' }} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(217,68,7,0.06)' }} />
              <Line type="monotone" dataKey="creators" stroke={BRAND} strokeWidth={2.5} dot={{ fill: BRAND, r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Submissions per challenge"
          onExport={() => downloadCsv('submissions-per-challenge.csv', derived.perChallenge.map(({ fullTitle, submissions }) => ({ challenge: fullTitle, submissions })))}
        >
          <ResponsiveContainer>
            <BarChart data={derived.perChallenge} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F1F2" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#6B7280' }} />
              <YAxis tick={{ fontSize: 11, fill: '#6B7280' }} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(217,68,7,0.06)' }} />
              <Bar dataKey="submissions" fill={BRAND} radius={[8, 8, 0, 0]} maxBarSize={48} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Logged views per challenge"
          subtitle="Total (orange) and average per entry (light)"
          onExport={() => downloadCsv('views-per-challenge.csv', derived.perChallenge.map(({ fullTitle, totalViews, avgViews }) => ({ challenge: fullTitle, total_views: totalViews, avg_views: avgViews })))}
        >
          <ResponsiveContainer>
            <BarChart data={derived.perChallenge} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F1F2" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#6B7280' }} />
              <YAxis tick={{ fontSize: 11, fill: '#6B7280' }} tickFormatter={formatViews} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(217,68,7,0.06)' }} formatter={(v) => formatViews(v)} />
              <Bar dataKey="totalViews" name="Total views" fill={BRAND} radius={[8, 8, 0, 0]} maxBarSize={40} />
              <Bar dataKey="avgViews" name="Avg per entry" fill={BRAND_LIGHT} radius={[8, 8, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Prize money per challenge"
          onExport={() => downloadCsv('prizes-per-challenge.csv', derived.perChallenge.map(({ fullTitle, prizesPaid }) => ({ challenge: fullTitle, prizes_paid_gbp: prizesPaid })))}
        >
          <ResponsiveContainer>
            <BarChart data={derived.perChallenge} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F1F2" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#6B7280' }} />
              <YAxis tick={{ fontSize: 11, fill: '#6B7280' }} tickFormatter={(v) => `£${v}`} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(217,68,7,0.06)' }} formatter={(v) => formatMoney(v)} />
              <Bar dataKey="prizesPaid" name="Paid out" fill={BRAND} radius={[8, 8, 0, 0]} maxBarSize={48} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Most active creators"
          subtitle="Submissions (×3) + chat messages"
          onExport={() => downloadCsv('most-active-creators.csv', derived.mostActive.map(({ fullName, submissions, chatMessages }) => ({ creator: fullName, submissions, chat_messages: chatMessages })))}
        >
          <ResponsiveContainer>
            <BarChart data={derived.mostActive} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F1F2" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: '#6B7280' }} allowDecimals={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#6B7280' }} width={70} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(217,68,7,0.06)' }} />
              <Bar dataKey="score" name="Activity score" fill={BRAND} radius={[0, 8, 8, 0]} maxBarSize={20} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Chat activity by channel"
          onExport={() => downloadCsv('chat-activity.csv', derived.chat.map(({ name, messages }) => ({ channel: name, messages })))}
        >
          <ResponsiveContainer>
            <BarChart data={derived.chat} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F1F2" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#6B7280' }} />
              <YAxis tick={{ fontSize: 11, fill: '#6B7280' }} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(217,68,7,0.06)' }} />
              <Bar dataKey="messages" fill={BRAND} radius={[8, 8, 0, 0]} maxBarSize={48} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  )
}
