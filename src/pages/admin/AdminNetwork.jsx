import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { PageHeader, StatCard, Skeleton, Avatar, EmptyState } from '../../components/ui'
import Icon from '../../components/Icon'
import { timeAgo } from '../../lib/utils'

// Admin view of how the community is connecting: totals, the most-connected
// creators, and the latest links formed. Replies to a first DM auto-connect, so
// this doubles as a picture of who's actually talking to whom.
export default function AdminNetwork() {
  const [data, setData] = useState(null)

  useEffect(() => {
    async function load() {
      const { data: conns } = await supabase
        .from('connections')
        .select('creator_id, connected_creator_id, status, created_at')
        .order('created_at', { ascending: false })
      const accepted = (conns ?? []).filter((c) => c.status === 'accepted')
      const pending = (conns ?? []).filter((c) => c.status === 'pending').length
      const ids = [...new Set(accepted.flatMap((c) => [c.creator_id, c.connected_creator_id]))]
      const { data: profs } = ids.length
        ? await supabase.from('profiles').select('id, name, photo_url, is_test, is_admin').in('id', ids)
        : { data: [] }
      const profById = Object.fromEntries((profs ?? []).map((p) => [p.id, p]))
      setData({ accepted, pending, profById })
    }
    load()
  }, [])

  const derived = useMemo(() => {
    if (!data) return null
    const { accepted, profById } = data
    // Connection degree per (non-test) creator.
    const degree = new Map()
    let realEdges = 0
    for (const c of accepted) {
      const a = profById[c.creator_id]
      const b = profById[c.connected_creator_id]
      if (a?.is_test || b?.is_test) continue
      realEdges++
      degree.set(c.creator_id, (degree.get(c.creator_id) || 0) + 1)
      degree.set(c.connected_creator_id, (degree.get(c.connected_creator_id) || 0) + 1)
    }
    const ranked = [...degree.entries()]
      .map(([id, count]) => ({ ...profById[id], id, count }))
      .filter((p) => p.name)
      .sort((a, b) => b.count - a.count)
    const connectedPeople = ranked.length
    const recent = accepted
      .filter((c) => !profById[c.creator_id]?.is_test && !profById[c.connected_creator_id]?.is_test)
      .slice(0, 12)
    const maxDegree = ranked[0]?.count || 1
    return { realEdges, connectedPeople, ranked: ranked.slice(0, 10), recent, maxDegree }
  }, [data])

  if (!derived) {
    return (
      <div className="page space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3"><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /></div>
      </div>
    )
  }

  const avgPerPerson = derived.connectedPeople ? (derived.realEdges * 2 / derived.connectedPeople).toFixed(1) : '0'

  return (
    <div className="page">
      <PageHeader title="Community network" subtitle="How creators are connecting - totals, the best-connected members, and the latest links." />

      <div className="mb-10 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Connections" value={derived.realEdges} hint="accepted links" />
        <StatCard label="Connected creators" value={derived.connectedPeople} />
        <StatCard label="Avg per creator" value={avgPerPerson} />
        <StatCard label="Pending requests" value={data.pending} accent />
      </div>

      {derived.realEdges === 0 ? (
        <EmptyState icon={<Icon name="users" className="h-7 w-7" />} title="No connections yet" hint="As creators connect and reply to each other, the network will show up here." />
      ) : (
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
          {/* Most connected */}
          <section>
            <h2 className="mb-4 text-lg font-semibold">Most connected</h2>
            <div className="space-y-3">
              {derived.ranked.map((p, i) => (
                <Link key={p.id} to={`/profile/${p.id}`} className="flex items-center gap-3 rounded-card border border-gray-100 p-3 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-lift">
                  <span className="w-5 text-center text-sm font-bold text-smoke">{i + 1}</span>
                  <Avatar src={p.photo_url} name={p.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{p.name}{p.is_admin && <span className="ml-1 text-xs font-normal text-smoke">· Tryp.com</span>}</p>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-cloud">
                      <div className="h-full rounded-full bg-gradient-to-r from-brand to-brand-light" style={{ width: `${(p.count / derived.maxDegree) * 100}%` }} />
                    </div>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">{p.count}</span>
                </Link>
              ))}
            </div>
          </section>

          {/* Recent links */}
          <section>
            <h2 className="mb-4 text-lg font-semibold">Recent connections</h2>
            <div className="overflow-hidden rounded-card border border-gray-100 shadow-card">
              {derived.recent.map((c, i) => {
                const a = data.profById[c.creator_id]
                const b = data.profById[c.connected_creator_id]
                return (
                  <div key={i} className="flex items-center justify-between gap-3 border-b border-gray-50 px-4 py-3 last:border-0">
                    <div className="flex min-w-0 items-center gap-2 text-sm">
                      <span className="truncate font-medium">{a?.name}</span>
                      <Icon name="users" className="h-3.5 w-3.5 shrink-0 text-brand" />
                      <span className="truncate font-medium">{b?.name}</span>
                    </div>
                    <span className="shrink-0 text-xs text-smoke">{timeAgo(c.created_at)}</span>
                  </div>
                )
              })}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
