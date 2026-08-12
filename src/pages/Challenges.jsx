import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useMyScopes, inScope } from '../lib/scope'
import CountdownTimer from '../components/CountdownTimer'
import VideoThumb from '../components/VideoThumb'
import Icon from '../components/Icon'
import { Avatar, PageHeader, Badge, SkeletonCards, EmptyState } from '../components/ui'
import { formatDate, formatViews, formatMoney, challengeDeadline, PRIZE_BASELINE } from '../lib/utils'
import Reveal from '../components/network/Reveal'
import ParticipationBar from '../components/network/ParticipationBar'

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
  const { ids: scopeIds, networkId, loading: scopesLoading } = useMyScopes()
  const [challenges, setChallenges] = useState([])
  const [galleries, setGalleries] = useState({}) // challenge_id -> {winners, totalViews}
  // challenge_id -> {posted, total}. Keyed rather than singular: the moment a
  // second market opened, "the live challenge" stopped being a single thing,
  // and a lone object silently attached the UK bar to Spain's numbers.
  const [participation, setParticipation] = useState({})
  const [prizesAwarded, setPrizesAwarded] = useState(null) // total distributed across the program
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

      // Total prizes awarded across the program (moved here from the home page).
      // Includes the pre-platform WhatsApp-era baseline so it reads honestly.
      supabase.from('rewards').select('amount').eq('status', 'distributed').then(({ data: paid }) => {
        setPrizesAwarded(PRIZE_BASELINE + (paid ?? []).reduce((sum, r) => sum + Number(r.amount), 0))
      })

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
    }
    load()
  }, [])

  // Participation, computed per live challenge and against the RIGHT crowd.
  //
  // This used to count every active profile on the platform, which was correct
  // while there was one market and became wrong the instant there were two: a
  // Spanish challenge with no Spanish creators reported "0 of 43", 43 being the
  // UK. The denominator is the challenge's own market, so a market with nobody
  // in it says so instead of borrowing another market's roster.
  useEffect(() => {
    const liveOnes = challenges.filter(
      (c) => c.status === 'active' && challengeDeadline(c.end_date).getTime() > Date.now(),
    )
    if (liveOnes.length === 0) return
    let cancelled = false
    async function tally() {
      const entries = await Promise.all(liveOnes.map(async (c) => {
        const roster = c.community_id
          ? supabase.from('community_members')
              .select('profile_id, profiles!inner(is_admin, is_test, status, deletion_requested_at)', { count: 'exact', head: true })
              .eq('community_id', c.community_id).eq('status', 'active')
              .eq('profiles.is_admin', false).eq('profiles.is_test', false).eq('profiles.status', 'active')
              .is('profiles.deletion_requested_at', null)
          : supabase.from('profiles').select('id', { count: 'exact', head: true })
              .eq('status', 'active').eq('is_admin', false).eq('is_test', false)
              .is('deletion_requested_at', null)
        const [{ data: entrants }, { count }] = await Promise.all([
          supabase.from('submissions').select('creator_id').eq('challenge_id', c.id),
          roster,
        ])
        return [c.id, {
          posted: new Set((entrants ?? []).map((e) => e.creator_id)).size,
          total: count ?? 0,
        }]
      }))
      if (!cancelled) setParticipation(Object.fromEntries(entries))
    }
    tally()
    return () => { cancelled = true }
  }, [challenges])

  const isLive = (c) => c.status === 'active' && challengeDeadline(c.end_date).getTime() > nowMs
  // This page is the creator's OWN community's challenge board. RLS already
  // narrows it for a creator; an admin can read every market, so without this
  // they get Spain's live card stacked above the UK's with no way to tell which
  // is which. Every market's board is at /c/<slug>/challenges.
  const mine = challenges.filter((c) => inScope(scopeIds, c.community_id))
  const live = mine.filter(isLive)
  const past = mine.filter((c) => !isLive(c))

  return (
    <div className="page">
      {/* THE PAGE ARRIVES, IT DOES NOT APPEAR. Everything else in the network
          shell rises into view; this board - the page most creators open first
          - was the one that simply blinked into existence. Header, prize pill
          and the live card each carry their own place in the queue, so the eye
          is led down the page in the order the page wants to be read. */}
      <Reveal from="down">
        <PageHeader
          title="Challenges"
          subtitle="One brief, one deadline, real prizes. Enter with your best video."
          action={isAdmin && <Link to="/admin/challenges/new" className="btn-primary">+ New challenge</Link>}
        />
      </Reveal>

      {prizesAwarded != null && (
        <Reveal from="down" delay={0.06} className="mb-8">
          <div className="inline-flex items-center gap-2.5 rounded-full border border-brand/20 bg-brand-tint/40 px-4 py-2 text-sm">
            <Icon name="trophy" className="h-4 w-4 shrink-0 text-brand" />
            <span className="font-semibold text-brand">{formatMoney(prizesAwarded)}</span>
            <span className="text-smoke">awarded in prizes so far</span>
          </div>
        </Reveal>
      )}

      {loading || scopesLoading ? (
        <SkeletonCards count={3} />
      ) : mine.length === 0 ? (
        <EmptyState icon={<Icon name="flag" className="h-7 w-7" />} title="No challenges yet" hint="The first challenge will appear here once the team posts it." />
      ) : (
        <div className="space-y-12">
          {/* ---------- Live ---------- */}
          {live.map((c) => (
            <Reveal key={c.id} from="down" delay={0.12} as="div">
              <div className="relative block overflow-hidden rounded-card bg-gradient-to-br from-brand to-brand-light p-6 text-white shadow-lift sm:p-10">
                {/* Soft light bloom for depth, matching the home hero. */}
                <div className="pointer-events-none absolute -right-16 -top-20 h-72 w-72 rounded-full bg-white/10 blur-2xl" />
                <div className="pointer-events-none absolute -bottom-24 -left-10 h-72 w-72 rounded-full bg-black/5 blur-2xl" />
                <div className="relative">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="inline-flex items-center gap-2 rounded-full bg-white/20 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider">
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/80" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
                      </span>
                      Live now
                    </span>
                    {/* A global brief sits on every creator's board in every
                        country, so it has to say so or it reads as one more
                        local challenge that happens to be in English. */}
                    {networkId && c.community_id === networkId && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-brand">
                        <Icon name="globe" className="h-3.5 w-3.5" />
                        Open to everyone
                      </span>
                    )}
                    <span className="text-xs text-white/75">{formatDate(c.start_date)} → {formatDate(c.end_date)}</span>
                  </div>
                  {/* The title grows slightly on hover rather than underlining.
                      An underline reads as "this is a link in a paragraph"; a
                      heading that swells reads as "this whole thing is the
                      target", which is what it actually is. origin-left keeps
                      it anchored to the text's start instead of drifting. */}
                  <Link to={`/challenges/${c.id}`} className="group block">
                    <h2 className="mt-4 inline-block origin-left text-2xl font-bold transition-transform duration-200 ease-out group-hover:scale-[1.03] sm:text-3xl">
                      {c.title}
                    </h2>
                    <p className="mt-2 max-w-2xl text-white/85 line-clamp-2">{c.description}</p>
                  </Link>
                  <div className="mt-8 flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                      <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-white/75">Closes in</p>
                      <CountdownTimer endDate={c.end_date} hero />
                    </div>
                    <div className="flex flex-col gap-2.5 lg:items-end">
                      <div className="flex flex-wrap gap-3">
                        <Link to={`/challenges/${c.id}`} className="btn border border-white/40 text-white hover:bg-white/10">Read the brief →</Link>
                        <Link to={`/challenges/${c.id}?submit=1`} className="btn bg-white !text-brand hover:bg-white/90">Submit your video</Link>
                      </div>
                      <p className="text-sm text-white/80">{c.submissions?.[0]?.count ?? 0} {(c.submissions?.[0]?.count ?? 0) === 1 ? 'entry' : 'entries'} so far</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Participation pace: nudges the quiet majority, names no one.
                  The shared component, not a fourth hand-rolled copy of it -
                  this one had drifted into `Math.max(pct, 2)`, which paints a
                  sliver of orange under "0 of 43 have posted" and is the exact
                  bug ParticipationBar was written to avoid. */}
              {participation[c.id] && (
                <ParticipationBar
                  participation={participation[c.id]}
                  where=""
                  className="mt-4"
                />
              )}
            </Reveal>
          ))}

          {/* ---------- Past ---------- */}
          {past.length > 0 && (
            <section>
              <h2 className="mb-5 text-lg font-semibold text-smoke">Past challenges</h2>
              <Reveal className="grid grid-cols-1 gap-6 sm:grid-cols-2">
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
              </Reveal>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
