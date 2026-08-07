import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { supabase } from '../lib/supabase'
import { useCommunity } from '../context/CommunityContext'
import { useAuth } from '../context/AuthContext'
import WorldMap from '../components/WorldMap'
import Icon from '../components/Icon'
import { Skeleton, EmptyState } from '../components/ui'
import { cx } from '../lib/utils'
import { listContainer, listItem, cardHover, pageFade, SOFT_SPRING } from '../lib/motion'

// The Worldwide hub: the one network everybody belongs to, with the market
// chapters shown NESTED inside it rather than sitting beside it.
//
// The nesting is the product decision this page exists to make legible.
// Connections, DMs, the collab board, the creator map and the daily game are
// network-wide and are deliberately NOT cut up by market: the only mechanics
// working today are the private and one-to-one ones, and splitting them six ways
// would make each of them six times weaker. Chapters carry only what genuinely
// needs a local owner: briefs, payouts, roster, local rooms.

const MotionLink = motion.create(Link)

// One flag emoji per ISO2. The chapter cards are the only place in the app that
// shows a country flag next to a market name, and doing it from the code keeps
// it consistent with `countries.js` rather than hand-typing emoji into the DB.
function flagFromIso(iso) {
  if (!iso || iso.length !== 2) return ''
  return iso.toUpperCase().replace(/./g, (ch) => String.fromCodePoint(0x1f1e6 + ch.charCodeAt(0) - 65))
}

function StatBlock({ label, value, hint }) {
  return (
    <motion.div variants={listItem} className="card">
      <p className="text-sm font-medium text-smoke">{label}</p>
      <p className="mt-2 text-3xl font-bold tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-xs text-smoke">{hint}</p>}
    </motion.div>
  )
}

function ChapterCard({ chapter, mine, memberCount, liveChallenge }) {
  const isHome = mine?.membership?.is_home
  const flags = (chapter.country_codes || []).map(flagFromIso).join(' ')
  return (
    <MotionLink
      to={`/c/${chapter.slug}`}
      variants={listItem}
      {...cardHover}
      className={cx(
        'card flex flex-col gap-4 hover:shadow-lift',
        isHome && 'border-brand/30 bg-brand-tint/20',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {flags && <span className="text-lg leading-none" aria-hidden>{flags}</span>}
            <h3 className="truncate text-lg font-semibold tracking-tight">{chapter.name}</h3>
          </div>
          <p className="mt-1 text-xs text-smoke">
            {chapter.country_codes?.length ? chapter.country_codes.join(' · ') : 'Global'}
            <span className="mx-1.5">•</span>
            {chapter.currency}
          </p>
        </div>
        {isHome && (
          <span className="shrink-0 rounded-full bg-brand px-2.5 py-1 text-[11px] font-semibold text-white">
            Your chapter
          </span>
        )}
      </div>

      {liveChallenge ? (
        <div className="flex items-center gap-2 rounded-xl bg-brand-tint px-3 py-2">
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand/60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-brand" />
          </span>
          <span className="truncate text-xs font-semibold text-brand">{liveChallenge.title}</span>
        </div>
      ) : (
        <div className="rounded-xl bg-cloud px-3 py-2">
          <span className="text-xs font-medium text-smoke">No live challenge</span>
        </div>
      )}

      <div className="flex items-center gap-4 text-sm text-smoke">
        <span className="flex items-center gap-1.5">
          <Icon name="users" className="h-4 w-4" />
          {memberCount == null ? '—' : memberCount} {memberCount === 1 ? 'creator' : 'creators'}
        </span>
        <span className="ml-auto flex items-center gap-1 font-medium text-brand">
          Open
          <Icon name="chevronRight" className="h-4 w-4" />
        </span>
      </div>
    </MotionLink>
  )
}

export default function GlobalHome() {
  const { profile } = useAuth()
  const { network, chapters, myCommunities, home, error, isGlobalAdmin } = useCommunity()
  const [d, setD] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [
        { data: mems },
        { count: creators },
        { count: connections },
        { data: challenges },
        { data: rooms },
        { data: visited },
        { data: countries },
      ] = await Promise.all([
        // One grouped read rather than a count per card, so a seventh market
        // does not add a seventh round trip.
        supabase.from('community_members').select('community_id').eq('status', 'active'),
        supabase.from('profiles').select('id', { count: 'exact', head: true })
          .eq('status', 'active').eq('is_admin', false).eq('is_test', false),
        supabase.from('connections').select('id', { count: 'exact', head: true }),
        supabase.from('challenges').select('id, title, community_id, status').eq('status', 'active'),
        supabase.from('channels').select('id, key, label, hint, icon, community_id, visibility').order('position'),
        supabase.from('profiles').select('countries_visited'),
        supabase.from('profiles').select('country_code').eq('status', 'active').not('country_code', 'is', null),
      ])
      if (cancelled) return
      const tally = {}
      for (const m of mems || []) tally[m.community_id] = (tally[m.community_id] || 0) + 1
      const live = {}
      for (const c of challenges || []) live[c.community_id] = c
      setD({
        counts: tally,
        creators,
        connections,
        live,
        rooms: rooms || [],
        visited: [...new Set((visited || []).flatMap((p) => p.countries_visited || []))],
        nations: new Set((countries || []).map((p) => p.country_code)).size,
      })
    }
    load()
    return () => { cancelled = true }
  }, [])

  if (error) {
    return (
      <div className="page mx-auto w-full max-w-5xl px-4 py-8">
        <EmptyState
          icon={<Icon name="alert" className="h-6 w-6" />}
          title="The network tables are not readable yet"
          hint={`Migrations 073 and 074 need to be applied before this page has anything to show. The database said: ${error}`}
        />
      </div>
    )
  }

  const activeChapters = chapters.filter((c) => c.is_active)
  const comingChapters = chapters.filter((c) => !c.is_active)
  const networkRooms = (d?.rooms || []).filter((r) => r.community_id === network?.id)

  return (
    <motion.div {...pageFade} className="page mx-auto w-full max-w-5xl space-y-12 px-4 py-8">
      {/* ---------- Welcome ---------- */}
      <section>
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={SOFT_SPRING}
          className="relative overflow-hidden rounded-card bg-gradient-to-br from-brand to-brand-light p-6 text-white shadow-lift sm:p-10"
        >
          {/* Soft light blooms for depth, matching the challenge hero on Home so
              the two pages read as one product. */}
          <div className="pointer-events-none absolute -right-16 -top-20 h-72 w-72 rounded-full bg-white/10 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-10 h-72 w-72 rounded-full bg-black/5 blur-2xl" />

          <div className="relative">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/20 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider">
              <Icon name="globe" className="h-3.5 w-3.5" />
              {network?.name || 'Worldwide'}
            </span>
            <h1 className="mt-5 max-w-2xl text-3xl font-bold leading-tight sm:text-4xl">
              Welcome to the Tryp.com creator network
            </h1>
            <p className="mt-3 max-w-xl text-white/85">
              One community across every market. Your connections, messages, the map and the daily game live here and are never split by country.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-4">
              <div>
                <p className="text-2xl font-bold sm:text-3xl">{d?.creators ?? '—'}</p>
                <p className="text-xs font-medium uppercase tracking-widest text-white/70">Creators</p>
              </div>
              <div>
                <p className="text-2xl font-bold sm:text-3xl">{activeChapters.length}</p>
                <p className="text-xs font-medium uppercase tracking-widest text-white/70">Markets open</p>
              </div>
              <div>
                <p className="text-2xl font-bold sm:text-3xl">{d?.nations ?? '—'}</p>
                <p className="text-xs font-medium uppercase tracking-widest text-white/70">Nations</p>
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* ---------- Where you sit ---------- */}
      {/* The nesting made explicit. A creator should see they are in the network
          first and a market second, which is the whole architecture in one line. */}
      <section>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...SOFT_SPRING, delay: 0.08 }}
          className="card flex flex-wrap items-center gap-3 text-sm"
        >
          <span className="flex items-center gap-2 font-semibold text-ink">
            <Icon name="globe" className="h-5 w-5 text-brand" />
            {network?.name || 'Worldwide'}
          </span>
          <Icon name="chevronRight" className="h-4 w-4 text-gray-300" />
          {home ? (
            <Link
              to={`/c/${home.slug}`}
              className="flex items-center gap-2 rounded-full bg-brand-tint px-3 py-1 font-semibold text-brand transition-transform duration-200 hover:scale-105"
            >
              <Icon name="flag" className="h-4 w-4" />
              {home.name}
            </Link>
          ) : (
            <span className="text-smoke">No chapter yet</span>
          )}
          <span className="ml-auto text-xs text-smoke">
            {profile?.name}
            {isGlobalAdmin && ' · Global admin'}
          </span>
        </motion.div>
      </section>

      {/* ---------- Network numbers ---------- */}
      <motion.section
        variants={listContainer}
        initial="hidden"
        animate="show"
        className="grid gap-4 sm:grid-cols-3"
      >
        <StatBlock label="Creators worldwide" value={d?.creators ?? '—'} hint="Across every market" />
        <StatBlock label="Connections made" value={d?.connections ?? '—'} hint="Never split by country" />
        <StatBlock label="Countries explored" value={d?.visited?.length ?? '—'} hint="Together, all time" />
      </motion.section>

      {/* ---------- Markets ---------- */}
      <section>
        <div className="mb-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Icon name="flag" className="h-5 w-5 text-brand" /> Markets
          </h2>
          <p className="mt-1 text-sm text-smoke">
            Each market runs its own challenges, briefs and payouts. Everything social stays worldwide.
          </p>
        </div>
        <motion.div
          variants={listContainer}
          initial="hidden"
          animate="show"
          className="grid gap-4 sm:grid-cols-2"
        >
          {activeChapters.map((c) => (
            <ChapterCard
              key={c.id}
              chapter={c}
              mine={myCommunities.find((m) => m.id === c.id)}
              memberCount={d?.counts?.[c.id] ?? null}
              liveChallenge={d?.live?.[c.id]}
            />
          ))}
        </motion.div>
      </section>

      {/* ---------- Worldwide rooms ---------- */}
      {networkRooms.length > 0 && (
        <section>
          <div className="mb-4">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Icon name="chat" className="h-5 w-5 text-brand" /> Worldwide rooms
            </h2>
            <p className="mt-1 text-sm text-smoke">
              The main conversation is one room for everyone, not one per market.
            </p>
          </div>
          <motion.div
            variants={listContainer}
            initial="hidden"
            animate="show"
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
          >
            {networkRooms.map((r) => (
              <motion.div
                key={r.id}
                variants={listItem}
                {...cardHover}
                className="card flex flex-col gap-1 p-5 hover:shadow-lift"
              >
                <div className="flex items-center gap-2">
                  <Icon name={r.icon || 'chat'} className="h-4 w-4 text-brand" />
                  <span className="font-semibold">{r.label}</span>
                </div>
                {r.hint && <p className="text-xs text-smoke">{r.hint}</p>}
              </motion.div>
            ))}
          </motion.div>
        </section>
      )}

      {/* ---------- Opening next ---------- */}
      {comingChapters.length > 0 && (
        <section>
          <div className="mb-4">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Icon name="pin" className="h-5 w-5 text-brand" /> Opening next
            </h2>
            <p className="mt-1 text-sm text-smoke">
              A market stays closed until it has a lead. Adding another one is a row in a table, not a release.
            </p>
          </div>
          <motion.div
            variants={listContainer}
            initial="hidden"
            animate="show"
            className="flex flex-wrap gap-3"
          >
            {comingChapters.map((c) => (
              <motion.span
                key={c.id}
                variants={listItem}
                className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-smoke"
              >
                <span aria-hidden>{(c.country_codes || []).map(flagFromIso).join(' ')}</span>
                {c.name}
              </motion.span>
            ))}
          </motion.div>
        </section>
      )}

      {/* ---------- The map ---------- */}
      <section>
        <div className="mb-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Icon name="globe" className="h-5 w-5 text-brand" /> Where we have been, together
          </h2>
          <p className="mt-1 text-sm text-smoke">
            Every creator in the network, on one map.{' '}
            {d?.visited?.length ? (
              <>We have collectively explored <span className="font-semibold text-brand">{d.visited.length} countries</span>.</>
            ) : null}
          </p>
        </div>
        {d ? <WorldMap selected={d.visited} /> : <Skeleton className="h-64" />}
      </section>
    </motion.div>
  )
}
