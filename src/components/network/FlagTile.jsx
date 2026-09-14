import { flagFromIso } from '../../lib/flags'
import { cx } from '../../lib/utils'

// ONE FLAG, IN A SQUARE THAT CANNOT GROW.
//
// THE DIFFERENCE BETWEEN THIS AND `FlagStack`, BECAUSE THEY LOOK ALIKE AND ARE
// NOT INTERCHANGEABLE.
//
// `FlagStack` is for a WIDE ROW - a switcher line, a market header - where there
// is room for two flags and a "+2" chip, and where showing the reader that a
// market spans four countries is worth the width it costs.
//
// This is for a FIXED SQUARE: the 24-28px tile that sits before a market's name
// in a list. Nothing fits in there but one glyph. Flag emoji are double-width,
// so a second one is already overflowing and the "+N" chip beside it is a third
// object in a box sized for one - which is what Ethan reported on the
// notification settings ("an issue with how the flags appear when it shows more
// than one flag icon for a market"): the Nordics drew a Swedish flag and a "+3"
// pill inside a 24px square, and UK & Ireland drew a Union Jack and a "+1".
//
// So the tile shows the FIRST flag and nothing else, and the full list is the
// title for anyone who wants it. Same bargain the sidebar struck on 13 Sep and
// for the same reason: a market's identity is its NAME, which is right beside
// this, and the flag is a glance. `overflow-hidden` is the belt: a market
// configured with an unexpected code cannot push the name out of the row.
export default function FlagTile({ codes = [], kind, className, size = 'h-6 w-6', title }) {
  const list = (codes || []).filter(Boolean)
  const glyph = kind === 'network' ? '🌍' : (flagFromIso(list[0]) || '🌍')
  return (
    <span
      className={cx(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-cloud leading-none',
        size,
        className,
      )}
      title={title || list.join(', ')}
      aria-hidden
    >
      {glyph}
    </span>
  )
}
