import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import PlatformBadges, { platformsForProfile } from '../components/PlatformBadges'
import { Avatar, Badge, Confetti, EmptyState, PageHeader, Skeleton } from '../components/ui'
import { formatViews, formatDate, cx } from '../lib/utils'

// The Wall of Fame: per-challenge celebrations curated by admins, plus an
// all-time podium aggregated from every published wall.
// Top 3 spots get gold / silver / bronze styling; confetti plays for walls
// published in the last 3 days (the "just announced" window).
const SPOT_STYLES = [
  { ring: 'ring-amber-400', chip: 'bg-amber-400 text-white', label: '1st', glow: 'shadow-[0_8px_32px_rgba(251,191,36,0.35)]' },
  { ring: 'ring-gray-300', chip: 'bg-gray-300 text-ink', label: '2nd', glow: '' },
  { ring: 'ring-orange-300', chip: 'bg-orange-300 text-white', label: '3rd', glow: '' },
]

export default function WallOfFame() {
  const [walls, setWalls] = useState([])
  const [profiles, setProfiles] = useState({})
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(true)
  // Confetti plays when a wall was published within the last 3 days
  // (the "just announced" window). Computed once at load time.
  const [justPublished, setJustPublished] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: wallRows } = await supabase
        .from('wall_of_fame')
        .select('*, challenges(id, title, start_date, end_date)')
        .eq('published', true)
        .order('published_at', { ascending: false })

      // Collect every featured creator id, then fetch their profiles in one go.
      const ids = [...new Set((wallRows ?? []).flatMap((w) => (w.featured_spots ?? []).map((s) => s.creator_id)))]
      const [{ data: people }, { data: res }] = await Promise.all([
        ids.length ? supabase.from('profiles').select('*').in('id', ids) : Promise.resolve({ data: [] }),
        supabase.from('results').select('*'),
      ])

      setWalls(wallRows ?? [])
      setProfiles(Object.fromEntries((people ?? []).map((p) => [p.id, p])))
      setResults(res ?? [])
      setJustPublished(
        (wallRows ?? []).some(
          (w) => w.published_at && Date.now() - new Date(w.published_at).getTime() < 3 * 24 * 3600 * 1000
        )
      )
      setLoading(false)
    }
    load()
  }, [])


  // All-time podium: total wins (1st places) and podium finishes per creator.
  const allTime = useMemo(() => {
    const tally = {}
    for (const w of walls) {
      ;(w.featured_spots ?? []).forEach((spot, i) => {
        tally[spot.creator_id] = tally[spot.creator_id] || { wins: 0, podiums: 0, features: 0 }
        tally[spot.creator_id].features++
        if (i === 0) tally[spot.creator_id].wins++
        if (i < 3) tally[spot.creator_id].podiums++
      })
    }
    return Object.entries(tally)
      .map(([id, t]) => ({ id, ...t }))
      .sort((a, b) => b.wins - a.wins || b.podiums - a.podiums || b.features - a.features)
      .slice(0, 6)
  }, [walls])

  const viewsFor = (challengeId, creatorId) =>
    results.find((r) => r.challenge_id === challengeId && r.creator_id === creatorId)?.final_views

  if (loading) {
    return (
      <div className="page space-y-8">
        <Skeleton className="h-10 w-72" />
        <div className="grid gap-6 sm:grid-cols-3"><Skeleton className="h-64" /><Skeleton className="h-64" /><Skeleton className="h-64" /></div>
      </div>
    )
  }

  return (
    <div className="page">
      {justPublished && <Confetti />}

      <PageHeader
        title="Wall of Fame 🏆"
        subtitle="The creators who made each challenge legendary. Your name could be up here next."
      />

      {walls.length === 0 ? (
        <EmptyState
          emoji="🏆"
          title="The wall awaits its first legends"
          hint="When a challenge wraps up, the Tryp.com Team publishes its top creators here."
          action={<Link to="/challenges" className="btn-primary">View challenges</Link>}
        />
      ) : (
        <div className="space-y-16">
          {/* ---------- All-time legends ---------- */}
          {allTime.length > 0 && (
            <section>
              <h2 className="mb-5 text-lg font-semibold text-smoke">All-time legends</h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                {allTime.map((t) => {
                  const p = profiles[t.id]
                  if (!p) return null
                  return (
                    <Link key={t.id} to={`/profile/${t.id}`} className="card flex flex-col items-center gap-2 !p-5 text-center transition-all hover:-translate-y-0.5 hover:shadow-lift">
                      <Avatar src={p.photo_url} name={p.name} size="md" />
                      <p className="text-sm font-semibold leading-tight">{p.name}</p>
                      <p className="text-xs text-smoke">
                        {t.wins > 0 ? `${t.wins}× winner 🥇` : `${t.podiums}× podium`}
                      </p>
                    </Link>
                  )
                })}
              </div>
            </section>
          )}

          {/* ---------- Per-challenge walls ---------- */}
          {walls.map((wall) => {
            const spots = wall.featured_spots ?? []
            return (
              <section key={wall.id}>
                <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
                  <div>
                    <h2 className="text-2xl font-bold">{wall.challenges?.title}</h2>
                    <p className="mt-1 text-sm text-smoke">
                      {formatDate(wall.challenges?.start_date)} → {formatDate(wall.challenges?.end_date)}
                    </p>
                  </div>
                  <Link to={`/challenges/${wall.challenges?.id}`} className="text-sm font-medium text-brand hover:underline">
                    Full leaderboard →
                  </Link>
                </div>

                {wall.admin_note && (
                  <p className="mb-8 max-w-2xl rounded-card border-l-4 border-brand bg-brand-tint/50 px-5 py-4 text-sm italic leading-relaxed text-ink">
                    "{wall.admin_note}" <span className="not-italic text-smoke">from the Tryp.com Team</span>
                  </p>
                )}

                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                  {spots.map((spot, i) => {
                    const p = profiles[spot.creator_id]
                    if (!p) return null
                    const style = SPOT_STYLES[i]
                    const views = viewsFor(wall.challenge_id, spot.creator_id)
                    return (
                      <Link
                        key={spot.creator_id + i}
                        to={`/profile/${p.id}`}
                        className={cx(
                          'card group flex flex-col items-center gap-3 !p-7 text-center transition-all hover:-translate-y-1 hover:shadow-lift animate-pop-in',
                          style?.glow
                        )}
                        style={{ animationDelay: `${i * 0.08}s` }}
                      >
                        <div className="relative">
                          <Avatar src={p.photo_url} name={p.name} size="lg" className={cx(style && `ring-4 ${style.ring}`)} />
                          {style ? (
                            <span className={cx('absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full px-2.5 py-0.5 text-[10px] font-bold', style.chip)}>
                              {style.label}
                            </span>
                          ) : (
                            <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-cloud px-2.5 py-0.5 text-[10px] font-bold text-smoke">
                              Featured
                            </span>
                          )}
                        </div>
                        <p className="mt-2 font-semibold group-hover:text-brand">{p.name}</p>
                        <PlatformBadges platforms={platformsForProfile(p)} />
                        {views != null && <Badge tone="light">{formatViews(views)} views</Badge>}
                        {spot.note && <p className="text-xs leading-relaxed text-smoke">{spot.note}</p>}
                      </Link>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
