import Icon from '../components/Icon'
import { cx } from '../lib/utils'
import { PURPOSES } from './FlightsParts'

// A SINGLE HUE STEPPED IN OPACITY rather than six colours: the palette here is
// one orange, and six arbitrary colours would be six things to learn.
export function PurposeBar({ list }) {
  // SIX CARDS, NOT ONE STACKED BAR.
  //
  // The bar was a single rounded strip cut into segments, each in a different
  // shade of orange, with a legend underneath. The colours were rebuilt once
  // already to make the segments distinguishable, and the honest conclusion is
  // that fixing the palette never fixed the control: a reader who wants to know
  // how many creator trips they took has to find the right orange in the legend,
  // carry it back up to the strip, judge a width against the whole, and multiply.
  // Ethan: "rather than doing that, maybe just have cards for each of them to
  // show the number, it would be clearer and look better."
  //
  // AND ALL SIX ARE ALWAYS HERE, INCLUDING THE ZEROES. The bar could only draw
  // what existed, so the set of categories changed shape as flights were logged
  // and "Commute" appearing for the first time looked like a new feature. A
  // fixed grid of six is a stable thing to read, and a zero is information: it
  // says the category exists and you have not used it, which is exactly what
  // somebody deciding whether to bother filling the field in wants to know.
  const counts = PURPOSES.map((p) => ({ ...p, n: list.filter((f) => f.purpose === p.key).length }))
  const most = Math.max(...counts.map((p) => p.n), 0)

  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
      {counts.map((p) => {
        const on = p.n > 0
        // The biggest category gets the tint. One highlight, not six competing
        // ones, and it is the only thing the old ramp was really conveying.
        const top = on && p.n === most
        return (
          <div
            key={p.key}
            className={cx(
              'flex flex-col items-center gap-1 rounded-xl border px-2 py-3 text-center transition-colors',
              top ? 'border-brand/40 bg-brand-tint/50'
                : on ? 'border-gray-100 bg-white' : 'border-gray-100 bg-cloud/40',
            )}
          >
            <Icon name={p.icon} className={cx('h-4 w-4 shrink-0', on ? 'text-brand' : 'text-gray-300')} />
            <span className={cx('text-lg font-bold leading-none tabular-nums', on ? 'text-ink' : 'text-gray-300')}>
              {p.n}
            </span>
            {/* leading-tight and a two-line box: "Creator trip" wraps at this
                width and a shorter label must not shunt the numbers out of line
                with the ones beside it. */}
            <span className="flex h-7 items-start justify-center text-[11px] font-medium leading-tight text-smoke">
              {p.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}
