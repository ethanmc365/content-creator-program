import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { loadRelationships } from '../lib/connections'
import ConnectButton from '../components/ConnectButton'
import { Avatar, EmptyState, PageHeader, Skeleton } from '../components/ui'
import Icon from '../components/Icon'

// Connections hub: incoming requests to accept, your connections, and people
// you might know (creators you've shared a challenge with).
export default function Connections() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [requests, setRequests] = useState(null)
  const [connections, setConnections] = useState([])
  const [suggestions, setSuggestions] = useState([])
  const [loaded, setLoaded] = useState(false)

  async function load() {
    const [{ data: reqRows }, { data: connRows }, rels] = await Promise.all([
      supabase.from('connections')
        .select('id, created_at, requester:creator_id(id, name, photo_url, bio)')
        .eq('connected_creator_id', user.id).eq('status', 'pending')
        .order('created_at', { ascending: false }),
      supabase.from('connections')
        .select('id, creator_id, connected_creator_id, a:creator_id(id, name, photo_url, bio), b:connected_creator_id(id, name, photo_url, bio)')
        .eq('status', 'accepted').or(`creator_id.eq.${user.id},connected_creator_id.eq.${user.id}`),
      loadRelationships(user.id),
    ])
    setRequests(reqRows ?? [])
    setConnections((connRows ?? []).map((r) => (r.creator_id === user.id ? r.b : r.a)).filter(Boolean))

    // Suggestions: EVERY active creator I'm not already connected to or pending
    // with. Creators I've shared a challenge with float to the top with a reason;
    // the rest fill in by how recently they joined. rels holds connected AND
    // pending, so nobody I've already actioned appears here.
    const { data: mySubs } = await supabase.from('submissions').select('challenge_id').eq('creator_id', user.id)
    const myChallengeIds = [...new Set((mySubs ?? []).map((s) => s.challenge_id))]
    const reasonByCreator = new Map()
    if (myChallengeIds.length) {
      const { data: shared } = await supabase.from('submissions')
        .select('creator_id, challenges(title)').in('challenge_id', myChallengeIds).neq('creator_id', user.id)
      for (const s of shared ?? []) if (!reasonByCreator.has(s.creator_id)) reasonByCreator.set(s.creator_id, s.challenges?.title)
    }
    const { data: profs } = await supabase.from('profiles')
      .select('id, name, photo_url, bio, created_at')
      .eq('status', 'active').eq('is_admin', false).eq('is_test', false).is('deletion_requested_at', null)
      .neq('id', user.id)
      .order('created_at', { ascending: false })
    const candidates = (profs ?? [])
      .filter((p) => !rels.has(p.id))
      .sort((a, b) => {
        const ra = reasonByCreator.has(a.id) ? 1 : 0
        const rb = reasonByCreator.has(b.id) ? 1 : 0
        if (ra !== rb) return rb - ra
        return new Date(b.created_at) - new Date(a.created_at)
      })
    setSuggestions(candidates.slice(0, 8).map((p) => ({ ...p, reason: reasonByCreator.get(p.id) })))
    setLoaded(true)
  }
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function accept(row) {
    setRequests((r) => r.filter((x) => x.id !== row.id))
    setConnections((c) => [row.requester, ...c])
    await supabase.from('connections').update({ status: 'accepted' }).eq('id', row.id)
  }
  async function decline(row) {
    setRequests((r) => r.filter((x) => x.id !== row.id))
    await supabase.from('connections').delete().eq('id', row.id)
  }

  return (
    <div className="page max-w-3xl">
      <PageHeader title="Connections" subtitle="Requests, your network, and creators you might know." />

      {/* ---- Incoming requests ---- */}
      {requests === null ? (
        <Skeleton className="h-24 w-full" />
      ) : requests.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-4 text-lg font-semibold">Requests <span className="text-brand">({requests.length})</span></h2>
          <div className="space-y-3">
            {requests.map((row) => (
              <div key={row.id} className="card flex items-center justify-between gap-3 !p-4">
                <Link to={`/profile/${row.requester?.id}`} className="flex min-w-0 items-center gap-3 group">
                  <Avatar src={row.requester?.photo_url} name={row.requester?.name} size="md" />
                  <div className="min-w-0">
                    <p className="truncate font-semibold group-hover:text-brand">{row.requester?.name}</p>
                    <p className="truncate text-xs text-smoke">{row.requester?.bio || 'Wants to connect'}</p>
                  </div>
                </Link>
                <div className="flex shrink-0 gap-2">
                  <button onClick={() => accept(row)} className="btn-primary !py-2 text-xs">Accept</button>
                  <button onClick={() => decline(row)} className="btn-ghost !py-2 text-xs">Ignore</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ---- My connections (shown first) ---- */}
      <section className="mb-10">
        <h2 className="mb-4 text-lg font-semibold">Your connections {connections.length > 0 && <span className="text-smoke">({connections.length})</span>}</h2>
        {requests === null ? (
          <Skeleton className="h-24 w-full" />
        ) : connections.length === 0 ? (
          <EmptyState
            icon={<Icon name="users" className="h-7 w-7" />}
            title="No connections yet"
            hint="Connect with creators from the suggestions below, the directory, or their profiles."
            action={<button onClick={() => navigate('/creators')} className="btn-primary">Browse creators</button>}
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {connections.map((c) => (
              <Link key={c.id} to={`/profile/${c.id}`} className="card flex items-center gap-3 !p-4 transition-all hover:-translate-y-0.5 hover:shadow-lift group">
                <Avatar src={c.photo_url} name={c.name} size="md" />
                <div className="min-w-0">
                  <p className="truncate font-semibold group-hover:text-brand">{c.name}</p>
                  <p className="truncate text-xs text-smoke">{c.bio || 'Creator'}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* ---- Suggestions (below your connections) ---- */}
      <section>
        <h2 className="mb-4 text-lg font-semibold">Creators to connect with</h2>
        {!loaded ? (
          <Skeleton className="h-24 w-full" />
        ) : suggestions.length === 0 ? (
          <EmptyState
            icon={<Icon name="users" className="h-7 w-7" />}
            title="You already have a large network"
            hint="No suggestions right now. Check back later when new creators join!"
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {suggestions.map((s) => (
              <div key={s.id} className="card flex items-center justify-between gap-3 !p-4">
                <Link to={`/profile/${s.id}`} className="flex min-w-0 items-center gap-3 group">
                  <Avatar src={s.photo_url} name={s.name} size="md" />
                  <div className="min-w-0">
                    <p className="truncate font-semibold group-hover:text-brand">{s.name}</p>
                    <p className="truncate text-xs text-smoke">{s.reason ? `You both entered ${s.reason}` : (s.bio || 'In the community')}</p>
                  </div>
                </Link>
                <ConnectButton myId={user.id} targetId={s.id} relation={null} onChange={() => setSuggestions((list) => list.filter((x) => x.id !== s.id))} className="shrink-0 !py-2 text-xs" />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
