import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Avatar, EmptyState, PageHeader, Skeleton } from '../components/ui'
import Icon from '../components/Icon'
import { cx } from '../lib/utils'

// All-time leaderboard: active creators ranked by total challenge views, with
// wins and entries. Built from the results table (admin-logged final views).
export default function Leaderboard() {
  const [rows, setRows] = useState(null)

  useEffect(() => {
    async function load() {
      const { data: results } = await supabase
        .from('results')
        .select('creator_id, final_views, rank, profiles:creator_id(id, name, photo_url, status, deletion_requested_at, is_admin)')
      const byCreator = new Map()
      for (const r of results ?? []) {
        const p = r.profiles
        if (!p || p.status !== 'active' || p.deletion_requested_at || p.is_admin) continue
        const e = byCreator.get(p.id) || { id: p.id, name: p.name, photo_url: p.photo_url, views: 0, entries: 0, wins: 0 }
        e.views += r.final_views || 0
        e.entries += 1
        if (r.rank === 1) e.wins += 1
        byCreator.set(p.id, e)
      }
      setRows([...byCreator.values()].sort((a, b) => b.views - a.views || b.wins - a.wins))
    }
    load()
  }, [])

  const medal = ['from-amber-400 to-yellow-500', 'from-gray-300 to-gray-400', 'from-amber-600 to-amber-700']

  return (
    <div className="page max-w-3xl">
      <PageHeader title="All-time leaderboard" subtitle="The community's top creators by total challenge views." />

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
              <div
                className={cx(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold',
                  i < 3 ? `bg-gradient-to-br ${medal[i]} text-white shadow-card` : 'bg-cloud text-smoke'
                )}
              >
                {i + 1}
              </div>
              <Avatar src={c.photo_url} name={c.name} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{c.name}</p>
                <p className="text-xs text-smoke">
                  {c.entries} {c.entries === 1 ? 'entry' : 'entries'}{c.wins > 0 && ` · ${c.wins} ${c.wins === 1 ? 'win' : 'wins'} 🏆`}
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
