import Reveal from '../components/network/Reveal'
import Icon from '../components/Icon'
import { formatDate } from '../lib/utils'
import { PURPOSE_LABEL, km } from './FlightsParts'
import { Badge } from '../components/ui'
import { haul } from '../lib/airports'
import { humanHours } from '../lib/flightStats'

// Part of Flights.jsx: every value it shows comes in as a prop from the page.
export default function FlightsLog({
  openEdit,
  remove,
  setDetail,
  setShowAll,
  showAll,
  stats,
  tr,
  visible,
}) {
  return (
    <Reveal from="down">
      <section>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">{tr("Every flight")}</h2>
          <p className="text-xs text-smoke">{stats.flights} logged</p>
        </div>
        <Reveal className="space-y-2.5" stagger={0.03}>
          {visible.map((t) => {
            const f = t.out
            const back = t.back
            return (
            // THE WHOLE ROW OPENS THE TRIP. It carried an Edit and a Remove button and nothing else, so the only thing
            // you could do to a flight you had logged was change it or destroy it - there was no way to simply look at
            // one. The buttons stop the press so they still do their own jobs.
            <div
              key={t.id}
              role="button"
              tabIndex={0}
              onClick={() => setDetail(t)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDetail(t) } }}
              className="card group flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-2 !p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-lift"
            >
              {/* THE PHOTOGRAPH IS THE FIRST THING ON THE ROW, and it is big enough to be one. It was a 56px square - a
                  thumbnail of a thumbnail, on the only part of a flight anybody wants to look at again. It opens full
                  size from the detail sheet the row leads to. */}
              {t.photo_url && (
                <img
                  src={t.photo_url}
                  alt=""
                  loading="lazy"
                  className="h-20 w-20 shrink-0 rounded-xl object-cover ring-1 ring-black/5 transition-transform duration-200 group-hover:scale-[1.03] sm:h-24 sm:w-24"
                />
              )}
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span className="flex shrink-0 items-center gap-1.5 text-sm font-bold tracking-wider text-brand">
                  {f.from.iata}
                  {/* THE SAME GLYPH THE COMING UP CARDS USE, IN THE
                      LIGHTER ORANGE - and a DOUBLE-HEADED one when the
                      trip has a return, because that arrow is now the
                      only thing saying two legs are one trip. */}
                  <Icon name={back ? 'reorder' : 'plane'} className="h-3.5 w-3.5 text-brand-light" />
                  {f.to.iata}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {f.from.city} to {f.to.city}
                  </span>
                  <span className="block truncate text-xs text-smoke">
                    {/* A trip with a return is a RANGE. Two dates say
                        "you were away from here to here", which is what
                        a week in Madrid actually was. */}
                    {back ? `${formatDate(f.flown_on)} – ${formatDate(back.flown_on)}` : formatDate(f.flown_on)}
                    {f.airline ? ` · ${f.airline}` : ''}
                    {f.flight_number ? ` ${f.flight_number}` : ''}
                    {f.aircraft ? ` · ${f.aircraft}` : ''}
                    {f.seat ? ` · seat ${f.seat}` : ''}
                    {f.purpose ? ` · ${f.purpose === 'other' && f.purpose_note ? f.purpose_note : (PURPOSE_LABEL[f.purpose] || f.purpose)}` : ''}
                  </span>
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {/* "Return" is not a badge on a second row any more, it
                    is a property of the one row. */}
                {back && <Badge tone="light" className="!px-2 !py-0.5">{tr("Return")}</Badge>}
                <Badge tone="grey" className="!px-2 !py-0.5">{haul(f.dist)}</Badge>
                <span className="text-right text-xs tabular-nums text-smoke">
                  <span className="block font-semibold text-ink">{km(t.dist)} km</span>
                  <span className="block">{humanHours(t.mins)}</span>
                </span>
                {/* EDIT BEFORE REMOVE, and nearer to hand. Deleting is
                    the irreversible one, so the gentler option comes
                    first. Both stop the press reaching the row. */}
                <button
                  onClick={(e) => { e.stopPropagation(); openEdit(f) }}
                  aria-label={tr("Edit this flight")}
                  className="rounded-lg p-1.5 text-gray-300 transition-colors hover:bg-brand-tint hover:text-brand"
                >
                  <Icon name="pencil" className="h-4 w-4" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); remove(f) }}
                  aria-label={tr("Remove this flight")}
                  className="rounded-lg p-1.5 text-gray-300 transition-colors hover:bg-red-50 hover:text-red-500"
                >
                  <Icon name="trash" className="h-4 w-4" />
                </button>
              </div>
            </div>
            )
          })}
        </Reveal>
        {stats.flights > 12 && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-card border border-gray-100 bg-white py-3 text-sm font-semibold text-brand shadow-card transition-all hover:-translate-y-0.5 hover:shadow-lift"
          >
            {showAll ? 'Show fewer' : `Show all ${stats.flights} flights`}
          </button>
        )}
      </section>
    </Reveal>
  )
}
