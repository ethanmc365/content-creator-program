import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { motion } from 'motion/react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useCommunity } from '../context/CommunityContext'
import NetworkLayout, { flagFromIso } from '../components/network/NetworkLayout'
import NetworkMotion from '../components/NetworkMotion'
import WorldMap from '../components/WorldMap'
import CreatorSpotlight from '../components/CreatorSpotlight'
import Icon from '../components/Icon'
import { Avatar, EmptyState, Skeleton } from '../components/ui'
import { flagForCountry } from '../lib/flags'
import { stripMarkup } from '../lib/richText'
import { cx, timeAgo } from '../lib/utils'
import { listContainer, listItem, cardHover, pageFade, SOFT_SPRING } from '../lib/motion'

// The Worldwide hub. Reads as a HOME PAGE, not a directory of markets: a
// greeting, then what is happening, then where everyone is.
//
// Everything here is NETWORK level. Market content (challenges, briefs, rooms,
// standings) lives on the market's own page. Mixing the two is what made
// Worldwide and Spain feel like the same place.

const MotionLink = motion.create(Link)

function SectionHead({ icon, title, hint, to, toLabel }) {
  return (
    <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Icon name={icon} className="h-5 w-5 shrink-0 text-brand" /> {title}
        </h2>
        {hint && <p className="mt-1 text-sm text-smoke">{hint}</p>}
      </div>
      {to && <Link to={to} className="text-sm font-medium text-brand hover:underline">{toLabel} →</Link>}
    </div>
  )
}

// A market as a DOOR, not a summary.
//
// This card used to print the market's live challenge title, which is what made
// Worldwide and Spain feel intertwined: you would be reading the network hub
// and half of what you saw belonged to one market. A challenge belongs on its
// market's page. What survives here is only what helps you decide where to go:
// the name, its size, and whether anything is running at all.
function MarketCard({ chapter, mine, memberCount, hasLive }) {
  const flags = (chapter.country_codes || []).map(flagFromIso).join(' ')
  return (
    <MotionLink
      to={`/c/${chapter.slug}`}
      variants={listItem}
      {...cardHover}
      className={cx(
        'flex items-center gap-3 rounded-card border bg-white px-5 py-4 hover:shadow-lift',
        mine ? 'border-brand/30 bg-brand-tint/20' : 'border-gray-100',
      )}
    >
      {flags && <span className="shrink-0 whitespace-nowrap text-lg leading-none" aria-hidden>{flags}</span>}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate font-semibold">{chapter.name}</span>
          {mine && <span className="shrink-0 rounded-full bg-brand px-2 py-0.5 text-[10px] font-semibold text-white">Yours</span>}
        </span>
        <span className="mt-0.5 flex items-center gap-2 text-xs text-smoke">
          {memberCount == null ? '—' : memberCount} {memberCount === 1 ? 'creator' : 'creators'}
          {hasLive && (
            <>
              <span aria-hidden>•</span>
              <span className="flex items-center gap-1.5 font-medium text-brand">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand/60" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand" />
                </span>
                Challenge running
              </span>
            </>
          )}
        </span>
      </span>
      <Icon name="chevronRight" className="h-4 w-4 shrink-0 text-gray-300" />
    </MotionLink>
  )
}

export default function GlobalHome() {
  const { profile } = useAuth()
  const { network, chapters, myCommunities, error } = useCommunity()
  const [d, setD] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const today = new Date().toISOString().slice(0, 10)
      const [
        { data: mems }, { count: creators }, { data: challenges },
        { data: ann }, { data: trips }, { data: fresh }, { data: visited }, { data: countries },
        { data: netStandings },
      ] = await Promise.all([
        supabase.from('community_members')
          .select('community_id, profiles!inner(is_admin, is_test, status)')
          .eq('status', 'active')
          .eq('profiles.is_admin', false).eq('profiles.is_test', false).eq('profiles.status', 'active'),
        supabase.from('profiles').select('id', { count: 'exact', head: true })
          .eq('status', 'active').eq('is_admin', false).eq('is_test', false),
        supabase.from('challenges').select('id, title, community_id, status').eq('status', 'active'),
        // The worldwide announcement thread. Chapter announcements live in the
        // market's own room and are shown there, not mixed in here.
        supabase.from('messages')
          .select('*, profiles:sender_id(name, photo_url)')
          .eq('channel', 'announcements').eq('deleted', false)
          .order('created_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('collab_posts')
          .select('id, city, country, start_date, end_date, profiles:creator_id(name, photo_url)')
          .gte('end_date', today).order('start_date', { ascending: true }).limit(6),
        supabase.from('profiles').select('id, name, photo_url, bio')
          .eq('status', 'active').eq('is_admin', false).eq('is_test', false)
          .is('deletion_requested_at', null).order('created_at', { ascending: false }).limit(4),
        supabase.from('profiles').select('countries_visited'),
        supabase.from('profiles').select('country_code').eq('status', 'active').not('country_code', 'is', null),
        supabase.from('network_standings')
          .select('creator_id, points, markets, profiles!inner(id, name, photo_url, is_test)')
          .order('points', { ascending: false }).limit(10),
      ])
      if (cancelled) return
      const tally = {}
      for (const m of mems || []) tally[m.community_id] = (tally[m.community_id] || 0) + 1
      const live = {}
      for (const c of challenges || []) live[c.community_id] = c
      setD({
        counts: tally, creators, live, ann, trips: trips || [], fresh: fresh || [],
        visited: [...new Set((visited || []).flatMap((p) => p.countries_visited || []))],
        nations: new Set((countries || []).map((p) => p.country_code)).size,
        network: (netStandings || []).filter((s) => !s.profiles.is_test),
      })
    }
    load()
    return () => { cancelled = true }
  }, [])

  if (error) {
    return (
      <NetworkLayout>
        <EmptyState icon={<Icon name="alert" className="h-6 w-6" />}
          title="The network tables are not readable yet" hint={error} />
      </NetworkLayout>
    )
  }

  const home = myCommunities.find((c) => c.membership.is_home)
  const openMarkets = chapters
    .filter((c) => c.is_active)
    .sort((a, b) => (b.id === home?.id) - (a.id === home?.id) || a.name.localeCompare(b.name))

  return (
    <NetworkMotion>
      <NetworkLayout>
        <motion.div {...pageFade} className="page space-y-12">

          {/* ---------- Greeting ---------- */}
          <section>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Hey {profile?.name?.split(' ')[0]}
            </h1>
            <p className="mt-2 text-smoke">Here is what is happening across the network right now.</p>
          </section>

          {/* ---------- Welcome ---------- */}
          <motion.section
            initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={SOFT_SPRING}
            className="relative overflow-hidden rounded-card bg-gradient-to-br from-brand to-brand-light p-6 text-white shadow-lift sm:p-10"
          >
            <div className="pointer-events-none absolute -right-16 -top-20 h-72 w-72 rounded-full bg-white/10 blur-2xl" />
            <div className="pointer-events-none absolute -bottom-24 -left-10 h-72 w-72 rounded-full bg-black/5 blur-2xl" />
            <div className="relative">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/20 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider">
                <Icon name="globe" className="h-3.5 w-3.5" />
                {network?.name || 'Worldwide'}
              </span>
              <h2 className="mt-5 max-w-2xl text-2xl font-bold leading-tight sm:text-4xl">
                Welcome to the Tryp.com content creator community
              </h2>
              <p className="mt-3 max-w-xl text-white/85">
                One community across every market. Your connections, messages, the map and the daily game live here and are never split by country.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-x-10 gap-y-4">
                <div>
                  <p className="text-2xl font-bold sm:text-3xl">{d?.creators ?? '—'}</p>
                  <p className="text-xs font-medium uppercase tracking-widest text-white/70">Creators worldwide</p>
                </div>
                <div>
                  <p className="text-2xl font-bold sm:text-3xl">{openMarkets.length}</p>
                  <p className="text-xs font-medium uppercase tracking-widest text-white/70">Markets open</p>
                </div>
                <div>
                  <p className="text-2xl font-bold sm:text-3xl">{d?.nations ?? '—'}</p>
                  <p className="text-xs font-medium uppercase tracking-widest text-white/70">Nations</p>
                </div>
              </div>
            </div>
          </motion.section>

          {/* ---------- Markets ---------- */}
          <section>
            <SectionHead icon="flag" title="Markets"
              hint="Challenges, briefs and rooms live inside a market. Open one to see what is happening there." />
            <motion.div variants={listContainer} initial="hidden" animate="show" className="grid gap-3 sm:grid-cols-2">
              {openMarkets.map((c) => (
                <MarketCard key={c.id} chapter={c}
                  mine={myCommunities.some((m) => m.id === c.id)}
                  memberCount={d ? (d.counts[c.id] ?? 0) : null}
                  hasLive={!!d?.live?.[c.id]} />
              ))}
            </motion.div>
          </section>

          {/* ---------- Network standings ---------- */}
          {/* Points are earned inside a market but they add up across the whole
              network, so this is the one leaderboard that belongs at network
              level rather than in a market. A creator who moves from Spain to
              the UK keeps their standing here. */}
          {d?.network?.length > 0 && (
            <section>
              <SectionHead icon="trophy" title="Across the network"
                hint="Points earned in any market, added up. Your standing follows you if you move." />
              <motion.div variants={listContainer} initial="hidden" animate="show" className="space-y-2">
                {d.network.map((s, i) => (
                  <motion.div key={s.creator_id} variants={listItem}
                    className={cx('flex items-center gap-3 rounded-card border bg-white px-5 py-3.5',
                      i === 0 ? 'border-brand/30 bg-brand-tint/20' : 'border-gray-100')}>
                    <span className={cx('w-5 shrink-0 text-sm font-bold', i === 0 ? 'text-brand' : 'text-smoke')}>{i + 1}</span>
                    <Avatar src={s.profiles.photo_url} name={s.profiles.name} size="sm" />
                    <Link to={`/profile/${s.creator_id}`} className="min-w-0 flex-1 truncate text-sm font-medium hover:text-brand">
                      {s.profiles.name}
                    </Link>
                    {s.markets > 1 && (
                      <span className="shrink-0 rounded-full bg-cloud px-2 py-0.5 text-[10px] font-medium text-smoke">
                        {s.markets} markets
                      </span>
                    )}
                    <span className="shrink-0 text-sm font-bold text-brand">{Number(s.points)} pts</span>
                  </motion.div>
                ))}
              </motion.div>
            </section>
          )}

          {/* ---------- Latest announcement ---------- */}
          {d?.ann && (
            <section>
              <SectionHead icon="megaphone" title="Latest announcement" to="/global/chat/announcements" toLabel="All announcements" />
              <Link to="/global/chat/announcements"
                className="card block border-l-4 !border-l-brand transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift">
                <div className="flex items-center gap-3">
                  <Avatar src={d.ann.profiles?.photo_url} name={d.ann.profiles?.name} size="sm" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{d.ann.profiles?.name}</p>
                    <p className="text-xs text-smoke">{timeAgo(d.ann.created_at)}</p>
                  </div>
                </div>
                <p className="mt-3 line-clamp-3 text-sm text-ink">{stripMarkup(d.ann.body)}</p>
              </Link>
            </section>
          )}

          {/* ---------- Creators on the move ---------- */}
          {d?.trips?.length > 0 && (
            <section>
              <SectionHead icon="pin" title="Creators on the move" to="/collab" toLabel="Collab board" />
              <motion.div variants={listContainer} initial="hidden" animate="show"
                className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {d.trips.map((t) => (
                  <MotionLink key={t.id} to="/collab" variants={listItem} {...cardHover}
                    className="card flex items-center gap-3 !p-4 hover:shadow-lift">
                    <Avatar src={t.profiles?.photo_url} name={t.profiles?.name} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {t.profiles?.name?.split(' ')[0]} → {flagForCountry(t.country)} {t.city}
                      </p>
                      <p className="truncate text-xs text-smoke">
                        {format(new Date(t.start_date), 'd MMM')} – {format(new Date(t.end_date), 'd MMM')}
                      </p>
                    </div>
                  </MotionLink>
                ))}
              </motion.div>
            </section>
          )}

          {/* ---------- Spotlight ---------- */}
          <CreatorSpotlight />

          {/* ---------- The map ---------- */}
          <section>
            <SectionHead icon="globe" title="Where we have been, together"
              hint={d?.visited?.length ? `Every creator in the network, on one map. ${d.visited.length} countries so far.` : 'Every creator in the network, on one map.'} />
            {d ? <WorldMap selected={d.visited} /> : <Skeleton className="h-64" />}
          </section>

          {/* ---------- New creators ---------- */}
          {d?.fresh?.length > 0 && (
            <section>
              <SectionHead icon="users" title="New in the community" to="/creators" toLabel="All creators" />
              <motion.div variants={listContainer} initial="hidden" animate="show"
                className="grid gap-3 sm:grid-cols-2">
                {d.fresh.map((c) => (
                  <MotionLink key={c.id} to={`/profile/${c.id}`} variants={listItem} {...cardHover}
                    className="card flex items-center gap-4 !p-5 hover:shadow-lift">
                    <Avatar src={c.photo_url} name={c.name} />
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{c.name}</p>
                      {c.bio && <p className="truncate text-sm text-smoke">{c.bio}</p>}
                    </div>
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
