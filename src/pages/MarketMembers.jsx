import { useEffect, useState } from 'react'
import { isRealMember } from '../lib/members'
import { Link, useParams } from 'react-router-dom'
import { motion } from 'motion/react'
import { supabase } from '../lib/supabase'
import { useCommunity } from '../context/CommunityContext'
import NetworkLayout from '../components/network/NetworkLayout'
import NetworkMotion from '../components/NetworkMotion'
import MarketHeader from '../components/network/MarketHeader'
import { MarketHeaderSkeleton, CardGridSkeleton } from '../components/network/Skeletons'
import Icon from '../components/Icon'
import { flagFromIso } from '../components/network/PlaceSwitcher'
import { Avatar, Badge, EmptyState } from '../components/ui'
import { cx } from '../lib/utils'
import { listContainer, listItem, cardHover, pageFade } from '../lib/motion'
import { useT } from '../lib/i18n'

// Who is in this market.
//
// Deliberately NOT a second creator directory. /creators is the network's
// directory and it has the map, the filters and the travel view; duplicating any
// of that per market would split the one place creators go to find each other.
// This answers a narrower question: who else is competing in the same briefs as
// me, and how are they doing here.

const MotionLink = motion.create(Link)

export default function MarketMembers() {
  const tr = useT()
  const { slug } = useParams()
  const { bySlug, manages, loading: ctxLoading } = useCommunity()
  const market = bySlug(slug)
  const canManage = market ? manages(market.id) : false
  const [d, setD] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!market) return
    let cancelled = false
    async function load() {
      setLoading(true)
      const [{ data: members }, { data: standings }] = await Promise.all([
        // The same fields the shared membership predicate needs. See lib/members
        // for why the filtering happens in one place rather than in each query.
        supabase.from('community_members')
          .select('profile_id, role, is_home, joined_at, profiles!inner(id, name, photo_url, bio, country_code, is_admin, is_test, is_sandbox, status, deletion_requested_at)')
          .eq('community_id', market.id).eq('status', 'active'),
        supabase.from('community_standings')
          .select('creator_id, points').eq('community_id', market.id),
      ])
      if (cancelled) return
      setD({
        members: (members || []).filter((m) => isRealMember(m.profiles)),
        points: new Map((standings || []).map((s) => [s.creator_id, Number(s.points)])),
      })
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
        <EmptyState icon={<Icon name="pin" className="h-6 w-6" />} title={tr("No such market")}
          action={<Link to="/global" className="btn-secondary">{tr("Back to Worldwide")}</Link>} />
      </NetworkLayout>
    )
  }

  const creators = (d?.members || []).filter((m) => !m.profiles.is_admin)
  const team = (d?.members || []).filter((m) => m.profiles.is_admin)
  const ranked = creators
    .slice()
    .sort((a, b) => (d.points.get(b.profile_id) || 0) - (d.points.get(a.profile_id) || 0)
      || a.profiles.name.localeCompare(b.profiles.name))

  return (
    <NetworkMotion>
      <NetworkLayout>
        <motion.div {...pageFade} className="space-y-9">
          <MarketHeader market={market} memberCount={loading ? null : creators.length} canManage={canManage} tab="Creators" />

          {loading ? (
            <CardGridSkeleton count={6} cols="sm:grid-cols-2 xl:grid-cols-3" height="h-20" />
          ) : creators.length === 0 ? (
            <EmptyState
              icon={<Icon name="users" className="h-7 w-7" />}
              title={`Nobody has joined ${market.name} yet`}
              hint={tr("Creators are suggested this market at signup when their country matches. Until then it is quiet in here.")}
              action={<Link to="/global/markets" className="btn-secondary">{tr("See every market")}</Link>}
            />
          ) : (
            <>
              {/* THE TRYP.COM TEAM COMES FIRST. It used to sit under the roster,
                  which on Ireland meant scrolling past 44 creator cards to find
                  the four people who actually run the market. Ethan's read:
                  "the team here should actually be moved to the top above the
                  creators because that's showing the Tryp.com team". Putting it
                  first costs the roster nothing - it is a row of pills, not a
                  section - and it answers "who do I talk to" before the reader
                  has to go looking. */}
              {team.length > 0 && (
                <section>
                  <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
                    <Icon name="shield" className="h-5 w-5 text-brand" /> {tr("The team here")}
                  </h2>
                  <div className="flex flex-wrap gap-2">
                    {team.map((m) => (
                      <Link key={m.profile_id} to={`/profile/${m.profile_id}`}
                        className={cx('flex items-center gap-2.5 rounded-full border border-gray-200 bg-white py-1.5 pl-1.5 pr-4',
                          'transition-transform duration-200 hover:scale-105 hover:border-brand')}>
                        <Avatar src={m.profiles.photo_url} name={m.profiles.name} size="xs" />
                        <span className="text-sm font-medium">{m.profiles.name}</span>
                        {m.role === 'manager' && <Badge tone="light">{tr("Manager")}</Badge>}
                      </Link>
                    ))}
                  </div>
                </section>
              )}

              <section>
                <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
                  <Icon name="users" className="h-5 w-5 text-brand" />
                  {creators.length} {creators.length === 1 ? 'creator' : 'creators'}
                </h2>
                <motion.div variants={listContainer} initial="hidden" animate="show"
                  className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {ranked.map((m) => {
                    const pts = d.points.get(m.profile_id) || 0
                    return (
                      <MotionLink key={m.profile_id} to={`/profile/${m.profile_id}`}
                        variants={listItem} {...cardHover}
                        className="card flex min-w-0 items-center gap-3 !p-4 hover:shadow-lift">
                        <Avatar src={m.profiles.photo_url} name={m.profiles.name} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-1.5 truncate font-semibold">
                            <span className="truncate">{m.profiles.name}</span>
                            {m.profiles.country_code && (
                              <span className="shrink-0 text-xs" aria-hidden>{flagFromIso(m.profiles.country_code)}</span>
                            )}
                          </p>
                          <p className="truncate text-xs text-smoke">
                            {m.role === 'manager' ? 'Market manager' : m.profiles.bio || 'Creator'}
                          </p>
                        </div>
                        {pts > 0 && (
                          <span className="shrink-0 rounded-full bg-brand-tint px-2.5 py-1 text-xs font-bold text-brand">
                            {pts}
                          </span>
                        )}
                      </MotionLink>
                    )
                  })}
                </motion.div>
              </section>

            </>
          )}
        </motion.div>
      </NetworkLayout>
    </NetworkMotion>
  )
}
