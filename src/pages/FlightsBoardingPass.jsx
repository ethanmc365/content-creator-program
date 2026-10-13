import { Badge } from '../components/ui'
import Icon from '../components/Icon'
import AircraftArt from '../components/network/AircraftArt'
import { humanHours } from '../lib/flightStats'
import { formatDate } from '../lib/utils'
import { useT } from '../lib/i18n'
import { km, PassField } from './FlightsParts'

// ------------------------------------------------------------ the boarding pass
//
// THE FORM'S ANSWER, DRAWN AS THE THING IT IS ABOUT.
//
// This was a tinted rectangle with a definition list in it. A boarding pass is the right object for two reasons beyond
// looking like one: it is the shape everybody already reads flight information in, so the codes, the date and the flight
// number land where the eye is already going to look for them; and it is the artefact the form is replacing, so filling
// in the form produces one.
//
// It builds ITSELF as you type. With one airport it is a stub with the other
// end blank, with both it draws the arc and the aircraft starts flying, and
// every fact underneath appears the moment it can be worked out. Nothing here
// is ever typed by the person filling it in.
export function BoardingPass({ from, to, facts, dateStr, airlineName, flightNo, seat, aircraftType }) {
  const tr = useT()
  // A STRAIGHT LINE, AND THE PLANE IS THE THING MOVING ALONG IT.
  //
  // A great-circle route drawn on a MAP curves because the map is a projection
  // of a sphere. In a box between two words it is not a projection of anything,
  // so a curve there is decoration that reads as a wobble. Straight is also what
  // a departure board draws, which is the object this is imitating.
  //
  // Where the line LIVES is in the markup below; how the plane moves along it is
  // in index.css (`pass-plane-fly`).
  return (
    <div className="overflow-hidden rounded-card border border-brand/25 bg-white shadow-card">
      {/* The stub across the top: brand, and the two codes with the aircraft
          between them, which is the one line of a boarding pass anybody
          actually reads. */}
      <div className="relative overflow-hidden bg-gradient-to-br from-brand to-brand-light px-5 py-4 text-white">
        <div className="pointer-events-none absolute -right-10 -top-14 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
        {/* THE CODES ON ONE ROW, THE ROUTE UNDER THEM, EDGE TO EDGE.
            The owner, twice: "you made it much shorter and it doesn't look as
            good", and "I said the dotted line with the animated airplane should
            go from the airport code to the other airport code but you still
            have it small in the middle."
            Both are the same fault. The line was a flex sibling BETWEEN the two
            code blocks, so it only ever got whatever width was left over after
            two 4xl codes and two city names had taken theirs - about a third of
            the card on a phone - and squeezing it in there is what flattened the
            whole stub. Now the codes are a row of their own and the route is a
            full-width band beneath them, anchored under DUB and under BUD. The
            plane has the whole card to cross. */}
        {/* THE ROUTE RUNS BETWEEN THE CODES, LEVEL WITH THEM. The team drew a red line across the screenshot to say
            where: from the right edge of DUB to the left edge of LIS, at the height of the codes. It had been a
            full-width band UNDER the codes with a white dot at each end, so the plane crossed the whole card while the
            two dots - not the codes - read as the airports.

            Three rows rather than two columns is what makes that possible.
            Labels, then codes-with-the-route-between-them on a single
            `items-center` row, then cities. The route is the flex child that
            grows, so it takes every pixel the two three-letter codes do not,
            which is most of the card - the previous attempt put the line
            BETWEEN two full From/To blocks, where it got only the leftovers
            after two 5xl codes and two city names, and that is why it came out
            "small in the middle". */}
        <div className="relative">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-white/70">{tr("From")}</p>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-white/70">To</p>
          </div>

          <div className="mt-0.5 flex items-center gap-3">
            <p className="shrink-0 text-4xl font-bold leading-none tracking-wider sm:text-5xl">{from?.iata || '– – –'}</p>

            <div className="relative h-8 min-w-0 flex-1">
              {/* The dashes stretch; the plane must not, so they are separate
                  layers. `vectorEffect` keeps the stroke 1.4px at any width. */}
              <svg viewBox="0 0 400 32" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" fill="none" aria-hidden>
                <path d="M0 16 L 400 16" stroke="rgba(255,255,255,0.55)" strokeWidth="1.4" strokeDasharray="6 8" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              </svg>
              {from && to && (
                <span className="pass-plane-fly">
                  {/* A PLAIN WHITE PLANE, NOT THE BRAND ONE. It was the tryp.com plane photograph, which was asked for
                      and then read back badly at this size: a 40px photo of an aircraft on a moving element is a
                      grey-and-white smudge with a shadow under it, and the thing it is meant to say - "something is
                      flying along this line" - was the part that got lost. So: a flat silhouette in pure white, which
                      holds its shape at any size and needs no drop shadow to sit on the orange. `plane-flight` is
                      nose-up like every plane glyph in the set, and the line runs left to right, so `.pass-plane-img`
                      turns it a quarter. */}
                  <Icon
                    name="plane-flight"
                    className="pass-plane-img h-[26px] w-[26px] text-white sm:h-[30px] sm:w-[30px]"
                  />
                </span>
              )}
            </div>

            <p className="shrink-0 text-4xl font-bold leading-none tracking-wider sm:text-5xl">{to?.iata || '– – –'}</p>
          </div>

          <div className="mt-1.5 flex items-baseline justify-between gap-3">
            <p className="min-w-0 truncate text-xs text-white/80">{from?.city || 'Where you left'}</p>
            <p className="min-w-0 truncate text-right text-xs text-white/80">{to?.city || 'Where you went'}</p>
          </div>
        </div>
      </div>

      {/* A PLAIN DASHED RULE, AND NO NOTCHES. There were two half-circles hanging off the edges to suggest a
          perforation. They were pinned outside the card, so on any background that was not white they were two white
          blobs floating beside it - and the card is `overflow-hidden`, so they were clipped into quarter-circles as
          often as not. */}
      <div className="border-t border-dashed border-brand/30 px-5 py-4">
        {/* CENTRED, AND EVENLY SPLIT. Six fields in a 3-up grid left two of them
            alone on a second row hanging to the left. */}
        <dl className="grid grid-cols-3 gap-x-4 gap-y-3 text-center sm:grid-cols-6">
          <PassField label={tr("Date")} value={dateStr ? formatDate(dateStr) : '—'} />
          <PassField label={tr("Flight")} value={flightNo?.trim().toUpperCase() || (airlineName ? airlineName.split(' ')[0] : '—')} />
          <PassField label={tr("Seat")} value={seat?.trim().toUpperCase() || '—'} />
          <PassField label={tr("Distance")} value={facts ? `${km(facts.dist)} km` : '—'} />
          {/* NO "estimated" HINT. Everything on this pass is derived from two airport codes and it says so nowhere else
              either; one field apologising for itself just draws the eye. */}
          <PassField label={tr("In the air")} value={facts ? humanHours(facts.mins) : '—'} />
          <PassField
            label={tr("Clocks")}
            value={!facts || facts.shift == null ? '—' : facts.shift === 0 ? 'No change' : `${facts.shift > 0 ? '+' : ''}${facts.shift}h`}
          />
        </dl>

        {facts && (
          // THE BADGES ARE CENTRED AND THE FLAGS ARE GONE.
          //
          // It ended with "🇮🇪 to 🇭🇺, international" - two flag emoji on a
          // platform whose rule is line icons and never emoji, saying something
          // the two airport codes eight pixels above already say. The row now
          // carries facts you could not work out by looking: how far a haul it
          // is, which way you are pointing, what it costs the atmosphere, and
          // how much of a day it eats.
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2 border-t border-gray-100 pt-3">
            <Badge tone="light" className="!px-2.5 !py-1">{facts.haul}</Badge>
            <Badge tone="grey" className="!px-2.5 !py-1">{facts.direction} · {Math.round(facts.bearing)}°</Badge>
            <Badge tone="grey" className="!px-2.5 !py-1">{facts.co2} kg CO2</Badge>
            {aircraftType && (
              <Badge tone="grey" className="!px-2.5 !py-1">
                <span className="mr-1.5 inline-block h-4 w-6 align-middle"><AircraftArt type={aircraftType} /></span>
                {aircraftType.name}
              </Badge>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
