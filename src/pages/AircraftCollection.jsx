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

// NO HINT LINE ANY MORE. Each of these carried one - "Propellers. Islands and
// short runways", and three more like it. Ethan: "remove these descriptions, I
// don't like them." He is right twice over: the drawings underneath say which
// class this is far better than a sentence can, and four headings with four
// subtitles turns a wall of pictures into a document.
const CLASSES = [
  { key: 'widebody', label: 'Widebodies' },
  { key: 'narrowbody', label: 'Single aisle' },
  { key: 'regional', label: 'Regional jets' },
  { key: 'turboprop', label: 'Turboprops' },
]

function TypeCard({ type, seen, most = false }) {
  const owned = !!seen
  return (
    <div
      className={cx(
        // `h-full`, so every card in a row is the same height whatever its
        // detail line says. A grid row is as tall as its tallest cell either
        // way; without this the CARD stops short inside it and the wall looks
        // ragged.
        'group relative flex h-full flex-col overflow-hidden rounded-card border p-4 transition-all duration-300',
        most
          ? 'border-brand bg-brand-tint/25 shadow-card ring-1 ring-brand/30 hover:-translate-y-1 hover:shadow-lift'
          : owned
            ? 'border-brand/25 bg-white shadow-card hover:-translate-y-1 hover:shadow-lift'
            : 'border-dashed border-gray-200 bg-cloud/40',
      )}
    >
      {/* The drawing leads. It is the reason to be on this page. */}
      <div className="relative h-24 w-full">
        <AircraftArt type={type} owned={owned} />
        {/* THE ONE YOU HAVE FLOWN MOST WINS THE BADGE.
            Ethan: "highlighting the aircraft you travelled on most." A wall
            where every flown card looks identical has a fact in it that it is
            not saying, and this is the only one on the page that is about YOU
            rather than about the aeroplane. "Flown" is implicit on it - a card
            cannot be your most-flown type without being one you have flown. */}
        {most ? (
          <span className="absolute right-0 top-0 inline-flex items-center gap-1 rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
            <Icon name="trophy" className="h-3 w-3" />
            Most flown
          </span>
        ) : owned && (
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
      <div className="mt-auto border-t border-gray-100 pt-2 text-[11px]">
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
  // ONLY THE ONES YOU HAVE ACTUALLY BEEN ON.
  // Ethan: "a button to quickly filter by the ones you've actually been on so
  // it just shows up them and not all the other aircrafts too." The ghosted
  // cards are the whole reason this is a collection rather than an inventory
  // (see the note at the top), so the default stays the full book - but a wall
  // of thirty-odd types is a lot to scroll past when what you came to look at
  // is your own eleven.
  const [onlyMine, setOnlyMine] = useState(false)

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

  // THE ONE YOU HAVE FLOWN MOST. `aircraftSeen` already returns the types
  // sorted by how often, so this is the head of it - but only when it is a type
  // the book knows, because the badge is drawn on a card and an off-table type
  // has no card to draw it on.
  const top = useMemo(() => seen.find((sn) => sn.type) || null, [seen])
  // A tie at one flight each is not a favourite, it is a list.
  const mostFlown = top && top.flights > 1 ? top.name.toLowerCase() : null
  // WHAT THE HEADLINE COUNTS: every distinct type you have been on, including
  // the ones our table has never heard of. `collected` counts only the ones
  // with a card, which is what the per-class "3 of 7" figures are about.
  const flownCount = seen.length

  return (
    <div className="page">
      <Link to="/flights" className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-smoke transition-colors hover:text-brand">
        <Icon name="chevronLeft" className="h-4 w-4" />
        Your flight log
      </Link>

      {/* NO STRAPLINE. It read "Every type in the book, and the ones you have
          actually been on. It fills in by itself as you log flights with an
          aircraft on them", which explains a mechanism nobody needs explained -
          the ghosted cards and the counter say all of it. Ethan asked for it
          gone. */}
      <PageHeader
        title="Aircraft collection"
        action={
          // ADDING A RARE ONE. Ethan: "a button to add other aircraft in case
          // there's a rare one someone goes on."
          // An aircraft type is not a thing you own on its own - it is
          // something you were ON, which means it belongs to a flight. So the
          // button goes where the fact actually lives: the log form, whose
          // aircraft picker now has an "Other" escape for anything the book
          // does not hold. What you type there appears under "Also flown"
          // below, and counts.
          <Link to="/flights?log=new" className="btn-secondary !py-2.5 text-sm">
            <Icon name="plus" className="h-4 w-4" />
            Add an aircraft
          </Link>
        }
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
              {/* A NUMBER AND A SENTENCE, NOT A SCORE OUT OF SOMETHING.
                  It read "11 / 24" over a progress bar. Ethan: "don't have it
                  as 1/x but rather just like, a number - you've been on 3
                  different aircraft for example."
                  He is right, and the reason is that the denominator was never
                  a real target. It is the size of OUR TABLE, which grew by ten
                  the day this page was rewritten - so somebody's score went
                  down overnight without them doing anything, and "11 of 24"
                  invites a completion nobody is going to reach and nothing is
                  offering them. The count of what you HAVE is the fact; the
                  ghosted cards below are the invitation. */}
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-white/70">You have been on</p>
                <p className="mt-1 flex items-baseline gap-3 text-5xl font-bold tabular-nums sm:text-6xl">
                  <CountUp value={flownCount} />
                  <span className="text-lg font-semibold text-white/75 sm:text-xl">
                    different {flownCount === 1 ? 'aircraft' : 'aircraft'}
                  </span>
                </p>
                {offTable.length > 0 && (
                  <p className="mt-1.5 text-xs text-white/70">
                    {offTable.length} of {flownCount === 1 ? 'it is' : 'them are'} not in our book, and {offTable.length === 1 ? 'it still counts' : 'they still count'}
                  </p>
                )}
              </div>
              {/* THE FAVOURITE, AS THE OTHER HALF OF THE CARD. The count says
                  how much of the world you have been in; this says which one
                  you keep going back to, which is the more personal of the
                  two. */}
              {top && (
                <div className="flex items-center gap-4 rounded-2xl bg-white/15 px-4 py-3">
                  <span className="h-12 w-20 shrink-0 text-white">
                    <AircraftArt type={top.type} className="[&>g]:!text-white" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[11px] font-semibold uppercase tracking-widest text-white/70">Most flown</span>
                    <span className="block truncate text-lg font-bold">{top.name}</span>
                    <span className="block text-xs text-white/75">
                      {top.flights} {top.flights === 1 ? 'flight' : 'flights'} · {Math.round(top.distance).toLocaleString('en-GB')} km
                    </span>
                  </span>
                </div>
              )}
            </div>
          </section>

          {/* THE FILTER, ONCE, ABOVE ALL FOUR CLASSES. A control per section
              would be four controls doing one job, and the answer to "show me
              only mine" is never "only my widebodies". */}
          <div className="flex flex-wrap items-center gap-2">
            {[
              { on: !onlyMine, label: `The whole book (${total})`, go: () => setOnlyMine(false) },
              { on: onlyMine, label: `Only what I have flown (${collected})`, go: () => setOnlyMine(true) },
            ].map((o) => (
              <button
                key={o.label}
                type="button"
                onClick={o.go}
                aria-pressed={o.on}
                className={cx(
                  'inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold transition-all duration-200',
                  o.on
                    ? 'border-brand bg-brand text-white'
                    : 'border-gray-200 bg-white text-smoke hover:-translate-y-0.5 hover:border-brand hover:text-brand',
                )}
              >
                {o.label}
              </button>
            ))}
          </div>

          {CLASSES.map((cls) => {
            const all = Object.entries(AIRCRAFT)
              .filter(([, a]) => a.body === cls.key)
              .map(([key, a]) => ({ key, ...a }))
              .sort((a, b) => b.range - a.range)
            const got = all.filter((t) => byName.has(t.name.toLowerCase())).length
            const types = onlyMine ? all.filter((t) => byName.has(t.name.toLowerCase())) : all
            // A class you have nothing in disappears entirely under the filter,
            // rather than leaving a heading over a hole.
            if (types.length === 0) return null
            return (
              <Reveal from="down" key={cls.key}>
                <section>
                  <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="text-lg font-semibold">{cls.label}</h2>
                    <p className="text-xs font-semibold tabular-nums text-brand">
                      {onlyMine ? `${got} flown` : `${got} of ${all.length}`}
                    </p>
                  </div>
                  <Reveal className="grid grid-cols-2 items-stretch gap-4 sm:grid-cols-3 lg:grid-cols-4" stagger={0.05}>
                    {types.map((t) => (
                      <TypeCard
                        key={t.key}
                        type={t}
                        seen={byName.get(t.name.toLowerCase()) || null}
                        most={mostFlown === t.name.toLowerCase()}
                      />
                    ))}
                  </Reveal>
                </section>
              </Reveal>
            )
          })}

          {offTable.length > 0 && (
            <Reveal from="down">
              <section>
                <h2 className="mb-3 text-lg font-semibold">Also flown</h2>
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
