import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { motion } from 'motion/react'
import { supabase } from '../lib/supabase'
import { useCommunity } from '../context/CommunityContext'
import NetworkLayout, { RailCard, flagFromIso } from '../components/network/NetworkLayout'
import NetworkMotion from '../components/NetworkMotion'
import MarketHeader from '../components/network/MarketHeader'
import MarketMap from '../components/network/MarketMap'
import MarketActivity from '../components/network/MarketActivity'
import { isOnline, countOnline } from '../lib/presence'
import { MarketOverviewSkeleton, LiveChallengeSkeleton, CardGridSkeleton, RailCardSkeleton } from '../components/network/Skeletons'
import LiveChallengeCard, { NoLiveChallenge } from '../components/network/LiveChallengeCard'
import Icon from '../components/Icon'
import { Avatar, EmptyState } from '../components/ui'
import { cx, timeAgo, challengeDeadline } from '../lib/utils'
import { stripMarkup } from '../lib/richText'
import { listContainer, listItem, cardHover, pageFade } from '../lib/motion'

// A single market's overview, seen by the people IN it.
//
// What a creator sees here is deliberately narrower than what a manager sees.
// Currency, CPM target and the roster are operating numbers for the Tryp.com
// team: telling a creator their market is "10x over its CPM target" tells them
// nothing they can act on and quite a lot they will misread. Those live in
// /manage/:slug behind the manager check.
//
// SCORING RULES ARE NOT ON THIS PAGE ANY MORE
//
// A "how points work here" panel used to sit in the middle of it. That was
// wrong twice over: the rules are set per CHALLENGE now, not per market, and
// half the markets do not run points at all, so a creator in a best-video
// market was being taught a scoring system that would never apply to them.
// Scoring lives on the challenge it governs.

const MotionLink = motion.create(Link)

export default function ChapterHome() {
  const { slug } = useParams()
  const { bySlug, manages, error, loading: ctxLoading } = useCommunity()
  const chapter = bySlug(slug)
  const canManage = chapter ? manages(chapter.id) : false
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!chapter) return
    let cancelled = false
    async function load() {
      setLoading(true)
      const [
        { data: channels }, { count: members }, { data: challenges },
        { data: standings }, { data: ann }, { data: roster },
      ] = await Promise.all([
        supabase.from('channels').select('id, key, label, hint, icon, visibility, position')
          .eq('community_id', chapter.id).order('position'),
        supabase.from('community_members')
          .select('profile_id, profiles!inner(is_admin, is_test, status)', { count: 'exact', head: true })
          .eq('community_id', chapter.id).eq('status', 'active')
          .eq('profiles.is_admin', false).eq('profiles.is_test', false).eq('profiles.status', 'active'),
        supabase.from('challenges').select('id, title, status, end_date, scoring, description, submissions(count)')
          .eq('community_id', chapter.id).order('end_date', { ascending: false }).limit(6),
        supabase.from('community_standings')
          .select('creator_id, points, profiles!inner(id, name, photo_url, is_test)')
          .eq('community_id', chapter.id).order('points', { ascending: false }).limit(8),
        // THIS market's announcements, not the network's. The two are different
        // rooms and mixing them is what made the markets feel like views onto
        // one shared feed.
        supabase.from('messages')
          .select('id, body, created_at, profiles:sender_id(name, photo_url)')
          .eq('channel', `${chapter.slug}:announcements`).eq('deleted', false)
          .order('created_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('community_members')
          .select('profile_id, profiles!inner(id, name, photo_url, country_code, last_seen_at, is_admin, is_test, status)')
          .eq('community_id', chapter.id).eq('status', 'active')
          .eq('profiles.is_test', false).eq('profiles.status', 'active').limit(24),
      ])
      if (cancelled) return

      // Participation against THIS market's roster. The old page borrowed the
      // platform-wide creator count, which is how a market with nobody in it
      // reported "0 of 43".
      const live = (challenges || []).find(
        (c) => c.status === 'active' && challengeDeadline(c.end_date).getTime() > Date.now(),
      )
      let participation = null
      if (live) {
        const { data: entrants } = await supabase
          .from('submissions').select('creator_id').eq('challenge_id', live.id)
        if (cancelled) return
        participation = {
          posted: new Set((entrants || []).map((e) => e.creator_id)).size,
          total: members ?? 0,
        }
      }

      setData({
        channels: channels || [], members, challenges: challenges || [],
        standings: (standings || []).filter((s) => !s.profiles.is_test),
        ann, live, participation,
        roster: (roster || []).map((r) => r.profiles),
      })
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [chapter])

  if (error) {
    return <NetworkLayout><EmptyState icon={<Icon name="alert" className="h-6 w-6" />} title="Not readable yet" hint={error} /></NetworkLayout>
  }
  if (ctxLoading && !chapter) {
    return <NetworkLayout><MarketOverviewSkeleton /></NetworkLayout>
  }
  if (!chapter) {
    return (
      <NetworkLayout>
        <EmptyState icon={<Icon name="pin" className="h-6 w-6" />} title="No such market"
          hint={`Nothing here is called "${slug}".`}
          action={<Link to="/global" className="btn-secondary">Back to Worldwide</Link>} />
      </NetworkLayout>
    )
  }

  const flags = (chapter.country_codes || []).map(flagFromIso).join(' ')
  const past = (data?.challenges || []).filter((c) => c.id !== data?.live?.id)

  const rail = (
    <>
      <RailCard icon={<Icon name="chat" className="h-3.5 w-3.5 text-brand" />} title="Rooms">
        {loading ? <RailCardSkeleton rows={3} /> : (
          <div className="space-y-0.5">
            {data.channels.map((ch) => (
              <Link key={ch.id} to={`/c/${chapter.slug}/chat/${ch.key}`}
                className="group flex items-center gap-2.5 rounded-xl px-3 py-2 transition-colors hover:bg-cloud">
                <Icon name={ch.icon || 'chat'} className="h-4 w-4 shrink-0 text-smoke transition-colors group-hover:text-brand" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{ch.label}</span>
                {ch.visibility === 'staff' && (
                  <span className="shrink-0 rounded-full bg-cloud px-1.5 py-0.5 text-[10px] font-medium text-smoke">Staff</span>
                )}
              </Link>
            ))}
          </div>
        )}
      </RailCard>

      {data?.standings?.length > 0 && (
        <RailCard
          icon={<Icon name="chart" className="h-3.5 w-3.5 text-brand" />}
          title={`${chapter.name} standings`}
        >
          <div className="space-y-1">
            {data.standings.slice(0, 5).map((s, i) => (
              <div key={s.creator_id} className="flex items-center gap-2.5 px-1 py-1">
                <span className={cx('w-4 shrink-0 text-xs font-bold', i === 0 ? 'text-brand' : 'text-smoke')}>{i + 1}</span>
                <Avatar src={s.profiles.photo_url} name={s.profiles.name} size="xs" />
                <Link to={`/profile/${s.creator_id}`} className="min-w-0 flex-1 truncate text-xs font-medium hover:text-brand">
                  {s.profiles.name}
                </Link>
                <span className="shrink-0 text-xs font-bold text-brand">{Number(s.points)}</span>
              </div>
            ))}
          </div>
        </RailCard>
      )}

      {data?.roster?.length > 0 && (
        <RailCard
          icon={<Icon name="users" className="h-3.5 w-3.5 text-brand" />}
          title="Who is here"
          action={
            <Link to={`/c/${chapter.slug}/members`} className="text-[11px] font-medium text-brand transition-transform duration-200 hover:scale-105">
              All
            </Link>
          }
        >
          {/* Presence, from the heartbeat AppLayout already sends. The number
              of people actually around is the single most useful thing a
              community page can say, and nothing was reading it. */}
          {countOnline(data.roster) > 0 && (
            <p className="mb-2.5 flex items-center gap-1.5 px-1 text-xs font-medium text-green-600">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500/70" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-green-500" />
              </span>
              {countOnline(data.roster)} online now
            </p>
          )}
          <div className="flex flex-wrap gap-1.5">
            {data.roster
              .slice()
              .sort((a, b) => (isOnline(b.last_seen_at) ? 1 : 0) - (isOnline(a.last_seen_at) ? 1 : 0))
              .slice(0, 12)
              .map((p) => (
                <Link key={p.id} to={`/profile/${p.id}`} title={p.name}
                  className="relative transition-transform duration-200 hover:scale-110">
                  <Avatar src={p.photo_url} name={p.name} size="sm" />
                  {isOnline(p.last_seen_at) && (
                    <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-green-500 ring-2 ring-white" />
                  )}
                </Link>
              ))}
          </div>
        </RailCard>
      )}

      {/* The network is one link away from every market page. Without it a
          market becomes a place you fall into and have to use the browser back
          button to leave. */}
      <RailCard icon={<Icon name="globe" className="h-3.5 w-3.5 text-brand" />} title="Worldwide">
        <p className="mb-3 px-1 text-xs text-smoke">
          Your connections, DMs, the map and the daily game are shared by every market.
        </p>
        <Link to="/global" className="btn-secondary w-full justify-center !py-2 !text-sm">
          Go to Worldwide
        </Link>
      </RailCard>
    </>
  )

  return (
    <NetworkMotion>
      <NetworkLayout rail={rail}>
        <motion.div {...pageFade} className="space-y-10">
          <MarketHeader market={chapter} memberCount={loading ? null : data?.members} canManage={canManage} tab="Overview" />

          {/* ---------- Live challenge ---------- */}
          <section>
            {loading ? (
              <LiveChallengeSkeleton />
            ) : data.live ? (
              <LiveChallengeCard
                challenge={data.live}
                market={chapter.name}
                flags={flags}
                entries={data.live.submissions?.[0]?.count ?? 0}
                participation={data.participation}
              />
            ) : (
              <NoLiveChallenge market={chapter.name} canCreate={canManage} slug={chapter.slug} />
            )}
          </section>

          {/* ---------- This market's latest announcement ---------- */}
          {data?.ann && (
            <section>
              <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
                <Icon name="megaphone" className="h-5 w-5 text-brand" /> Latest from {chapter.name}
              </h2>
              <MotionLink to={`/c/${chapter.slug}/chat/announcements`} {...cardHover}
                className="card block border-l-4 !border-l-brand hover:shadow-lift">
                <div className="flex items-center gap-3">
                  <Avatar src={data.ann.profiles?.photo_url} name={data.ann.profiles?.name} size="sm" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{data.ann.profiles?.name}</p>
                    <p className="text-xs text-smoke">{timeAgo(data.ann.created_at)}</p>
                  </div>
                </div>
                <p className="mt-3 line-clamp-3 text-sm">{stripMarkup(data.ann.body)}</p>
              </MotionLink>
            </section>
          )}

          {/* ---------- Rooms ---------- */}
          <section>
            <div className="mb-4">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <Icon name="chat" className="h-5 w-5 text-brand" /> Rooms
              </h2>
              <p className="mt-1 text-sm text-smoke">
                {chapter.name}&rsquo;s own rooms. Nothing posted here reaches another market.
              </p>
            </div>
            {loading ? (
              <CardGridSkeleton count={3} height="h-20" />
            ) : (
              <motion.div variants={listContainer} initial="hidden" animate="show" className="grid gap-3 sm:grid-cols-2">
                {data.channels.map((ch) => (
                  <MotionLink key={ch.id} to={`/c/${chapter.slug}/chat/${ch.key}`}
                    variants={listItem} {...cardHover}
                    className={cx(
                      'card flex flex-col gap-1 !p-5 hover:shadow-lift',
                      // General is the room a market is FOR. It gets the brand
                      // edge so it is never one of four identical tiles.
                      ch.key === 'general' && 'border-brand/30 bg-brand-tint/20',
                    )}>
                    <div className="flex items-center gap-2">
                      <Icon name={ch.icon || 'chat'} className="h-4 w-4 shrink-0 text-brand" />
                      <span className="font-semibold">{ch.label}</span>
                      {ch.key === 'general' && (
                        <span className="ml-auto rounded-full bg-brand px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                          Main room
                        </span>
                      )}
                      {ch.visibility === 'staff' && (
                        <span className="ml-auto rounded-full bg-cloud px-2 py-0.5 text-[10px] font-medium text-smoke">Staff</span>
                      )}
                    </div>
                    {ch.hint && <p className="text-xs text-smoke">{ch.hint}</p>}
                  </MotionLink>
                ))}
              </motion.div>
            )}
          </section>

          {/* ---------- Recent activity ---------- */}
          {/* A market can be entirely correct and still read as abandoned. This
              is the cheapest possible proof that it is not. */}
          <section>
            <div className="mb-4">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <Icon name="clock" className="h-5 w-5 text-brand" /> Lately in {chapter.name}
              </h2>
              <p className="mt-1 text-sm text-smoke">Who joined, who posted, who entered.</p>
            </div>
            <MarketActivity market={chapter} />
          </section>

          {/* ---------- Where this market is ---------- */}
          {/* Zoomed to the market, not the world. It also does real layout
              work: a market with no challenge and no announcement used to end
              after two room tiles, leaving the page visibly unfinished. */}
          <section>
            <div className="mb-4">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <Icon name="pin" className="h-5 w-5 text-brand" /> Where we are in {chapter.name}
              </h2>
              <p className="mt-1 text-sm text-smoke">
                Every creator here, in the town they filmed this morning.
              </p>
            </div>
            <MarketMap marketId={chapter.id} marketName={chapter.name} />
          </section>

          {/* ---------- Getting started ---------- */}
          {/* Only for whoever runs a market that has not opened yet. It is the
              difference between an empty page and a page with a next step. */}
          {canManage && (!chapter.is_active || (data && data.members === 0)) && (
            <section>
              <div className="rounded-card border border-brand/25 bg-brand-tint/20 p-6">
                <h2 className="text-lg font-semibold">Getting {chapter.name} off the ground</h2>
                <p className="mt-1 text-sm text-smoke">
                  Nobody sees any of this until you switch the market on.
                </p>
                <ul className="mt-5 space-y-2.5">
                  {[
                    { done: !!chapter.tagline, label: 'Write a tagline so it introduces itself', to: `/manage/${chapter.slug}` },
                    { done: (data?.channels?.length || 0) > 2, label: 'Add a room beyond General and Announcements', to: `/manage/${chapter.slug}` },
                    { done: (data?.challenges?.length || 0) > 0, label: 'Create the first challenge', to: `/admin/challenges/new?market=${chapter.slug}` },
                    { done: (data?.members || 0) > 0, label: 'Get the first creators in', to: `/manage/${chapter.slug}` },
                    { done: chapter.is_active, label: 'Open it to creators', to: `/manage/${chapter.slug}` },
                  ].map((step) => (
                    <li key={step.label}>
                      <Link to={step.to}
                        className="flex items-center gap-3 rounded-xl bg-white px-4 py-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card">
                        <span className={cx(
                          'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px]',
                          step.done ? 'border-brand bg-brand text-white' : 'border-gray-300 text-transparent',
                        )}>
                          ✓
                        </span>
                        <span className={cx('min-w-0 flex-1 text-sm', step.done ? 'text-smoke line-through' : 'font-medium')}>
                          {step.label}
                        </span>
                        <Icon name="chevronRight" className="h-4 w-4 shrink-0 text-gray-300" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}

          {/* ---------- Recent challenges ---------- */}
          {past.length > 0 && (
            <section>
              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  <Icon name="flag" className="h-5 w-5 text-brand" /> Recent challenges
                </h2>
                <Link to={`/c/${chapter.slug}/challenges`} className="text-sm font-medium text-brand transition-transform duration-200 hover:scale-105">
                  All challenges →
                </Link>
              </div>
              <motion.div variants={listContainer} initial="hidden" animate="show" className="space-y-2">
                {past.slice(0, 4).map((c) => (
                  <MotionLink key={c.id} to={`/challenges/${c.id}`} variants={listItem} {...cardHover}
                    className="flex items-center gap-3 rounded-card border border-gray-100 bg-white px-5 py-4">
                    <span className="min-w-0 flex-1 truncate font-medium">{c.title}</span>
                    <span className="shrink-0 text-xs text-smoke">
                      {c.submissions?.[0]?.count ?? 0} {(c.submissions?.[0]?.count ?? 0) === 1 ? 'entry' : 'entries'}
                    </span>
                    <Icon name="chevronRight" className="h-4 w-4 shrink-0 text-gray-300" />
                  </MotionLink>
                ))}
              </motion.div>
            </section>
          )}
        </motion.div>
      </NetworkLayout>
    </NetworkMotion>
  )
}
