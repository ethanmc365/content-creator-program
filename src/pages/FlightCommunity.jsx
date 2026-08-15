import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Avatar, EmptyState, PageHeader, Skeleton } from '../components/ui'
import Icon from '../components/Icon'
import Reveal from '../components/network/Reveal'
import Segmented from '../components/network/Segmented'
import { CountUp } from '../components/network/Motion'
import { airport } from '../lib/airports'
import { buildFlightStats } from '../lib/flightStats'
import { cx } from '../lib/utils'

// THE FLIGHT LOG, ACROSS EVERYBODY.
//
// WHY THIS IS ITS OWN PAGE NOW.
//
// All of this used to be two sections near the bottom of `/flights`, under a
// records wall, a streak, an airline ranking, a year-by-year chart and the log
// itself. Ethan: "the across the community for this should have its own page and
// a button at the top to access it. On this page the leaderboards, community
// info from flights etc and other cool features should appear."
//
// He is right, and the reason is that they answer a different question with a
// different owner. `/flights` is about YOU - it is a private record, and every
// number on it is your own. This is about everybody else, and it is the only
// part of the flight log with any social pull in it: who has flown furthest,
// who else has been where you are going, who is on your routes. Buried nine
// screens down, it was a footnote to a personal page; at the top of its own
// page it is a reason to open the feature at all.
//
// WHAT IS AND IS NOT IN HERE. Only flights their owner has ticked to share, and
// even then only who flew, how many times, how far and between which airports.
// No dates, no seats, no notes, no photographs. See migration 103 for the
// policy that enforces that rather than promising it, and 104 for why an
// upcoming flight is never counted in anybody's totals.

// One column of a leaderboard. Module scope, not nested: a component declared
// during render is a new type every render, so every row would unmount and
// remount whenever the window switch is pressed.
function Board({ icon, title, rows, value, unit, myId }) {
  return (
    <div className="flex h-full flex-col rounded-card border border-gray-100 bg-white p-5 shadow-card">
      <p className="mb-4 flex items-center gap-2 text-sm font-semibold">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-tint text-brand">
          <Icon name={icon} className="h-4 w-4" />
        </span>
        {title}
      </p>
      <ol className="space-y-2.5">
        {rows.map((b, i) => (
          <li
            key={b.creator_id}
            className={cx(
              'flex items-center gap-2.5 rounded-xl px-2 py-1.5 transition-colors',
              // YOUR OWN ROW IS MARKED. A leaderboard you cannot find yourself
              // on is a list of other people.
              b.creator_id === myId ? 'bg-brand-tint/40' : 'hover:bg-cloud',
            )}
          >
            <span className={cx(
              'w-4 shrink-0 text-xs font-bold tabular-nums',
              i === 0 ? 'text-brand' : 'text-gray-300',
            )}>{i + 1}</span>
            <Avatar src={b.photo_url} name={b.name} size="xs" />
            <Link to={`/profile/${b.creator_id}`} className="min-w-0 flex-1 truncate text-xs font-medium hover:text-brand">
              {b.name}
            </Link>
            <span className="shrink-0 text-xs font-semibold tabular-nums text-smoke">
              {value(b)}<span className="ml-0.5 font-normal text-gray-400">{unit}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}

export default function FlightCommunity() {
  const { user } = useAuth()
  const [today] = useState(() => new Date().toISOString().slice(0, 10))
  const [board, setBoard] = useState(null)
  const [win, setWin] = useState('year')
  const [mine, setMine] = useState(null)
  const [flyers, setFlyers] = useState({})
  const [totals, setTotals] = useState(null)

  const thisYear = today.slice(0, 4)

  useEffect(() => {
    let cancelled = false
    const from = win === 'year' ? `${thisYear}-01-01` : '1970-01-01'
    supabase.rpc('flight_leaderboard', { p_from: from, p_to: today }).then(({ data }) => {
      if (!cancelled) setBoard(data ?? [])
    })
    return () => { cancelled = true }
  }, [win, thisYear, today])

  // The whole community's totals, which is the one figure on this page that is
  // about the group rather than about a ranking inside it.
  useEffect(() => {
    let cancelled = false
    supabase.rpc('community_flight_totals').then(({ data }) => {
      if (cancelled) return
      const row = Array.isArray(data) ? data[0] : data
      if (row) setTotals({ km: Number(row.total_km) || 0, n: Number(row.total_flights) || 0 })
    })
    return () => { cancelled = true }
  }, [])

  // Your own log, for the routes to look other creators up on. Read directly
  // (it is your data, under RLS) rather than through the shared aggregate.
  useEffect(() => {
    let cancelled = false
    supabase.from('flights').select('*').eq('creator_id', user.id)
      .order('flown_on', { ascending: false }).limit(1000)
      .then(({ data }) => { if (!cancelled) setMine(data ?? []) })
    return () => { cancelled = true }
  }, [user.id])

  const stats = useMemo(() => buildFlightStats(mine, today), [mine, today])

  const topRoutes = useMemo(
    () => [...stats.routes].sort((a, b) => b.flights.length - a.flights.length).slice(0, 6),
    [stats.routes],
  )

  useEffect(() => {
    if (topRoutes.length === 0) return undefined
    let cancelled = false
    ;(async () => {
      const out = {}
      for (const r of topRoutes) {
        const { data } = await supabase.rpc('route_flyers', { p_a: r.from.iata, p_b: r.to.iata })
        if (cancelled) return
        if (data?.length) out[r.key] = data
      }
      if (!cancelled) setFlyers(out)
    })()
    return () => { cancelled = true }
  }, [topRoutes])

  // The three rankings, from one query. "Most countries" cannot be computed in
  // Postgres - there is no airport table there on purpose (see migration 103) -
  // so the codes come back and the page that already owns the airport table
  // does the mapping.
  const boards = useMemo(() => {
    if (!board) return null
    const withCountries = board.map((b) => {
      const countries = new Set()
      for (const code of b.airports || []) {
        const a = airport(code)
        if (a?.country) countries.add(a.country)
      }
      return { ...b, km: Number(b.km) || 0, flights: Number(b.flights) || 0, countries: countries.size }
    })
    return {
      distance: [...withCountries].sort((a, b) => b.km - a.km).slice(0, 8),
      countries: [...withCountries].sort((a, b) => b.countries - a.countries || b.km - a.km).slice(0, 8),
      flights: [...withCountries].sort((a, b) => b.flights - a.flights || b.km - a.km).slice(0, 8),
    }
  }, [board])

  const sharing = board?.length ?? 0

  return (
    <div className="page">
      <PageHeader
        title="Flights across the community"
        action={
          <Link to="/flights" className="btn-secondary !py-2.5 text-sm">
            <Icon name="chevronLeft" className="h-4 w-4" />
            Your flight log
          </Link>
        }
      />

      <div className="space-y-10">
        {/* ---- WHAT THE WHOLE COMMUNITY HAS FLOWN ----
            The group figure leads, because a leaderboard makes more sense once
            you know what pool it is drawn from. */}
        <Reveal from="down">
          <section className="relative overflow-hidden rounded-card bg-gradient-to-br from-brand to-brand-light p-6 text-white shadow-lift sm:p-8">
            <div className="pointer-events-none absolute -right-16 -top-20 h-72 w-72 rounded-full bg-white/10 blur-2xl" />
            <div className="relative flex flex-wrap gap-x-12 gap-y-5">
              {[
                { n: totals?.km ?? null, label: 'Kilometres flown', fmt: (v) => Math.round(v).toLocaleString('en-GB') },
                { n: totals?.n ?? null, label: 'Flights logged' },
                { n: sharing, label: 'Creators sharing' },
              ].map((s) => (
                <div key={s.label}>
                  <p className="text-3xl font-bold tabular-nums sm:text-4xl">
                    {s.n == null ? '—' : <CountUp value={s.n} format={s.fmt} />}
                  </p>
                  <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-widest text-white/70">{s.label}</p>
                </div>
              ))}
            </div>
          </section>
        </Reveal>

        {/* ---- THE LEADERBOARDS ---- */}
        <Reveal from="down">
          <section>
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <h2 className="text-lg font-semibold">Leaderboards</h2>
              <Segmented
                value={win}
                onChange={setWin}
                options={[{ value: 'year', label: thisYear }, { value: 'all', label: 'All time' }]}
              />
            </div>
            {!boards ? (
              <div className="grid gap-4 sm:grid-cols-3">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-72" />)}
              </div>
            ) : boards.distance.length === 0 ? (
              <EmptyState
                icon={<Icon name="plane" className="h-6 w-6" />}
                title="Nobody is sharing flights yet"
                hint="Log one and it counts here. Your dates, seat, note and photo stay private either way."
                action={<Link to="/flights" className="btn-primary">Open your flight log</Link>}
              />
            ) : (
              <Reveal className="grid items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3" stagger={0.06}>
                <Board icon="globe" title="Furthest" rows={boards.distance} myId={user.id}
                  value={(b) => Math.round(b.km).toLocaleString('en-GB')} unit=" km" />
                <Board icon="flag" title="Most countries" rows={boards.countries} myId={user.id}
                  value={(b) => b.countries} unit="" />
                <Board icon="plane" title="Most flights" rows={boards.flights} myId={user.id}
                  value={(b) => b.flights} unit="" />
              </Reveal>
            )}
          </section>
        </Reveal>

        {/* ---- WHO ELSE FLIES YOUR ROUTES ----
            The point of the whole page: an introduction, not a statistic. It
            names people, because "3 other creators have flown this" is trivia
            and "Ana, Marco and Sofia have flown this" is a reason to open a DM. */}
        {Object.keys(flyers).length > 0 && (
          <Reveal from="down">
            <section>
              <h2 className="mb-1 text-lg font-semibold">Others on your routes</h2>
              <p className="mb-4 text-sm text-smoke">
                Creators who have flown the same pair of airports. Their dates and notes stay private.
              </p>
              <Reveal className="grid items-stretch gap-3 sm:grid-cols-2" stagger={0.05}>
                {topRoutes.filter((rt) => flyers[rt.key]).map((rt) => (
                  <div key={rt.key} className="flex h-full flex-col rounded-card border border-gray-100 bg-white p-4 shadow-card">
                    <p className="flex items-center gap-2 text-sm font-bold tracking-wider text-brand">
                      {rt.from.iata}
                      <Icon name="plane" className="h-3.5 w-3.5 text-brand-light" />
                      {rt.to.iata}
                      <span className="ml-auto text-[11px] font-medium normal-case tracking-normal text-smoke">
                        {flyers[rt.key].length} other {flyers[rt.key].length === 1 ? 'creator' : 'creators'}
                      </span>
                    </p>
                    <p className="mt-0.5 truncate text-xs text-smoke">{rt.from.city} to {rt.to.city}</p>
                    <div className="mt-3 flex flex-wrap gap-2 border-t border-gray-100 pt-3">
                      {flyers[rt.key].slice(0, 6).map((p) => (
                        <Link
                          key={p.creator_id}
                          to={`/profile/${p.creator_id}`}
                          className="flex items-center gap-2 rounded-full bg-cloud py-1 pl-1 pr-3 text-xs font-medium transition-all duration-200 hover:-translate-y-0.5 hover:bg-brand-tint hover:text-brand"
                        >
                          <Avatar src={p.photo_url} name={p.name} size="xs" />
                          <span className="max-w-[8rem] truncate">{p.name.split(' ')[0]}</span>
                          {Number(p.flights) > 1 && <span className="text-smoke">{p.flights}×</span>}
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
              </Reveal>
            </section>
          </Reveal>
        )}

        {/* ---- WHERE THE COMMUNITY FLIES ----
            The airports the sharing creators pass through most. It is the one
            thing this data can say that a ranking cannot: not who is winning,
            but where everybody actually is. */}
        {boards?.distance?.length > 0 && (
          <Reveal from="down">
            <section>
              <h2 className="mb-4 text-lg font-semibold">Busiest airports in the community</h2>
              <CommunityAirports rows={board} />
            </section>
          </Reveal>
        )}
      </div>
    </div>
  )
}

// THE COMMUNITY'S OWN MAP OF ITSELF, WITHOUT A MAP.
//
// `flight_leaderboard` returns the distinct airport codes each sharing creator
// has used, so counting how many CREATORS touch each airport is free - and that
// is the more interesting number than how many flights went through it. Six
// creators through Lisbon is a place the community lives; sixty flights through
// Lisbon might be one person commuting.
function CommunityAirports({ rows }) {
  const top = useMemo(() => {
    const by = new Map()
    for (const b of rows || []) {
      for (const code of new Set(b.airports || [])) {
        const a = airport(code)
        if (!a) continue
        const cur = by.get(code) || { ...a, creators: 0 }
        cur.creators += 1
        by.set(code, cur)
      }
    }
    return [...by.values()].sort((a, b) => b.creators - a.creators || a.city.localeCompare(b.city)).slice(0, 12)
  }, [rows])

  if (top.length === 0) return null
  const max = top[0].creators || 1

  return (
    <div className="card space-y-2.5 !p-5 sm:!p-6">
      {top.map((a) => (
        <div key={a.iata} className="flex items-center gap-3">
          <span className="w-10 shrink-0 text-xs font-bold tracking-wider text-brand">{a.iata}</span>
          <span className="w-28 shrink-0 truncate text-xs text-smoke sm:w-40">{a.city}</span>
          <span className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-cloud">
            {/* A zero-width fill still paints its own padding, so a row with
                nothing in it draws no bar at all. */}
            {a.creators > 0 && (
              <span
                className="block h-full rounded-full bg-brand transition-[width] duration-700 ease-out"
                style={{ width: `${Math.max(6, (a.creators / max) * 100)}%` }}
              />
            )}
          </span>
          <span className="w-20 shrink-0 text-right text-xs tabular-nums text-smoke">
            {a.creators} {a.creators === 1 ? 'creator' : 'creators'}
          </span>
        </div>
      ))}
    </div>
  )
}
