import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { supabase } from '../../lib/supabase'
import { Avatar, PageHeader, Skeleton, StatCard } from '../../components/ui'
import PlatformBadges from '../../components/PlatformBadges'
import { formatViews, formatMoney, formatDate, downloadCsv } from '../../lib/utils'

// Deep-dive analytics for ONE challenge (admin only).
// Reached by tapping a bar/row on the main Analytics page.
const BRAND = '#d94407'
const BRAND_LIGHT = '#f5853f'
const tooltipStyle = {
  borderRadius: 12, border: '1px solid #F1F1F2', fontFamily: 'Poppins',
  fontSize: 12, boxShadow: '0 4px 16px rgba(26,26,26,0.08)',
}
const PLATFORM_COLORS = { Instagram: '#d94407', TikTok: '#1A1A1A', YouTube: '#f5853f', Other: '#9CA3AF' }

export default function AdminChallengeAnalytics() {
  const { id } = useParams()
  const [raw, setRaw] = useState(null)

  useEffect(() => {
    async function load() {
      const [{ data: challenge }, { data: subs }, { data: results }, { data: rewards }, { count: totalCreators }] =
        await Promise.all([
          supabase.from('challenges').select('*').eq('id', id).single(),
          supabase.from('submissions').select('*, profiles:creator_id(id, name, photo_url, instagram_url, tiktok_url, youtube_url)').eq('challenge_id', id).order('logged_views', { ascending: false, nullsFirst: false }),
          supabase.from('results').select('*, profiles:creator_id(id, name, photo_url)').eq('challenge_id', id).order('rank'),
          supabase.from('rewards').select('*').eq('challenge_id', id),
          supabase.from('profiles').select('id', { count: 'exact', head: true }),
        ])
      setRaw({ challenge, subs: subs ?? [], results: results ?? [], rewards: rewards ?? [], totalCreators: totalCreators ?? 0 })
    }
    load()
  }, [id])

  const d = useMemo(() => {
    if (!raw) return null
    const { subs, rewards, totalCreators } = raw
    const viewed = subs.filter((s) => s.logged_views != null).map((s) => s.logged_views).sort((a, b) => a - b)
    const totalViews = viewed.reduce((a, b) => a + b, 0)
    const uniqueCreators = new Set(subs.map((s) => s.creator_id)).size

    // Per-platform breakdown.
    const platforms = ['Instagram', 'TikTok', 'YouTube', 'Other'].map((p) => {
      const ps = subs.filter((s) => s.platform === p)
      return {
        name: p,
        entries: ps.length,
        views: ps.reduce((sum, s) => sum + (s.logged_views || 0), 0),
      }
    }).filter((p) => p.entries > 0)

    const median = viewed.length ? viewed[Math.floor(viewed.length / 2)] : 0

    return {
      submissions: subs.length,
      uniqueCreators,
      participation: totalCreators ? Math.round((uniqueCreators / totalCreators) * 100) : 0,
      totalViews,
      avgViews: viewed.length ? Math.round(totalViews / viewed.length) : 0,
      medianViews: median,
      topViews: viewed.length ? viewed[viewed.length - 1] : 0,
      platforms,
      prizesPaid: rewards.filter((r) => r.status === 'distributed').reduce((s, r) => s + Number(r.amount), 0),
      prizesPending: rewards.filter((r) => r.status === 'pending').reduce((s, r) => s + Number(r.amount), 0),
    }
  }, [raw])

  if (!raw || !d) {
    return <div className="page space-y-6"><Skeleton className="h-10 w-72" /><div className="grid grid-cols-1 gap-4 sm:grid-cols-4"><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /></div><Skeleton className="h-72 w-full" /></div>
  }

  const { challenge, subs, results } = raw

  function exportSubs() {
    downloadCsv(`${challenge.title}-submissions.csv`, subs.map((s) => ({
      creator: s.profiles?.name ?? '', platform: s.platform, logged_views: s.logged_views ?? '',
      video_url: s.video_url, submitted: formatDate(s.submitted_at),
    })))
  }

  return (
    <div className="page">
      <Link to="/admin/analytics" className="mb-6 inline-block text-sm font-medium text-smoke hover:text-brand">← Back to analytics</Link>

      <PageHeader
        title={challenge.title}
        subtitle={`${formatDate(challenge.start_date)} → ${formatDate(challenge.end_date)} · ${challenge.status}`}
        action={
          <div className="flex gap-2">
            <Link to={`/challenges/${id}`} className="btn-secondary !py-2 text-xs">Challenge page</Link>
            <button onClick={exportSubs} className="btn-secondary !py-2 text-xs">Export CSV ↓</button>
          </div>
        }
      />

      {/* ---------- Headline stats ---------- */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Entries" value={d.submissions} hint={`${d.uniqueCreators} creators`} />
        <StatCard label="Participation" value={`${d.participation}%`} hint="of all creators" />
        <StatCard label="Total views" value={formatViews(d.totalViews)} accent />
        <StatCard label="Prize money paid" value={formatMoney(d.prizesPaid)} hint={d.prizesPending ? `${formatMoney(d.prizesPending)} pending` : 'all settled'} />
      </div>
      <div className="mb-10 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Avg views / entry" value={formatViews(d.avgViews)} />
        <StatCard label="Median views" value={formatViews(d.medianViews)} />
        <StatCard label="Top entry" value={formatViews(d.topViews)} />
        <StatCard label="Reviewed" value={`${subs.filter((s) => s.logged_views != null).length}/${d.submissions}`} hint="views logged" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* ---------- Platform breakdown ---------- */}
        <section className="card">
          <h2 className="mb-6 font-semibold">Entries by platform</h2>
          <div className="h-56">
            {d.platforms.length === 0 ? (
              <p className="flex h-full items-center justify-center text-sm text-smoke">No entries yet.</p>
            ) : (
              <ResponsiveContainer>
                <BarChart data={d.platforms} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F1F2" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#6B7280' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#6B7280' }} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(217,68,7,0.06)' }} />
                  <Bar dataKey="entries" radius={[8, 8, 0, 0]} maxBarSize={56}>
                    {d.platforms.map((p) => <Cell key={p.name} fill={PLATFORM_COLORS[p.name] || BRAND} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        {/* ---------- Views by platform ---------- */}
        <section className="card">
          <h2 className="mb-6 font-semibold">Views by platform</h2>
          <div className="h-56">
            {d.platforms.length === 0 ? (
              <p className="flex h-full items-center justify-center text-sm text-smoke">No views logged yet.</p>
            ) : (
              <ResponsiveContainer>
                <BarChart data={d.platforms} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F1F2" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#6B7280' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#6B7280' }} tickFormatter={formatViews} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(217,68,7,0.06)' }} formatter={(v) => formatViews(v)} />
                  <Bar dataKey="views" fill={BRAND_LIGHT} radius={[8, 8, 0, 0]} maxBarSize={56} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>
      </div>

      {/* ---------- Leaderboard ---------- */}
      {results.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-4 text-lg font-semibold">Final leaderboard</h2>
          <div className="overflow-hidden rounded-card border border-gray-100 shadow-card">
            {results.map((r) => (
              <Link key={r.id} to={`/profile/${r.profiles?.id}`} className="flex items-center gap-4 border-b border-gray-50 px-5 py-3 transition-colors last:border-0 hover:bg-cloud/60 sm:px-7">
                <span className="w-8 text-center text-lg font-bold">{{ 1: '🥇', 2: '🥈', 3: '🥉' }[r.rank] || r.rank}</span>
                <Avatar src={r.profiles?.photo_url} name={r.profiles?.name} size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{r.profiles?.name}</span>
                <span className="text-sm font-bold tabular-nums">{formatViews(r.final_views)}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ---------- All submissions ---------- */}
      <section className="mt-10">
        <h2 className="mb-4 text-lg font-semibold">All entries ({subs.length})</h2>
        {subs.length === 0 ? (
          <p className="rounded-card border border-dashed border-gray-200 px-5 py-10 text-center text-sm text-smoke">No entries for this challenge.</p>
        ) : (
          <div className="overflow-hidden rounded-card border border-gray-100 shadow-card">
            {subs.map((s) => (
              <div key={s.id} className="flex items-center gap-4 border-b border-gray-50 px-5 py-3 last:border-0 sm:px-7">
                <Avatar src={s.profiles?.photo_url} name={s.profiles?.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{s.profiles?.name}</p>
                  <p className="text-xs text-smoke">{formatDate(s.submitted_at)}</p>
                </div>
                <PlatformBadges platforms={[s.platform]} className="hidden sm:flex" />
                <span className="w-20 text-right text-sm tabular-nums">{s.logged_views != null ? formatViews(s.logged_views) : '-'}</span>
                <a href={s.video_url} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-brand hover:underline">Watch ↗</a>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
