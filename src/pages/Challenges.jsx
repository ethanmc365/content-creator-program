import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import CountdownTimer from '../components/CountdownTimer'
import VideoThumb from '../components/VideoThumb'
import { Avatar, PageHeader, Badge, SkeletonCards, EmptyState } from '../components/ui'
import { formatDate, formatViews, challengeDeadline } from '../lib/utils'

const STATUS_TONE = { active: 'brand', ended: 'amber', archived: 'grey', draft: 'red' }

// Podium metal styling per rank.
const MEDALS = {
  1: { ring: 'ring-amber-400', bar: 'bg-amber-400', label: '1st', h: 'h-16' },
  2: { ring: 'ring-gray-300', bar: 'bg-gray-300', label: '2nd', h: 'h-11' },
  3: { ring: 'ring-amber-600', bar: 'bg-amber-600', label: '3rd', h: 'h-8' },
}

// Hall-of-fame block for a finished challenge: the top-three podium with
// avatars + final views, their winning videos, and the closing stats.
function WinnersGallery({ winners, entries, totalViews }) {
  if (!winners?.length) return null
  // Display order 2nd | 1st | 3rd, classic podium shape.
  const order = [winners[1], winners[0], winners[2]].filter(Boolean)
  return (
    <div className="mt-5 rounded-2xl bg-cloud/60 p-4">
      <p className="mb-4 text-center text-[11px] font-semibold uppercase tracking-widest text-smoke">Hall of fame</p>
      <div className="flex items-end justify-center gap-3 sm:gap-5">
        {order.map((w) => {
          const m = MEDALS[w.rank]
          return (
            <div key={w.rank} className="flex w-24 flex-col items-center">
              <div className={`rounded-full ring-4 ${m.ring}`}>
                <Avatar src={w.profiles?.photo_url} name={w.profiles?.name} size={w.rank === 1 ? 'lg' : 'md'} />
              </div>
              <p className="mt-2 w-full truncate text-center text-xs font-semibold text-ink">{w.profiles?.name?.split(' ')[0] || 'Creator'}</p>
              <p className="text-[11px] tabular-nums text-smoke">{formatViews(w.final_views)} views</p>
              <div className={`mt-2 flex w-full items-start justify-center rounded-t-lg ${m.bar} ${m.h}`}>
                <span className="pt-1 text-xs font-bold text-white">{m.label}</span>
              </div>
            </div>
          )
        })}
      </div>
      {/* the winning videos */}
      {winners.some((w) => w.videoUrl) && (
        <div className="mt-4 grid grid-cols-3 gap-2">
          {winners.filter((w) => w.videoUrl).map((w) => (
            <VideoThumb key={w.rank} url={w.videoUrl} platform={w.platform} className="rounded-xl" />
          ))}
        </div>
      )}
      <div className="mt-4 flex items-center justify-center gap-6 border-t border-gray-200/70 pt-3 text-center">
        <div>
          <p className="text-sm font-bold tabular-nums text-ink">{entries}</p>
          <p className="text-[10px] font-medium uppercase tracking-wide text-smoke">Entries</p>
        </div>
        <div>
          <p className="text-sm font-bold tabular-nums text-ink">{formatViews(totalViews)}</p>
          <p className="text-[10px] font-medium uppercase tracking-wide text-smoke">Final views</p>
        </div>
        <div>
          <p className="text-sm font-bold tabular-nums text-ink">{winners.length}</p>
          <p className="text-[10px] font-medium uppercase tracking-wide text-smoke">On the podium</p>
        </div>
      </div>
    </div>
  )
}

// All challenges: the live one up top, past challenges browsable below.
export default function Challenges() {
  const { isAdmin } = useAuth()
  const [challenges, setChallenges] = useState([])
  const [galleries, setGalleries] = useState({}) // challenge_id -> {winners, totalViews}
  const [participation, setParticipation] = useState(null) // {posted, total} for the live challenge
  const [loading, setLoading] = useState(true)
  // Captured once at mount (lazy initialiser, not read during render) so the
  // "is this challenge past its deadline" check stays pure per the lint rules.
  const [nowMs] = useState(() => Date.now())

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('challenges')
        .select('*, submissions(count)')
        .order('start_date', { ascending: false })
      const all = data ?? []
      setChallenges(all)
      setLoading(false)

      // Hall-of-fame data: final results + each winner's video, in one sweep.
      const [{ data: results }, { data: subs }] = await Promise.all([
        supabase.from('results')
          .select('challenge_id, creator_id, final_views, rank, profiles:creator_id(id, name, photo_url)')
          .order('final_views', { ascending: false }),
        supabase.from('submissions').select('challenge_id, creator_id, video_url, platform, logged_views'),
      ])
      const bestVideo = new Map() // `${challenge}:${creator}` -> best submission
      for (const s of subs ?? []) {
        const k = `${s.challenge_id}:${s.creator_id}`
        const cur = bestVideo.get(k)
        if (!cur || (s.logged_views ?? 0) > (cur.logged_views ?? 0)) bestVideo.set(k, s)
      }
      const byChallenge = {}
      for (const r of results ?? []) (byChallenge[r.challenge_id] ||= []).push(r)
      const built = {}
      for (const [cid, rows] of Object.entries(byChallenge)) {
        const ranked = rows
          .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99) || b.final_views - a.final_views)
          .slice(0, 3)
          .map((r, i) => ({
            ...r,
            rank: i + 1,
            videoUrl: bestVideo.get(`${cid}:${r.creator_id}`)?.video_url ?? null,
            platform: bestVideo.get(`${cid}:${r.creator_id}`)?.platform ?? null,
          }))
        built[cid] = {
          winners: ranked,
          totalViews: rows.reduce((sum, r) => sum + (r.final_views || 0), 0),
        }
      }
      setGalleries(built)

      // Participation for the live challenge: distinct creators who posted vs
      // every active member (admins and test accounts excluded).
      const liveNow = all.find((c) => c.status === 'active' && challengeDeadline(c.end_date).getTime() > Date.now())
      if (liveNow) {
        const [{ data: entrants }, { count }] = await Promise.all([
          supabase.from('submissions').select('creator_id').eq('challenge_id', liveNow.id),
          supabase.from('profiles').select('id', { count: 'exact', head: true })
            .eq('status', 'active').eq('is_admin', false).eq('is_test', false).is('deletion_requested_at', null),
        ])
        setParticipation({
          challengeId: liveNow.id,
          posted: new Set((entrants ?? []).map((e) => e.creator_id)).size,
          total: count ?? 0,
        })
      }
    }
    load()
  }, [])

  const isLive = (c) => c.status === 'active' && challengeDeadline(c.end_date).getTime() > nowMs
  const live = challenges.filter(isLive)
  const past = challenges.filter((c) => !isLive(c))

  const pct = participation && participation.total > 0
    ? Math.round((participation.posted / participation.total) * 100)
    : null

  return (
    <div className="page">
      <PageHeader
        title="Challenges"
        subtitle="One brief, one deadline, real prizes. Enter with your best video."
        action={isAdmin && <Link to="/admin/challenges/new" className="btn-primary">+ New challenge</Link>}
      />

      {loading ? (
        <SkeletonCards count={3} />
      ) : challenges.length === 0 ? (
        <EmptyState emoji="🏁" title="No challenges yet" hint="The first challenge will appear here once the team posts it." />
      ) : (
        <div className="space-y-12">
          {/* ---------- Live ---------- */}
          {live.map((c) => (
            <div key={c.id}>
              <Link to={`/challenges/${c.id}`} className="block overflow-hidden rounded-card bg-gradient-to-br from-brand to-brand-light p-6 text-white shadow-lift transition-transform hover:scale-[1.005] active:scale-[0.995] sm:p-10">
                <div className="flex flex-wrap items-center gap-3">
                  <Badge className="!bg-white/20 !text-white">Live now</Badge>
                  <span className="text-xs text-white/75">{formatDate(c.start_date)} → {formatDate(c.end_date)}</span>
                </div>
                <h2 className="mt-4 text-2xl font-bold sm:text-3xl">{c.title}</h2>
                <p className="mt-2 max-w-2xl text-white/85 line-clamp-2">{c.description}</p>
                <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
                  <CountdownTimer endDate={c.end_date} />
                  <span className="text-sm text-white/85">{c.submissions?.[0]?.count ?? 0} entries so far →</span>
                </div>
              </Link>

              {/* Participation pace: nudges the quiet majority, names no one. */}
              {pct != null && participation.challengeId === c.id && (
                <div className="mt-4 rounded-card border border-gray-100 bg-white px-5 py-4 shadow-card">
                  <div className="mb-2 flex items-baseline justify-between gap-3">
                    <p className="text-sm font-semibold text-ink">Creator participation</p>
                    <p className="text-sm font-bold tabular-nums text-brand">{pct}%</p>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-cloud">
                    <div className="h-full rounded-full bg-gradient-to-r from-brand to-brand-light transition-all duration-700" style={{ width: `${Math.max(pct, 2)}%` }} />
                  </div>
                  <p className="mt-2 text-xs text-smoke">
                    {participation.posted} of {participation.total} creators have posted so far. Get your entry in!
                  </p>
                </div>
              )}
            </div>
          ))}

          {/* ---------- Past ---------- */}
          {past.length > 0 && (
            <section>
              <h2 className="mb-5 text-lg font-semibold text-smoke">Past challenges</h2>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                {past.map((c) => (
                  <Link key={c.id} to={`/challenges/${c.id}`} className="card group transition-all hover:-translate-y-0.5 hover:shadow-lift active:translate-y-0">
                    <div className="flex items-center justify-between gap-3">
                      {/* Still status 'active' but past its deadline → show "ended", not "active". */}
                      <Badge tone={c.status === 'active' ? STATUS_TONE.ended : STATUS_TONE[c.status]}>{c.status === 'active' ? 'ended' : c.status}</Badge>
                      <span className="text-xs text-smoke">{formatDate(c.start_date)} → {formatDate(c.end_date)}</span>
                    </div>
                    <h3 className="mt-4 text-xl font-semibold group-hover:text-brand">{c.title}</h3>
                    <p className="mt-2 text-sm text-smoke line-clamp-2">{c.description}</p>
                    {galleries[c.id] ? (
                      <WinnersGallery
                        winners={galleries[c.id].winners}
                        entries={c.submissions?.[0]?.count ?? 0}
                        totalViews={galleries[c.id].totalViews}
                      />
                    ) : (
                      <p className="mt-4 text-xs font-medium text-smoke">{c.submissions?.[0]?.count ?? 0} entries · results inside →</p>
                    )}
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
