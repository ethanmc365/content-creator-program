import { flagFromIso } from '../../lib/flags'
import { cx } from '../../lib/utils'

// THE BADGE THAT SITS BEFORE A MARKET'S NAME.
//
// A TILE THAT KEEPS ITS HEIGHT AND GROWS SIDEWAYS, WHICH IS THE WHOLE IDEA.
//
// This box has now been got wrong three times in three places, and every one of
// them was the same mistake in different clothes: a market's flags were poured
// into a container sized for ONE flag, and the container was a SQUARE.
//
//   * the notification settings drew a Swedish flag and a "+3" pill inside a
//     24px square, and UK & Ireland drew a Union Jack and a "+1";
//   * the sidebar drew all four Nordic flags in a 28px square and they pushed
//     the market's own name out of the card;
//   * the Rooms page put `FlagStack` - two flags AND a "+N" chip - inside a
//     34px square, which is what Ethan reported on 15 Sep 2026: "it shows a
//     little circle around the flags and works good for the markets with one
//     flag but for UK & Ireland and the Nordics it looks weird."
//
// The first two were fixed by throwing information away: show the first flag,
// put the rest in the `title`. That stopped the overflow and it is a poor
// bargain, because "UK & Ireland" then draws a Union Jack and nothing else -
// the badge actively misinforms, and the Nordics' badge says Sweden.
//
// THE FIX IS TO STOP INSISTING ON A SQUARE. Flag emoji are double-width and
// there is no font size at which four of them fit across 34 pixels; that is
// arithmetic, not a tuning problem, and every previous attempt was an attempt
// to tune it. But nothing actually needed the box to be square - it needed the
// box to be a FIXED HEIGHT, so a list of markets has rows of one height and
// reads as a column. Width was never load-bearing. A one-country market gets a
// square, a two-country market gets a slightly wider pill, the Nordics get a
// wider one again, and every one of them is the same height with the flags at
// the same readable size. Nothing overflows, nothing is hidden, and nothing has
// to be shrunk to eight pixels to fit a shape nobody needed.
//
// WHY NOT A 2x2 QUILT, or overlapping circular coins, both of which look
// smarter in a mockup: a quilt puts flags at a third of this size, and a coin
// has to CROP the glyph - which is fine on Apple and Android, where flags are
// rendered as flags, and destroys the badge on Windows, where they are rendered
// as the two letters of the country code. A row of whole glyphs is the only
// version that cannot be broken by a font.
//
// FOUR IS THE CAP and it is not arbitrary: it is every market this platform
// has - Worldwide (none), Germany/Portugal/Romania/Spain (one), UK & Ireland
// (two), the Nordics (four). The `+N` is for a market nobody has created yet,
// so it is correct rather than decorative.

const MAX_FLAGS = 4

export default function FlagTile({
  codes = [],
  kind,
  className,
  size = 'h-6 w-6',
  glyph: glyphClass = 'text-sm',
  title,
}) {
  const list = (codes || []).filter(Boolean)
  const flags = kind === 'network' ? [] : list.map(flagFromIso).filter(Boolean)
  const shown = flags.slice(0, MAX_FLAGS)
  const rest = flags.length - shown.length

  // ONE GLYPH KEEPS THE SQUARE. `size` carries both dimensions (`h-7 w-7`), and
  // for the single-flag case that is exactly right and is what every one of
  // these badges already looked like. More than one and the WIDTH has to go,
  // which is what `w-auto` and the padding below do - the height class in
  // `size` survives untouched, so the row height never moves.
  const many = shown.length > 1

  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center justify-center gap-[3px] rounded-xl leading-none',
        size,
        many && 'w-auto px-1.5',
        kind === 'network' ? 'bg-brand-tint text-brand' : 'bg-cloud',
        className,
      )}
      title={title || list.join(', ')}
      aria-hidden
    >
      {shown.length === 0
        ? <span className={glyphClass}>🌍</span>
        : shown.map((f, i) => <span key={`${f}-${i}`} className={glyphClass}>{f}</span>)}
      {rest > 0 && (
        <span className="rounded-full bg-black/10 px-1 py-px text-[9px] font-bold leading-none text-smoke">
          +{rest}
        </span>
      )}
    </span>
  )
}
