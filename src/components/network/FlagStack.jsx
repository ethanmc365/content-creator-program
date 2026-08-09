import { flagFromIso } from '../../lib/flags'
import { cx } from '../../lib/utils'

// The flags of a market, in a box that cannot grow.
//
// THE BUG THIS EXISTS TO KILL
//
// Markets were rendering `codes.map(flagFromIso).join('')` into a 16px-wide
// span. One flag fits. Two (UK & Ireland) wrap onto a second line and make the
// row twice as tall as its neighbours; four (the Nordics) make it four times as
// tall, which is what made "Your places" look broken. Flag emoji are also
// double-width, so the intuitive fix of widening the box a little never quite
// works and the row height quietly depends on how many countries a market has.
//
// So: at most two flags, always on one line, and a quiet "+N" for the rest. The
// full list is in the title attribute for anyone who wants it. A market's
// identity is its name; the flags are a glance, and a glance does not need to be
// exhaustive.
export default function FlagStack({ codes = [], className, max = 2, title }) {
  const list = (codes || []).filter(Boolean)
  if (list.length === 0) {
    return <span className={cx('shrink-0 leading-none', className)} aria-hidden>🌍</span>
  }
  const shown = list.slice(0, max)
  const rest = list.length - shown.length
  return (
    <span
      className={cx('inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap leading-none', className)}
      title={title || list.join(', ')}
      aria-hidden
    >
      {shown.map((c) => <span key={c}>{flagFromIso(c)}</span>)}
      {rest > 0 && (
        <span className="ml-0.5 rounded-full bg-black/5 px-1 py-px text-[9px] font-semibold leading-none text-smoke">
          +{rest}
        </span>
      )}
    </span>
  )
}
