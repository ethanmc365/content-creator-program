import { Skeleton } from '../ui'
import { cx } from '../../lib/utils'

// Placeholders shaped like the thing they stand in for.
//
// A `<Skeleton className="h-96" />` is one grey slab. It fills the space, and
// then the real content arrives at a completely different height and everything
// below it jumps. Worse, the slab tells the reader nothing about what is
// coming, so the page reads as broken rather than as loading.
//
// These mirror the real components' box model: same paddings, same grid
// columns, same row heights. The rule when editing either side is that the
// skeleton and the component change together.

// One line of text. `w` is a tailwind width so a paragraph can ragged-edge
// like real text instead of ending flush.
function Line({ w = 'w-full', h = 'h-4', className }) {
  return <Skeleton className={cx(h, w, 'rounded-md', className)} />
}

export function TextBlock({ lines = 3 }) {
  const widths = ['w-full', 'w-11/12', 'w-4/5', 'w-2/3']
  return (
    <div className="space-y-2">
      {Array.from({ length: lines }, (_, i) => (
        <Line key={i} w={widths[i % widths.length]} />
      ))}
    </div>
  )
}

// Matches MarketHeader: back link, flags + title, tagline, meta row, tabs.
export function MarketHeaderSkeleton() {
  return (
    <div>
      <Line w="w-24" h="h-4" className="mb-4" />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Skeleton className="h-10 w-72 max-w-full rounded-lg" />
          <Line w="w-96 max-w-full" className="mt-3" />
          <div className="mt-4 flex gap-4">
            <Line w="w-24" h="h-3.5" />
            <Line w="w-14" h="h-3.5" />
          </div>
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-28 rounded-full" />
          <Skeleton className="h-10 w-24 rounded-full" />
        </div>
      </div>
      {/* Keyed by index, not by the width class: two tabs happen to be the same
          width, and using the class as the key made them duplicate keys. */}
      <div className="mt-6 flex gap-6 border-b border-gray-100 pb-3">
        {['w-20', 'w-24', 'w-16', 'w-20'].map((w, i) => <Line key={i} w={w} h="h-4" />)}
      </div>
    </div>
  )
}

// Matches LiveChallengeCard's hero: badge row, title, two lines, countdown
// tiles on the left and buttons on the right.
//
// AND IT MATCHES THE PHONE'S CARD TOO, which is a different shape since that
// card was cut down: no blurb, a one-line clock instead of four tiles, one
// button instead of two. A skeleton that promises a paragraph and four tiles
// and then hands over a card two hundred pixels shorter is the jump it exists
// to prevent. Ethan: "the loading previews of cards across the platform, I've
// noticed sometimes the preview shows 3 small cards when it's actually loading
// a big card." The rule at the top of this file cuts both ways: the skeleton
// and the component change together.
export function LiveChallengeSkeleton() {
  return (
    <div className="rounded-card border border-gray-100 bg-white p-5 shadow-card sm:p-10">
      <div className="flex flex-wrap gap-3">
        <Skeleton className="h-7 w-40 rounded-full" />
        <Skeleton className="hidden h-7 w-32 rounded-full sm:block" />
      </div>
      <Skeleton className="mt-3 h-7 w-2/3 rounded-lg sm:mt-5 sm:h-9" />
      <div className="mt-3 hidden space-y-2 sm:block">
        <Line w="w-full" />
        <Line w="w-3/4" />
      </div>
      <div className="mt-5 flex flex-col gap-5 sm:mt-8 sm:gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Line w="w-20" h="h-3" className="mb-2 sm:mb-3" />
          {/* Four tiles from `sm`, one line below it - the two clocks the card
              actually draws. */}
          <div className="hidden gap-2.5 sm:flex">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-16 rounded-xl" />)}
          </div>
          <Skeleton className="h-6 w-40 rounded-md sm:hidden" />
        </div>
        <div className="flex gap-3">
          <Skeleton className="hidden h-11 w-36 rounded-full sm:block" />
          <Skeleton className="h-11 w-full rounded-full sm:w-40" />
        </div>
      </div>
    </div>
  )
}

// A grid of cards. `rows` of `cols`, each the given height, matching whatever
// grid the caller renders when the data lands.
export function CardGridSkeleton({ count = 4, cols = 'sm:grid-cols-2', height = 'h-24' }) {
  return (
    <div className={cx('grid gap-3', cols)}>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className={cx(height, 'rounded-card')} />
      ))}
    </div>
  )
}

// Avatar + two lines + a trailing value: the shape of every roster, standings
// and directory row in the network.
export function PersonRowsSkeleton({ count = 5, avatar = 'h-9 w-9' }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-card border border-gray-100 bg-white px-5 py-3.5">
          <Skeleton className={cx(avatar, 'shrink-0 rounded-full')} />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Line w="w-32" h="h-3.5" />
            <Line w="w-24" h="h-3" />
          </div>
          <Line w="w-10" h="h-4" />
        </div>
      ))}
    </div>
  )
}

// A rail card: the uppercase label, then rows.
export function RailCardSkeleton({ rows = 3 }) {
  return (
    <section className="rounded-card border border-gray-100 bg-white p-4 shadow-card">
      <Line w="w-24" h="h-3" className="mb-4" />
      <div className="space-y-2.5">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-2.5">
            <Skeleton className="h-4 w-4 shrink-0 rounded" />
            <Line w={i % 2 ? 'w-2/3' : 'w-4/5'} h="h-3.5" />
          </div>
        ))}
      </div>
    </section>
  )
}

// The whole Worldwide hub, main column only. Used before the first paint of
// data so the greeting, hero and market grid all land in the boxes they are
// already occupying.
export function HubSkeleton() {
  return (
    <div className="space-y-11">
      <div>
        <Skeleton className="h-10 w-48 rounded-lg" />
        <Line w="w-80 max-w-full" className="mt-3" />
      </div>
      <Skeleton className="h-64 rounded-card" />
      <div>
        <Line w="w-40" h="h-5" className="mb-4" />
        <CardGridSkeleton count={2} height="h-20" />
      </div>
      <div>
        <Line w="w-48" h="h-5" className="mb-4" />
        <PersonRowsSkeleton count={4} />
      </div>
    </div>
  )
}

export function MarketOverviewSkeleton() {
  return (
    <div className="space-y-10">
      <MarketHeaderSkeleton />
      <LiveChallengeSkeleton />
      <div>
        <Line w="w-24" h="h-5" className="mb-4" />
        <CardGridSkeleton count={3} height="h-20" />
      </div>
      <div>
        <Line w="w-56" h="h-5" className="mb-4" />
        <Skeleton className="h-64 rounded-card" />
      </div>
    </div>
  )
}

// The rooms list plus the message column, matching NetworkChat's two-pane
// desktop layout.
// `fill` bottom-aligns it and draws a few more rows, for the overlay that
// covers a thread while it is being pinned to its bottom - a chat fills from
// the bottom up, so a placeholder that sits at the top reads as a different
// screen rather than as the same one loading.
export function ChatSkeleton({ fill = false, rows = 5 }) {
  return (
    <div className={cx('space-y-4 px-4 py-4 sm:px-5', fill && 'flex h-full flex-col justify-end')}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={cx('flex gap-3', fill && 'mt-4 first:mt-0')}>
          <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Line w="w-28" h="h-3.5" />
            <Line w={i % 2 ? 'w-3/5' : 'w-4/5'} />
          </div>
        </div>
      ))}
    </div>
  )
}
