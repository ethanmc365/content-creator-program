import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { motion } from 'motion/react'
import { supabase } from '../lib/supabase'
import { useCommunity } from '../context/CommunityContext'
import NetworkLayout from '../components/network/NetworkLayout'
import NetworkMotion from '../components/NetworkMotion'
import MarketHeader from '../components/network/MarketHeader'
import { MarketHeaderSkeleton, LiveChallengeSkeleton } from '../components/network/Skeletons'
import { NoLiveChallenge } from '../components/network/LiveChallengeCard'
import ChallengeDetail from './ChallengeDetail'
import Icon from '../components/Icon'
import { Avatar, Badge, EmptyState } from '../components/ui'
import { scoringMode } from '../lib/scoring'
import WinnersPodium from '../components/WinnersPodium'
import { loadWinnerGalleries } from '../lib/winners'
import { cx, formatDate, challengeDeadline } from '../lib/utils'
import { listContainer, listItem, cardHover, pageFade } from '../lib/motion'

// A market's own challenge board.
//
// WHY THIS EXISTS SEPARATELY FROM /challenges
//
// /challenges is the board for the market you call home, and it is the page 43
// UK creators open every day. This is the board for a SPECIFIC market, reached
// from inside that market. They look alike on purpose and they are not the same
// page: this one can show you a market you are only visiting, and it never has
// to guess which market you meant.
//
// Which is the whole bug that started this. The old code took "the active
// challenge" from an unfiltered list and got Spain's, then drew the UK's
// participation bar underneath it.

const MotionLink = motion.create(Link)

export default function MarketChallenges() {
  const { slug } = useParams()
  const { bySlug, manages, loading: ctxLoading } = useCommunity()
  const market = bySlug(slug)
  const canManage = market ? manages(market.id) : false
  const [d, setD] = useState(null)
  // The published podiums, from the same builder the main board uses.
  const [galleries, setGalleries] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!market) return
    let cancelled = false
    async function load() {
      setLoading(true)
      const [{ data: challenges }, { count: members }] = await Promise.all([
        supabase.from('challenges')
          .select('*, submissions(count)')
          .eq('community_id', market.id)
          .order('start_date', { ascending: false }),
        supabase.from('community_members')
          .select('profile_id, profiles!inner(is_admin, is_test, status)', { count: 'exact', head: true })
          .eq('community_id', market.id).eq('status', 'active')
          .eq('profiles.is_admin', false).eq('profiles.is_test', false).eq('profiles.status', 'active'),
      ])
      if (cancelled) return

      const all = challenges || []
      const live = all.find((c) => c.status === 'active' && challengeDeadline(c.end_date).getTime() > Date.now())

      let participation = null
      let winners = {}
      if (live) {
        const { data: entrants } = await supabase
          .from('submissions').select('creator_id').eq('challenge_id', live.id)
        if (cancelled) return
        participation = {
          posted: new Set((entrants || []).map((e) => e.creator_id)).size,
          total: members ?? 0,
        }
      }

      // Podium for finished challenges in this market only.
      const done = all.filter((c) => c.id !== live?.id).map((c) => c.id)
      if (done.length) {
        // THE VIEW COUNT COMES FROM THE SUBMISSIONS, NOT FROM `results`.
        // Same reason as the archive on /challenges: `results.final_views` is a
        // snapshot taken when an admin saved the results, and views keep being
        // read off each entry's link long afterwards, so the snapshot drifts
        // and this card ends up disagreeing with every leaderboard in the app.
        // The RANK still comes from `results`, because that is the decision.
        const [{ data: results }, { data: subs }] = await Promise.all([
          supabase.from('results')
            .select('challenge_id, creator_id, final_views, rank, profiles:creator_id(id, name, photo_url)')
            .in('challenge_id', done)
            .order('rank', { ascending: true }),
          supabase.from('submissions')
            .select('challenge_id, creator_id, logged_views')
            .in('challenge_id', done),
        ])
        if (cancelled) return
        const liveViews = new Map()
        for (const sub of subs || []) {
          const k = `${sub.challenge_id}:${sub.creator_id}`
          liveViews.set(k, (liveViews.get(k) || 0) + (Number(sub.logged_views) || 0))
        }
        for (const r of results || []) {
          (winners[r.challenge_id] ||= []).push({
            ...r,
            final_views: liveViews.get(`${r.challenge_id}:${r.creator_id}`) ?? r.final_views ?? 0,
          })
        }
      }

      setD({ all, live, members, participation, winners })
      const built = await loadWinnerGalleries(all)
      if (!cancelled) setGalleries(built)
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [market])

  if (ctxLoading && !market) {
    return <NetworkLayout><MarketHeaderSkeleton /></NetworkLayout>
  }
  if (!market) {
    return (
      <NetworkLayout>
        <EmptyState icon={<Icon name="pin" className="h-6 w-6" />} title="No such market"
          action={<Link to="/global" className="btn-secondary">Back to Worldwide</Link>} />
      </NetworkLayout>
    )
  }

  const past = (d?.all || []).filter((c) => c.id !== d?.live?.id)

  return (
    <NetworkMotion>
      <NetworkLayout>
        <motion.div {...pageFade} className="space-y-10">
          <MarketHeader market={market} memberCount={loading ? null : d?.members} canManage={canManage} tab="Challenges" />

          {/* THE LIVE BRIEF, NOT A CARD ABOUT IT.
              This tab used to show a second live challenge card carrying a
              button to the challenge page: two clicks and a page load to reach
              the brief you had already asked for by opening the tab called
              Challenges. It now renders the challenge itself - brief, prizes,
              entries, leaderboard, submit flow - by embedding the same
              component /challenges/:id uses, so there is one implementation and
              the two can never drift apart. */}
          <section>
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  <Icon name="flag" className="h-5 w-5 text-brand" /> Challenges in {market.name}
                </h2>
                <p className="mt-1 text-sm text-smoke">
                  Every brief run here, and how each one was won.
                </p>
              </div>
              {canManage && (
                <Link to={`/admin/challenges/new?market=${market.slug}`} className="btn-primary !py-2.5">
                  + New challenge
                </Link>
              )}
            </div>

            {loading ? (
              <LiveChallengeSkeleton />
            ) : d.live ? (
              <ChallengeDetail challengeId={d.live.id} marketParticipation={d.participation} embedded />
            ) : (
              <NoLiveChallenge market={market.name} canCreate={canManage} slug={market.slug} />
            )}
          </section>

          {past.length > 0 && (
            <section>
              <h2 className="mb-5 text-lg font-semibold text-smoke">Past challenges</h2>
              <motion.div variants={listContainer} initial="hidden" animate="show" className="grid gap-5 sm:grid-cols-2">
                {past.map((c) => {
                  const mode = scoringMode(c.scoring)
                  const podium = (d.winners[c.id] || []).slice(0, 3)
                  return (
                    <MotionLink key={c.id} to={`/challenges/${c.id}`} variants={listItem} {...cardHover}
                      className="card block hover:shadow-lift">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Badge tone={c.status === 'archived' ? 'grey' : 'amber'}>
                          {c.status === 'active' ? 'ended' : c.status}
                        </Badge>
                        <span className="text-xs text-smoke">
                          {formatDate(c.start_date)} → {formatDate(c.end_date)}
                        </span>
                      </div>
                      <h3 className="mt-3 text-lg font-semibold">{c.title}</h3>
                      <p className="mt-1.5 line-clamp-2 text-sm text-smoke">{c.description}</p>
                      <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-smoke">
                        <span className="flex items-center gap-1.5 font-medium text-ink">
                          <Icon name={mode.icon} className="h-3.5 w-3.5 text-brand" />
                          {mode.short}
                        </span>
                        <span aria-hidden>•</span>
                        <span>{c.submissions?.[0]?.count ?? 0} entries</span>
                      </p>
                      {/* THE REAL PODIUM, the same one the main challenges
                          board draws. This was a "Won by" strip: three small
                          faces, the first name of whoever came first and a
                          view count. Ethan: "for the past challenges it should
                          show the same view it does for the normal challenges
                          page, the actual podium graphic." The assembly lives
                          in lib/winners now so the two boards cannot drift.
                          `pointer-events-auto` because the whole card is a
                          link and the podium has its own targets inside it. */}
                      {galleries[c.id] ? (
                        /* ONE PODIUM, OR ONE PER BOARD. A challenge run as two
                           leaderboards has two sets of winners, and ranks are
                           stored per board - so a single podium off the flat
                           list would show two firsts and a second. See
                           lib/winners. */
                        galleries[c.id].boards?.length > 0 ? (
                          <div className="pointer-events-auto mt-5 space-y-4">
                            {galleries[c.id].boards.map((b) => (
                              <div key={b.id ?? 'all'}>
                                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand">{b.name}</p>
                                <WinnersPodium
                                  winners={b.winners}
                                  entries={b.entries}
                                  totalScore={b.totalScore}
                                  scoring={c.scoring}
                                  voucherWinners={[]}
                                  voucherPrize={c.participation_prize}
                                />
                              </div>
                            ))}
                          </div>
                        ) : (
                        <WinnersPodium
                          className="pointer-events-auto mt-5"
                          winners={galleries[c.id].winners}
                          entries={c.submissions?.[0]?.count ?? 0}
                          totalScore={galleries[c.id].totalScore}
                          scoring={c.scoring}
                          voucherWinners={galleries[c.id].voucherWinners}
                          voucherPrize={c.participation_prize}
                        />
                        )
                      ) : podium.length > 0 ? (
                        <div className="mt-4 flex items-center gap-3 rounded-xl bg-cloud/60 px-3 py-2.5">
                          <span className="text-[10px] font-semibold uppercase tracking-widest text-smoke">Won by</span>
                          <div className="flex min-w-0 items-center gap-2">
                            {podium.map((w, i) => (
                              <span key={w.creator_id} className="flex min-w-0 items-center gap-1.5">
                                <Avatar src={w.profiles?.photo_url} name={w.profiles?.name} size="xs"
                                  className={cx(i === 0 && 'ring-2 ring-amber-400')} />
                                {i === 0 && (
                                  <span className="min-w-0 truncate text-xs font-medium">
                                    {w.profiles?.name?.split(' ')[0]}
                                  </span>
                                )}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </MotionLink>
                  )
                })}
              </motion.div>
            </section>
          )}

          {!loading && d.all.length === 0 && (
            <EmptyState
              icon={<Icon name="flag" className="h-7 w-7" />}
              title={`No challenges in ${market.name} yet`}
              hint="The first brief for this market will appear here."
              action={canManage
                ? <Link to={`/admin/challenges/new?market=${market.slug}`} className="btn-primary">+ Create the first one</Link>
                : undefined}
            />
          )}
        </motion.div>
      </NetworkLayout>
    </NetworkMotion>
  )
}
