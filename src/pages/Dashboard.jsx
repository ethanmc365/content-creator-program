import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { PageHeader, Skeleton, StatCard, EmptyState } from '../components/ui'
import { formatMoney, formatViews } from '../lib/utils'

// Creator-visible dashboard: their own performance + program-wide highlights.
// (The deep analytics with charts live in the admin-only dashboard.)
export default function Dashboard() {
  const { user } = useAuth()
  const [data, setData] = useState(null)

  useEffect(() => {
    async function load() {
      const [
        { data: mySubs },
        { data: myResults },
        { data: myRewards },
        { count: creators },
        { count: challengesRun },
        { data: allPaid },
      ] = await Promise.all([
        supabase.from('submissions').select('id, challenge_id').eq('creator_id', user.id),
        supabase.from('results').select('*, challenges(title)').eq('creator_id', user.id).order('created_at', { ascending: false }),
        supabase.from('rewards').select('amount, status'),
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('challenges').select('id', { count: 'exact', head: true }).neq('status', 'draft'),
        supabase.from('rewards').select('amount').eq('status', 'distributed'),
      ])

      setData({
        submissions: mySubs?.length ?? 0,
        challengesEntered: new Set((mySubs ?? []).map((s) => s.challenge_id)).size,
        results: myResults ?? [],
        totalViews: (myResults ?? []).reduce((s, r) => s + r.final_views, 0),
        bestRank: (myResults ?? []).reduce((best, r) => Math.min(best, r.rank), Infinity),
        myEarned: (myRewards ?? []).filter((r) => r.status === 'distributed').reduce((s, r) => s + Number(r.amount), 0),
        creators: creators ?? 0,
        challengesRun: challengesRun ?? 0,
        prizesPaid: (allPaid ?? []).reduce((s, r) => s + Number(r.amount), 0),
      })
    }
    load()
  }, [user.id])

  if (!data) {
    return (
      <div className="page space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4"><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /></div>
      </div>
    )
  }

  return (
    <div className="page">
      <PageHeader title="My dashboard" subtitle="Your performance in the program, at a glance." />

      {/* ---------- My numbers ---------- */}
      <section className="mb-12 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Challenges entered" value={data.challengesEntered} />
        <StatCard label="Total submissions" value={data.submissions} />
        <StatCard label="Logged views (all time)" value={formatViews(data.totalViews)} />
        <StatCard label="Best finish" value={data.bestRank === Infinity ? '-' : `#${data.bestRank}`} accent={data.bestRank <= 3} />
      </section>

      {/* ---------- My results history ---------- */}
      <section className="mb-12">
        <h2 className="mb-4 text-lg font-semibold">My challenge results</h2>
        {data.results.length === 0 ? (
          <EmptyState
            emoji="📈"
            title="No results yet"
            hint="Results appear after a challenge closes and the Tryp.com Team logs the final views."
            action={<Link to="/challenges" className="btn-primary">Enter the live challenge</Link>}
          />
        ) : (
          <div className="overflow-hidden rounded-card border border-gray-100 shadow-card">
            {data.results.map((r) => (
              <Link key={r.id} to={`/challenges/${r.challenge_id}`} className="flex items-center gap-4 border-b border-gray-50 px-5 py-4 transition-colors last:border-0 hover:bg-cloud/60 sm:px-7">
                <span className="text-xl" aria-hidden>{{ 1: '🥇', 2: '🥈', 3: '🥉' }[r.rank] || '🎬'}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{r.challenges?.title}</p>
                  <p className="text-xs text-smoke">Finished #{r.rank}</p>
                </div>
                <span className="text-sm font-bold tabular-nums">{formatViews(r.final_views)} views</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* ---------- Program-wide highlights ---------- */}
      <section>
        <h2 className="mb-4 text-lg font-semibold">Program highlights</h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Creators" value={data.creators} />
          <StatCard label="Challenges run" value={data.challengesRun} />
          <StatCard label="Prizes distributed" value={formatMoney(data.prizesPaid)} accent />
          <StatCard label="You've earned" value={formatMoney(data.myEarned)} />
        </div>
      </section>
    </div>
  )
}
