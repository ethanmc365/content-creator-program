import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Badge, EmptyState, PageHeader, Skeleton } from '../components/ui'
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
      .select('*, challenges(title), milestones(title), profiles:creator_id(name), invoices(stage, sent_at, paid_at)')
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
    // A combined voucher is several rows and the database ticks them together.
    const ids = reward.rewardIds || [reward.id]
    setRewards((rs) => rs.map((r) => (ids.includes(r.id) ? { ...r, used_at: data ?? null } : r)))
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
  const sources = [
    { key: 'challenge', label: tr('Challenges'), icon: 'trophy', n: rewards.filter((r) => r.challenge_id).length },
    { key: 'milestone', label: tr('Milestones'), icon: 'flag', n: rewards.filter((r) => r.milestone_id).length },
    { key: 'referral', label: tr('Referrals'), icon: 'users', n: rewards.filter((r) => r.source === 'referral').length },
    { key: 'vip', label: tr('VIP'), icon: 'star', n: rewards.filter((r) => r.source === 'vip').length },
  ].filter((x) => x.n > 0)

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
          {/* ONE CARD FOR THE TWO FIGURES (3 Oct 2026). Ethan: the rewards page "needs to be improved for the
              creators". What you have received and what is on its way, on the brand card, with where it came from
              underneath - challenges, milestones, referrals - so the page answers "for what" as well as "how much". */}
          <Reveal className="mb-10">
            <section className="relative overflow-hidden rounded-card bg-gradient-to-br from-brand to-brand-light p-5 text-white shadow-card sm:p-7">
              <span aria-hidden className="pointer-events-none absolute -right-12 -top-16 h-56 w-56 rounded-full bg-white/15 blur-2xl" />
              <div className="relative grid gap-5 sm:grid-cols-2">
                <div>
                  <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-white/85"><Icon name="money" className="h-4 w-4" />{tr('Total received')}</p>
                  <p className="mt-1 text-4xl font-bold tabular-nums tracking-tight sm:text-5xl">{showTotal(earned)}</p>
                </div>
                <div className="sm:border-l sm:border-white/25 sm:pl-6">
                  <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-white/85"><Icon name="clock" className="h-4 w-4" />{tr('On its way')}</p>
                  <p className="mt-1 text-2xl font-bold tabular-nums sm:text-3xl">{showTotal(pending)}</p>
                  <p className="mt-1 text-xs text-white/85">{pending.amount > 0 ? tr('The team is processing it. Nothing for you to do.') : tr('Nothing pending right now.')}</p>
                </div>
              </div>
              {sources.length > 0 && (
                <div className="relative mt-5 flex flex-wrap gap-2">
                  {sources.map((x) => (
                    <span key={x.key} className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold">
                      <Icon name={x.icon} className="h-3.5 w-3.5" />{x.label}<span className="tabular-nums text-white/85">{x.n}</span>
                    </span>
                  ))}
                </div>
              )}
            </section>
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
                        : sentInvoice(r)
                          // YOUR INVOICE HAS ALREADY GONE (3 Oct 2026). A creator asked whether they should send it to
                          // finance themselves. The team sends every invoice; this says it has been sent and when.
                          ? tr('Your invoice was sent to Tryp.com finance on {date}. Nothing for you to do, it is paid within 7 days.', { date: formatDate(sentInvoice(r).sent_at) })
                          : tr('Added {date}', { date: formatDate(r.created_at) })}
                    </p>
                  </div>
                  <span className="text-base font-bold tabular-nums">{formatMoney(r.amount, r.currency)}</span>
                  {/* The row's own status, in words rather than the database's. */}
                  <Badge tone={r.status === 'distributed' ? 'green' : sentInvoice(r) ? 'light' : 'amber'}>
                    {r.status === 'distributed' ? tr('Paid out') : sentInvoice(r) ? tr('Invoice sent') : tr('Pending')}
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

// The invoice behind a cash reward once the team has sent it (creators can read their own only from 'sent' on).
function sentInvoice(r) {
  const list = Array.isArray(r.invoices) ? r.invoices : r.invoices ? [r.invoices] : []
  return list.find((i) => i.stage === 'sent' && i.sent_at) || null
}
