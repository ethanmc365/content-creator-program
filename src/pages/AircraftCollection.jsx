import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Icon from '../components/Icon'
import Reveal from '../components/network/Reveal'
import AircraftArt from '../components/network/AircraftArt'
import { CountUp } from '../components/network/Motion'
import { EmptyState, PageHeader, Skeleton } from '../components/ui'
import { AIRCRAFT } from '../lib/airlines'
import { aircraftSeen } from '../lib/flightStats'
import { cx, formatDate } from '../lib/utils'

// THE AIRCRAFT COLLECTION.
//
// A flight log knows which types you have been on and has never once told you,
// which is a waste of the one fact in it that behaves like a collection: it
// only grows, it has a finite and knowable end, and the gaps in it are as
// interesting as the entries. Ethan: "an aircraft collection page showing image
// of all the aircraft types you've been on."
//
// IT SHOWS THE ONES YOU HAVE NOT FLOWN TOO, and that is the whole design. A
// page listing only what you have is an inventory; a page that also shows the
// four widebodies you have never been on is a collection, and the difference is
// that one of them makes you want to go and get the missing ones. Everything
// ghosted is a type in the fleet table (lib/airlines) that no flight in your
// log names.
//
// See components/network/AircraftArt for why these are drawings and not
// photographs - short version: airliner photography is somebody's copyright,
// the CSP forbids a remote image, and at collection-card size the shape class
// is the only thing that distinguishes one from another anyway.

const CLASSES = [
  { key: 'widebody', label: 'Widebodies', hint: 'Two aisles. The ones that cross oceans.' },
  { key: 'narrowbody', label: 'Single aisle', hint: 'The workhorses. Most flights, most of the time.' },
  { key: 'regional', label: 'Regional jets', hint: 'Small, quick, and usually the last hop.' },
  { key: 'turboprop', label: 'Turboprops', hint: 'Propellers. Islands and short runways.' },
]

function TypeCard({ type, seen }) {
  const owned = !!seen
  return (
    <div
      className={cx(
        'group relative flex flex-col overflow-hidden rounded-card border p-4 transition-all duration-300',
        owned
          ? 'border-brand/25 bg-white shadow-card hover:-translate-y-1 hover:shadow-lift'
          : 'border-dashed border-gray-200 bg-cloud/40',
      )}
    >
      {/* The drawing leads. It is the reason to be on this page. */}
      <div className="relative h-24 w-full">
        <AircraftArt type={type} owned={owned} />
        {owned && (
          <span className="absolute right-0 top-0 inline-flex items-center gap-1 rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
            <Icon name="check" className="h-3 w-3" />
            Flown
          </span>
        )}
      </div>

      <p className={cx('mt-3 text-sm font-semibold leading-snug', owned ? 'text-ink' : 'text-gray-400')}>
        {type.name}
      </p>
      <p className="text-[11px] text-smoke">{type.maker}</p>

      {/* WHAT THE CARD SAYS DEPENDS ENTIRELY ON WHETHER YOU HAVE IT.
          A card you own answers "when, how often, with whom". A card you do not
          own must not answer anything about you - it says what the aircraft is,
          which is the only honest thing it can say and also the thing that
          makes somebody want it. */}
      <div className="mt-2 border-t border-gray-100 pt-2 text-[11px]">
        {owned ? (
          <>
            <p className="font-semibold text-brand">
              {seen.flights} {seen.flights === 1 ? 'flight' : 'flights'}
              <span className="font-normal text-smoke"> · {Math.round(seen.distance).toLocaleString('en-GB')} km</span>
            </p>
            <p className="truncate text-smoke">
              {seen.airlines.length > 0 ? seen.airlines.slice(0, 2).join(', ') : 'Airline not logged'}
              {seen.airlines.length > 2 ? ` +${seen.airlines.length - 2}` : ''}
            </p>
            <p className="text-gray-400">Last flown {formatDate(seen.last)}</p>
          </>
        ) : (
          <p className="text-gray-400">
            {type.seats} seats · {Math.round(type.range).toLocaleString('en-GB')} km range
          </p>
        )}
      </div>
    </div>
  )
}

export default function AircraftCollection() {
  const { user } = useAuth()
  const [rows, setRows] = useState(null)

  useEffect(() => {
    let cancelled = false
    supabase
      .from('flights')
      .select('aircraft, airline, flown_on, distance_km, from_iata, to_iata')
      .eq('creator_id', user.id)
      .limit(1000)
      .then(({ data }) => { if (!cancelled) setRows(data ?? []) })
    return () => { cancelled = true }
  }, [user.id])

  const seen = useMemo(() => (rows ? aircraftSeen(rows) : []), [rows])
  const byName = useMemo(
    () => new Map(seen.map((s) => [s.name.toLowerCase(), s])),
    [seen],
  )
  // The types somebody typed by hand that are not in the fleet table. They are
  // real aircraft that were really flown, so they are counted and listed - they
  // simply have no drawing, and pretending they do not exist because the table
  // is short would be the page calling somebody's memory wrong.
  const offTable = useMemo(() => seen.filter((s) => !s.type), [seen])
  const collected = useMemo(
    () => Object.entries(AIRCRAFT).filter(([, a]) => byName.has(a.name.toLowerCase())).length,
    [byName],
  )
  const total = Object.keys(AIRCRAFT).length

  return (
    <div className="page">
      <Link to="/flights" className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-smoke transition-colors hover:text-brand">
        <Icon name="chevronLeft" className="h-4 w-4" />
        Your flight log
      </Link>

      <PageHeader
        title="Aircraft collection"
        subtitle="Every type in the book, and the ones you have actually been on. It fills in by itself as you log flights with an aircraft on them."
      />

      {rows === null ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-56" />)}
        </div>
      ) : (
        <div className="space-y-10">
          {/* THE COUNT, AS THE PAGE'S FIRST SENTENCE. A collection page whose
              first line is a grid is a catalogue; the number is what makes it
              yours. */}
          <section className="relative overflow-hidden rounded-card bg-gradient-to-br from-brand to-brand-light p-6 text-white shadow-lift sm:p-8">
            <div className="pointer-events-none absolute -right-16 -top-20 h-72 w-72 rounded-full bg-white/10 blur-2xl" />
            <div className="relative flex flex-wrap items-end justify-between gap-6">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-white/70">Types collected</p>
                <p className="mt-1 flex items-baseline gap-2 text-5xl font-bold tabular-nums sm:text-6xl">
                  <CountUp value={collected} />
                  <span className="text-xl font-semibold text-white/70">/ {total}</span>
                </p>
                {offTable.length > 0 && (
                  <p className="mt-1 text-xs text-white/70">
                    plus {offTable.length} {offTable.length === 1 ? 'type' : 'types'} not in our book
                  </p>
                )}
              </div>
              <div className="w-full max-w-sm">
                <div className="h-2.5 overflow-hidden rounded-full bg-white/20">
                  {collected > 0 && (
                    <div
                      className="h-full rounded-full bg-white transition-[width] duration-1000 ease-out"
                      style={{ width: `${Math.max(3, (collected / total) * 100)}%` }}
                    />
                  )}
                </div>
                <p className="mt-1.5 text-[11px] text-white/60">
                  {collected === total
                    ? 'Every type in the book. There is nothing left to collect.'
                    : `${total - collected} still to fly.`}
                </p>
              </div>
            </div>
          </section>

          {CLASSES.map((cls) => {
            const types = Object.entries(AIRCRAFT)
              .filter(([, a]) => a.body === cls.key)
              .map(([key, a]) => ({ key, ...a }))
              .sort((a, b) => b.range - a.range)
            if (types.length === 0) return null
            const got = types.filter((t) => byName.has(t.name.toLowerCase())).length
            return (
              <Reveal from="down" key={cls.key}>
                <section>
                  <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <h2 className="text-lg font-semibold">{cls.label}</h2>
                      <p className="mt-0.5 text-sm text-smoke">{cls.hint}</p>
                    </div>
                    <p className="text-xs font-semibold tabular-nums text-brand">{got} / {types.length}</p>
                  </div>
                  <Reveal className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4" stagger={0.05}>
                    {types.map((t) => (
                      <TypeCard key={t.key} type={t} seen={byName.get(t.name.toLowerCase()) || null} />
                    ))}
                  </Reveal>
                </section>
              </Reveal>
            )
          })}

          {offTable.length > 0 && (
            <Reveal from="down">
              <section>
                <h2 className="mb-1 text-lg font-semibold">Also flown</h2>
                <p className="mb-3 text-sm text-smoke">
                  Types you typed in yourself. They count; we just have no drawing for them.
                </p>
                <div className="flex flex-wrap gap-2">
                  {offTable.map((a) => (
                    <span key={a.name} className="inline-flex items-center gap-2 rounded-full border border-gray-100 bg-white px-3.5 py-1.5 text-xs shadow-card">
                      <span className="font-semibold">{a.name}</span>
                      <span className="text-smoke">{a.flights}</span>
                    </span>
                  ))}
                </div>
              </section>
            </Reveal>
          )}

          {seen.length === 0 && (
            <EmptyState
              icon={<Icon name="plane" className="h-7 w-7" />}
              title="Nothing collected yet"
              hint="Add an aircraft to a flight in your log and it lights up here."
              action={<Link to="/flights" className="btn-primary">Go to your flight log</Link>}
            />
          )}
        </div>
      )}
    </div>
  )
}
