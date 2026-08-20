import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Icon from '../components/Icon'
import Reveal from '../components/network/Reveal'
import AircraftPhoto, { photoCredits } from '../components/network/AircraftPhoto'
import { CountUp } from '../components/network/Motion'
import { EmptyState, PageHeader, Skeleton } from '../components/ui'
import { AIRCRAFT } from '../lib/airlines'
import { aircraftSeen } from '../lib/flightStats'
import { cx } from '../lib/utils'

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
// THEY ARE PHOTOGRAPHS NOW. Every one is a freely licensed shot from Wikimedia
// Commons, picked off a contact sheet for being side-on and filling its frame,
// downloaded into `public/aircraft` and credited at the foot of this page. See
// components/network/AircraftPhoto for how each of the three objections that
// made them drawings in the first place was actually answered.

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
        'group relative flex h-full flex-col overflow-hidden rounded-card border p-2.5 transition-all duration-300',
        'hover:-translate-y-1 hover:shadow-lift',
        // THE CARD CARRIES THE STATE, NOT THE PHOTOGRAPH.
        //
        // Ethan: "the card should normally be white if it's not collected, and
        // it should be the bright tryp.com orange if you have collected that
        // plane." The photographs used to be greyscaled instead, which reads as
        // a broken image before it reads as a gap - see AircraftPhoto.
        //
        // Three states and not two, because "most flown" was already on this
        // wall and deserves to stay: a solid brand card for the favourite, a
        // brand-tinted one for anything flown, and plain white for a gap. The
        // gap is the DEFAULT-looking card, which is the right way round - it is
        // the aeroplane you have not got, so it should look untouched, not
        // damaged.
        most
          ? 'border-brand bg-brand text-white shadow-lift ring-1 ring-brand'
          : owned
            ? 'border-brand/40 bg-brand-tint/60 shadow-card'
            : 'border-gray-100 bg-white shadow-card',
      )}
    >
      {/* The photograph leads. It is the reason to be on this page, and it gets
          a real 16:9 frame rather than a 96px strip - at that height a side-on
          airliner was about eleven pixels of fuselage. */}
      <div className="relative aspect-[16/9] w-full">
        <AircraftPhoto typeKey={type.key} type={type} owned={owned} />
        {/* THE ONE YOU HAVE FLOWN MOST WINS THE BADGE.
            Ethan: "highlighting the aircraft you travelled on most." A wall
            where every flown card looks identical has a fact in it that it is
            not saying, and this is the only one on the page that is about YOU
            rather than about the aeroplane.
            NO "FLOWN" TICK ANY MORE - the card being orange says it, and a
            badge repeating the card's own colour is a label on a label. */}
        {most && (
          <span className="absolute right-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand shadow-card">
            <Icon name="trophy" className="h-3 w-3" />
            Most flown
          </span>
        )}
      </div>

      <div className="mt-3 flex items-baseline justify-between gap-2">
        <p className={cx('min-w-0 truncate text-sm font-semibold leading-snug', most ? 'text-white' : 'text-ink')}>
          {type.name}
        </p>
        {/* THE YEAR IT ENTERED SERVICE. Ethan: "one piece of good information
            for each plane would be the year it was manufactured or the year it
            was released." Entry into service rather than first flight, because
            it is the date that answers "could I have been on this" - see the
            note on `year` in lib/airlines. It sits on the title line, where a
            number reads as an attribute of the name rather than as another
            statistic in the footer. */}
        {type.year && (
          <span className={cx('shrink-0 text-[11px] font-semibold tabular-nums', most ? 'text-white/70' : 'text-smoke')}>
            {type.year}
          </span>
        )}
      </div>
      <p className={cx('text-[11px]', most ? 'text-white/70' : 'text-smoke')}>{type.maker}</p>

      {/* WHAT THE CARD SAYS DEPENDS ENTIRELY ON WHETHER YOU HAVE IT.
          A card you own answers "when, how often, with whom". A card you do not
          own must not answer anything about you - it says what the aircraft is,
          which is the only honest thing it can say and also the thing that
          makes somebody want it. */}
      <div className={cx('mt-auto border-t pt-2 text-[11px]', most ? 'border-white/25' : 'border-gray-100')}>
        {owned ? (
          <>
            <p className={cx('font-semibold', most ? 'text-white' : 'text-brand')}>
              {seen.flights} {seen.flights === 1 ? 'flight' : 'flights'}
              <span className={cx('font-normal', most ? 'text-white/70' : 'text-smoke')}>
                {' · '}{Math.round(seen.distance).toLocaleString('en-GB')} km
              </span>
            </p>
            <p className={cx('truncate', most ? 'text-white/70' : 'text-smoke')}>
              {seen.airlines.length > 0 ? seen.airlines.slice(0, 2).join(', ') : 'Airline not logged'}
              {seen.airlines.length > 2 ? ` +${seen.airlines.length - 2}` : ''}
            </p>
          </>
        ) : (
          <p className="text-smoke">
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
      {/* TWO DOORS, NOT ONE ARROW. Ethan: "from the aircraft collection, there
          should be buttons to go back to the flight log and across to the
          community rather than just having to press the arrow back." The three
          flight pages are one feature and this was the only one of them that
          was a dead end. */}
      <div className="mb-4 flex flex-wrap gap-2">
        <Link to="/flights" className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-smoke transition-all duration-200 hover:-translate-y-0.5 hover:border-brand hover:text-brand">
          <Icon name="chevronLeft" className="h-3.5 w-3.5" />
          Your flight log
        </Link>
        <Link to="/flights/community" className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-smoke transition-all duration-200 hover:-translate-y-0.5 hover:border-brand hover:text-brand">
          <Icon name="globe" className="h-3.5 w-3.5" />
          Across the community
        </Link>
      </div>

      {/* NO STRAPLINE. It read "Every type in the book, and the ones you have
          actually been on. It fills in by itself as you log flights with an
          aircraft on them", which explains a mechanism nobody needs explained -
          the ghosted cards and the counter say all of it. Ethan asked for it
          gone. */}
      {/* NO ACTION BUTTON. It said "Add an aircraft" and it went to
          `/flights?log=new` - which is the flight log, so the button on the
          collection page was a link back to the page you just came from. Ethan:
          "there shouldn't be an add aircraft button because that just takes you
          back to the flight log, so if we can remove that button." An aircraft
          is not a thing you add here; it arrives because you logged a flight
          with one on it, and the two doors above are the way back. */}
      <PageHeader title="Aircraft collection" />

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
                {/* "AIRCRAFTS", AND NOT "different aircraft". Ethan: "it
                    shouldn't be 'different aircraft' it should be 'aircrafts'
                    just right". The old line also had a bug hiding in it - a
                    ternary whose two branches were the same word - which is
                    what happens when you try to make an irregular plural agree
                    and give up halfway. */}
                <p className="mt-1 flex items-baseline gap-3 text-5xl font-bold tabular-nums sm:text-6xl">
                  <CountUp value={flownCount} />
                  <span className="text-lg font-semibold text-white/75 sm:text-xl">
                    {flownCount === 1 ? 'aircraft' : 'aircrafts'}
                  </span>
                </p>
                {offTable.length > 0 && (
                  <p className="mt-1.5 text-xs text-white/70">
                    {offTable.length} of {flownCount === 1 ? 'it is' : 'them are'} not on our list, and {offTable.length === 1 ? 'it still counts' : 'they still count'}
                  </p>
                )}
              </div>
              {/* THE FAVOURITE, AS THE OTHER HALF OF THE CARD. The count says
                  how much of the world you have been in; this says which one
                  you keep going back to, which is the more personal of the
                  two. */}
              {top && (
                <div className="flex items-center gap-4 rounded-2xl bg-white/15 px-4 py-3">
                  <span className="h-14 w-24 shrink-0 overflow-hidden rounded-xl ring-1 ring-white/30">
                    <AircraftPhoto typeKey={top.type?.key} type={top.type} />
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
              // NOT "The whole book". Ethan asked for it gone, and he is right
              // that it was the page being pleased with itself: nobody calls a
              // list of aeroplanes a book, and the pair of labels has to be two
              // plain descriptions of two sets.
              //
              // AND NOT "FLOWN BY ME" EITHER. Ethan: "I wouldn't call that flown
              // by me because that could make it seem like you're the pilot.
              // When actually it's you've been on the plane." He is right, and
              // it is the same slip the whole feature has to watch for - a
              // "flight log" is a pilot's document and this one belongs to a
              // passenger. "Been on board" cannot be read the other way.
              { on: !onlyMine, label: `Every aircraft (${total})`, go: () => setOnlyMine(false), icon: 'globe' },
              { on: onlyMine, label: `Been on board (${collected})`, go: () => setOnlyMine(true), icon: 'check' },
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
                <Icon name={o.icon} className="h-3.5 w-3.5" />
                {o.label}
              </button>
            ))}
          </div>

          {CLASSES.map((cls) => {
            const all = Object.entries(AIRCRAFT)
              .filter(([, a]) => a.body === cls.key)
              .map(([key, a]) => ({ key, ...a }))
              .sort((a, b) => b.range - a.range)
            const types = onlyMine ? all.filter((t) => byName.has(t.name.toLowerCase())) : all
            // A class you have nothing in disappears entirely under the filter,
            // rather than leaving a heading over a hole.
            if (types.length === 0) return null
            return (
              <Reveal from="down" key={cls.key}>
                <section>
                  <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="text-lg font-semibold">{cls.label}</h2>
                    {/* NO "3 of 7". Ethan: "I wouldn't have the one out of
                        fourteen, I don't think it's necessary." Same reasoning
                        as the headline, which stopped being a score out of
                        something for the same reason: the denominator is the
                        size of OUR table, it grew by thirteen in one commit,
                        and a fraction invites a completion nobody is being
                        offered. The orange cards on the wall say how many you
                        have, and they say it by being orange. */}
                  </div>
                  {/* A WRAP, NOT A GRID - AND IT STARTS AT THE LEFT.
                      This has been both ways round and the second answer is the
                      right one, so the argument for the first is worth keeping.
                      A four-column grid leaves the remainder of every class
                      hanging on a half-empty final row, and with four sections
                      stacked the holes all land in the same corner, which reads
                      as a layout fault rather than as "there are eleven of
                      these". Ethan: "there's like two blank spaces in the bottom
                      right, it looks odd." Centring the leftovers hid that.
                      What it also did was untether every row from the left
                      margin, and that shows up hardest under "Been on board",
                      where a section can hold ONE card: a single card in the
                      middle of the page, lined up with nothing. Ethan: "you have
                      it so that all the cards are centered, so if there's only
                      one it's centre. This would be better if they always start
                      from the left and go to the right, like all the other pages
                      work."
                      He is right, and the reason is consistency rather than
                      geometry: every other card grid in this product starts at
                      the left margin, and one that does not reads as broken even
                      when it is tidier. The widths are unchanged 2/3/4 columns;
                      only where the leftovers sit has moved. */}
                  {/* The widths go on `itemClassName`, because Reveal wraps
                      every child in its own div and THAT is the flex item. */}
                  <Reveal
                    className="flex flex-wrap justify-start gap-4"
                    // `!h-auto self-stretch` and not the default `height:100%`.
                    // A flex item only stretches to its line's height when its
                    // cross size is `auto`; `.reveal-item` sets `height: 100%`,
                    // which against an indefinite container resolves to the
                    // content height AND disables stretch - so a card with a
                    // three-line footer stood taller than the one beside it and
                    // the row came out ragged.
                    itemClassName="flex !h-auto self-stretch w-[calc(50%-0.5rem)] sm:w-[calc(33.333%-0.667rem)] lg:w-[calc(25%-0.75rem)]"
                    stagger={0.05}
                  >
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

          {/* THE CREDIT LINE IS A LINE NOW, NOT A CARD.
              Ethan: "please remove at the bottom where it says photographs by
              the Wikimedia Commons community. We don't need that."
              IT CANNOT BE DELETED, and this is the one note on this page that
              is not a design opinion. Every photograph here is CC BY, CC BY-SA,
              GFDL or public domain, and the first three of those licences grant
              the right to use the image ON THE CONDITION that the author,
              the licence and a link back are given. Take the credit away and we
              are not using them under a licence any more; we are just using
              them. The pictures would have to come off the page instead.
              What CAN change is how much room it takes, because the licences
              ask for attribution "reasonable to the medium", not for a panel.
              So: one line of small grey text, no border, no fill, no heading
              about the Commons community, with the thirty-seven names folded
              behind it. */}
          <details className="group/credits pt-2">
            <summary className="flex cursor-pointer list-none items-center gap-1 text-[11px] text-gray-400 transition-colors hover:text-smoke">
              Photo credits
              <Icon name="chevronRight" className="h-3 w-3 transition-transform duration-200 group-open/credits:rotate-90" />
            </summary>
            <div className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
              {Object.entries(photoCredits).map(([key, c]) => (
                <a
                  key={key}
                  href={c.page}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate text-[11px] text-gray-400 transition-colors hover:text-brand"
                >
                  <span className="font-semibold">{AIRCRAFT[key]?.name || key}</span>
                  {' · '}
                  {c.author || 'Unknown'}
                  {' · '}
                  {c.licence}
                </a>
              ))}
            </div>
          </details>
        </div>
      )}
    </div>
  )
}
