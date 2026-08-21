import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useCommunity } from '../context/CommunityContext'
import { loadRelationships } from '../lib/connections'
import ConnectButton from '../components/ConnectButton'
import BackLink from '../components/BackLink'
import Reveal from '../components/network/Reveal'
import { Avatar, EmptyState, PageHeader, Skeleton } from '../components/ui'
import Icon from '../components/Icon'
import { isOnline, presenceLabel } from '../lib/presence'
import { flagFromIso } from '../lib/flags'
import { toast } from '../lib/toast'
import { cx } from '../lib/utils'

// The connections hub.
//
// WHAT WAS WRONG WITH THE OLD ONE
//
// Three stacked lists of identical grey cards: requests, your connections, and
// eight "creators to connect with" whose reason for being suggested was, for
// most of them, that they had signed up recently. Nothing on the page answered
// the only question anybody actually asks before pressing Connect, which is
// "who is this person to me". So the page was pleasant, inert, and nobody used
// it.
//
// WHAT THIS ONE DOES INSTEAD
//
// It leads with the reason. Every suggestion carries a real, specific one -
// mutual connections first, because a shared friend is the single strongest
// signal there is, then the same market, then a challenge you both entered, then
// a country in common - and a suggestion with no reason is not shown at all.
// Better to offer four people worth meeting than forty of the roster.
//
// MUTUALS ARE COMPUTED HERE, NOT IN THE DATABASE
//
// The whole accepted-connections table for a network of this size is a few
// hundred rows. Pulling it once and building an adjacency map in memory answers
// "how many friends do we share" for every creator on the page at no extra
// round trip, where doing it per card would be N queries fired from a grid.
// If the network ever reaches the tens of thousands this becomes an RPC; it is
// nowhere near that, and pretending otherwise would be building for a problem
// nobody has.

const TABS = [
  { key: 'network', label: 'Your network', icon: 'users' },
  { key: 'discover', label: 'Discover', icon: 'sparkles' },
]

const DISMISSED_KEY = 'connection-suggestions-dismissed'

// "12 - 19 Sep", or "12 Sep - 3 Oct" when it crosses a month. Written out
// rather than as two ISO dates because this line is read at a glance beside a
// face, and 2026-09-12 is a value, not a date.
function fmtTripRange(start, end) {
  const d = (s) => new Date(`${s}T12:00:00`)
  const a = d(start), b = d(end)
  const day = (x) => x.getDate()
  const mon = (x) => x.toLocaleDateString('en-GB', { month: 'short' })
  return a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()
    ? `${day(a)} - ${day(b)} ${mon(b)}`
    : `${day(a)} ${mon(a)} - ${day(b)} ${mon(b)}`
}

function loadDismissed() {
  try { return new Set(JSON.parse(localStorage.getItem(DISMISSED_KEY)) || []) } catch { return new Set() }
}

// A person, drawn the same way everywhere on this page so the eye stops having
// to relearn the card between sections.
function PersonCard({ person, subtitle, mutuals, right, tone = 'plain' }) {
  return (
    <div className={cx(
      'flex items-center gap-3 rounded-card border bg-white p-4 transition-shadow duration-200 hover:shadow-card',
      tone === 'accent' ? 'border-brand/25 bg-brand-tint/15' : 'border-gray-100',
    )}>
      <Link to={`/profile/${person.id}`} className="relative shrink-0">
        <Avatar src={person.photo_url} name={person.name} size="md" />
        {isOnline(person.last_seen_at) && (
          <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-green-500 ring-2 ring-white" title="Online now" />
        )}
      </Link>
      <div className="min-w-0 flex-1">
        <Link to={`/profile/${person.id}`} className="group flex items-center gap-1.5">
          <span className="truncate font-semibold group-hover:text-brand">{person.name}</span>
          {person.country_code && (
            <span className="shrink-0 text-xs" aria-hidden>{flagFromIso(person.country_code)}</span>
          )}
        </Link>
        <p className="truncate text-xs text-smoke">{subtitle}</p>
        {mutuals > 0 && (
          <p className="mt-1 flex items-center gap-1.5 text-[11px] font-medium text-brand">
            <Icon name="users" className="h-3 w-3" />
            {mutuals} mutual {mutuals === 1 ? 'connection' : 'connections'}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">{right}</div>
    </div>
  )
}

export default function Connections() {
  const { user } = useAuth()
  const { preview: showMarkets } = useCommunity()
  const navigate = useNavigate()
  const [d, setD] = useState(null)
  const [tab, setTab] = useState('network')
  const [search, setSearch] = useState('')
  const [dismissed, setDismissed] = useState(loadDismissed)

  const load = useCallback(async () => {
    const [
      { data: allConns }, { data: profs }, { data: mems }, { data: mySubs }, rels,
    ] = await Promise.all([
      // Every accepted edge plus every request touching me. One read: the
      // adjacency map needs the whole graph anyway.
      supabase.from('connections').select('id, creator_id, connected_creator_id, status, created_at'),
      supabase.from('profiles')
        .select('id, name, photo_url, bio, country_code, city, country, last_seen_at, created_at')
        .eq('status', 'active').eq('is_admin', false).eq('is_test', false)
        .is('deletion_requested_at', null),
      supabase.from('community_members')
        .select('profile_id, community_id, communities!inner(id, name, kind, slug)')
        .eq('status', 'active').eq('communities.kind', 'chapter'),
      supabase.from('submissions').select('challenge_id, creator_id'),
      loadRelationships(user.id),
    ])

    // WHERE YOUR PEOPLE ARE GOING NEXT.
    //
    // The one thing this page could tell you that the Creator Network cannot,
    // and the reason to open it: the directory answers "who is out there", and
    // it answers it about forty-five strangers. This answers "which of the
    // people I already know is about to be somewhere", which is the question
    // that turns a connection into a trip. Ethan: "I don't see why anyone would
    // click on it over the Creator Network."
    //
    // Same rows the collab board and the map use, so a trip somebody posts
    // shows up here without a second source of truth.
    const today = new Date().toISOString().slice(0, 10)
    const { data: tripRows } = await supabase
      .from('collab_posts')
      .select('creator_id, city, country, start_date, end_date, note')
      .gte('end_date', today)
      .order('start_date')

    const byId = new Map((profs || []).map((p) => [p.id, p]))

    // Adjacency over ACCEPTED edges only. A pending request is not a friendship
    // and must never contribute a mutual count.
    const friends = new Map()
    for (const c of allConns || []) {
      if (c.status !== 'accepted') continue
      if (!friends.has(c.creator_id)) friends.set(c.creator_id, new Set())
      if (!friends.has(c.connected_creator_id)) friends.set(c.connected_creator_id, new Set())
      friends.get(c.creator_id).add(c.connected_creator_id)
      friends.get(c.connected_creator_id).add(c.creator_id)
    }
    const mine = friends.get(user.id) || new Set()
    const mutualsWith = (id) => {
      const theirs = friends.get(id)
      if (!theirs) return 0
      let n = 0
      for (const f of theirs) if (mine.has(f)) n += 1
      return n
    }

    const requests = (allConns || [])
      .filter((c) => c.status === 'pending' && c.connected_creator_id === user.id)
      .map((c) => ({ id: c.id, at: c.created_at, person: byId.get(c.creator_id) }))
      .filter((r) => r.person)
      .sort((a, b) => new Date(b.at) - new Date(a.at))

    // THE NOTE THEY SENT WITH IT, WHICH IS THE WHOLE REASON TO ASK FOR ONE.
    //
    // A note that is written and never shown is a form field. This is where it
    // is read: on the card where you decide whether to accept, which is the
    // moment it exists to influence. One query for all pending requests rather
    // than one per card - and RLS does the security, so this cannot return a
    // note belonging to somebody else's request even if the ids were wrong.
    const noteBy = new Map()
    if (requests.length) {
      const { data: notes } = await supabase
        .from('connection_notes')
        .select('connection_id, body')
        .in('connection_id', requests.map((r) => r.id))
      for (const n of notes || []) noteBy.set(n.connection_id, n.body)
    }
    for (const r of requests) r.note = noteBy.get(r.id) || null

    const connections = [...mine].map((id) => byId.get(id)).filter(Boolean)

    // My markets, and everyone else's, for the strongest non-social reason.
    const myMarkets = new Map()
    const marketsOf = new Map()
    for (const m of mems || []) {
      if (!marketsOf.has(m.profile_id)) marketsOf.set(m.profile_id, [])
      marketsOf.get(m.profile_id).push(m.communities)
      if (m.profile_id === user.id) myMarkets.set(m.community_id, m.communities)
    }

    // Challenges I entered, and who else entered them.
    const myChallenges = new Set((mySubs || []).filter((s) => s.creator_id === user.id).map((s) => s.challenge_id))
    const sharedChallenge = new Set(
      (mySubs || []).filter((s) => s.creator_id !== user.id && myChallenges.has(s.challenge_id))
        .map((s) => s.creator_id),
    )

    const me = byId.get(user.id)
    const suggestions = (profs || [])
      .filter((p) => p.id !== user.id && !rels.has(p.id))
      .map((p) => {
        const mutual = mutualsWith(p.id)
        const theirMarkets = marketsOf.get(p.id) || []
        const shared = theirMarkets.find((m) => myMarkets.has(m.id))
        // Ranked reasons. The FIRST one that applies is the one shown, because a
        // card listing four reasons reads as an algorithm justifying itself
        // rather than as a person worth meeting.
        let reason = null
        let weight = 0
        if (mutual > 0) {
          reason = `${mutual} mutual ${mutual === 1 ? 'connection' : 'connections'}`
          weight = 1000 + mutual * 10
        } else if (shared && showMarkets) {
          // GATED. Markets do not exist yet as far as a UK creator is
          // concerned: /global and /c/:slug are behind the preview flag AND the
          // admin check, and the whole point of that gate is that the network
          // rollout is invisible until it ships. A suggestion reading "Also in
          // UK & Ireland" would announce the entire feature from a page every
          // creator already uses. When the flag comes off for everyone this
          // reason turns itself on with it.
          reason = `Also in ${shared.name}`
          weight = 500
        } else if (sharedChallenge.has(p.id)) {
          reason = 'You both entered the same challenge'
          weight = 400
        } else if (me?.country_code && p.country_code === me.country_code) {
          reason = `Also in ${p.country || 'your country'}`
          weight = 300
        } else if (isOnline(p.last_seen_at)) {
          reason = 'Online right now'
          weight = 100
        }
        return { ...p, mutual, reason, weight }
      })
      // A suggestion without a reason is a name from a list. Those are what the
      // creator directory is for.
      .filter((p) => p.reason)
      .sort((a, b) => b.weight - a.weight || (a.name || '').localeCompare(b.name || ''))

    // Only YOUR connections, soonest first, one trip each. The whole point is
    // that these are people you have already agreed to know - the same list for
    // strangers is the collab board, and it lives there.
    const seenTrip = new Set()
    const travelling = (tripRows || [])
      .filter((t) => mine.has(t.creator_id) && byId.has(t.creator_id))
      .filter((t) => (seenTrip.has(t.creator_id) ? false : seenTrip.add(t.creator_id)))
      .map((t) => ({ ...t, person: byId.get(t.creator_id), current: t.start_date <= today }))

    setD({ requests, connections, suggestions, travelling, mutualsWith, marketsOf })
  }, [user.id, showMarkets])

  useEffect(() => { load() }, [load])

  async function accept(row) {
    setD((prev) => prev && ({
      ...prev,
      requests: prev.requests.filter((r) => r.id !== row.id),
      connections: [row.person, ...prev.connections],
    }))
    await supabase.from('connections').update({ status: 'accepted' }).eq('id', row.id)
    toast(`You and ${row.person.name.split(' ')[0]} are connected.`)
  }

  async function decline(row) {
    setD((prev) => prev && ({ ...prev, requests: prev.requests.filter((r) => r.id !== row.id) }))
    await supabase.from('connections').delete().eq('id', row.id)
  }

  // Dismissals are local. A suggestion you have said no to should stop coming
  // back on this device, and it is nowhere near important enough to spend a
  // table and an RLS policy on.
  function dismiss(id) {
    setDismissed((prev) => {
      const next = new Set(prev)
      next.add(id)
      try { localStorage.setItem(DISMISSED_KEY, JSON.stringify([...next])) } catch { /* private mode */ }
      return next
    })
  }

  const visibleSuggestions = useMemo(
    () => (d?.suggestions || []).filter((s) => !dismissed.has(s.id)),
    [d, dismissed],
  )

  const filteredConnections = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = (d?.connections || []).slice()
      .sort((a, b) => (isOnline(b.last_seen_at) ? 1 : 0) - (isOnline(a.last_seen_at) ? 1 : 0)
        || (a.name || '').localeCompare(b.name || ''))
    if (!q) return list
    return list.filter((c) =>
      (c.name || '').toLowerCase().includes(q)
      || (c.city || '').toLowerCase().includes(q)
      || (c.country || '').toLowerCase().includes(q)
      || (c.bio || '').toLowerCase().includes(q))
  }, [d, search])

  if (!d) {
    return (
      <div className="page max-w-4xl space-y-4">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }

  const online = d.connections.filter((c) => isOnline(c.last_seen_at)).length

  return (
    <div className="page max-w-4xl">
      <BackLink />
      {/* No subtitle. "Who you know, who wants to know you, and who you should
          meet" was a description of the three tabs directly underneath it. */}
      <PageHeader title="Connections" />

      {/* Three numbers, not three sentences. The count of people waiting on you
          is the one thing on this page that is time sensitive, so it is a number
          and it is first. */}
      <div className="mb-8 grid grid-cols-3 gap-3">
        {[
          { n: d.connections.length, label: d.connections.length === 1 ? 'Connection' : 'Connections' },
          { n: d.requests.length, label: d.requests.length === 1 ? 'Request' : 'Requests', accent: d.requests.length > 0 },
          { n: online, label: 'Online now' },
        ].map((s) => (
          <div key={s.label} className={cx(
            'rounded-card border px-4 py-3.5 text-center',
            s.accent ? 'border-brand/30 bg-brand-tint/25' : 'border-gray-100 bg-white',
          )}>
            <p className={cx('text-2xl font-bold tabular-nums', s.accent ? 'text-brand' : 'text-ink')}>{s.n}</p>
            <p className="text-[11px] font-medium uppercase tracking-wide text-smoke">{s.label}</p>
          </div>
        ))}
      </div>

      {/* ---- Requests ----
          Above the tabs on purpose. Somebody has asked you a question; burying
          it behind a tab means the answer arrives days late, and a request that
          sits for a week is a connection that never happens. */}
      {d.requests.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
            <Icon name="heart" className="h-5 w-5 text-brand" />
            Waiting on you
            <span className="text-brand">({d.requests.length})</span>
          </h2>
          <div className="space-y-3">
            {d.requests.map((row) => (
              <PersonCard
                key={row.id}
                person={row.person}
                tone="accent"
                mutuals={d.mutualsWith(row.person.id)}
                subtitle={row.note
                  ? `“${row.note}”`
                  : row.person.bio || presenceLabel(row.person.last_seen_at) || 'Wants to connect'}
                right={
                  <>
                    <button onClick={() => accept(row)} className="btn-primary !py-2 !px-4 text-xs">Accept</button>
                    <button onClick={() => decline(row)} className="btn-ghost !py-2 !px-3 text-xs">Ignore</button>
                  </>
                }
              />
            ))}
          </div>
        </section>
      )}

      {/* ---- Your people, on the move ----
          See the note in `load`: this is the section that gives the page a
          reason to exist next to the Creator Network. The directory tells you
          who is out there; this tells you which of the people you already know
          is about to be somewhere, which is the one that turns a connection
          into a coffee. Above the tabs because it EXPIRES - a trip you find out
          about after it has happened is not information. */}
      {d.travelling?.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
            <Icon name="plane" className="h-5 w-5 text-brand" />
            Your connections on the move
            <span className="text-brand">({d.travelling.length})</span>
          </h2>
          <Reveal className="space-y-3" stagger={0.05}>
            {d.travelling.slice(0, 6).map((t) => (
              <PersonCard
                key={t.creator_id}
                person={t.person}
                mutuals={d.mutualsWith(t.creator_id)}
                subtitle={`${t.current ? 'In' : 'Going to'} ${[t.city, t.country].filter(Boolean).join(', ')} · ${fmtTripRange(t.start_date, t.end_date)}`}
                right={
                  <Link to="/collab" className="btn-ghost !px-3 !py-2 text-xs">See the trip</Link>
                }
              />
            ))}
          </Reveal>
          {d.travelling.length > 6 && (
            <Link to="/collab" className="mt-3 inline-block text-sm font-medium text-brand hover:underline">
              All {d.travelling.length} on the collab board →
            </Link>
          )}
        </section>
      )}

      {/* ---- Tabs ---- */}
      <div className="mb-6 flex gap-1 border-b border-gray-100" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cx(
              '-mb-px flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors',
              tab === t.key ? 'border-brand text-brand' : 'border-transparent text-smoke hover:text-ink',
            )}
          >
            <Icon name={t.icon} className="h-4 w-4" />
            {t.label}
            <span className="text-xs text-gray-400">
              {t.key === 'network' ? d.connections.length : visibleSuggestions.length}
            </span>
          </button>
        ))}
      </div>

      {tab === 'network' ? (
        <section>
          {d.connections.length === 0 ? (
            <EmptyState
              icon={<Icon name="users" className="h-7 w-7" />}
              title="No connections yet"
              hint="Discover has people picked because you already have something in common with them."
              action={<button onClick={() => setTab('discover')} className="btn-primary">See who you should meet</button>}
            />
          ) : (
            <>
              {/* Search only appears once there is enough to search. A filter
                  over four names is furniture. */}
              {d.connections.length > 6 && (
                <div className="mb-4 flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4">
                  <Icon name="magnifier" className="h-4 w-4 shrink-0 text-smoke" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search your connections by name, city or country"
                    aria-label="Search your connections"
                    className="min-w-0 flex-1 border-0 bg-transparent py-2.5 text-sm outline-none placeholder:text-gray-400"
                  />
                  {search && (
                    <button onClick={() => setSearch('')} aria-label="Clear search"
                      className="shrink-0 text-smoke hover:text-ink">
                      <Icon name="close" className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              )}
              {filteredConnections.length === 0 ? (
                <EmptyState icon={<Icon name="magnifier" className="h-6 w-6" />}
                  title={`Nobody in your network matches "${search}"`} />
              ) : (
                <Reveal className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {filteredConnections.map((c) => (
                    <PersonCard
                      key={c.id}
                      person={c}
                      mutuals={d.mutualsWith(c.id)}
                      subtitle={presenceLabel(c.last_seen_at) || c.bio || 'Creator'}
                      right={
                        <Link
                          to={`/messages?to=${c.id}`}
                          aria-label={`Message ${c.name}`}
                          title={`Message ${c.name}`}
                          className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 text-smoke transition-transform duration-200 hover:scale-110 hover:border-brand hover:text-brand"
                        >
                          <Icon name="envelope" className="h-4 w-4" />
                        </Link>
                      }
                    />
                  ))}
                </Reveal>
              )}
            </>
          )}
        </section>
      ) : (
        <section>
          {visibleSuggestions.length === 0 ? (
            <EmptyState
              icon={<Icon name="sparkles" className="h-7 w-7" />}
              title="Nobody left to suggest"
              hint="New suggestions appear as people join, post and connect."
              action={<button onClick={() => navigate('/creators')} className="btn-secondary">Browse every creator</button>}
            />
          ) : (
            <Reveal className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {visibleSuggestions.map((s) => (
                <PersonCard
                  key={s.id}
                  person={s}
                  mutuals={0 /* the reason line already says it, twice is nagging */}
                  subtitle={s.reason}
                  right={
                    <>
                      <ConnectButton
                        myId={user.id}
                        targetId={s.id}
                        relation={null}
                        onChange={() => dismiss(s.id)}
                        className="!py-2 !px-4 text-xs"
                      />
                      <button
                        onClick={() => dismiss(s.id)}
                        aria-label={`Not interested in ${s.name}`}
                        title="Not now"
                        className="flex h-8 w-8 items-center justify-center rounded-full text-gray-300 transition-colors hover:bg-cloud hover:text-smoke"
                      >
                        <Icon name="close" className="h-3.5 w-3.5" />
                      </button>
                    </>
                  }
                />
              ))}
            </Reveal>
          )}
        </section>
      )}
    </div>
  )
}
