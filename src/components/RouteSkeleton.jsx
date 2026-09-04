import { useLocation } from 'react-router-dom'
import { useBootLoaderSlot } from '../lib/bootLoader'
import { shapeForPath } from '../lib/routeChunks'
import { Skeleton } from './ui'

/**
 * THE SHAPE OF THE PAGE THAT IS ARRIVING, NOT A LOADING SCREEN OVER THE APP.
 *
 * Ethan, three times now, and the third time is what produced this version:
 * "clicking between pages briefly flashes up the loading screen every time. I
 * don't want this to happen, instead I want a skeleton loader / skeleton
 * screen: the main term for a blank UI preview that COPIES THE SHAPE of the
 * content before it loads."
 *
 * Those last five words are the brief, and they are what the first two attempts
 * missed. Both of them were about WHEN the placeholder appears - move the
 * boundary, then delay the fallback - when the complaint was about WHAT it is.
 * A centred plane and the word "Loading" is a screen; three grey cards on a
 * page that is about to draw a conversation is a different screen. Either way
 * you are looking at a third thing between two pages, and that is what reads as
 * a flash.
 *
 * So there are two halves to the answer and only one of them is in this file:
 *
 *   1  DO NOT SUSPEND. Route chunks are prefetched on idle and, for everything
 *      else, the instant a pointer or a finger touches a link to them. See
 *      lib/routeChunks and lib/prefetchLinks. This is the half that removes the
 *      flash, and after it this component is a rare sight rather than a screen
 *      in the way of every tap.
 *   2  WHEN IT DOES APPEAR, BE THE PAGE. Not a generic card grid: the hub's
 *      wide banner, the thread's alternating bubbles, the directory's rows,
 *      the calendar's month grid, the admin panel's tiles. `shapeForPath`
 *      decides from the path, which is the only thing known about a route whose
 *      code has not arrived.
 *
 * NO GRACE PERIOD, and that was tried too: holding this back for 160ms only
 * swaps a flash of grey for a flash of NOTHING, and an empty content area
 * between a header and a tab bar reads worse than the shape of what is coming.
 * Once the boundary is genuinely rare, drawing immediately is right.
 *
 * `min-h-[70vh]` so the content area keeps its size while it waits. Without it
 * a short skeleton lets the page collapse, the tab bar jumps up the screen and
 * back down, and THAT movement is most of what reads as a flash.
 *
 * WHILE THE BOOT LAYER IS UP THIS DRAWS NOTHING, and holds that layer up until
 * it unmounts, exactly like AppLoader. A cold boot is the one case where the
 * screen genuinely is empty and `index.html`'s own loader is already on it; two
 * loaders at two vertical centres is the photograph lib/bootLoader.js exists to
 * prevent, and a skeleton underneath one would be the same bug.
 */

// A line of text. Widths are deliberately uneven - a stack of identical bars is
// the one thing that never looks like prose.
function Lines({ widths = ['100%', '92%', '60%'], className = '' }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {widths.map((w, i) => <Skeleton key={i} className="h-3 rounded" style={{ width: w }} />)}
    </div>
  )
}

function Head({ wide = false }) {
  return (
    <div className="space-y-3">
      <Skeleton className={wide ? 'h-9 w-64 max-w-full rounded-lg' : 'h-8 w-52 max-w-full rounded-lg'} />
      <Skeleton className="h-4 w-72 max-w-full rounded" />
    </div>
  )
}

function Rows({ count = 6 }) {
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

function Cards({ count = 3 }) {
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
function Thread() {
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
// sections. This is the busiest first screen in the product and a card grid is
// nothing like it.
function Hub() {
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
    </div>
  )
}

// A profile: the big avatar and its identity block, then the two-column wall of
// rail cards that follows it on a desktop.
function ProfileShape() {
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
function MapShape() {
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

// The calendar: a toolbar, then a month grid. Six rows of seven.
function CalendarShape() {
  return (
    <div className="space-y-6">
      <Head />
      <div className="flex gap-2">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-9 w-24 rounded-full" />)}
      </div>
      <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
        {Array.from({ length: 42 }).map((_, i) => (
          <Skeleton key={i} className="aspect-square rounded-lg sm:aspect-[4/3]" />
        ))}
      </div>
    </div>
  )
}

// A challenge / milestone page: a headline block, a strip of stats, a wide card.
function Feature() {
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
function Tiles() {
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
function Form() {
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

const SHAPE = {
  thread: Thread,
  list: () => <><Head /><Rows /></>,
  hub: Hub,
  profile: ProfileShape,
  map: MapShape,
  calendar: CalendarShape,
  feature: Feature,
  settings: Tiles,
  panel: Tiles,
  form: Form,
  cards: () => <><Head /><Cards /></>,
}

export default function RouteSkeleton({ shape: forced }) {
  const visible = useBootLoaderSlot()
  const { pathname } = useLocation()

  if (!visible) return null

  const Shape = SHAPE[forced || shapeForPath(pathname)] || SHAPE.cards
  return (
    <div className="page min-h-[70vh]" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>
      <Shape />
    </div>
  )
}
