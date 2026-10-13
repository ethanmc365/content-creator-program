import { humanHours } from '../lib/flightStats'
import { cx } from '../lib/utils'
import { km } from './FlightsParts'

// A YEAR, BESIDE ANOTHER YEAR.
//
// SIDE BY SIDE AND ON DEMAND, both of which On demand matters as much as the shape - a comparison that is always on
// screen is a judgement passed on you every time you open the page, and in January it is a very unkind one.
export function YearColumn({ title, data, other, lead = false }) {
  const delta = (a, b) => {
    if (!other || b === 0) return null
    const pct = Math.round(((a - b) / b) * 100)
    if (!Number.isFinite(pct) || pct === 0) return null
    return pct
  }
  const rows = [
    { label: 'Flights', value: data.flights.toLocaleString('en-GB'), d: delta(data.flights, other?.flights) },
    { label: 'Distance', value: `${km(data.distance)} km`, d: delta(data.distance, other?.distance) },
    { label: 'In the air', value: humanHours(data.minutes), d: delta(data.minutes, other?.minutes) },
    { label: 'Countries', value: data.countries, d: delta(data.countries, other?.countries) },
    { label: 'Airports', value: data.airports, d: delta(data.airports, other?.airports) },
    { label: 'Time zones crossed', value: `${data.zonesCrossed}h`, d: delta(data.zonesCrossed, other?.zonesCrossed) },
  ]
  return (
    <div className={cx(
      'rounded-card border p-5',
      lead ? 'border-brand/30 bg-brand-tint/20' : 'border-gray-100 bg-white shadow-card',
    )}>
      <p className={cx('text-sm font-bold', lead ? 'text-brand' : 'text-ink')}>{title}</p>
      <dl className="mt-3 space-y-2.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between gap-3">
            <dt className="text-xs text-smoke">{r.label}</dt>
            <dd className="flex items-baseline gap-2">
              <span className="text-sm font-semibold tabular-nums text-ink">{r.value}</span>
              {/* The arrow only appears on the LEAD column. Printing "+40%" on
                  one side and "-29%" on the other is the same fact twice, and
                  the second one reads as last year having failed. */}
              {lead && r.d != null && (
                <span className={cx(
                  'w-12 shrink-0 text-right text-[11px] font-semibold tabular-nums',
                  r.d > 0 ? 'text-green-600' : 'text-smoke',
                )}>
                  {r.d > 0 ? '+' : ''}{r.d}%
                </span>
              )}
              {lead && r.d == null && <span className="w-12 shrink-0" />}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
