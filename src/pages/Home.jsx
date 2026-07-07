import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import CountdownTimer from '../components/CountdownTimer'
import WorldMap from '../components/WorldMap'
import Icon from '../components/Icon'
import { Avatar, Badge, Skeleton, StatCard } from '../components/ui'
import { flagForCountry } from '../lib/flags'
import { stripMarkup } from '../lib/richText'
import { formatDate, timeAgo, formatMoney, challengeDeadline } from '../lib/utils'

// Signed-in home: the CURRENT challenge front and centre with a live
// countdown, plus quick community pulse (latest announcement, new creators).
export default function Home() {
  const { profile, user } = useAuth()
  const [allCountries, setAllCountries] = useState([])
  const [challenge, setChallenge] = useState(null)
  const [mySubmissions, setMySubmissions] = useState([])
  const [announcement, setAnnouncement] = useState(null)
  const [newCreators, setNewCreators] = useState([])
  const [upcomingTrips, setUpcomingTrips] = useState([])
  const [stats, setStats] = useState({ creators: 0, prizes: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [{ data: activeChallenges }, { data: ann }, { data: fresh }, { count: creatorCount }, { data: paid }] =
        await Promise.all([
          supabase.from('challenges').select('*').eq('status', 'active').order('end_date', { ascending: true }),
          supabase
            .from('messages')
            .select('*, profiles:sender_id(name, photo_url)')
            .eq('channel', 'announcements')
            .eq('deleted', false)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase.from('profiles').select('id, name, photo_url, bio').eq('status', 'active').eq('is_admin', false).eq('is_test', false).is('deletion_requested_at', null).order('created_at', { ascending: false }).limit(4),
          supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'active').eq('is_admin', false).eq('is_test', false).is('deletion_requested_at', null),
          supabase.from('rewards').select('amount').eq('status', 'distributed'),
        ])

      // Only surface a challenge as "live" if its deadline hasn't passed. An
      // admin may not have archived a finished contest yet; showing it as live
      // (with a "Challenge closed" countdown) is confusing for new members.
      const nowMs = Date.now()
      const ch = (activeChallenges ?? []).find((c) => challengeDeadline(c.end_date).getTime() > nowMs) ?? null

      setChallenge(ch)
      setAnnouncement(ann)
      setNewCreators(fresh ?? [])
      setStats({
        creators: creatorCount ?? 0,
        prizes: (paid ?? []).reduce((sum, r) => sum + Number(r.amount), 0),
      })

      // Combined "where we've been" map: union of countries across ACCEPTED
      // (active, non-deleted, non-test) creators only - pending signups no
      // longer inflate the count.
      const { data: visited } = await supabase.from('profiles').select('countries_visited')
        .eq('status', 'active').eq('is_test', false).is('deletion_requested_at', null)
      setAllCountries([...new Set((visited ?? []).flatMap((p) => p.countries_visited || []))])

      // Upcoming trips from the collab board, for the "creators on the move" nudge.
      const today = new Date().toISOString().slice(0, 10)
      const { data: tripsData } = await supabase
        .from('collab_posts')
        .select('id, city, country, start_date, end_date, profiles:creator_id(name, photo_url)')
        .gte('end_date', today)
        .order('start_date', { ascending: true })
        .limit(6)
      setUpcomingTrips(tripsData ?? [])

      if (ch) {
        const { data: subs } = await supabase
          .from('submissions')
          .select('id')
          .eq('challenge_id', ch.id)
          .eq('creator_id', user.id)
        setMySubmissions(subs ?? [])
      }
      setLoading(false)
    }
    load()
  }, [user.id])

  if (loading) {
    return (
      <div className="page space-y-8">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3"><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /></div>
      </div>
    )
  }

  return (
    <div className="page space-y-12">
      {/* ---------- Greeting ---------- */}
      <section>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Hey {profile?.name?.split(' ')[0]} 👋
        </h1>
        <p className="mt-2 text-smoke">Here's what's happening in the program right now.</p>
      </section>

      {/* ---------- Current challenge hero ---------- */}
      {challenge ? (
        <section className="overflow-hidden rounded-card bg-gradient-to-br from-brand to-brand-light p-6 text-white shadow-lift sm:p-12">
          <Badge className="!bg-white/20 !text-white">Live challenge</Badge>
          <h2 className="mt-4 max-w-xl text-3xl font-bold leading-tight sm:text-4xl">{challenge.title}</h2>
          <p className="mt-3 max-w-xl text-white/85 line-clamp-2">{challenge.description}</p>

          <div className="mt-8 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-white/70">Closes in</p>
              <CountdownTimer endDate={challenge.end_date} />
            </div>
            <div className="flex gap-3">
              <Link to={`/challenges/${challenge.id}`} className="btn bg-white text-brand hover:bg-white/90">
                {mySubmissions.length > 0 ? 'View your entry' : 'Read the brief →'}
              </Link>
            </div>
          </div>

          {mySubmissions.length > 0 && (
            <p className="mt-6 inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm">
              You've entered with {mySubmissions.length} {mySubmissions.length === 1 ? 'video' : 'videos'}. Good luck!
            </p>
          )}
        </section>
      ) : (
        <section className="relative overflow-hidden rounded-card border border-gray-100 bg-gradient-to-b from-brand-tint/40 to-white text-center shadow-card">
          <div className="px-6 py-12 sm:py-16">
            {/* Tryp.com plane coming in to land. A gentle descent/bob hints at
                "landing soon" (disabled for reduced-motion users). */}
            <div className="tryp-landing mx-auto mb-7 w-56 max-w-full sm:w-72">
              <img src="/brand/tryp-plane-transparent.png" alt="Tryp.com plane coming in to land" className="w-full drop-shadow-md" />
              <div className="mx-auto mt-1 h-px w-40 bg-gradient-to-r from-transparent via-brand/40 to-transparent" aria-hidden />
            </div>
            <h2 className="text-xl font-semibold sm:text-2xl">The next challenge is landing here soon</h2>
            <p className="mx-auto mt-2 max-w-md text-smoke">
              Your next brief is cleared for landing. You'll get a notification the moment it touches down.
              Meanwhile, polish your profile or browse past challenges for inspiration.
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <Link to="/challenges" className="btn-primary">Past challenges</Link>
              <Link to="/creators" className="btn-secondary">Meet the creators</Link>
            </div>
          </div>
          <style>{`
            @keyframes tryp-land { 0%,100% { transform: translateY(-6px) } 50% { transform: translateY(4px) } }
            .tryp-landing { animation: tryp-land 4s ease-in-out infinite; }
            @media (prefers-reduced-motion: reduce) { .tryp-landing { animation: none } }
          `}</style>
        </section>
      )}

      {/* ---------- Program stats ---------- */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Creators in the program" value={stats.creators} />
        <StatCard label="Prizes distributed" value={formatMoney(stats.prizes)} accent />
        <StatCard label="Member since" value={formatDate(profile?.accepted_at || profile?.created_at)} />
      </section>

      {/* ---------- Latest announcement ---------- */}
      {announcement && (
        <section>
          <div className="mb-4">
            <h2 className="flex items-center gap-2 text-lg font-semibold"><Icon name="megaphone" className="h-5 w-5 shrink-0 text-brand" /> Latest announcement</h2>
            <Link to="/chat/announcements" className="mt-1 inline-block text-sm font-medium text-brand hover:underline">All announcements →</Link>
          </div>
          <Link to="/chat/announcements" className="card block border-l-4 !border-l-brand transition-shadow hover:shadow-lift">
            <div className="flex items-center gap-3">
              <Avatar src={announcement.profiles?.photo_url} name={announcement.profiles?.name} size="sm" />
              <div>
                <p className="text-sm font-semibold">{announcement.profiles?.name} <Badge tone="light" className="ml-1">Tryp.com Team</Badge></p>
                <p className="text-xs text-smoke">{timeAgo(announcement.created_at)}</p>
              </div>
            </div>
            {announcement.body ? (
              <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-ink">{stripMarkup(announcement.body)}</p>
            ) : (
              <p className="mt-4 flex items-center gap-2 text-sm font-medium text-brand">
                <Icon name={announcement.poll_id ? 'poll' : announcement.game_event_id ? 'joystick' : announcement.resource_id ? 'book' : 'megaphone'} className="h-4 w-4" />
                {announcement.poll_id ? 'Posted a new poll' : announcement.game_event_id ? 'Shared a game challenge' : announcement.resource_id ? 'Shared a resource' : 'New announcement'} · tap to view
              </p>
            )}
          </Link>
        </section>
      )}

      {/* ---------- Creators on the move (collab board nudge) ---------- */}
      {upcomingTrips.length > 0 && (
        <section>
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="flex items-center gap-2 text-lg font-semibold"><Icon name="pin" className="h-5 w-5 text-brand" /> Creators on the move</h2>
            <Link to="/collab" className="text-sm font-medium text-brand hover:underline">Collab board →</Link>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {upcomingTrips.map((t) => (
              <Link key={t.id} to="/collab" className="card flex items-center gap-3 !p-4 transition-all hover:-translate-y-0.5 hover:shadow-lift active:-translate-y-0.5 active:shadow-lift">
                <Avatar src={t.profiles?.photo_url} name={t.profiles?.name} size="sm" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{t.profiles?.name?.split(' ')[0]} → {flagForCountry(t.country)} {t.city}</p>
                  <p className="truncate text-xs text-smoke">{format(new Date(t.start_date), 'd MMM')} – {format(new Date(t.end_date), 'd MMM')}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ---------- Combined "where we've been" map ---------- */}
      <section>
        <div className="mb-4 flex flex-col gap-1">
          <h2 className="flex items-center gap-2 text-lg font-semibold"><Icon name="globe" className="h-5 w-5 text-brand" /> Where we've been, together</h2>
          <p className="text-sm text-smoke">
            We have collectively explored{' '}
            <span className="font-semibold text-brand">{allCountries.length} countries</span>. How much of the world can we see together?
          </p>
        </div>
        <WorldMap selected={allCountries} />
      </section>

      {/* ---------- New creators ---------- */}
      <section>
        <div className="mb-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold"><Icon name="users" className="h-5 w-5 text-brand" /> New in the community</h2>
          <Link to="/creators" className="mt-1 inline-block text-sm font-medium text-brand hover:underline">Browse all →</Link>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {newCreators.map((c) => (
            <Link key={c.id} to={`/profile/${c.id}`} className="card flex items-center gap-4 !p-5 transition-all hover:-translate-y-0.5 hover:shadow-lift active:-translate-y-0.5 active:shadow-lift">
              <Avatar src={c.photo_url} name={c.name} size="md" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{c.name}</p>
                <p className="truncate text-xs text-smoke">{c.bio || 'New creator ✈️'}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
