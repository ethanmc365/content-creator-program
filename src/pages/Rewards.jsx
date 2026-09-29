import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Badge, EmptyState, PageHeader, Skeleton, StatCard } from '../components/ui'
import Icon from '../components/Icon'
import Reveal from '../components/network/Reveal'
import { cx, formatDate, formatMoney } from '../lib/utils'
import { rewardsTotal } from '../lib/programme'
import { walletTickets } from '../lib/wallet'
import { useViewAs, ViewingAsBanner } from '../components/ViewingAs'
import { useT } from '../lib/i18n'
import CertificateWall from '../components/certificate/CertificateWall'
import VoucherTicket from '../components/VoucherTicket'
import { notice } from '../lib/confirm'

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
  const [ticking, setTicking] = useState(null)
  const [showSpent, setShowSpent] = useState(false)
  // THE CERTIFICATE IS GONE FOR NOW.
  //
  // A share-a-certificate button on every reward row, on a page a creator opens
  // to check whether they have been paid. It was the loudest control on the
  // page and it answered a question nobody had come here to ask.
  //
  // AND THE COMPONENTS ARE NOW DELETED (20 Sep 2026), not parked. `Certificate`
  // and `CertificateModal` were a SECOND, hard-coded certificate - one design,
  // its words in the markup, its own bar along the bottom - kept in the tree on
  // the theory that it might come back somewhere. `certificate/CertificateCard`
  // is the certificate now, it can make six layouts out of a stored design, and
  // a second implementation of the same object is the exact thing `domSnapshot`
  // exists to stop. `CertificateWall`, below, is where a creator finds theirs.

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

  // THE VOUCHERS, AS TICKETS (24 Sep 2026). The code used to travel by DM after
  // "distributed"; it is on the reward row now and the creator ticks it off
  // themselves once spent (set_reward_used, migration 255).
  //
  // THE CODE IS NO LONGER WHAT MAKES IT A VOUCHER (29 Sep 2026). This filter
  // used to require `voucher_code`, which meant an awarded voucher the team had
  // not yet typed a code into was missing from the wallet entirely - it existed
  // only as a grey ledger row further down the page. Six were in exactly that
  // state in production. A voucher a creator has been awarded belongs in their
  // wallet whether or not the code has been written yet, saying honestly which
  // of the two it is.
  //
  // THE WALLET SPLITS IN TWO, BECAUSE THE TWO HALVES ANSWER DIFFERENT
  // QUESTIONS. "What can I spend?" is the reason anybody opens this page. "What
  // have I spent?" is a record, and a record does not need to be in the way -
  // so it collapses, and only appears at all once there is something in it.
  //
  // The split itself is in lib/wallet.js, under test, because the version of
  // it that lived here was wrong in a way that rendered perfectly.
  const { toSpend, spent } = walletTickets(rewards)
  const tickets = [...toSpend, ...spent]
  const walletToSpend = rewardsTotal(toSpend)
  const walletSpent = rewardsTotal(spent)

  async function toggleUsed(reward, used) {
    setTicking(reward.id)
    const { data, error } = await supabase.rpc('set_reward_used', { p_reward: reward.id, p_used: used })
    setTicking(null)
    if (error) { notice(error.message); return }
    setRewards((rs) => rs.map((r) => (r.id === reward.id ? { ...r, used_at: data ?? null } : r)))
  }

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
      <PageHeader title={tr("Rewards")} subtitle={tr("Everything you've earned in the community, in cash and Tryp.com vouchers.")} />

      <ViewingAsBanner viewing={viewing} person={person} />

      {loading ? (
        <div className="space-y-4"><Skeleton className="h-28 w-full" /><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>
      ) : (
        <>
          {/* The two figures arrive as a pair, then the ledger under them.
              This page drew itself on one frame; see the note in Reveal. */}
          <Reveal className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-2" row stagger={0.07}>
            <StatCard label={tr("Total received")} value={showTotal(earned)} accent />
            <StatCard label={tr("Pending")} value={showTotal(pending)} hint={pending.amount > 0 ? tr('On its way. The team is processing it.') : tr('Nothing pending right now.')} />
          </Reveal>

          {tickets.length > 0 && (
            <section className="mb-10">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h2 className="text-base font-semibold">{tr('Your vouchers')}</h2>
                {walletToSpend.amount > 0 && (
                  <p className="text-xs text-smoke">
                    {tr('{n} to spend', { n: showTotal(walletToSpend) })}
                    {walletSpent.amount > 0 && ` · ${tr('{n} spent', { n: showTotal(walletSpent) })}`}
                  </p>
                )}
              </div>

              {toSpend.length > 0 && (
                <Reveal className="grid grid-cols-1 gap-4 lg:grid-cols-2" stagger={0.07}>
                  {toSpend.map((r) => (
                    <VoucherTicket
                      key={r.id}
                      reward={r}
                      busy={ticking === r.id}
                      onToggleUsed={viewing ? undefined : (used) => toggleUsed(r, used)}
                    />
                  ))}
                </Reveal>
              )}

              {spent.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowSpent((v) => !v)}
                    aria-expanded={showSpent}
                    className={cx(
                      'flex w-full items-center justify-center gap-1.5 rounded-full py-2 text-xs font-semibold text-smoke transition-colors hoverable:hover:text-ink',
                      toSpend.length > 0 && 'mt-4',
                    )}
                  >
                    <Icon name={showSpent ? 'chevronUp' : 'chevronDown'} className="h-4 w-4" />
                    {spent.length === 1 ? tr('1 used voucher') : tr('{n} used vouchers', { n: spent.length })}
                  </button>
                  {showSpent && (
                    <Reveal className="mt-1 grid grid-cols-1 gap-4 lg:grid-cols-2" stagger={0.07}>
                      {spent.map((r) => (
                        <VoucherTicket
                          key={r.id}
                          reward={r}
                          busy={ticking === r.id}
                          onToggleUsed={viewing ? undefined : (used) => toggleUsed(r, used)}
                        />
                      ))}
                    </Reveal>
                  )}
                </>
              )}
            </section>
          )}

          {rewards.length === 0 ? (
            <EmptyState
              icon={<Icon name="money" className="h-7 w-7" />}
              title={tr("No rewards yet. Your first one is waiting")}
              hint={tr("Enter a challenge to earn a voucher or win the cash prizes.")}
              action={<Link to="/challenges" className="btn-primary">{tr("See the challenge")}</Link>}
            />
          ) : (
            /* `dense`, because these are ledger rows and not cards. */
            <Reveal className="overflow-hidden rounded-card border border-gray-100 shadow-card" dense delay={0.1}>
              {rewards.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center gap-3 border-b border-gray-50 px-5 py-4 last:border-0 sm:px-7">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand" aria-hidden>
                    <Icon name={r.reward_type === 'cash' ? 'money' : 'ticket'} className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">
                      {r.reward_type === 'cash' ? tr('Cash prize') : tr('Tryp.com voucher')}
                      {/* WHERE IT CAME FROM. A voucher with no context is a
                          line saying money exists. Challenge prizes had a
                          title; referral and milestone vouchers had nothing,
                          so the two rewards a creator earns OUTSIDE a
                          challenge were the two they could not identify. */}
                      {r.challenges?.title && <span className="font-normal text-smoke"> · {r.challenges.title}</span>}
                      {r.milestones?.title && <span className="font-normal text-smoke"> · {tr('Milestone')}: {r.milestones.title}</span>}
                      {r.source === 'referral' && <span className="font-normal text-smoke"> · {tr('Referral')}</span>}
                    </p>
                    <p className="text-xs text-smoke">
                      {r.status === 'distributed'
                        ? tr('Distributed {date}', { date: formatDate(r.distributed_at) })
                        : tr('Added {date}', { date: formatDate(r.created_at) })}
                    </p>
                  </div>
                  <span className="text-base font-bold tabular-nums">{formatMoney(r.amount, r.currency)}</span>
                  {/* The row's own status, in words rather than the database's. */}
                  <Badge tone={r.status === 'distributed' ? 'green' : 'amber'}>
                    {r.status === 'distributed' ? tr('Paid out') : tr('Pending')}
                  </Badge>
                </div>
              ))}
            </Reveal>
          )}

          {/* WHAT YOU WERE PAID, THEN WHAT YOU CAN SHOW FOR IT. Under the
              ledger and never inside it - see the note in CertificateWall for
              why a certificate button on every reward ROW was removed and why
              a section of its own is a different thing. Draws nothing at all
              until somebody has one. */}
          <CertificateWall profileId={whose} className="mt-12" readOnly={viewing} />
        </>
      )}

    </div>
  )
}
