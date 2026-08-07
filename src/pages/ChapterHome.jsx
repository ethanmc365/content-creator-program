import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { motion } from 'motion/react'
import { supabase } from '../lib/supabase'
import { listContainer, listItem, cardHover, pageFade, SOFT_SPRING } from '../lib/motion'
import { useCommunity } from '../context/CommunityContext'
import { PageHeader, StatCard, Skeleton, EmptyState, Badge } from '../components/ui'
import Icon from '../components/Icon'
import { cx } from '../lib/utils'

const MotionLink = motion.create(Link)

// A single market, shown as what it is: a room inside the network, not a
// separate app. The breadcrumb back to Worldwide is deliberately the first thing
// on the page.

export default function ChapterHome() {
  const { slug } = useParams()
  const { bySlug, network, myCommunities, manages, loading: ctxLoading, error } = useCommunity()
  const chapter = bySlug(slug)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  const mine = myCommunities.find((c) => c.slug === slug)

  useEffect(() => {
    if (!chapter) return
    let cancelled = false
    async function load() {
      setLoading(true)
      const [{ data: channels }, { count: members }, { data: challenges }] = await Promise.all([
        supabase.from('channels').select('id, key, label, hint, icon, visibility, position')
          .eq('community_id', chapter.id).order('position'),
        supabase.from('community_members').select('profile_id', { count: 'exact', head: true })
          .eq('community_id', chapter.id).eq('status', 'active'),
        supabase.from('challenges').select('id, title, status, end_date')
          .eq('community_id', chapter.id).order('end_date', { ascending: false }).limit(5),
      ])
      if (cancelled) return
      setData({ channels: channels || [], members, challenges: challenges || [] })
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [chapter])

  if (error) {
    return (
      <div className="page mx-auto w-full max-w-5xl px-4 py-8">
        <EmptyState
          icon={<Icon name="alert" className="h-6 w-6" />}
          title="The network tables are not readable yet"
          hint={`Migrations 073 and 074 need to be applied first. The database said: ${error}`}
        />
      </div>
    )
  }

  if (ctxLoading && !chapter) {
    return (
      <div className="page mx-auto w-full max-w-5xl px-4 py-8">
        <Skeleton className="h-10 w-64" />
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" />
        </div>
      </div>
    )
  }

  if (!chapter) {
    return (
      <div className="page mx-auto w-full max-w-5xl px-4 py-8">
        <EmptyState
          icon={<Icon name="pin" className="h-6 w-6" />}
          title="No such market"
          hint={`Nothing here is called "${slug}". It may not be open yet.`}
          action={<Link to="/global" className="btn-secondary">Back to Worldwide</Link>}
        />
      </div>
    )
  }

  const activeChallenge = data?.challenges?.find((c) => c.status === 'active')

  return (
    <motion.div {...pageFade} className="page mx-auto w-full max-w-5xl px-4 py-8">
      {/* Breadcrumb first: you are in the network, and this is one room in it. */}
      <Link
        to="/global"
        className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-smoke transition-colors hover:text-brand"
      >
        <Icon name="chevronLeft" className="h-4 w-4" />
        {network?.name || 'Worldwide'}
      </Link>

      <PageHeader
        title={chapter.name}
        subtitle={
          chapter.is_active
            ? 'Briefs, submissions, results and payouts for this market. Your connections and messages stay worldwide.'
            : 'This market is not open yet. It stays invisible to creators until it has a lead.'
        }
        action={
          // The per-chapter manage surface (/manage/:slug) is phase 5. Until it
          // exists this points at the current admin panel rather than at a route
          // that would bounce to the landing page.
          manages(chapter.id) ? (
            <Link to="/admin" className="btn-secondary">
              <Icon name="shield" className="h-4 w-4" />
              Manage
            </Link>
          ) : null
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Members" value={loading ? '—' : data?.members ?? 0} accent={!!mine} />
        <StatCard label="Currency" value={chapter.currency} hint={chapter.country_codes?.join(' · ') || 'Global'} />
        <StatCard label="CPM target" value={Number(chapter.cpm_target).toFixed(2)} hint="Set per market" />
      </div>

      {activeChallenge && (
        <MotionLink
          to={`/challenges/${activeChallenge.id}`}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={SOFT_SPRING}
          {...cardHover}
          className="card mt-6 flex items-center gap-4 hover:shadow-lift"
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-tint text-brand">
            <Icon name="flag" className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand">Live challenge</p>
            <p className="truncate font-semibold">{activeChallenge.title}</p>
          </div>
          <Icon name="chevronRight" className="ml-auto h-5 w-5 shrink-0 text-gray-300" />
        </MotionLink>
      )}

      <h2 className="mt-10 text-lg font-semibold tracking-tight">Rooms</h2>
      <p className="mt-1 text-sm text-smoke">
        Purposeful rooms for this market. The main conversation stays in Worldwide.
      </p>
      {loading ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Skeleton className="h-20" /><Skeleton className="h-20" /><Skeleton className="h-20" />
        </div>
      ) : data?.channels?.length ? (
        <motion.div
          variants={listContainer}
          initial="hidden"
          animate="show"
          className="mt-4 grid gap-3 sm:grid-cols-3"
        >
          {data.channels.map((ch) => (
            <motion.div
              key={ch.id}
              variants={listItem}
              {...cardHover}
              className={cx('card flex flex-col gap-1 p-5 hover:shadow-lift')}
            >
              <div className="flex items-center gap-2">
                <Icon name={ch.icon || 'chat'} className="h-4 w-4 text-brand" />
                <span className="font-semibold">{ch.label}</span>
                {ch.visibility === 'staff' && <Badge tone="grey">Staff</Badge>}
              </div>
              {ch.hint && <p className="text-xs text-smoke">{ch.hint}</p>}
            </motion.div>
          ))}
        </motion.div>
      ) : (
        <p className="mt-4 text-sm text-smoke">No rooms yet.</p>
      )}

      <h2 className="mt-10 text-lg font-semibold tracking-tight">Challenges</h2>
      {loading ? (
        <Skeleton className="mt-4 h-24" />
      ) : data?.challenges?.length ? (
        <div className="mt-4 flex flex-col gap-2">
          {data.challenges.map((c) => (
            <Link
              key={c.id}
              to={`/challenges/${c.id}`}
              className="flex items-center gap-3 rounded-card border border-gray-100 bg-white px-5 py-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card"
            >
              <span className="truncate font-medium">{c.title}</span>
              <Badge tone={c.status === 'active' ? 'light' : 'grey'} className="ml-auto shrink-0">
                {c.status}
              </Badge>
            </Link>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-smoke">No challenges in this market yet.</p>
      )}
    </motion.div>
  )
}
