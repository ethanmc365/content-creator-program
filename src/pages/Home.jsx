import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import CountdownTimer from '../components/CountdownTimer'
import WorldMap from '../components/WorldMap'
import Icon from '../components/Icon'
import { Avatar, Badge, Skeleton, StatCard } from '../components/ui'
import { formatDate, timeAgo, formatMoney } from '../lib/utils'

// Signed-in home: the CURRENT challenge front and centre with a live
// countdown, plus quick community pulse (latest announcement, new creators).
export default function Home() {
  const { profile, user } = useAuth()
  const [allCountries, setAllCountries] = useState([])
  const [challenge, setChallenge] = useState(null)
  const [mySubmissions, setMySubmissions] = useState([])
  const [announcement, setAnnouncement] = useState(null)
  const [newCreators, setNewCreators] = useState([])
  const [stats, setStats] = useState({ creators: 0, prizes: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [{ data: ch }, { data: ann }, { data: fresh }, { count: creatorCount }, { data: paid }] =
        await Promise.all([
          supabase.from('challenges').select('*').eq('status', 'active').order('end_date').limit(1).maybeSingle(),
          supabase
            .from('messages')
            .select('*, profiles:sender_id(name, photo_url)')
            .eq('channel', 'announcements')
            .eq('deleted', false)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase.from('profiles').select('id, name, photo_url, bio').order('created_at', { ascending: false }).limit(4),
          supabase.from('profiles').select('id', { count: 'exact', head: true }),
          supabase.from('rewards').select('amount').eq('status', 'distributed'),
        ])

      setChallenge(ch)
      setAnnouncement(ann)
      setNewCreators(fresh ?? [])
      setStats({
        creators: creatorCount ?? 0,
        prizes: (paid ?? []).reduce((sum, r) => sum + Number(r.amount), 0),
      })

      // Combined "where we've been" map: union of every creator's countries.
      const { data: visited } = await supabase.from('profiles').select('countries_visited')
      setAllCountries([...new Set((visited ?? []).flatMap((p) => p.countries_visited || []))])

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
              ✅ You've entered with {mySubmissions.length} {mySubmissions.length === 1 ? 'video' : 'videos'}. Good luck!
            </p>
          )}
        </section>
      ) : (
        <section className="card text-center !py-14">
          <p className="text-4xl" aria-hidden>🏝️</p>
          <h2 className="mt-3 text-xl font-semibold">No live challenge right now</h2>
          <p className="mx-auto mt-2 max-w-md text-smoke">
            The next one is around the corner. You'll get a notification the moment it drops.
            Meanwhile, polish your profile or browse past challenges for inspiration.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link to="/challenges" className="btn-primary">Past challenges</Link>
            <Link to="/creators" className="btn-secondary">Meet the creators</Link>
          </div>
        </section>
      )}

      {/* ---------- Program stats ---------- */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Creators in the program" value={stats.creators} />
        <StatCard label="Prizes distributed" value={formatMoney(stats.prizes)} accent />
        <StatCard label="Member since" value={formatDate(profile?.created_at)} />
      </section>

      {/* ---------- Latest announcement ---------- */}
      {announcement && (
        <section>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold"><Icon name="megaphone" className="h-5 w-5 shrink-0 text-brand" /> Latest announcement</h2>
            <Link to="/chat/announcements" className="shrink-0 text-sm font-medium text-brand hover:underline">All announcements</Link>
          </div>
          <Link to="/chat/announcements" className="card block border-l-4 !border-l-brand transition-shadow hover:shadow-lift">
            <div className="flex items-center gap-3">
              <Avatar src={announcement.profiles?.photo_url} name={announcement.profiles?.name} size="sm" />
              <div>
                <p className="text-sm font-semibold">{announcement.profiles?.name} <Badge tone="light" className="ml-1">Tryp.com Team</Badge></p>
                <p className="text-xs text-smoke">{timeAgo(announcement.created_at)}</p>
              </div>
            </div>
            <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-ink">{announcement.body}</p>
          </Link>
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
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold"><Icon name="users" className="h-5 w-5 text-brand" /> New in the community</h2>
          <Link to="/creators" className="text-sm font-medium text-brand hover:underline">Browse all</Link>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {newCreators.map((c) => (
            <Link key={c.id} to={`/profile/${c.id}`} className="card flex items-center gap-4 !p-5 transition-all hover:-translate-y-0.5 hover:shadow-lift">
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
