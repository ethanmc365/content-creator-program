import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { fetchAll } from '../../../lib/fetchAll'
import { StatCard, Skeleton, Avatar } from '../../../components/ui'
import Icon from '../../../components/Icon'
import { timeAgo } from '../../../lib/utils'

// WHO IS CONNECTED TO WHOM, AS A SECTION OF COMMUNITY HEALTH (24 Sep 2026).
//
// Ethan: "I want the connections tab... to be combined into the community
// health and be a separate section there... that basically is community
// health." It was its own tab, `AdminNetwork`, and it also read the wrong
// clock: it dated and sorted connections by `created_at`, which is when the
// REQUEST was sent - so a link a new creator accepted this morning sat two
// weeks down "recent" saying "2 weeks ago". Migration 257 stamps
// `accepted_at`, and this reads it.
//
// Health, not a leaderboard of popularity: the numbers that matter are how
// many people are connected to NOBODY (the ones the community has not reached
// yet) and how many links were made this week (whether it is still moving).
//
// `market` is a community id, or '' for worldwide. A market's network is the
// graph between its own members; an edge with one end elsewhere is not one the
// market made.

const WEEK = 7 * 86400000

export default function ConnectionsSection({ market = '', memberRows = [] }) {
  const [data, setData] = useState(null)
  const [now] = useState(() => Date.now())

  const inMarket = useMemo(() => {
    if (!market) return null
    return new Set(memberRows.filter((r) => r.community_id === market).map((r) => r.profile_id))
  }, [market, memberRows])

  useEffect(() => {
    let alive = true
    Promise.all([
      fetchAll(() => supabase.from('connections')
        .select('id, creator_id, connected_creator_id, status, created_at, accepted_at')),
      fetchAll(() => supabase.from('profiles')
        .select('id, name, photo_url, is_test, is_admin, status, created_at')),
    ]).then(([{ data: conns }, { data: profs }]) => {
      if (!alive) return
      setData({ conns: conns ?? [], profById: Object.fromEntries((profs ?? []).map((p) => [p.id, p])) })
    }).catch(() => { if (alive) setData({ conns: [], profById: {}, failed: true }) })
    return () => { alive = false }
  }, [])

  const d = useMemo(() => {
    if (!data) return null
    const { profById } = data
    const real = (id) => {
      const p = profById[id]
      return p && !p.is_test && (!inMarket || inMarket.has(id))
    }
    const edges = data.conns.filter((c) => real(c.creator_id) && real(c.connected_creator_id))
    const accepted = edges.filter((c) => c.status === 'accepted')
    const pending = edges.filter((c) => c.status === 'pending').length
    const degree = new Map()
    for (const c of accepted) {
      degree.set(c.creator_id, (degree.get(c.creator_id) || 0) + 1)
      degree.set(c.connected_creator_id, (degree.get(c.connected_creator_id) || 0) + 1)
    }
    // Everybody who COULD be connected: approved creators in scope, not the team.
    const members = Object.values(profById).filter((p) => p.status === 'active' && !p.is_test && !p.is_admin
      && (!inMarket || inMarket.has(p.id)))
    const alone = members.filter((p) => !degree.has(p.id))
      .sort((a, b) => Date.parse(b.created_at || 0) - Date.parse(a.created_at || 0))
    const connectedMembers = members.length - alone.length
    const at = (c) => Date.parse(c.accepted_at || c.created_at)
    const thisWeek = accepted.filter((c) => now - at(c) < WEEK).length
    const lastWeek = accepted.filter((c) => now - at(c) >= WEEK && now - at(c) < 2 * WEEK).length
    const ranked = [...degree.entries()]
      .map(([id, count]) => ({ ...profById[id], id, count }))
      .filter((p) => p.name)
      .sort((a, b) => b.count - a.count)
    const recent = [...accepted].sort((a, b) => at(b) - at(a)).slice(0, 10)
    return {
      accepted: accepted.length, pending, thisWeek, lastWeek,
      members: members.length, connectedMembers, alone,
      ranked: ranked.slice(0, 8), maxDegree: ranked[0]?.count || 1,
      recent, avg: members.length ? (accepted.length * 2 / Math.max(1, ranked.length)).toFixed(1) : '0',
      at,
    }
  }, [data, inMarket, now])

  return (
    <section>
      <div className="mb-4">
        <h2 className="text-lg font-semibold">Connections</h2>
        <p className="mt-1 text-xs text-smoke">
          Who has connected with whom. A reply to a first DM connects two people too, so this is a picture of who is actually talking.
        </p>
      </div>

      {!d ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}
        </div>
      ) : (
        <>
          <div className="grid auto-rows-fr grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              label="New this week"
              value={d.thisWeek}
              hint={d.lastWeek ? `${d.lastWeek} the week before` : 'accepted in the last 7 days'}
              accent
            />
            <StatCard label="Connections" value={d.accepted} hint={`${d.pending} requests waiting`} />
            <StatCard
              label="Creators connected"
              value={`${d.connectedMembers} of ${d.members}`}
              hint={d.members ? `${Math.round((d.connectedMembers / d.members) * 100)}% have at least one` : ''}
            />
            <StatCard label="Not connected yet" value={d.alone.length} hint="approved, connected to nobody" />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="card !p-0 overflow-hidden">
              <p className="border-b border-gray-100 px-5 py-3.5 text-sm font-semibold">Recently connected</p>
              {d.recent.length === 0 ? (
                <p className="px-5 py-6 text-sm text-smoke">No connections yet.</p>
              ) : (
                <ul className="divide-y divide-gray-50">
                  {d.recent.map((c) => {
                    const a = data.profById[c.creator_id]
                    const b = data.profById[c.connected_creator_id]
                    return (
                      <li key={c.id} className="flex items-center gap-3 px-5 py-2.5">
                        <span className="flex shrink-0 -space-x-2">
                          <Avatar src={a?.photo_url} name={a?.name} size="xs" className="ring-2 ring-white" />
                          <Avatar src={b?.photo_url} name={b?.name} size="xs" className="ring-2 ring-white" />
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm">
                          <Link to={`/profile/${a?.id}`} className="font-semibold hover:text-brand">{a?.name?.split(' ')[0]}</Link>
                          <span className="text-smoke"> and </span>
                          <Link to={`/profile/${b?.id}`} className="font-semibold hover:text-brand">{b?.name?.split(' ')[0]}</Link>
                        </span>
                        <span className="shrink-0 text-xs text-smoke">{timeAgo(new Date(d.at(c)).toISOString())}</span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            <div className="card !p-0 overflow-hidden">
              <p className="border-b border-gray-100 px-5 py-3.5 text-sm font-semibold">Most connected</p>
              <ul className="divide-y divide-gray-50">
                {d.ranked.map((p, i) => (
                  <li key={p.id}>
                    <Link to={`/profile/${p.id}`} className="flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-cloud/50">
                      <span className="w-4 shrink-0 text-center text-xs font-bold tabular-nums text-smoke">{i + 1}</span>
                      <Avatar src={p.photo_url} name={p.name} size="xs" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">
                          {p.name}{p.is_admin && <span className="ml-1 text-xs font-normal text-smoke">· Tryp.com</span>}
                        </span>
                        <span className="mt-1 block h-1 overflow-hidden rounded-full bg-cloud">
                          <span className="block h-full rounded-full bg-brand" style={{ width: `${(p.count / d.maxDegree) * 100}%` }} />
                        </span>
                      </span>
                      <span className="shrink-0 text-sm font-bold tabular-nums">{p.count}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* THE ONES TO INTRODUCE. The most useful list here: an approved
              creator with no connections at all is the one a warm hello from
              the team (or an introduction to someone nearby) helps most. */}
          {d.alone.length > 0 && (
            <details className="mt-4 rounded-card border border-gray-100 shadow-card">
              <summary className="flex cursor-pointer items-center gap-2 px-5 py-3 text-sm font-semibold">
                <Icon name="users" className="h-4 w-4 text-brand" />
                Not connected to anyone yet
                <span className="text-xs font-normal text-smoke">({d.alone.length}, newest first)</span>
              </summary>
              <div className="grid max-h-80 grid-cols-1 gap-x-4 overflow-y-auto overscroll-contain border-t border-gray-100 px-5 py-2 sm:grid-cols-2">
                {d.alone.map((p) => (
                  <Link key={p.id} to={`/messages?to=${p.id}`} className="flex items-center gap-3 py-2 text-sm hover:text-brand">
                    <Avatar src={p.photo_url} name={p.name} size="xs" />
                    <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    <span className="shrink-0 text-xs text-smoke">Say hello</span>
                  </Link>
                ))}
              </div>
            </details>
          )}
        </>
      )}
    </section>
  )
}
