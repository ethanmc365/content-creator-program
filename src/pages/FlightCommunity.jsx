import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Avatar, EmptyState, PageHeader, Skeleton } from '../components/ui'
import Icon from '../components/Icon'
import Reveal from '../components/network/Reveal'
import Segmented from '../components/network/Segmented'
import WhenVisible from '../components/WhenVisible'
import FlightMap from '../components/network/FlightMap'
import MapSkeleton from '../components/network/MapSkeleton'
import { CountUp } from '../components/network/Motion'
import { airport } from '../lib/airports'
import { buildFlightStats } from '../lib/flightStats'
import { aircraftTypeByName } from '../lib/airlines'
import AircraftPhoto from '../components/network/AircraftPhoto'
import { isoForCountryName } from '../lib/markets'
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
function Board({ icon, title, rows, value, unit, myId, open, note }) {
  // THREE, THEN THE REST ON A TAP.
  //
  // Ethan: "we only show maybe the top five, or when clicking on it, it expands
  // down and shows the top ten for all the leaderboards... and obviously it
  // doesn't show for all of them, like if I click on most countries it'll show
  // the drop down leaderboard for most countries... I will just bring it back
  // to only showing the top three."
  //
  // Eight rows x three boards is twenty-four names, which on a phone is the
  // whole page and on a desktop is three columns of ties. Three is the shape
  // everybody already reads a ranking in.
  //
  // THE EXPANSION IS FOR ALL THREE AT ONCE, AND IT LIVES IN THE SECTION.
  //
  // It used to be `useState` in here, one per board, so the control at the foot
  // of each card only ever opened its own - and because the three cards are a
  // `grid items-stretch`, opening one STRETCHED the other two to match without
  // filling them, which is what Ethan hit: "it does expand the cards and at the
  // bottom of those cards I have to click show top 20 to see them... clicking
  // see top 20 and clicking show fewer should do it for them all."
  //
  // Three cards that are already forced to the same height are one control, not
  // three. `open` is now owned by the section and passed down.
  const shown = open ? rows : rows.slice(0, 3)
  return (
    <div className="flex h-full flex-col rounded-card border border-gray-100 bg-white p-5 shadow-card">
      <p className="mb-4 flex items-center gap-2 text-sm font-semibold">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-tint text-brand">
          <Icon name={icon} className="h-4 w-4" />
        </span>
        {title}
      </p>
      {/* Where the number comes from, said once, on the board that needs it.
          "Most countries" is the one ranking whose SOURCE changes with the
          window, and a ranking that changes its mind without saying why reads
          as a bug. */}
      {note && <p className="-mt-3 mb-3 text-[11px] leading-snug text-gray-400">{note}</p>}
      <ol className="space-y-2.5">
        {shown.map((b, i) => (
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
  // One expansion for all three leaderboards - see the note on `Board`.
  const [boardsOpen, setBoardsOpen] = useState(false)
  // THE MAP HAS ITS OWN WINDOW, SEPARATE FROM THE LEADERBOARDS.
  //
  // The owner asked for both: "I think we should be able to toggle two maps.
  // One map will show every flown logged flight, which will be an insane map
  // with a bunch of lines... and then the other one should be for recent
  // flights... it should always start by showing just the flights for the
  // current year."
  //
  // Not the same switch as the leaderboards' because they answer different
  // questions: a ranking is nearly always "this year, who is winning", while
  // the map is a picture and the all-time one is the more impressive of the
  // two. Tying them together would mean you could not look at the whole map
  // without also re-ranking everybody.
  const [mapWin, setMapWin] = useState('year')
  const [mine, setMine] = useState(null)
  const [flyers, setFlyers] = useState({})
  // Every aircraft type, or the first three. See the toggle below the grid.
  const [allFleet, setAllFleet] = useState(false)
  const [totals, setTotals] = useState(null)
  // THE THREE AGGREGATES BEHIND THE MAP AND THE TWO SECTIONS UNDER IT.
  // All definer functions returning counts and airport codes and NOTHING that
  // identifies a person - see migration 106 for the whole argument.
  const [routes, setRoutes] = useState(null)
  const [fleet, setFleet] = useState(null)
  const [records, setRecords] = useState(null)

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

  // Everything the map and the two sections under it draw. One effect, because
  // they arrive together or the page assembles in three instalments.
  useEffect(() => {
    let cancelled = false
    Promise.all([
      supabase.rpc('community_aircraft'),
      supabase.rpc('community_flight_records'),
    ]).then(([a, rec]) => {
      if (cancelled) return
      setFleet(a.data ?? [])
      const row = Array.isArray(rec.data) ? rec.data[0] : rec.data
      setRecords(row ?? null)
    })
    return () => { cancelled = true }
  }, [])

  // The routes, re-fetched when the map's window changes. Every flight in the
  // window, not a sample: `community_routes` groups by the unordered pair, so
  // a thousand flights come back as however many distinct city pairs there are
  // - which is what makes drawing all of them affordable.
  useEffect(() => {
    let cancelled = false
    setRoutes(null)
    const from = mapWin === 'year' ? `${thisYear}-01-01` : '1970-01-01'
    supabase.rpc('community_routes', { p_from: from, p_to: today }).then(({ data }) => {
      if (!cancelled) setRoutes(data ?? [])
    })
    return () => { cancelled = true }
  }, [mapWin, thisYear, today])

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
      // THE FLIGHT LOG IS NOT THE ONLY RECORD OF WHERE SOMEBODY HAS BEEN.
      //
      // The owner: "most countries visited shouldn't just be from the flight
      // log because obviously people have already logged the countries they've
      // been to when they signed up in that travel map."
      //
      // He is right, and the flight-log-only version was actively misleading -
      // a creator who has been to thirty countries and logged four flights
      // ranked below somebody with six flights and no travel map. It is a
      // UNION, not a replacement: a country you flew to counts whether or not
      // you remembered to tick it at signup, and one you drove to counts even
      // though no flight will ever prove it.
      //
      // The two sides speak different languages - an airport carries ISO-2, the
      // travel map carries country NAMES - so the names are resolved to codes
      // through the same country table the rest of the app searches. A name
      // that does not resolve is kept as itself rather than dropped: it is
      // still a country somebody has been to, and losing it would understate
      // them.
      //
      // BUT THE TRAVEL MAP HAS NO DATES, SO IT CANNOT ANSWER A DATED QUESTION.
      //
      // Ethan: "it needs to be by flights logged, not from onboarding map they
      // filled in, the reason is because there's no years or dates for when
      // they've been there if they just clicked the map... so for all time it
      // can show them but for 2026 it has to be from flights logged."
      //
      // Exactly right, and the union was quietly wrong in the year view: the
      // board is windowed to the current year, so a creator with one flight in
      // 2026 and forty countries ticked at signup was ranked as having been to
      // forty countries THIS YEAR. The map is a lifetime record, so it joins in
      // on the lifetime view and stays out of the year.
      const countries = new Set()
      for (const code of b.airports || []) {
        const a = airport(code)
        if (a?.country) countries.add(a.country)
      }
      if (win === 'all') {
        for (const name of b.visited || []) {
          const iso = isoForCountryName(name)
          countries.add(iso || String(name).trim().toLowerCase())
        }
      }
      return { ...b, km: Number(b.km) || 0, flights: Number(b.flights) || 0, countries: countries.size }
    })
    return {
      // TWENTY, NOT EIGHT. Only three are on screen until somebody asks, so
      // the depth costs nothing now and the expansion is worth opening.
      distance: [...withCountries].sort((a, b) => b.km - a.km).slice(0, 20),
      countries: [...withCountries].sort((a, b) => b.countries - a.countries || b.km - a.km).slice(0, 20),
      flights: [...withCountries].sort((a, b) => b.flights - a.flights || b.km - a.km).slice(0, 20),
    }
  }, [board, win])

  const sharing = board?.length ?? 0

  // THE MAP'S DATA, IN THE SHAPE `FlightMap` ALREADY TAKES.
  //
  // It wants `routes` of `{ key, from, to, flights[] }` and `airports` of
  // `{ ...airport, weight }` - exactly what `buildFlightStats` hands it on your
  // own log. Building the community's version into the same shape means the two
  // maps are THE SAME MAP with different data in it, rather than a second map
  // that has to be kept looking like the first one.
  //
  // A route whose two codes are not both in our airport table is dropped rather
  // than drawn at (0,0), which is the Gulf of Guinea and is where every map bug
  // of this kind ends up.
  const mapData = useMemo(() => {
    if (!routes) return null
    const arcs = []
    const weight = new Map()
    for (const r of routes) {
      const from = airport(r.a)
      const to = airport(r.b)
      if (!from || !to) continue
      const n = Number(r.flights) || 1
      // `count`, NOT AN ARRAY OF NULLS - AND THIS WAS A CRASH.
      //
      // This used to push `flights: new Array(n).fill(null)` purely so the map
      // could read `.length` for the route's weight. The route card then did
      // `active.flights.slice(0, 5).map((f) => <li key={f.id}>)` and threw on
      // the first null: "clicking on a flight trail across the community is
      // causing errors."
      //
      // The array was always a lie. `route_flyers` returns airports and counts
      // ONLY - never a date, an airline or a flight number - and that is
      // deliberate (migration 103): those fields are what turn a travel record
      // into somebody's movement history, and this is other people's data. So
      // there are no per-flight rows to show here, and the honest shape is a
      // number. FlightMap prefers `count` when it is given one and only lists
      // rows it actually has.
      arcs.push({ key: `${r.a}-${r.b}`, from, to, count: n, flights: [] })
      weight.set(r.a, (weight.get(r.a) || 0) + n)
      weight.set(r.b, (weight.get(r.b) || 0) + n)
    }
    const pins = [...weight.entries()]
      .map(([code, w]) => ({ ...airport(code), weight: w }))
      .filter((a) => a.iata)
    const countries = new Set(pins.map((a) => a.country).filter(Boolean))
    return { arcs, pins, countries: countries.size }
  }, [routes])

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
                // TWO FIGURES ABOUT THE SHAPE OF THE MAP UNDERNEATH, not about
                // who is winning. "Between us we have touched 84 airports in 39
                // countries" is the sentence this page exists to be able to say.
                { n: mapData?.pins.length ?? null, label: 'Airports touched' },
                { n: mapData?.countries ?? null, label: 'Countries reached' },
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

        {/* ---- WHERE WE ALL GO ----
            THE PICTURE, AND IT LEADS.
            Ethan: "improve the across the community tab, build in more features
            there that would be interesting, maybe a visual image or map."
            A page of three rankings and a bar chart is a page of numbers about
            travel, which is the one subject that should never be only numbers.
            Every shared route in the community drawn at once is the only thing
            on here that anybody would screenshot.

            It is the SAME COMPONENT as your own log's map (see `mapData`), so
            there is one map to maintain and moving between the two pages reads
            as zooming out rather than as arriving somewhere else.

            `WhenVisible` with a big rootMargin so the atlas is parsed before you
            scroll to it, never on the frames the section above is animating. */}
        <Reveal from="down">
          <section>
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold">Where we all go</h2>
                <p className="mt-1 text-sm text-smoke">
                  {mapData
                    ? `${mapData.arcs.length} ${mapData.arcs.length === 1 ? 'route' : 'routes'} across ${mapData.pins.length} airports. Tap a country or an airport.`
                    : 'Every route the community has shared.'}
                </p>
              </div>
              {/* THIS YEAR, OR EVERYTHING. Defaulting to the current year is
                  deliberate and it is the owner's: "it should always start by
                  showing just the flights for the current year." A map of a
                  live community should show a live year - the all-time one is
                  the trophy, and it gets better the longer nobody resets it. */}
              <Segmented
                value={mapWin}
                onChange={setMapWin}
                options={[{ value: 'year', label: thisYear }, { value: 'all', label: 'All time' }]}
              />
            </div>
            {/* THE LONGEST HOP ANYBODY HAS SHARED, as a caption on the map
                rather than a card of its own. It is one fact and it belongs
                next to the picture it is a fact about.
                A JSX COMMENT, NOT A `//` ONE. These were `//` lines, which is
                correct inside a JSX EXPRESSION and is plain text as soon as
                they become the children of an element - which is what happened
                when the block moved out of the header row to make room for the
                window toggle, and they rendered on the page. */}
            {records?.longest_km > 0 && airport(records.longest_a) && airport(records.longest_b) && (
              <div className="mb-3 flex">
                <span className="flex items-center gap-2 rounded-full bg-brand-tint px-3.5 py-1.5 text-xs font-semibold text-brand">
                  <Icon name="plane" className="h-3.5 w-3.5" />
                  Longest hop {records.longest_a} to {records.longest_b}
                  <span className="font-bold tabular-nums">{Math.round(records.longest_km).toLocaleString('en-GB')} km</span>
                </span>
              </div>
            )}
            {!mapData ? (
              <MapSkeleton />
            ) : mapData.arcs.length === 0 ? (
              <div className="rounded-card border border-dashed border-gray-200 px-6 py-14 text-center">
                <p className="text-sm font-medium text-ink">No shared routes yet.</p>
                <p className="mt-1 text-sm text-smoke">Tick &ldquo;share with the community&rdquo; on a flight and it lands on this map.</p>
              </div>
            ) : (
              <WhenVisible rootMargin="1000px" fallback={<MapSkeleton />}>
                <FlightMap
                  routes={mapData.arcs}
                  airports={mapData.pins}
                  routeExtra={(active) => <RouteCreators from={active.from.iata} to={active.to.iata} />}
                />
              </WhenVisible>
            )}
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
                <Board icon="globe" title="Furthest" rows={boards.distance} myId={user.id} open={boardsOpen}
                  value={(b) => Math.round(b.km).toLocaleString('en-GB')} unit=" km" />
                <Board icon="flag" title="Most countries" rows={boards.countries} myId={user.id} open={boardsOpen}
                  note={win === 'all'
                    ? 'Flights logged, plus your travel map.'
                    : 'Flights logged this year. The travel map has no dates, so it counts on all time only.'}
                  value={(b) => b.countries} unit="" />
                <Board icon="plane" title="Most flights" rows={boards.flights} myId={user.id} open={boardsOpen}
                  value={(b) => b.flights} unit="" />
              </Reveal>
            )}
            {/* ONE CONTROL, UNDER ALL THREE. It sits outside the grid because
                it belongs to the set: three cards forced to a common height by
                `items-stretch` cannot each have their own opinion about how
                tall they are. */}
            {boards && Math.max(boards.distance.length, boards.countries.length, boards.flights.length) > 3 && (
              <div className="mt-4 flex justify-center">
                <button
                  type="button"
                  onClick={() => setBoardsOpen((v) => !v)}
                  className="flex items-center justify-center gap-1 rounded-full px-4 py-2 text-xs font-semibold text-smoke transition-colors hover:text-brand"
                >
                  {boardsOpen
                    ? 'Show fewer'
                    : `Show top ${Math.max(boards.distance.length, boards.countries.length, boards.flights.length)}`}
                  <Icon name="chevronRight" className={cx('h-3 w-3 transition-transform duration-200', boardsOpen ? '-rotate-90' : 'rotate-90')} />
                </button>
              </div>
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

        {/* ---- WHAT THE COMMUNITY FLIES ----
            The other half of the aircraft collection, seen from outside: your
            own page tells you which types you have been on, and this tells you
            which ones everybody else has - which is what turns a gap on your
            wall from a fact into a dare. Every row is a door to the collection. */}
        {fleet && fleet.length > 0 && (
          <Reveal from="down">
            <section>
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <h2 className="text-lg font-semibold">Aircrafts</h2>
                <Link to="/flights/aircraft" className="text-sm font-medium text-brand transition-transform duration-200 hover:scale-105">
                  Your aircraft collection &rarr;
                </Link>
              </div>
              {/* THE AIRCRAFT, AND THE PEOPLE WHO HAVE BEEN ON IT.
                  Ethan: "it should show the visual image of the plane not an
                  icon and it should show creator profiles as like they've flown
                  it, like how rsvp would look."
                  Both halves are the same point. A generic plane glyph beside
                  the words "Airbus A320neo" says nothing the words did not, and
                  the collection already ships a photograph of every type. And
                  "2 creators have flown it" is trivia where two faces are an
                  introduction - the same reason "others on your routes" names
                  people instead of counting them. */}
              <Reveal className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" stagger={0.04}>
                {(allFleet ? fleet : fleet.slice(0, 3)).map((a) => {
                  const type = aircraftTypeByName(a.aircraft)
                  const faces = Array.isArray(a.faces) ? a.faces : []
                  return (
                    <div
                      key={a.aircraft}
                      className="group relative flex flex-col overflow-hidden rounded-card border border-gray-100 bg-white shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-lift"
                    >
                      {/* Stretched link UNDER the content, so a face on top of
                          it can be its own target. Same pattern as the
                          challenge board's past cards. */}
                      <Link to="/flights/aircraft" className="absolute inset-0 z-0" aria-label={`${a.aircraft} in the collection`} />
                      {/* ONE ASPECT RATIO FOR EVERY CARD. A row of photographs
                          at their own proportions is a ragged grid. */}
                      <span className="pointer-events-none relative z-10 block aspect-[16/7] w-full overflow-hidden bg-cloud">
                        {/* NO RADIUS: the card clips already, and a rounded
                            photo inside a square frame leaves grey wedges that
                            slide when the hover scale runs. See AircraftPhoto. */}
                        <AircraftPhoto typeKey={type?.key} type={type} radius="" />
                      </span>
                      <div className="pointer-events-none relative z-10 flex flex-1 flex-col px-4 py-3">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="min-w-0 truncate text-sm font-semibold">{a.aircraft}</span>
                          <span className="shrink-0 text-sm font-bold tabular-nums text-brand">{a.flights}</span>
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <span className="pointer-events-auto flex -space-x-1.5">
                            {faces.slice(0, 6).map((f) => (
                              <Link
                                key={f.id}
                                to={`/profile/${f.id}`}
                                title={f.name}
                                className="transition-transform duration-150 hover:z-10 hover:scale-110"
                              >
                                <Avatar src={f.photo_url} name={f.name} size="xs" />
                              </Link>
                            ))}
                          </span>
                          <span className="text-xs text-smoke">
                            {Number(a.creators) > 6
                              ? `+${Number(a.creators) - 6} more`
                              : `${a.creators} ${Number(a.creators) === 1 ? 'creator' : 'creators'}`}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </Reveal>
              {/* EVERY TYPE, NOT THE FIRST TWELVE.
                  Ethan: "it's not showing all the aircrafts we've been on, I
                  think it should show them all or show the first 3 with a
                  toggle to view all and they would then appear below." The cap
                  was a silent 12 over a list the RPC already returns 40 of, so
                  a community that has been on more types than that was simply
                  told it had not. Three is a full row on desktop and the rest
                  open underneath in place, which is the second half of the ask
                  - not a link to another page. */}
              {fleet.length > 3 && (
                <button
                  type="button"
                  onClick={() => setAllFleet((v) => !v)}
                  className="btn-secondary mt-4 w-full justify-center text-sm sm:w-auto"
                >
                  {allFleet ? 'Show fewer' : `View all ${fleet.length} aircrafts`}
                  <Icon name={allFleet ? 'chevronUp' : 'chevronDown'} className="h-4 w-4" />
                </button>
              )}
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

// WHO FLIES THIS ROUTE, ON THE CARD THAT OPENS WHEN YOU PRESS IT.
//
// Ethan: "same for the across the community trips, and it should provide some
// info, show the creator's name and profile picture."
//
// The community map cannot list flights - `community_routes` returns a pair of
// codes and two counts, and that is deliberate (migration 103: a date and a
// flight number are somebody's movement history). What it CAN say is who,
// which is the half of the question that makes a line on a map worth pressing,
// and it is exactly what `route_creators` returns.
//
// FETCHED WHEN THE CARD OPENS, NOT UP FRONT. There are hundreds of routes on
// this map and one of them is open at a time. Keying the component on the pair
// means pressing a different line remounts it and starts the right request; the
// cancelled flag stops a slow answer landing on a card that has since closed.
function RouteCreators({ from, to }) {
  const [rows, setRows] = useState(null)

  useEffect(() => {
    let cancelled = false
    setRows(null)
    supabase.rpc('route_creators', { p_a: from, p_b: to }).then(({ data }) => {
      if (!cancelled) setRows(data ?? [])
    })
    return () => { cancelled = true }
  }, [from, to])

  if (!rows || rows.length === 0) return null

  return (
    <div className="border-t border-gray-100 px-5 py-4">
      <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-smoke">
        {rows.length === 1 ? 'Flown by' : `Flown by ${rows.length} creators`}
      </p>
      <ul className="space-y-1">
        {rows.slice(0, 4).map((c) => (
          <li key={c.creator_id}>
            {/* THE ROW SAYS TWO NUMBERS, AND THEY ARE DIFFERENT KINDS OF FACT.
                Ethan: "it says two for the flight he's been on, but then it
                should say, like, in total, ten flights."
                "2 on this route" is about the LINE you just pressed; "27
                flights logged" is about the PERSON, and it is the one that
                turns a name into somebody worth opening. They are stacked
                rather than run together because reading "2 flights 27 flights"
                on one line is a puzzle. See migration 156 for where the second
                number comes from - and note it counts SHARED flights only, the
                same definition the leaderboard on this page publishes. */}
            <Link
              to={`/profile/${c.creator_id}`}
              className="flex items-center gap-3 rounded-xl px-2 py-1.5 transition-colors duration-200 hover:bg-cloud"
            >
              <Avatar src={c.photo_url} name={c.name} size="xs" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold text-ink">{c.name}</span>
                <span className="block text-[11px] text-smoke">
                  {c.total_flights} {Number(c.total_flights) === 1 ? 'flight' : 'flights'} logged
                </span>
              </span>
              <span className="shrink-0 rounded-full bg-brand-tint px-2.5 py-1 text-[11px] font-semibold tabular-nums text-brand">
                {c.flights} here
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {rows.length > 4 && (
        <p className="mt-2 px-2 text-[11px] text-smoke">and {rows.length - 4} more</p>
      )}
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
    return [...by.values()].sort((a, b) => b.creators - a.creators || a.city.localeCompare(b.city)).slice(0, 10)
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
