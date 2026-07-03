import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bar, BarChart, CartesianGrid, ComposedChart, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { format, startOfMonth } from 'date-fns'
import { supabase } from '../../lib/supabase'
import { PageHeader, Skeleton, StatCard } from '../../components/ui'
import { downloadCsv, formatMoney, formatViews } from '../../lib/utils'

// Admin analytics: the program's health at a glance. Recharts (free) for the
// charts, every dataset exportable to CSV, and every tile that has a natural
// destination is clickable.
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

// Horizontal funnel: each stage shows its count, a bar sized against the top
// stage, and the conversion rate from the previous stage.
function Funnel({ stages }) {
  const max = Math.max(1, ...stages.map((s) => s.count))
  return (
    <div className="space-y-3">
      {stages.map((s, i) => {
        const prev = i > 0 ? stages[i - 1].count : null
        const rate = prev ? Math.round((s.count / prev) * 100) : null
        return (
          <button
            key={s.label}
            type="button"
            onClick={s.onClick}
            disabled={!s.onClick}
            className="group block w-full text-left disabled:cursor-default"
          >
            <div className="mb-1 flex items-baseline justify-between text-sm">
              <span className={s.onClick ? 'font-medium transition-colors group-hover:text-brand' : 'font-medium'}>{s.label}</span>
              <span className="tabular-nums">
                <span className="font-semibold">{s.count}</span>
                {rate != null && <span className="ml-2 text-xs text-smoke">{rate}% of previous</span>}
              </span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-cloud">
              <div
                className="h-full rounded-full bg-gradient-to-r from-brand to-brand-light transition-all duration-500"
                style={{ width: `${Math.max(2, (s.count / max) * 100)}%` }}
              />
            </div>
          </button>
        )
      })}
    </div>
  )
}

export default function AdminAnalytics() {
  const navigate = useNavigate()
  const [raw, setRaw] = useState(null)
  // Clicking any per-challenge bar opens that challenge's deep-dive page.
  const openChallenge = (data) => {
    const id = data?.activePayload?.[0]?.payload?.id
    if (id) navigate(`/admin/analytics/${id}`)
  }

  useEffect(() => {
    async function load() {
      const [
        { data: profiles }, { data: challenges }, { data: submissions },
        { data: rewards }, { data: messages }, { data: results },
        { data: feedback }, { count: reactionCount }, { count: pollVoteCount },
      ] = await Promise.all([
        supabase.from('profiles').select('id, name, created_at, status, is_admin, onboarded, referred_by, deletion_requested_at, is_test'),
        supabase.from('challenges').select('id, title, status, start_date').neq('status', 'draft').order('start_date'),
        supabase.from('submissions').select('id, challenge_id, creator_id, logged_views, submitted_at'),
        supabase.from('rewards').select('amount, status, challenge_id, reward_type'),
        supabase.from('messages').select('id, sender_id, channel').eq('deleted', false),
        supabase.from('results').select('final_views'),
        supabase.from('feedback').select('status'),
        supabase.from('reactions').select('id', { count: 'exact', head: true }),
        supabase.from('poll_votes').select('id', { count: 'exact', head: true }),
      ])
      // Default every dataset so one failed query can never blank the page.
      setRaw({
        profiles: profiles || [], challenges: challenges || [],
        submissions: submissions || [], rewards: rewards || [],
        messages: messages || [], results: results || [], feedback: feedback || [],
        reactionCount: reactionCount || 0, pollVoteCount: pollVoteCount || 0,
      })
    }
    load()
  }, [])

  // ---------- Derived datasets ----------
  const derived = useMemo(() => {
    if (!raw) return null
    const { profiles, challenges, submissions, rewards, messages, results, feedback, reactionCount, pollVoteCount } = raw

    const realCreators = profiles.filter((p) => !p.is_admin && !p.deletion_requested_at && !p.is_test)

    // 1. Creator growth: new sign-ups per month + cumulative total.
    const byMonth = {}
    for (const p of realCreators) {
      const key = format(startOfMonth(new Date(p.created_at)), 'yyyy-MM')
      byMonth[key] = (byMonth[key] || 0) + 1
    }
    let running = 0
    const growth = Object.keys(byMonth).sort().map((key) => {
      running += byMonth[key]
      return { month: format(new Date(key + '-01'), 'MMM yy'), newCreators: byMonth[key], creators: running }
    })

    // 2. Submission momentum: entries per month.
    const subsByMonth = {}
    for (const s of submissions) {
      const key = format(startOfMonth(new Date(s.submitted_at)), 'yyyy-MM')
      subsByMonth[key] = (subsByMonth[key] || 0) + 1
    }
    const momentum = Object.keys(subsByMonth).sort().map((key) => ({
      month: format(new Date(key + '-01'), 'MMM yy'), submissions: subsByMonth[key],
    }))

    // 3. Per-challenge: submissions + total/average logged views.
    const perChallenge = challenges.map((c) => {
      const subs = submissions.filter((s) => s.challenge_id === c.id)
      const viewed = subs.filter((s) => s.logged_views != null)
      const totalViews = viewed.reduce((sum, s) => sum + s.logged_views, 0)
      return {
        id: c.id,
        status: c.status,
        name: c.title.length > 18 ? c.title.slice(0, 18) + '…' : c.title,
        fullTitle: c.title,
        creators: new Set(subs.map((s) => s.creator_id)).size,
        submissions: subs.length,
        totalViews,
        avgViews: viewed.length ? Math.round(totalViews / viewed.length) : 0,
        prizesPaid: rewards
          .filter((r) => r.challenge_id === c.id && r.status === 'distributed')
          .reduce((sum, r) => sum + Number(r.amount), 0),
      }
    })
    // Charts stay readable by showing only the most recent 8 challenges;
    // the full clickable list below covers every challenge, however many.
    const perChallengeRecent = perChallenge.slice(-8)

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

    // ---- Money and reach ----
    const totalPaid = rewards.filter((r) => r.status === 'distributed').reduce((s, r) => s + Number(r.amount), 0)
    const totalViews = perChallenge.reduce((s, c) => s + c.totalViews, 0)
    const verifiedViews = results.reduce((s, r) => s + (r.final_views || 0), 0)
    const costPer1k = totalViews > 0 && totalPaid > 0 ? totalPaid / (totalViews / 1000) : null

    // ---- Community health ----
    const active = realCreators.filter((p) => p.status === 'active')
    const pendingReview = realCreators.filter((p) => p.status === 'pending' && p.onboarded)
    const notCompleted = realCreators.filter((p) => p.status === 'pending' && !p.onboarded)
    const submittedIds = new Set(submissions.map((s) => s.creator_id))
    const participating = active.filter((p) => submittedIds.has(p.id)).length
    const participationRate = active.length ? Math.round((participating / active.length) * 100) : 0

    // ---- Application funnel ----
    const funnel = [
      { label: 'Signed up', count: realCreators.length, to: '/admin/creators' },
      { label: 'Completed their profile', count: realCreators.filter((p) => p.onboarded).length, to: '/admin/creators' },
      { label: 'Approved', count: active.length, to: '/admin/applications' },
      { label: 'Posted a video', count: participating, to: null },
    ]

    // ---- Engagement ----
    const openFeedback = feedback.filter((f) => f.status === 'new').length

    // Top referrers: who has the most creators joined via their link.
    const refCounts = {}
    for (const p of realCreators) if (p.referred_by) refCounts[p.referred_by] = (refCounts[p.referred_by] || 0) + 1
    const topReferrers = Object.entries(refCounts)
      .map(([id, count]) => ({ name: nameById[id] || 'Unknown', count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    return {
      growth, momentum, perChallenge, perChallengeRecent, mostActive, chat,
      totalPaid, totalViews, verifiedViews, costPer1k, funnel,
      engagement: { reactions: reactionCount, pollVotes: pollVoteCount, chatMessages: messages.length, feedbackTotal: feedback.length, openFeedback },
      community: { active: active.length, pendingReview: pendingReview.length, notCompleted: notCompleted.length, participating, participationRate, topReferrers },
      totals: {
        creators: active.length,
        submissions: submissions.length,
        challenges: challenges.length,
      },
    }
  }, [raw])

  if (!derived) {
    return (
      <div className="page space-y-6">
        <Skeleton className="h-10 w-72" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4"><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /></div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2"><Skeleton className="h-80" /><Skeleton className="h-80" /></div>
      </div>
    )
  }

  return (
    <div className="page">
      <PageHeader title="Analytics" subtitle="The program's pulse: growth, output, reach and spend." />

      {/* ---- Headline numbers ---- */}
      <div className="mb-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Creators" value={derived.totals.creators} onClick={() => navigate('/admin/creators')} />
        <StatCard label="Challenges run" value={derived.totals.challenges} onClick={() => navigate('/admin/challenges')} />
        <StatCard label="Submissions" value={derived.totals.submissions} />
        <StatCard
          label="Total views"
          value={formatViews(derived.totalViews)}
          hint={derived.verifiedViews > 0 ? `${formatViews(derived.verifiedViews)} verified` : 'logged by creators'}
        />
        <StatCard label="Prize money paid" value={formatMoney(derived.totalPaid)} accent onClick={() => navigate('/admin/rewards')} />
        <StatCard
          label="Cost per 1K views"
          value={derived.costPer1k != null ? formatMoney(derived.costPer1k) : '·'}
          hint="prize spend per 1,000 views"
        />
      </div>

      {/* ---- Funnel + community health ---- */}
      <div className="mb-10 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="card">
          <h2 className="mb-1 font-semibold">Application funnel</h2>
          <p className="mb-6 text-xs text-smoke">From sign-up to first video · tap a stage to manage it</p>
          <Funnel
            stages={derived.funnel.map((s) => ({
              label: s.label, count: s.count,
              onClick: s.to ? () => navigate(s.to) : undefined,
            }))}
          />
        </section>

        <section className="card">
          <h2 className="mb-1 font-semibold">Community health</h2>
          <p className="mb-6 text-xs text-smoke">Tap a tile to jump straight to the right page</p>
          <div className="grid grid-cols-2 gap-4">
            <StatCard label="Active members" value={derived.community.active} accent onClick={() => navigate('/admin/creators')} />
            <StatCard label="Awaiting review" value={derived.community.pendingReview} onClick={() => navigate('/admin/applications')} />
            <StatCard label="Incomplete signups" value={derived.community.notCompleted} onClick={() => navigate('/admin/creators')} />
            <StatCard label="Participation" value={`${derived.community.participationRate}%`} hint={`${derived.community.participating} have submitted`} />
          </div>
        </section>
      </div>

      {/* ---- Engagement snapshot ---- */}
      <div className="mb-10">
        <h2 className="mb-4 text-lg font-semibold">Engagement</h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Chat messages" value={derived.engagement.chatMessages} />
          <StatCard label="Reactions" value={derived.engagement.reactions} />
          <StatCard label="Poll votes" value={derived.engagement.pollVotes} />
          <StatCard
            label="Feedback"
            value={derived.engagement.feedbackTotal}
            hint={derived.engagement.openFeedback > 0 ? `${derived.engagement.openFeedback} awaiting triage` : 'all triaged'}
            onClick={() => navigate('/admin/feedback')}
          />
        </div>
        {derived.community.topReferrers.length > 0 && (
          <div className="mt-4 rounded-card border border-gray-100 p-5 shadow-card">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold">Top referrers</p>
              <button onClick={() => navigate('/admin/referrals')} className="btn-ghost !py-1 !px-2 text-xs">All referrals</button>
            </div>
            <div className="space-y-2">
              {derived.community.topReferrers.map((r, i) => (
                <div key={r.name + i} className="flex items-center justify-between text-sm">
                  <span className="text-smoke">{i + 1}. {r.name}</span>
                  <span className="font-semibold">{r.count} joined</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard
          title="Creator growth"
          subtitle="New sign-ups per month (bars) and running total (line)"
          onExport={() => downloadCsv('creator-growth.csv', derived.growth.map(({ month, newCreators, creators }) => ({ month, new_signups: newCreators, cumulative: creators })))}
        >
          <ResponsiveContainer>
            <ComposedChart data={derived.growth} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F1F2" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#6B7280' }} />
              <YAxis tick={{ fontSize: 11, fill: '#6B7280' }} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(217,68,7,0.06)' }} />
              <Bar dataKey="newCreators" name="New sign-ups" fill={BRAND_LIGHT} radius={[8, 8, 0, 0]} maxBarSize={32} />
              <Line type="monotone" dataKey="creators" name="Total creators" stroke={BRAND} strokeWidth={2.5} dot={{ fill: BRAND, r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Submission momentum"
          subtitle="Videos submitted per month"
          onExport={() => downloadCsv('submission-momentum.csv', derived.momentum)}
        >
          <ResponsiveContainer>
            <LineChart data={derived.momentum} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F1F2" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#6B7280' }} />
              <YAxis tick={{ fontSize: 11, fill: '#6B7280' }} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(217,68,7,0.06)' }} />
              <Line type="monotone" dataKey="submissions" name="Submissions" stroke={BRAND} strokeWidth={2.5} dot={{ fill: BRAND, r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Submissions per challenge"
          subtitle="Recent challenges · tap a bar for the full breakdown"
          onExport={() => downloadCsv('submissions-per-challenge.csv', derived.perChallenge.map(({ fullTitle, submissions }) => ({ challenge: fullTitle, submissions })))}
        >
          <ResponsiveContainer>
            <BarChart data={derived.perChallengeRecent} onClick={openChallenge} style={{ cursor: 'pointer' }} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
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
          subtitle="Total (orange) and average per entry (light) · tap a bar"
          onExport={() => downloadCsv('views-per-challenge.csv', derived.perChallenge.map(({ fullTitle, totalViews, avgViews }) => ({ challenge: fullTitle, total_views: totalViews, avg_views: avgViews })))}
        >
          <ResponsiveContainer>
            <BarChart data={derived.perChallengeRecent} onClick={openChallenge} style={{ cursor: 'pointer' }} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
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
          subtitle="Recent challenges · tap a bar for the full breakdown"
          onExport={() => downloadCsv('prizes-per-challenge.csv', derived.perChallenge.map(({ fullTitle, prizesPaid }) => ({ challenge: fullTitle, prizes_paid_gbp: prizesPaid })))}
        >
          <ResponsiveContainer>
            <BarChart data={derived.perChallengeRecent} onClick={openChallenge} style={{ cursor: 'pointer' }} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
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

      {/* ---------- All challenges (clickable, scales to any number) ---------- */}
      <section className="mt-10">
        <h2 className="mb-4 text-lg font-semibold">All challenges</h2>
        <p className="mb-4 text-sm text-smoke">Tap any challenge for a full performance breakdown.</p>
        <div className="overflow-hidden rounded-card border border-gray-100 shadow-card">
          {/* Header row (hidden on mobile) */}
          <div className="hidden grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-3 border-b border-gray-100 bg-cloud/60 px-5 py-3 text-xs font-semibold text-smoke sm:grid">
            <span>Challenge</span><span className="text-right">Creators</span><span className="text-right">Entries</span><span className="text-right">Total views</span><span className="text-right">Paid out</span>
          </div>
          {[...derived.perChallenge].reverse().map((c) => (
            <button
              key={c.id}
              onClick={() => navigate(`/admin/analytics/${c.id}`)}
              className="grid w-full grid-cols-2 items-center gap-3 border-b border-gray-50 px-5 py-4 text-left transition-colors last:border-0 hover:bg-cloud/60 sm:grid-cols-[2fr_1fr_1fr_1fr_1fr]"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{c.fullTitle}</span>
                <span className="text-xs capitalize text-smoke">{c.status}</span>
              </span>
              <span className="text-right text-sm tabular-nums sm:block"><span className="text-xs text-smoke sm:hidden">Creators </span>{c.creators}</span>
              <span className="hidden text-right text-sm tabular-nums sm:block">{c.submissions}</span>
              <span className="hidden text-right text-sm tabular-nums sm:block">{formatViews(c.totalViews)}</span>
              <span className="hidden text-right text-sm font-medium tabular-nums sm:block">{formatMoney(c.prizesPaid)}</span>
            </button>
          ))}
          {derived.perChallenge.length === 0 && <p className="px-5 py-10 text-center text-sm text-smoke">No challenges yet.</p>}
        </div>
      </section>
    </div>
  )
}
