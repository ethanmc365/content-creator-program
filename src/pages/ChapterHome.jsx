import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { motion } from 'motion/react'
import { supabase } from '../lib/supabase'
import { useCommunity } from '../context/CommunityContext'
import NetworkLayout, { flagFromIso } from '../components/network/NetworkLayout'
import NetworkMotion from '../components/NetworkMotion'
import Icon from '../components/Icon'
import { Avatar, Badge, EmptyState, Skeleton } from '../components/ui'
import { cx, timeAgo } from '../lib/utils'
import { stripMarkup } from '../lib/richText'
import { listContainer, listItem, cardHover, pageFade, SOFT_SPRING } from '../lib/motion'

// A single market, seen by the people IN it.
//
// What a creator sees here is deliberately narrower than what a manager sees.
// Currency, CPM target and the roster are operating numbers for the Tryp.com
// team: showing a creator that their market is "10x over its CPM target" tells
// them nothing they can act on and quite a lot they will misread. Those live in
// /manage/:slug behind the manager check.

const MotionLink = motion.create(Link)

export default function ChapterHome() {
  const { slug } = useParams()
  const { bySlug, network, manages, error, loading: ctxLoading } = useCommunity()
  const chapter = bySlug(slug)
  const canManage = chapter ? manages(chapter.id) : false
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!chapter) return
    let cancelled = false
    async function load() {
      setLoading(true)
      const [{ data: channels }, { count: members }, { data: challenges }, { data: standings }, { data: rules }, { data: ann }] =
        await Promise.all([
          supabase.from('channels').select('id, key, label, hint, icon, visibility, position')
            .eq('community_id', chapter.id).order('position'),
          supabase.from('community_members')
            .select('profile_id, profiles!inner(is_admin, is_test, status)', { count: 'exact', head: true })
            .eq('community_id', chapter.id).eq('status', 'active')
            .eq('profiles.is_admin', false).eq('profiles.is_test', false).eq('profiles.status', 'active'),
          supabase.from('challenges').select('id, title, status, end_date, scoring, description')
            .eq('community_id', chapter.id).order('end_date', { ascending: false }).limit(5),
          supabase.from('community_standings')
            .select('creator_id, points, profiles!inner(id, name, photo_url, is_test)')
            .eq('community_id', chapter.id).order('points', { ascending: false }).limit(10),
          supabase.from('point_rules').select('id, kind, label, points, threshold, max_points')
            .eq('community_id', chapter.id).is('challenge_id', null).order('position'),
          // THIS market's announcements, not the network's. The two are
          // different rooms and mixing them is what made the markets feel like
          // views onto one shared feed.
          supabase.from('messages')
            .select('id, body, created_at, profiles:sender_id(name, photo_url)')
            .eq('channel', `${chapter.slug}:announcements`).eq('deleted', false)
            .order('created_at', { ascending: false }).limit(1).maybeSingle(),
        ])
      if (cancelled) return
      setData({
        channels: channels || [], members, challenges: challenges || [],
        standings: (standings || []).filter((s) => !s.profiles.is_test),
        rules: rules || [],
        ann,
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
    return <NetworkLayout><Skeleton className="h-96" /></NetworkLayout>
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

  const live = data?.challenges?.find((c) => c.status === 'active')
  const flags = (chapter.country_codes || []).map(flagFromIso).join(' ')

  return (
    <NetworkMotion>
      <NetworkLayout>
        <motion.div {...pageFade} className="page space-y-10">

          {/* ---------- Heading ---------- */}
          <section>
            <Link to="/global" className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-smoke transition-colors hover:text-brand">
              <Icon name="chevronLeft" className="h-4 w-4" />
              {network?.name || 'Worldwide'}
            </Link>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight sm:text-4xl">
                {flags && <span aria-hidden>{flags}</span>}
                {chapter.name}
              </h1>
              {canManage && (
                <Link to={`/manage/${chapter.slug}`} className="btn-secondary !py-2.5">
                  <Icon name="shield" className="h-4 w-4" /> Market settings
                </Link>
              )}
            </div>
            <p className="mt-2 max-w-2xl text-smoke">
              {chapter.is_active
                ? `Challenges, briefs and rooms for ${chapter.name}. Your connections and messages stay worldwide.`
                : 'This market is not open yet. It stays invisible to creators until the team turns it on.'}
            </p>
            <p className="mt-3 flex items-center gap-1.5 text-sm text-smoke">
              <Icon name="users" className="h-4 w-4" />
              {loading ? '—' : data?.members ?? 0} {data?.members === 1 ? 'creator' : 'creators'}
            </p>
          </section>

          {/* ---------- Live challenge ---------- */}
          {/* Carries the market's flag so a Spanish challenge is never mistaken
              for a UK one at a glance. */}
          {live && (
            <MotionLink
              to={`/challenges/${live.id}`}
              initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={SOFT_SPRING}
              whileHover={{ y: -4, scale: 1.005 }}
              className="relative block overflow-hidden rounded-card bg-gradient-to-br from-brand to-brand-light p-6 text-white shadow-lift sm:p-8"
            >
              <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
              <div className="relative">
                <span className="inline-flex items-center gap-2 rounded-full bg-white/20 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/80" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
                  </span>
                  {flags} Live in {chapter.name}
                </span>
                <h2 className="mt-4 max-w-xl text-2xl font-bold leading-tight sm:text-3xl">{live.title}</h2>
                {live.description && <p className="mt-2 line-clamp-2 max-w-xl text-white/85">{live.description}</p>}
                <p className="mt-5 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold">
                  <Icon name={live.scoring === 'points' ? 'trophy' : 'money'} className="h-3.5 w-3.5" />
                  {live.scoring === 'points' ? 'Scored on points' : 'Cash prizes'}
                </p>
              </div>
            </MotionLink>
          )}

          {/* ---------- This market's latest announcement ---------- */}
          {data?.ann && (
            <section>
              <div className="mb-4">
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  <Icon name="megaphone" className="h-5 w-5 text-brand" /> Latest from {chapter.name}
                </h2>
              </div>
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
                {chapter.name}&rsquo;s own rooms. Completely separate from every other market.
              </p>
            </div>
            {loading ? (
              <div className="grid gap-3 sm:grid-cols-3"><Skeleton className="h-20" /><Skeleton className="h-20" /><Skeleton className="h-20" /></div>
            ) : (
              <motion.div variants={listContainer} initial="hidden" animate="show" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {data.channels.map((ch) => (
                  <MotionLink key={ch.id} to={`/c/${chapter.slug}/chat/${ch.key}`}
                    variants={listItem} {...cardHover}
                    className="card flex flex-col gap-1 !p-5 hover:shadow-lift">
                    <div className="flex items-center gap-2">
                      <Icon name={ch.icon || 'chat'} className="h-4 w-4 shrink-0 text-brand" />
                      <span className="font-semibold">{ch.label}</span>
                      {ch.visibility === 'staff' && <Badge tone="grey" className="ml-auto">Staff</Badge>}
                    </div>
                    {ch.hint && <p className="text-xs text-smoke">{ch.hint}</p>}
                  </MotionLink>
                ))}
              </motion.div>
            )}
          </section>

          {/* ---------- Scoring ---------- */}
          {data?.rules?.length > 0 && (
            <section>
              <div className="mb-4">
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  <Icon name="trophy" className="h-5 w-5 text-brand" /> How points work here
                </h2>
                <p className="mt-1 text-sm text-smoke">Every points challenge in this market starts from these.</p>
              </div>
              <motion.div variants={listContainer} initial="hidden" animate="show" className="grid gap-2 sm:grid-cols-2">
                {data.rules.map((r) => (
                  <motion.div key={r.id} variants={listItem}
                    className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white px-4 py-3">
                    <Icon name={r.kind === 'views_threshold' ? 'chart' : r.kind === 'bonus' ? 'star' : 'video'}
                      className="h-4 w-4 shrink-0 text-brand" />
                    <span className="min-w-0 truncate text-sm">{r.label}</span>
                    <span className="ml-auto shrink-0 text-sm font-semibold text-brand">
                      {Number(r.points)} {Number(r.points) === 1 ? 'pt' : 'pts'}
                    </span>
                    {r.max_points != null && <span className="shrink-0 text-xs text-smoke">max {Number(r.max_points)}</span>}
                  </motion.div>
                ))}
              </motion.div>
            </section>
          )}

          {/* ---------- Standings ---------- */}
          {data?.standings?.length > 0 && (
            <section>
              <div className="mb-4">
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  <Icon name="chart" className="h-5 w-5 text-brand" /> Standings
                </h2>
                <p className="mt-1 text-sm text-smoke">Points earned in {chapter.name}, all challenges combined.</p>
              </div>
              <motion.div variants={listContainer} initial="hidden" animate="show" className="space-y-2">
                {data.standings.map((s, i) => (
                  <motion.div key={s.creator_id} variants={listItem}
                    className={cx('flex items-center gap-3 rounded-xl border bg-white px-4 py-3',
                      i === 0 ? 'border-brand/30 bg-brand-tint/20' : 'border-gray-100')}>
                    <span className={cx('w-6 shrink-0 text-sm font-bold', i === 0 ? 'text-brand' : 'text-smoke')}>{i + 1}</span>
                    <Avatar src={s.profiles.photo_url} name={s.profiles.name} size="sm" />
                    <Link to={`/profile/${s.creator_id}`} className="min-w-0 truncate text-sm font-medium hover:text-brand">
                      {s.profiles.name}
                    </Link>
                    <span className="ml-auto shrink-0 text-sm font-bold text-brand">{Number(s.points)} pts</span>
                  </motion.div>
                ))}
              </motion.div>
            </section>
          )}

          {/* ---------- Challenges ---------- */}
          <section>
            <div className="mb-4">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <Icon name="flag" className="h-5 w-5 text-brand" /> Challenges
              </h2>
            </div>
            {loading ? <Skeleton className="h-20" /> : data.challenges.length === 0 ? (
              <p className="rounded-card border border-dashed border-gray-200 px-4 py-10 text-center text-sm text-smoke">
                No challenges in this market yet.
              </p>
            ) : (
              <motion.div variants={listContainer} initial="hidden" animate="show" className="space-y-2">
                {data.challenges.map((c) => (
                  <MotionLink key={c.id} to={`/challenges/${c.id}`} variants={listItem} {...cardHover}
                    className="flex items-center gap-3 rounded-card border border-gray-100 bg-white px-5 py-4">
                    <span className="min-w-0 truncate font-medium">{c.title}</span>
                    <Badge tone={c.scoring === 'points' ? 'light' : 'grey'} className="ml-auto shrink-0">
                      {c.scoring === 'points' ? 'Points' : 'Prize'}
                    </Badge>
                    <Badge tone={c.status === 'active' ? 'green' : 'grey'} className="shrink-0">{c.status}</Badge>
                  </MotionLink>
                ))}
              </motion.div>
            )}
          </section>
        </motion.div>
      </NetworkLayout>
    </NetworkMotion>
  )
}
