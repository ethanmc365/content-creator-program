import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Badge, EmptyState, PageHeader, Skeleton, StatCard } from '../components/ui'
import { formatDate, formatMoney } from '../lib/utils'

// A creator's own reward history. We filter by creator_id explicitly so that
// admins (whose RLS lets them read every reward) still see only *their own*
// rewards on this personal page. The all-rewards view lives in Admin → Rewards.
export default function Rewards() {
  const { user } = useAuth()
  const [rewards, setRewards] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('rewards')
      .select('*, challenges(title)')
      .eq('creator_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setRewards(data ?? [])
        setLoading(false)
      })
  }, [user.id])

  const earned = rewards.filter((r) => r.status === 'distributed').reduce((s, r) => s + Number(r.amount), 0)
  const pending = rewards.filter((r) => r.status === 'pending').reduce((s, r) => s + Number(r.amount), 0)

  return (
    <div className="page max-w-4xl">
      <PageHeader title="My rewards" subtitle="Everything you've earned in the program, in cash and Tryp.com vouchers." />

      {loading ? (
        <div className="space-y-4"><Skeleton className="h-28 w-full" /><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>
      ) : (
        <>
          <div className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <StatCard label="Total received" value={formatMoney(earned)} accent />
            <StatCard label="Pending" value={formatMoney(pending)} hint={pending > 0 ? 'On its way. The team is processing it.' : 'Nothing pending right now.'} />
          </div>

          {rewards.length === 0 ? (
            <EmptyState
              emoji="💸"
              title="No rewards yet. Your first one is waiting"
              hint="Enter the live challenge: every valid entry earns a voucher, and the top spots win cash."
              action={<Link to="/challenges" className="btn-primary">See the challenge</Link>}
            />
          ) : (
            <div className="overflow-hidden rounded-card border border-gray-100 shadow-card">
              {rewards.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center gap-3 border-b border-gray-50 px-5 py-4 last:border-0 sm:px-7">
                  <span className="text-2xl" aria-hidden>{r.reward_type === 'cash' ? '💷' : '🎟️'}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">
                      {r.reward_type === 'cash' ? 'Cash prize' : 'Tryp.com voucher'}
                      {r.challenges?.title && <span className="font-normal text-smoke"> · {r.challenges.title}</span>}
                    </p>
                    <p className="text-xs text-smoke">
                      {r.status === 'distributed' ? `Distributed ${formatDate(r.distributed_at)}` : `Added ${formatDate(r.created_at)}`}
                    </p>
                  </div>
                  <span className="text-base font-bold tabular-nums">{formatMoney(r.amount, r.currency)}</span>
                  <Badge tone={r.status === 'distributed' ? 'green' : 'amber'}>{r.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
