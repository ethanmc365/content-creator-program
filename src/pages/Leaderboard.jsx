import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Avatar, EmptyState, PageHeader, Skeleton } from '../components/ui'
import Icon from '../components/Icon'
import RankBadge from '../components/RankBadge'

// All-time leaderboard: active creators ranked by their TOTAL views across every
// video they have ever posted, in every challenge.
//
// This used to read the `results` table, which holds one row per creator per
// challenge scored on their BEST entry, so someone who posted five strong videos
// in a challenge was credited with one of them. Views now come from
// `submissions.logged_views` (every video, every challenge) and the count under
// each name is their number of posts. Wins still come from `results` (rank 1).
export default function Leaderboard() {
  const [rows, setRows] = useState(null)

  const load = useCallback(async () => {
    const [{ data: subs }, { data: results }] = await Promise.all([
      supabase
        .from('submissions')
        .select('creator_id, logged_views, profiles:creator_id(id, name, photo_url, status, deletion_requested_at, is_admin, is_test)'),
      supabase.from('results').select('creator_id, rank'),
    ])

    const wins = new Map()
    for (const r of results ?? []) {
      if (r.rank === 1) wins.set(r.creator_id, (wins.get(r.creator_id) ?? 0) + 1)
    }

    const byCreator = new Map()
    for (const s of subs ?? []) {
      const p = s.profiles
      if (!p || p.status !== 'active' || p.deletion_requested_at || p.is_admin || p.is_test) continue
      const e = byCreator.get(p.id) || { id: p.id, name: p.name, photo_url: p.photo_url, views: 0, posts: 0 }
      e.views += s.logged_views || 0
      e.posts += 1
      byCreator.set(p.id, e)
    }

    const list = [...byCreator.values()].map((e) => ({ ...e, wins: wins.get(e.id) ?? 0 }))
    setRows(list.sort((a, b) => b.views - a.views || b.posts - a.posts || b.wins - a.wins))
  }, [])

  useEffect(() => { load() }, [load])

  // Views arrive on their own now (the hourly TikTok sync writes straight to
  // submissions.logged_views), so listen for those writes and re-rank in place
  // rather than making people refresh to see the board move.
  useEffect(() => {
    const channel = supabase
      .channel('leaderboard-submissions')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'submissions' }, () => load())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'submissions' }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [load])

  return (
    <div className="page max-w-3xl">
      <PageHeader
        title="All-time leaderboard"
        subtitle="Total views across every video posted, in every challenge."
      />

      {rows === null ? (
        <div className="space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : rows.length === 0 ? (
        <EmptyState icon={<Icon name="trophy" className="h-7 w-7" />} title="No results yet" hint="Once challenges are scored, the leaderboard fills up here." />
      ) : (
        <div className="overflow-hidden rounded-card border border-gray-100 shadow-card">
          {rows.map((c, i) => (
            <Link
              key={c.id}
              to={`/profile/${c.id}`}
              className="flex items-center gap-4 border-b border-gray-50 px-4 py-4 transition-colors last:border-0 hover:bg-cloud/60 sm:px-6"
            >
              {/* Top three get a brand rosette; everyone else a plain number chip. */}
              {i < 3 ? (
                <RankBadge place={i + 1} className="h-11 w-9" />
              ) : (
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cloud text-sm font-bold text-smoke">
                  {i + 1}
                </div>
              )}
              <Avatar src={c.photo_url} name={c.name} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{c.name}</p>
                <p className="text-xs text-smoke">
                  {c.posts} {c.posts === 1 ? 'post' : 'posts'}{c.wins > 0 && ` · ${c.wins} ${c.wins === 1 ? 'win' : 'wins'}`}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-brand">{c.views.toLocaleString()}</p>
                <p className="text-[11px] text-smoke">views</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
