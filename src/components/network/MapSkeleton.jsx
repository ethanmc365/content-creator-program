import { cx } from '../../lib/utils'

// THE PLACEHOLDER FOR A MAP, AND IT IS THE SIZE OF THE MAP.
//
// THE BUG THIS FIXES. Every page that defers a map behind `WhenVisible` was
// passing its own guess at how big the map would be, and each guess was
// different and all of them were wrong: `h-72` on the worldwide hub, `h-64` in a
// market, `h-[340px] sm:h-[420px]` in the directory, `aspect-[2/1]` on the
// collab board. The maps themselves are a fixed 880x480 viewBox drawn at
// `width: 100%; height: auto`, so a map in a 700px column is 382px tall - and a
// 288px placeholder means the page visibly grows by a hundred pixels at the
// moment the map arrives, with everything below it jumping down. Ethan: "when
// loading, the card appearing to load and the actual card is different in size,
// please fix this."
//
// A placeholder is a PROMISE ABOUT A SIZE. There is only one honest way to keep
// it, which is to derive it from the same number the map uses, so this holds the
// aspect ratio and every caller takes it rather than inventing one. 880/480 is
// 11/6; WorldMap's 880/440 is 2/1, hence the `ratio` prop rather than a single
// hard-coded class.
//
// It is a plain pulsing block rather than the `Skeleton` component for one
// reason: `Skeleton` is a fixed-height box by design, and the whole point here
// is a height that follows the width.

/** Aspect ratios keyed by which map is coming. */
const RATIOS = {
  // CreatorMap, FlightMap, MarketMap: 880 x 480.
  creator: 'aspect-[11/6]',
  // WorldMap: 880 x 440.
  world: 'aspect-[2/1]',
}

export default function MapSkeleton({ ratio = 'creator', header = false, className }) {
  return (
    <div className={cx('w-full overflow-hidden rounded-card border border-gray-100', className)}>
      {/* The caption bar, when the map is going to have one. It is drawn inside
          the map's own frame (see the `header` prop on CreatorMap), so leaving
          it out here is another fifty pixels of jump. */}
      {header && <div className="h-[3.25rem] w-full animate-pulse bg-cloud/50" />}
      <div className={cx('w-full animate-pulse bg-cloud/70', RATIOS[ratio] || RATIOS.creator)} />
    </div>
  )
}
