import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Badge, EmptyState, PageHeader, Skeleton, StatCard } from '../components/ui'
import Icon from '../components/Icon'
import { formatDate, formatMoney } from '../lib/utils'
import { rewardsTotal } from '../lib/programme'
import { useViewAs, ViewingAsBanner } from '../components/ViewingAs'
import { useT } from '../lib/i18n'

// A creator's own reward history. We filter by creator_id explicitly so that
// admins (whose RLS lets them read every reward) still see only *their own*
// rewards on this personal page. The all-rewards view lives in Admin → Rewards.
export default function Rewards() {
  const tr = useT()
  // An admin can open one creator's own rewards page with `?as=<id>`, which is
  // how a support question about a missing voucher gets answered from the same
  // screen the creator is describing. Inert for everybody else.
  const { id: whose, viewing, person } = useViewAs()
  const [rewards, setRewards] = useState([])
  const [loading, setLoading] = useState(true)
  // THE CERTIFICATE IS GONE FOR NOW.
  //
  // A share-a-certificate button on every reward row, on a page a creator opens
  // to check whether they have been paid. It was the loudest control on the
  // page and it answered a question nobody had come here to ask. The component
  // is still in the tree (components/CertificateModal) if it comes back
  // somewhere it fits - a challenge result, most likely, which is where
  // finishing actually happens.

  useEffect(() => {
    supabase
      .from('rewards')
      .select('*, challenges(title), milestones(title), profiles:creator_id(name)')
      .eq('creator_id', whose)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setRewards(data ?? [])
        setLoading(false)
      })
  }, [whose])

  // Totals go through rewardsTotal: one figure, in euros, whole. The old sum
  // added amounts across currencies and printed the result with formatMoney's
  // GBP default, so a creator paid EUR 40 and GBP 50 saw "GBP 90". The
  // programme settles in euros, so euros is the number - and "~" marks it
  // whenever a conversion was involved, because that figure moves with the FX
  // rate and is not the exact amount that landed in anybody's account. The
  // rows below still show what was actually paid, in the currency it was paid.
  const earned = rewardsTotal(rewards.filter((r) => r.status === 'distributed'))
  const pending = rewardsTotal(rewards.filter((r) => r.status === 'pending'))
  const showTotal = (t) => `${t.converted ? '≈ ' : ''}${formatMoney(t.amount, t.currency)}`

  return (
    <div className="page max-w-4xl">
      <PageHeader title={tr("My rewards")} subtitle="Everything you've earned in the community, in cash and Tryp.com vouchers." />

      <ViewingAsBanner viewing={viewing} person={person} />

      {loading ? (
        <div className="space-y-4"><Skeleton className="h-28 w-full" /><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>
      ) : (
        <>
          <div className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <StatCard label={tr("Total received")} value={showTotal(earned)} accent />
            <StatCard label={tr("Pending")} value={showTotal(pending)} hint={pending.amount > 0 ? 'On its way. The team is processing it.' : 'Nothing pending right now.'} />
          </div>

          {rewards.length === 0 ? (
            <EmptyState
              icon={<Icon name="money" className="h-7 w-7" />}
              title={tr("No rewards yet. Your first one is waiting")}
              hint={tr("Enter a challenge to earn a voucher or win the cash prizes.")}
              action={<Link to="/challenges" className="btn-primary">{tr("See the challenge")}</Link>}
            />
          ) : (
            <div className="overflow-hidden rounded-card border border-gray-100 shadow-card">
              {rewards.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center gap-3 border-b border-gray-50 px-5 py-4 last:border-0 sm:px-7">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand" aria-hidden>
                    <Icon name={r.reward_type === 'cash' ? 'money' : 'ticket'} className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">
                      {r.reward_type === 'cash' ? 'Cash prize' : 'Tryp.com voucher'}
                      {/* WHERE IT CAME FROM. A voucher with no context is a
                          line saying money exists. Challenge prizes had a
                          title; referral and milestone vouchers had nothing,
                          so the two rewards a creator earns OUTSIDE a
                          challenge were the two they could not identify. */}
                      {r.challenges?.title && <span className="font-normal text-smoke"> · {r.challenges.title}</span>}
                      {r.milestones?.title && <span className="font-normal text-smoke"> · Milestone: {r.milestones.title}</span>}
                      {r.source === 'referral' && <span className="font-normal text-smoke"> · Referral</span>}
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
