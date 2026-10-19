import Icon from '../Icon'
import { cx, formatDate } from '../../lib/utils'
import { pickClass } from '../../lib/pick'
import { weeklyRounds } from '../../lib/weekly'

// VIDEO OF THE WEEK, ON THE CHALLENGE FORM (19 Oct 2026). Off until it has an amount. The most viewed video posted in
// each round wins it; on a split challenge each group has its own. The rounds are read one last time when they end and
// the team presses Award on the results page, so nothing is paid by itself.
export default function WeeklyPrizeFields({ value, onChange, symbol = '€', currency = 'EUR', start, end, boards = 1 }) {
  const on = !!value
  const w = value || { amount: 10, type: 'voucher', every_days: 7 }
  const rounds = on ? weeklyRounds(start, end, w.every_days) : []
  const set = (patch) => onChange({ ...w, currency, ...patch })
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink"><Icon name="fire" className="h-4 w-4 text-brand" />Video of the Week</p>
          <p className="mt-0.5 max-w-xl text-xs leading-relaxed text-smoke">
            The most viewed video posted in each round wins a prize on top of everything else.{boards > 1 ? ' Each group has its own winner.' : ''} Views are read one last time when a round ends, then you check it and press Award on the results page.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          onClick={() => onChange(on ? null : { ...w, currency })}
          className={cx('relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200', on ? 'bg-brand' : 'bg-gray-200')}
        >
          <span className={cx('absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200', on ? 'translate-x-6' : 'translate-x-1')} />
          <span className="sr-only">Video of the Week</span>
        </button>
      </div>
      {on && (
        <div className="mt-4 space-y-3 animate-fade-up">
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm font-semibold focus-within:border-brand">
              <span className="text-smoke">{symbol}</span>
              <input
                className="w-12 bg-transparent text-center tabular-nums outline-none" inputMode="decimal" aria-label="Prize per round"
                value={w.amount ?? ''} onChange={(e) => set({ amount: e.target.value.replace(/[^\d.]/g, '').slice(0, 6) })}
              />
            </label>
            {[['voucher', 'Tryp.com voucher'], ['cash', 'Cash']].map(([k, label]) => (
              <button key={k} type="button" aria-pressed={w.type === k} onClick={() => set({ type: k })} className={cx('rounded-full border px-3.5 py-1.5 text-xs font-semibold', pickClass(w.type === k))}>{label}</button>
            ))}
            <span className="mx-1 h-5 w-px bg-gray-200" aria-hidden />
            {[[7, 'Every week'], [5, 'Every 5 days']].map(([d, label]) => (
              <button key={d} type="button" aria-pressed={Number(w.every_days) === d} onClick={() => set({ every_days: d })} className={cx('rounded-full border px-3.5 py-1.5 text-xs font-semibold', pickClass(Number(w.every_days) === d))}>{label}</button>
            ))}
          </div>
          {rounds.length > 0 ? (
            <ol className="flex flex-wrap gap-1.5">
              {rounds.map((r) => (
                <li key={r.round} className="rounded-lg bg-cloud px-2.5 py-1 text-xs text-smoke">
                  <span className="font-semibold text-ink">Round {r.round}</span> {formatDate(r.startsAt)} to {formatDate(r.endsAt)}
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-xs text-smoke">Set the start and end dates to see the rounds.</p>
          )}
        </div>
      )}
    </div>
  )
}
