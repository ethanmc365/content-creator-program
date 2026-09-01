import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { supabase } from '../../lib/supabase'
import { Avatar, PageHeader, Skeleton, StatCard } from '../../components/ui'
import PlatformBadges from '../../components/PlatformBadges'
import { formatViews, formatMoney, formatDate, formatDateTimeTz, downloadCsv } from '../../lib/utils'
import { compareBoards, prizeForGroup } from '../../lib/challengeGroups'

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
      const [{ data: challenge }, { data: subs }, { data: results }, { data: rewards }, { count: totalCreators },
        { data: groups }, { data: groupMembers }] =
        await Promise.all([
          supabase.from('challenges').select('*').eq('id', id).single(),
          supabase.from('submissions').select('*, profiles:creator_id(id, name, photo_url, instagram_url, tiktok_url, youtube_url, facebook_url)').eq('challenge_id', id).order('logged_views', { ascending: false, nullsFirst: false }),
          supabase.from('results').select('*, profiles:creator_id(id, name, photo_url)').eq('challenge_id', id).order('rank'),
          supabase.from('rewards').select('*').eq('challenge_id', id),
          supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'active').eq('is_admin', false).is('deletion_requested_at', null),
          supabase.from('challenge_groups').select('*').eq('challenge_id', id).order('position'),
          supabase.from('challenge_group_members').select('group_id, creator_id').eq('challenge_id', id),
        ])
      setRaw({
        challenge, subs: subs ?? [], results: results ?? [], rewards: rewards ?? [],
        totalCreators: totalCreators ?? 0,
        groups: groups ?? [], groupMembers: groupMembers ?? [],
      })
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

  const { challenge, subs, results, groups, groupMembers } = raw

  // THE COMBINED FIGURE IS THE ONE ON THE TILES; THE GROUPS ARE UNDERNEATH.
  //
  // Ethan: "the analytics page should combine the data as just the one
  // challenge, but clicking in on the challenge data should reveal more data
  // and analytics from the different groups and comparing each."
  //
  // This page IS the click-in - the main analytics page lists challenges and
  // this is what opens - so the split belongs here rather than in a third
  // screen. The tiles above stay exactly as they are, because a challenge run
  // in two halves produced one challenge's worth of reach and that is the
  // number the programme is measured on. `compareBoards` derives both from the
  // same rows, so they cannot disagree. */
  const { rows: boardRows } = compareBoards(groups, groupMembers, subs)
  const memberCount = new Map()
  for (const m of groupMembers) memberCount.set(m.group_id, (memberCount.get(m.group_id) || 0) + 1)

  // The saved results, split the same way. `results.group_id` is written by
  // `rebuild_challenge_results`, so this reads the board a row was actually
  // ranked on rather than re-deriving it from the membership - a creator moved
  // between groups after the board was built belongs where they were ranked.
  const resultBoards = groups.length > 0
    ? [...groups, { id: null, name: 'Not in a group' }]
      .map((g) => ({ group: g, rows: results.filter((r) => (r.group_id ?? null) === g.id) }))
      .filter((b) => b.rows.length > 0)
    : [{ group: null, rows: results }]

  function exportSubs() {
    downloadCsv(`${challenge.title}-submissions.csv`, subs.map((s) => ({
      creator: s.profiles?.name ?? '', platform: s.platform, logged_views: s.logged_views ?? '',
      video_url: s.video_url, submitted: formatDateTimeTz(s.submitted_at),
    })))
  }

  return (
    <div className="page">
      <Link to="/admin/analytics" className="mb-6 inline-block text-sm font-medium text-smoke hover:text-brand">← Back to analytics</Link>

      <PageHeader
        back={{ to: '/admin/analytics', label: 'Analytics' }}
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

      {/* ---------- The groups, compared ---------- */}
      {boardRows.length > 0 && (
        <section className="card mb-10">
          <h2 className="mb-1 font-semibold">The {boardRows.length} leaderboards, compared</h2>
          <p className="mb-5 text-sm text-smoke">
            Every figure above is this challenge as a whole. These are the same numbers
            split by group, and they add back up to it.
          </p>
          <div className="-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
            <table className="w-full min-w-[44rem] text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-[11px] font-semibold uppercase tracking-wide text-smoke">
                  <th className="py-2 pr-4">Group</th>
                  <th className="py-2 pr-4 text-right">In the group</th>
                  <th className="py-2 pr-4 text-right">Entered</th>
                  <th className="py-2 pr-4 text-right">Entries</th>
                  <th className="py-2 pr-4 text-right">Views</th>
                  <th className="py-2 pr-4 text-right">Per entry</th>
                  <th className="py-2 pr-4 text-right">Best video</th>
                  <th className="py-2 text-right">Share</th>
                </tr>
              </thead>
              <tbody>
                {boardRows.map((r) => {
                  const g = groups.find((x) => x.id === r.id)
                  const inGroup = memberCount.get(r.id) || 0
                  const prize = g ? prizeForGroup(g, challenge) : null
                  return (
                    <tr key={r.id ?? 'ungrouped'} className="border-b border-gray-50 last:border-0">
                      <td className="py-3 pr-4">
                        <span className="font-semibold">{r.name}</span>
                        {prize?.prize_amount != null && (
                          <span className="ml-2 text-xs text-smoke">
                            {formatMoney(prize.prize_amount, prize.prize_currency)}
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-right tabular-nums text-smoke">{inGroup || '-'}</td>
                      {/* ENTERED, NOT PARTICIPATION - the percentage is the one
                          number worth comparing between two groups of different
                          sizes, and it is meaningless without the denominator
                          beside it, which is why both columns are here. */}
                      <td className="py-3 pr-4 text-right tabular-nums">
                        {r.creators}
                        {inGroup > 0 && (
                          <span className="ml-1 text-xs text-smoke">({Math.round((r.creators / inGroup) * 100)}%)</span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-right tabular-nums">{r.entries}</td>
                      <td className="py-3 pr-4 text-right font-semibold tabular-nums text-brand">{formatViews(r.views)}</td>
                      <td className="py-3 pr-4 text-right tabular-nums">{formatViews(r.perEntry)}</td>
                      <td className="py-3 pr-4 text-right tabular-nums">{formatViews(r.best)}</td>
                      <td className="py-3 text-right">
                        <span className="inline-flex items-center gap-2">
                          <span className="h-1.5 w-16 overflow-hidden rounded-full bg-cloud">
                            <span className="block h-full rounded-full bg-brand" style={{ width: `${r.share}%` }} />
                          </span>
                          <span className="w-9 text-right tabular-nums text-smoke">{r.share}%</span>
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

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
          <h2 className="mb-4 text-lg font-semibold">
            {resultBoards.length > 1 ? 'Final leaderboards' : 'Final leaderboard'}
          </h2>
          {/* ONE LIST PER BOARD.
              Ranks are stored per group (migration 154), so a flat list of a
              two-group challenge's results reads 1, 1, 2 - three rows with two
              gold medals and no explanation. They are separate contests and
              they have to be drawn as separate lists. A challenge with no
              groups produces exactly one list, which is what was here. */}
          <div className="space-y-6">
            {resultBoards.map(({ group, rows }) => (
              <div key={group?.id ?? 'all'}>
                {group && (
                  <p className="mb-2 text-sm font-semibold text-brand">{group.name}</p>
                )}
                <div className="overflow-hidden rounded-card border border-gray-100 shadow-card">
                  {rows.map((r) => (
                    <Link key={r.id} to={`/profile/${r.profiles?.id}`} className="flex items-center gap-4 border-b border-gray-50 px-5 py-3 transition-colors last:border-0 hover:bg-cloud/60 sm:px-7">
                      <span className="w-8 text-center text-lg font-bold">{{ 1: '🥇', 2: '🥈', 3: '🥉' }[r.rank] || r.rank}</span>
                      <Avatar src={r.profiles?.photo_url} name={r.profiles?.name} size="sm" />
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{r.profiles?.name}</span>
                      <span className="text-sm font-bold tabular-nums">{formatViews(r.final_views)}</span>
                    </Link>
                  ))}
                </div>
              </div>
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
                  <p className="text-xs text-smoke">{formatDateTimeTz(s.submitted_at)}</p>
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
