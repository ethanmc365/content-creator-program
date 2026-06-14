import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import CountdownTimer from '../components/CountdownTimer'
import { PageHeader, Badge, SkeletonCards, EmptyState } from '../components/ui'
import { formatDate } from '../lib/utils'

const STATUS_TONE = { active: 'brand', ended: 'amber', archived: 'grey', draft: 'red' }

// All challenges: the live one up top, past challenges browsable below.
export default function Challenges() {
  const { isAdmin } = useAuth()
  const [challenges, setChallenges] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('challenges')
      .select('*, submissions(count)')
      .order('start_date', { ascending: false })
      .then(({ data }) => {
        setChallenges(data ?? [])
        setLoading(false)
      })
  }, [])

  const live = challenges.filter((c) => c.status === 'active')
  const past = challenges.filter((c) => c.status !== 'active')

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
            <Link key={c.id} to={`/challenges/${c.id}`} className="block overflow-hidden rounded-card bg-gradient-to-br from-brand to-brand-light p-6 text-white shadow-lift transition-transform hover:scale-[1.005] sm:p-10">
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
          ))}

          {/* ---------- Past ---------- */}
          {past.length > 0 && (
            <section>
              <h2 className="mb-5 text-lg font-semibold text-smoke">Past challenges</h2>
              <div className="grid gap-6 sm:grid-cols-2">
                {past.map((c) => (
                  <Link key={c.id} to={`/challenges/${c.id}`} className="card group transition-all hover:-translate-y-0.5 hover:shadow-lift">
                    <div className="flex items-center justify-between gap-3">
                      <Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge>
                      <span className="text-xs text-smoke">{formatDate(c.start_date)} → {formatDate(c.end_date)}</span>
                    </div>
                    <h3 className="mt-4 text-xl font-semibold group-hover:text-brand">{c.title}</h3>
                    <p className="mt-2 text-sm text-smoke line-clamp-2">{c.description}</p>
                    <p className="mt-4 text-xs font-medium text-smoke">{c.submissions?.[0]?.count ?? 0} entries · results inside →</p>
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
