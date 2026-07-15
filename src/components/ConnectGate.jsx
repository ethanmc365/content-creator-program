import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Avatar, PlaneLoader, Spinner } from './ui'
import { cx } from '../lib/utils'

// Shown once to a newly-approved creator: connect with a few others before the
// full community unlocks. "Connecting" sends a connection request; after three
// we flip profiles.connect_gate_done and the app opens. Existing members are
// grandfathered (connect_gate_done = true) so they never see this.
const TARGET = 3

export default function ConnectGate() {
  const { user, profile, refreshProfile, signOut } = useAuth()
  const [creators, setCreators] = useState(null)
  const [connectedIds, setConnectedIds] = useState(new Set())
  const [busyId, setBusyId] = useState(null)
  const [finishing, setFinishing] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const [{ data: profiles }, { data: conns }] = await Promise.all([
        supabase.from('profiles')
          .select('id, name, photo_url, bio, city, country')
          .eq('status', 'active').eq('is_admin', false).eq('is_test', false).is('deletion_requested_at', null)
          .neq('id', user.id)
          .order('last_seen_at', { ascending: false, nullsFirst: false })
          .limit(12),
        supabase.from('connections').select('connected_creator_id').eq('creator_id', user.id),
      ])
      if (!alive) return
      setConnectedIds(new Set((conns ?? []).map((c) => c.connected_creator_id)))
      setCreators(profiles ?? [])
    })()
    return () => { alive = false }
  }, [user.id])

  const count = connectedIds.size
  const remaining = Math.max(0, TARGET - count)
  const firstName = profile?.name?.split(' ')[0] ?? 'there'

  async function connect(id) {
    if (connectedIds.has(id) || busyId) return
    setBusyId(id)
    const { error } = await supabase.from('connections').insert({ creator_id: user.id, connected_creator_id: id, status: 'pending' })
    if (!error) setConnectedIds((prev) => new Set(prev).add(id))
    setBusyId(null)
  }

  async function finish() {
    if (count < TARGET) return
    setFinishing(true)
    await supabase.from('profiles').update({ connect_gate_done: true }).eq('id', user.id)
    await refreshProfile() // flips the gate → ProtectedRoute renders the app
  }

  if (creators === null) {
    return <div className="flex min-h-screen items-center justify-center"><PlaneLoader /></div>
  }

  // Edge case: not enough other creators to reach the target — let them through.
  const canEverReach = creators.length + count >= TARGET

  return (
    <div className="min-h-screen bg-cloud/40 px-5 py-10 sm:py-14">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold sm:text-3xl">Welcome to the community, {firstName}!</h1>
          <p className="mx-auto mt-2 max-w-lg text-smoke">
            Let's get you started. Connect with {TARGET} creators you'd love to meet, then the full community opens up.
          </p>
          {/* Progress */}
          <div className="mx-auto mt-6 flex max-w-xs items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-white shadow-inner">
              <div className="h-full rounded-full bg-brand transition-all duration-500" style={{ width: `${Math.min(100, (count / TARGET) * 100)}%` }} />
            </div>
            <span className="text-sm font-semibold tabular-nums text-brand">{Math.min(count, TARGET)}/{TARGET}</span>
          </div>
        </div>

        {creators.length === 0 ? (
          <p className="rounded-card border border-dashed border-gray-200 bg-white px-5 py-10 text-center text-sm text-smoke">
            No other creators to connect with yet. You're all set!
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {creators.map((c) => {
              const connected = connectedIds.has(c.id)
              return (
                <div key={c.id} className="card flex flex-col items-center gap-3 !p-5 text-center">
                  <Avatar src={c.photo_url} name={c.name} size="lg" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{c.name}</p>
                    {(c.city || c.country) && <p className="truncate text-xs text-smoke">{[c.city, c.country].filter(Boolean).join(', ')}</p>}
                    {c.bio && <p className="mt-1 line-clamp-2 text-xs text-smoke">{c.bio}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => connect(c.id)}
                    disabled={connected || busyId === c.id}
                    className={cx('mt-auto w-full rounded-full py-2 text-xs font-semibold transition-colors',
                      connected ? 'cursor-default bg-brand-tint text-brand' : 'bg-brand text-white hover:bg-brand-light')}
                  >
                    {busyId === c.id ? <Spinner /> : connected ? 'Request sent ✓' : 'Connect'}
                  </button>
                </div>
              )
            })}
          </div>
        )}

        <div className="mt-8 flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={finish}
            disabled={(count < TARGET && canEverReach) || finishing}
            className="btn-primary !px-8"
          >
            {finishing ? <Spinner /> : count >= TARGET || !canEverReach ? 'Enter the community →' : `Connect with ${remaining} more`}
          </button>
          <button onClick={signOut} className="btn-ghost text-xs">Log out</button>
        </div>
      </div>
    </div>
  )
}
