import { Skeleton } from './ui'

/**
 * THE SHAPE OF A PAGE WHILE IT IS STILL ARRIVING.
 *
 * ONE SET OF SHAPES, TWO PLACES THAT NEED THEM, AND THE SECOND ONE IS WHY THIS
 * FILE EXISTS (4 Sep 2026).
 *
 * Ethan, for the fourth time: "the loading screens are still appearing between
 * clicks on mobile. This needs to be fixed. I told you I want the skeleton
 * ones."
 *
 * There are TWO different waits on a tab tap and the previous rounds only fixed
 * one of them:
 *
 *   1  THE ROUTE CHUNK arriving. Handled by `RouteSkeleton` at the Suspense
 *      boundary - and then handled better still by prefetching the chunk before
 *      the tap, so this one now almost never happens at all.
 *   2  THE PAGE'S OWN DATA arriving. Every page draws its own placeholder while
 *      its queries run, and THIS is what a creator actually sees on every
 *      single tap, because it happens whether the chunk was warm or not.
 *
 * Measured on production, tapping through the bottom tabs on a phone: the
 * challenges page drew 24 placeholder elements (a real skeleton), and the hub,
 * the rooms and the calendar drew FOUR, TWO and TWO. Two grey slabs on an
 * otherwise empty screen is not a skeleton of anything - it is a blank page
 * with a couple of bars on it, which is exactly what "a loading screen" looks
 * like. That is the report, and it is why fixing the Suspense fallback twice
 * did not touch it.
 *
 * So the shapes live here, both callers import them, and a page's loading state
 * is the same shape as the page. The rule: a skeleton is only doing its job if
 * you cannot tell the moment the real content replaces it.
 */

// A line of text. Widths are deliberately uneven - a stack of identical bars is
// the one thing that never looks like prose.
export function Lines({ widths = ['100%', '92%', '60%'], className = '' }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {widths.map((w, i) => <Skeleton key={i} className="h-3 rounded" style={{ width: w }} />)}
    </div>
  )
}

export function Head({ wide = false }) {
  return (
    <div className="space-y-3">
      <Skeleton className={wide ? 'h-9 w-64 max-w-full rounded-lg' : 'h-8 w-52 max-w-full rounded-lg'} />
      <Skeleton className="h-4 w-72 max-w-full rounded" />
    </div>
  )
}

export function Rows({ count = 6 }) {
  return (
    <div className="mt-8 space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-xl border border-gray-100 p-3">
          <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 rounded" style={{ width: `${[38, 30, 44, 34, 41, 28][i % 6]}%` }} />
            <Skeleton className="h-3 rounded" style={{ width: `${[56, 62, 48, 58, 52, 66][i % 6]}%` }} />
          </div>
          <Skeleton className="hidden h-8 w-20 shrink-0 rounded-full sm:block" />
        </div>
      ))}
    </div>
  )
}

export function Cards({ count = 3 }) {
  return (
    <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card space-y-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3 rounded" />
              <Skeleton className="h-3 w-1/3 rounded" />
            </div>
          </div>
          <Skeleton className="h-3 w-full rounded" />
          <Skeleton className={i % 3 === 2 ? 'h-3 w-1/3 rounded' : 'h-3 w-4/5 rounded'} />
        </div>
      ))}
    </div>
  )
}

// A conversation fills upwards from a composer, so its placeholder is bubbles of
// uneven width alternating sides, with the composer's bar pinned under them.
export function Thread() {
  return (
    <div className="mt-6 flex min-h-[60vh] flex-col">
      <div className="flex-1 space-y-4">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className={i % 2 ? 'flex justify-end' : 'flex items-end gap-2'}>
            {i % 2 === 0 && <Skeleton className="h-8 w-8 shrink-0 rounded-full" />}
            <Skeleton className="rounded-2xl" style={{ width: `${[62, 44, 70, 38, 55, 48][i]}%`, height: `${[48, 40, 64, 40, 48, 40][i]}px` }} />
          </div>
        ))}
      </div>
      <Skeleton className="mt-6 h-12 w-full rounded-2xl" />
    </div>
  )
}

// The worldwide / market hub: a switcher, a greeting, the wide live banner, then
// sections. This is the busiest first screen in the product and four grey bars
// is nothing like it.
export function Hub() {
  return (
    <div className="space-y-7">
      <Skeleton className="h-14 w-full rounded-full" />
      <div className="space-y-3">
        <Skeleton className="h-9 w-52 rounded-lg" />
        <Skeleton className="h-4 w-64 max-w-full rounded" />
      </div>
      <Skeleton className="h-32 w-full rounded-card" />
      <div className="space-y-3">
        <Skeleton className="h-6 w-56 rounded" />
        <Skeleton className="h-36 w-full rounded-card" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-6 w-44 rounded" />
        <div className="space-y-2">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
        </div>
      </div>
      <div className="space-y-3">
        <Skeleton className="h-6 w-40 rounded" />
        <div className="grid grid-cols-2 gap-3">
          {[0, 1].map((i) => <Skeleton key={i} className="h-24 rounded-card" />)}
        </div>
      </div>
    </div>
  )
}

// The rooms index: a market switcher, then a list of rooms each with an avatar,
// a name and a last message.
export function RoomList({ count = 5 }) {
  return (
    <div className="space-y-5">
      <Skeleton className="h-12 w-full rounded-full" />
      <div className="space-y-2">
        <Skeleton className="h-5 w-32 rounded" />
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-card border border-gray-100 p-3.5">
            <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 rounded" style={{ width: `${[34, 42, 28, 38, 30][i % 5]}%` }} />
              <Skeleton className="h-3 rounded" style={{ width: `${[64, 52, 71, 58, 66][i % 5]}%` }} />
            </div>
            <Skeleton className="h-3 w-8 shrink-0 rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}

// A profile: the big avatar and its identity block, then the two-column wall of
// rail cards that follows it on a desktop.
export function ProfileShape() {
  return (
    <div className="space-y-8">
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        <Skeleton className="h-28 w-28 shrink-0 rounded-full" />
        <div className="w-full min-w-0 flex-1 space-y-3">
          <Skeleton className="h-7 w-52 max-w-full rounded-lg" />
          <Skeleton className="h-4 w-32 rounded" />
          <Lines widths={['90%', '70%']} />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Skeleton className="h-64 w-full rounded-card" />
        <div className="space-y-4">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 w-full rounded-card" />)}
        </div>
      </div>
    </div>
  )
}

// Anything that leads with a map: the collab board, the flight log, the
// community board's wall. The block on top is the thing that takes longest to
// arrive, so reserving its height is most of the value.
export function MapShape() {
  return (
    <div className="space-y-6">
      <Head />
      <Skeleton className="h-64 w-full rounded-card sm:h-80" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-40 w-full rounded-card" />)}
      </div>
    </div>
  )
}

// THE CALENDAR, MEASURED AGAINST THE REAL PAGE RATHER THAN IMAGINED (4 Sep
// 2026). Ethan: "the calendar skeleton loading icons is really off for what it
// actually is - look at what actually is there and try replicate those."
//
// He is right, and the old one was wrong in four ways at once. Measured on
// production at 375px, the page below the header is:
//
//   77px  the "Next up" strip - a card, not a bare 80px block
//   40px  a FULL-WIDTH segmented control (Month / Week / Agenda) in a pill
//         track. The skeleton drew three separate 96px pills with gaps.
//   36px  "September 2026" on the left, Today + arrows on the right
//  382px  ONE bordered card containing a 36px weekday header on a tinted strip
//         and then the month grid - 68px rows separated by hairlines, not
//         free-floating squares with 6px gutters, and FIVE rows in a normal
//         month rather than six.
//  202px  "Coming up" and the event cards under it, which the skeleton did not
//         admit existed at all
//  136px  the "Find a time" section, likewise
//
// So the old placeholder was half the page's height and none of its shape: the
// grid alone was 42 loose squares where the page draws a bordered card. The
// rule at the top of this file is that the skeleton and the component change
// together, and this is what it looks like when they have not.
export function CalendarShape() {
  return (
    <div>
      {/* Next up */}
      <Skeleton className="mb-5 h-[77px] w-full rounded-card" />
      {/* The view switch, which is one full-width track and not three pills */}
      <Skeleton className="h-10 w-full rounded-full" />
      {/* Month name, and the Today / arrows cluster */}
      <div className="mb-5 mt-3 flex items-center justify-between gap-2">
        <Skeleton className="h-7 w-40 rounded" />
        <div className="flex items-center gap-1.5">
          <Skeleton className="h-7 w-16 rounded-full" />
          <Skeleton className="h-7 w-7 rounded-full" />
          <Skeleton className="h-7 w-7 rounded-full" />
        </div>
      </div>
      {/* The month card: a tinted weekday strip over a hairline grid. The cells
          are NOT skeletons - the card's own gap-px on a grey background draws
          the same lines the real grid does, and 35 pulsing squares is a
          disco. Only the day numbers shimmer. */}
      <div className="overflow-hidden rounded-card border border-gray-100 shadow-card">
        <div className="grid grid-cols-7 border-b border-gray-100 bg-cloud">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex justify-center py-2.5">
              <Skeleton className="h-3 w-4 rounded" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-px bg-gray-100">
          {Array.from({ length: 35 }).map((_, i) => (
            <div key={i} className="flex min-h-[68px] flex-col items-center gap-1.5 bg-white pt-2.5">
              <Skeleton className="h-3.5 w-3.5 rounded" />
              {/* A couple of days in the month have something on them. Any
                  more and the placeholder promises a busier month than the
                  programme has ever had. */}
              {(i === 6 || i === 19) && <Skeleton className="h-1.5 w-6 rounded-full" />}
            </div>
          ))}
        </div>
      </div>
      {/* Coming up */}
      <div className="mt-8">
        <Skeleton className="h-5 w-32 rounded" />
        <div className="mt-3 space-y-3">
          {[0, 1].map((i) => (
            <div key={i} className="flex gap-3.5 rounded-card border border-gray-100 p-4">
              <Skeleton className="h-12 w-12 shrink-0 rounded-xl" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 rounded" style={{ width: i ? '58%' : '76%' }} />
                <Skeleton className="h-3 w-1/3 rounded" />
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* Find a time */}
      <div className="mt-12 space-y-3">
        <Skeleton className="h-5 w-28 rounded" />
        <Skeleton className="h-16 w-full rounded-card" />
      </div>
    </div>
  )
}

// A challenge / milestone page: a headline block, a strip of stats, a wide card.
export function Feature() {
  return (
    <div className="space-y-6">
      <Head wide />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-card" />)}
      </div>
      <Skeleton className="h-48 w-full rounded-card" />
      <div className="space-y-3">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full rounded-card" />)}
      </div>
    </div>
  )
}

// Settings and the admin panel: a menu of section cards, two across.
export function Tiles() {
  return (
    <div className="space-y-6">
      <Head />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-card border border-gray-100 p-4">
            <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-1/2 rounded" />
              <Skeleton className="h-3 w-3/4 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// A long editing form: label / field, repeated, with the action row at the end.
export function Form() {
  return (
    <div className="space-y-6">
      <Head />
      <div className="card space-y-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3 w-28 rounded" />
            <Skeleton className={i === 2 ? 'h-24 w-full rounded-xl' : 'h-11 w-full rounded-xl'} />
          </div>
        ))}
        <div className="flex justify-end gap-2 pt-2">
          <Skeleton className="h-10 w-24 rounded-full" />
          <Skeleton className="h-10 w-28 rounded-full" />
        </div>
      </div>
    </div>
  )
}

export const SHAPES = {
  thread: Thread,
  list: () => <><Head /><Rows /></>,
  hub: Hub,
  rooms: RoomList,
  profile: ProfileShape,
  map: MapShape,
  calendar: CalendarShape,
  feature: Feature,
  settings: Tiles,
  panel: Tiles,
  form: Form,
  cards: () => <><Head /><Cards /></>,
}

/**
 * A page's own loading state, in the shape of that page.
 *
 * `aria-busy` and the screen-reader line are here rather than at each call
 * site, so a page cannot get the accessibility half wrong while getting the
 * drawing half right.
 */
export default function PageSkeleton({ shape = 'cards', className = '' }) {
  const Shape = SHAPES[shape] || SHAPES.cards
  return (
    <div className={className} aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>
      <Shape />
    </div>
  )
}
