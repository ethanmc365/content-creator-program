import { Badge, Modal } from '../components/ui'
import Icon from '../components/Icon'
import { km } from './FlightsParts'
import { humanHours } from '../lib/flightStats'
import { formatDate } from '../lib/utils'
import { haul } from '../lib/airports'

// Part of Flights.jsx: every value it shows comes in as a prop from the page.
export default function FlightsDetailModal({
  detail,
  offerTrip,
  openEdit,
  setDetail,
  setPhoto,
  tr,
  tripIsUpcoming,
}) {
  return (
    <Modal
      open={!!detail}
      onClose={() => setDetail(null)}
      title={detail ? `${detail.out.from.city} to ${detail.out.to.city}` : ''}
    >
      {detail && (
        <div className="space-y-5">
          {detail.photo_url && (
            <button
              type="button"
              onClick={() => setPhoto(detail.photo_url)}
              className="group relative block w-full overflow-hidden rounded-card"
              aria-label={tr("Open the photo full size")}
            >
              <img
                src={detail.photo_url}
                alt=""
                className="h-56 w-full object-cover transition-transform duration-300 group-hover:scale-[1.02] sm:h-72"
              />
              <span className="absolute bottom-2 right-2 flex items-center gap-1.5 rounded-full bg-ink/70 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-sm">
                <Icon name="expand" className="h-3.5 w-3.5" /> {tr("Full size")}
              </span>
            </button>
          )}

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-cloud px-3 py-2.5">
              <p className="text-lg font-bold tabular-nums text-brand">{km(detail.dist)}</p>
              <p className="text-[11px] text-smoke">{tr("km flown")}</p>
            </div>
            <div className="rounded-xl bg-cloud px-3 py-2.5">
              <p className="text-lg font-bold tabular-nums text-brand">{humanHours(detail.mins)}</p>
              <p className="text-[11px] text-smoke">{tr("in the air")}</p>
            </div>
            <div className="rounded-xl bg-cloud px-3 py-2.5">
              <p className="text-lg font-bold tabular-nums text-brand">{detail.legs.length}</p>
              <p className="text-[11px] text-smoke">{detail.legs.length === 1 ? 'leg' : 'legs'}</p>
            </div>
          </div>

          {/* EVERY LEG, NAMED. A return trip is two flights and the detail
              sheet is the one place that should say so plainly. */}
          <div className="space-y-2">
            {detail.legs.map((leg, i) => (
              <div key={leg.id} className="rounded-xl border border-gray-100 px-4 py-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="flex items-center gap-1.5 text-sm font-bold tracking-wider text-brand">
                    {leg.from.iata}
                    <Icon name="plane" className="h-3.5 w-3.5 text-brand-light" />
                    {leg.to.iata}
                  </span>
                  {detail.legs.length > 1 && (
                    <Badge tone="light" className="!px-2 !py-0.5">{i === 0 ? 'Out' : 'Back'}</Badge>
                  )}
                  <span className="ml-auto text-xs text-smoke">{formatDate(leg.flown_on)}</span>
                </div>
                <p className="mt-1 text-xs text-smoke">
                  {leg.from.city} to {leg.to.city}
                  {leg.airline ? ` · ${leg.airline}` : ''}
                  {leg.flight_number ? ` ${leg.flight_number}` : ''}
                  {leg.aircraft ? ` · ${leg.aircraft}` : ''}
                  {leg.seat ? ` · seat ${leg.seat}` : ''}
                </p>
                <p className="mt-1 text-xs tabular-nums text-smoke">
                  {km(leg.dist)} km · {humanHours(leg.mins)} · {haul(leg.dist)}
                </p>
              </div>
            ))}
          </div>

          {/* ONLY A TRIP THAT HAS NOT HAPPENED CAN BE POSTED (1 Sep 2026).

              Ethan: "I seemed to be able to log a past flight and then click
              edit and then it shows up a weird icon saying share to collab
              board and I pressed it and it then shared it and it appeared as
              a past trip. Remember only current or future trips logged on
              flight log should get a popup saying post to collab board."

              The rule was already right in ONE of the two places that offer
              this - the post-save offer checks `upcoming` - and completely
              absent from the other. So the button was there on a flight from
              2019, and pressing it put "I am in Seville" on a board where
              nobody could act on it.
              `tripIsUpcoming` is now the one definition, read by both.

              AND IT IS A REAL BUTTON. It was `btn-ghost` beside a
              `btn-secondary`, which at this size is an orange glyph and some
              text with no boundary at all - the "weird icon" in the report.
              A row of two actions is two buttons that look like buttons. */}
          <div className="flex flex-wrap gap-2">
            <button onClick={() => { const f = detail.out; setDetail(null); openEdit(f) }} className="btn-secondary !py-2.5 text-sm">
              <Icon name="pencil" className="h-4 w-4" /> {tr("Edit")}
            </button>
            {tripIsUpcoming(detail.out) && (
              <button onClick={() => { const f = detail.out; setDetail(null); offerTrip(f) }} className="btn-secondary !py-2.5 text-sm">
                <Icon name="share" className="h-4 w-4" /> {tr("Post to the collab board")}
              </button>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}
