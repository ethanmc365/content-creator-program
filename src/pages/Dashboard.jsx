import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { PageHeader, Skeleton, StatCard, EmptyState } from '../components/ui'
import Icon from '../components/Icon'
import { formatMoney, formatViews } from '../lib/utils'
import { rewardsTotal } from '../lib/programme'

// A `rewardsTotal` result, printed. "≈" whenever a conversion was involved.
const money = (t) => `${t?.converted ? '≈ ' : ''}${formatMoney(t?.amount ?? 0, t?.currency ?? 'EUR')}`
import { useViewAs, ViewingAsBanner } from '../components/ViewingAs'

// Creator-visible dashboard: their own performance + community-wide highlights.
// (The deep analytics with charts live in the admin-only dashboard.)
export default function Dashboard() {
  // `?as=<id>` lets an admin read one creator's own dashboard. Inert for
  // everybody else - see components/ViewingAs.
  const { id: whose, viewing, person } = useViewAs()
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
        // `logged_views` comes with the entries now. See the note on totalViews.
        supabase.from('submissions').select('id, challenge_id, logged_views').eq('creator_id', whose),
        supabase.from('results').select('*, challenges(title)').eq('creator_id', whose).order('created_at', { ascending: false }),
        // FILTERED TO THIS PERSON, which it was not.
        // "You have earned" summed EVERY distributed reward the reader could
        // see. Row-level security hid that from a creator, who can only read
        // their own - but an admin can read all of them, so every admin's
        // dashboard reported the programme's entire prize spend as their own
        // personal earnings.
        // `currency` COMES WITH THE AMOUNT. Without it these two totals were
        // plain sums across pounds and euros printed under one symbol.
        supabase.from('rewards').select('amount, status, currency').eq('creator_id', whose),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'active').eq('is_admin', false).is('deletion_requested_at', null),
        supabase.from('challenges').select('id', { count: 'exact', head: true }).neq('status', 'draft'),
        supabase.from('rewards').select('amount, currency').eq('status', 'distributed'),
      ])

      setData({
        submissions: mySubs?.length ?? 0,
        challengesEntered: new Set((mySubs ?? []).map((s) => s.challenge_id)).size,
        results: myResults ?? [],
        // TOTAL VIEWS COMES FROM THE ENTRIES, NOT FROM THE LEADERBOARD.
        //
        // This summed `results.final_views`, and a `results` row is one RANKED
        // entry per creator per published challenge - the single video the
        // leaderboard scored them on. So Jacob Pulley, with fourteen videos and
        // 23,490 views, was shown 3,635: his one ranked entry in his one
        // finished challenge. Every creator's headline number was the same
        // fraction of the truth, and it got worse the more they posted.
        //
        // `results` is still the right source for WHERE THEY FINISHED. It was
        // never the right source for how much work they have done.
        totalViews: (mySubs ?? []).reduce((s, r) => s + Number(r.logged_views || 0), 0),
        bestRank: (myResults ?? []).reduce((best, r) => Math.min(best, r.rank), Infinity),
        // In euros, whole, marked "≈" if anything had to be converted - the
        // same figure `rewardsTotal` gives the creator on /rewards. These two
        // used to be raw cross-currency sums.
        myEarned: rewardsTotal((myRewards ?? []).filter((r) => r.status === 'distributed')),
        creators: creators ?? 0,
        challengesRun: challengesRun ?? 0,
        prizesPaid: rewardsTotal(allPaid ?? []),
      })
    }
    load()
  }, [whose])

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
      <PageHeader title="My dashboard" subtitle="Your performance in the community, at a glance." />

      <ViewingAsBanner viewing={viewing} person={person} />

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
            icon={<Icon name="chart" className="h-7 w-7" />}
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

      {/* ---------- Community-wide highlights ---------- */}
      <section>
        <h2 className="mb-4 text-lg font-semibold">Community highlights</h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Creators" value={data.creators} />
          <StatCard label="Challenges run" value={data.challengesRun} />
          <StatCard label="Prizes distributed" value={money(data.prizesPaid)} accent />
          <StatCard label="You've earned" value={money(data.myEarned)} />
        </div>
      </section>
    </div>
  )
}
