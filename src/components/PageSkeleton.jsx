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
 *
 * ---------------------------------------------------------------------------
 * AND A PAGE HAS TWO SHAPES, NOT ONE (7 Sep 2026).
 *
 * Ethan: "a lot of these are incorrect. For example, on desktop and mobile we
 * need to have ones for each, because they have different layouts. On the
 * calendar page for desktop I noticed it doesn't match it at all."
 *
 * Exactly right, and the calendar is the clearest case because its own comment
 * below says what happened: it was measured, carefully, ON A PHONE AT 375px -
 * and every measurement in it is a mobile measurement. The real page at 1280px
 * is a different layout in four ways at once (a 9-rem hero instead of a 77px
 * strip, a three-column grid with a rail beside the month, 92px day cells
 * instead of 68px, and the "coming up" list in that rail rather than under the
 * grid), so a placeholder built from those numbers is half the width and none
 * of the arrangement of the thing it stands in for.
 *
 * The hub, the directory and the thread had the same fault for the same reason:
 * every one of them grows a SECOND COLUMN at `lg`, and none of the shapes had
 * one. A one-column skeleton on a two-column page does not merely look wrong,
 * it moves - the real page arrives and the right-hand rail shoves in from
 * nowhere, which is the jump a skeleton exists to prevent.
 *
 * SO THE SHAPES ARE RESPONSIVE, WITH TAILWIND RATHER THAN `useIsMobile()`.
 * That is the opposite of the rule the profile page and the challenge brief
 * follow ("two running orders over named sections, chosen with useIsMobile and
 * NOT with `hidden`") and the difference is the reason for the rule: a hidden
 * twin still MOUNTS, and there the twins FETCH. These are inert `<div>`s with
 * no data and no effects, so a hidden twin costs a few nodes - and in exchange
 * the placeholder is correct on the very first paint, before any JS has decided
 * how wide the window is, which is precisely when it is on screen.
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
//
// AND ON A DESKTOP THE PAGE IS TWO PANES. `/messages` at `sm` and up is an
// inbox rail beside the thread inside one bordered card (see pages/Messages);
// the bubbles alone were the phone's layout drawn across a 1280px window, so
// the real page arriving pulled a 20rem sidebar in from the left and shoved
// every bubble sideways.
function Bubbles() {
  return (
    <>
      <div className="flex-1 space-y-4">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className={i % 2 ? 'flex justify-end' : 'flex items-end gap-2'}>
            {i % 2 === 0 && <Skeleton className="h-8 w-8 shrink-0 rounded-full" />}
            <Skeleton className="rounded-2xl" style={{ width: `${[62, 44, 70, 38, 55, 48][i]}%`, height: `${[48, 40, 64, 40, 48, 40][i]}px` }} />
          </div>
        ))}
      </div>
      <Skeleton className="mt-6 h-12 w-full rounded-2xl" />
    </>
  )
}

export function Thread() {
  return (
    <>
      {/* The phone: the thread, full width, nothing beside it. */}
      <div className="mt-6 flex min-h-[60vh] flex-col sm:hidden">
        <Bubbles />
      </div>

      {/* From `sm`: one card, a 20rem inbox rail and the thread. */}
      <div className="mt-6 hidden min-h-[60vh] overflow-hidden rounded-card border border-gray-100 shadow-card sm:flex">
        <div className="w-64 shrink-0 border-r border-gray-100 p-4 lg:w-80">
          <Skeleton className="h-10 w-full rounded-full" />
          <div className="mt-4 space-y-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-3.5 rounded" style={{ width: `${[54, 42, 62, 48, 58, 38][i]}%` }} />
                  <Skeleton className="h-3 rounded" style={{ width: `${[34, 28, 40, 30, 36, 26][i]}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col p-5">
          {/* The thread's own header: the face and name of whoever you are
              talking to, over a hairline. */}
          <div className="flex items-center gap-3 border-b border-gray-100 pb-4">
            <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-40 rounded" />
              <Skeleton className="h-3 w-24 rounded" />
            </div>
          </div>
          <div className="flex flex-1 flex-col pt-5">
            <Bubbles />
          </div>
        </div>
      </div>
    </>
  )
}

// The worldwide / market hub: a switcher, a greeting, the wide live banner, then
// sections. This is the busiest first screen in the product and four grey bars
// is nothing like it.
//
// AND FROM `lg` IT HAS A RAIL. `NetworkLayout` puts the hub in
// `lg:grid-cols-[minmax(0,1fr)_20rem]` with a sticky column of five cards down
// the right (`xl` widens it to 22rem). A single-column placeholder on that page
// is a placeholder for a different page: the moment the query lands, a
// 20rem column appears and everything on the left narrows by a third.
export function Hub() {
  return (
    <div className="space-y-7">
      {/* The place switcher, above the columns, exactly as the layout has it. */}
      <Skeleton className="h-14 w-full rounded-full" />

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-8 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-7">
          <div className="space-y-3">
            <Skeleton className="h-9 w-52 rounded-lg lg:h-11 lg:w-64" />
            <Skeleton className="h-4 w-64 max-w-full rounded" />
          </div>
          {/* The live challenge banner. It is taller on a desktop, where it
              carries the leaderboard down its right-hand side. */}
          <Skeleton className="h-32 w-full rounded-card sm:h-44" />
          <div className="space-y-3">
            <Skeleton className="h-6 w-56 rounded" />
            <Skeleton className="h-36 w-full rounded-card" />
          </div>
          <div className="space-y-3">
            <Skeleton className="h-6 w-44 rounded" />
            <div className="space-y-2 sm:grid sm:grid-cols-2 sm:gap-3 sm:space-y-0">
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
            </div>
          </div>
          <div className="space-y-3">
            <Skeleton className="h-6 w-40 rounded" />
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
              {[0, 1, 2].map((i) => <Skeleton key={i} className={i === 2 ? 'hidden h-24 rounded-card xl:block' : 'h-24 rounded-card'} />)}
            </div>
          </div>
        </div>

        {/* THE RAIL. Five cards, sticky, only from `lg` - below that the real
            rail renders under the article and its cards are the sections
            already drawn above, so a second stack here would be a page and a
            half of placeholder on a phone. */}
        <div className="hidden space-y-4 lg:block">
          {[104, 168, 208, 140, 120].map((h, i) => (
            <div key={i} className="rounded-card border border-gray-100 p-4 shadow-card">
              <Skeleton className="h-3 w-24 rounded" />
              <Skeleton className="mt-3 w-full rounded-xl" style={{ height: `${h}px` }} />
            </div>
          ))}
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
      {/* ---- THE PHONE ----------------------------------------------------
          The measurements below are the ones taken at 375px in September and
          they are still right; what was wrong was applying them at 1280px too.
          `sm:hidden` is now doing the job the comment above always described. */}
      <div className="sm:hidden">
        {/* Next up: a card, not a bare 80px block */}
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
        <MonthCard cell="min-h-[68px]" />
        <ComingUp />
        <div className="mt-12 space-y-3">
          <Skeleton className="h-5 w-28 rounded" />
          <Skeleton className="h-16 w-full rounded-card" />
        </div>
      </div>

      {/* ---- FROM `sm` -----------------------------------------------------
          MEASURED AGAINST THE REAL PAGE, AGAIN, AT THE OTHER END (7 Sep 2026).
          Ethan: "on the calendar page for desktop, I noticed it doesn't match
          it at all." Four differences, and they compound:

            the hero      a `p-9` gradient banner, ~9rem tall, in place of the
                          phone's 77px strip. The phone version is `sm:hidden`
                          in Events.jsx and the big one is `hidden sm:block`,
                          so this is not a resize, it is a different element.
            the columns   `grid-cols-1 lg:grid-cols-3` with the month card in
                          `lg:col-span-2` and an `<aside>` beside it. The whole
                          "coming up" list is IN that aside on a desktop and
                          under the grid on a phone.
            the cells     `min-h-[68px] sm:min-h-[92px]`, so five rows are 120px
                          taller than the placeholder claimed.
            the weekdays  full names from `sm` ("Monday"), single letters below.

          The aside only exists from `lg`, so between `sm` and `lg` this is the
          big hero over a full-width month with the list underneath - which is
          what the page actually does at that width. */}
      <div className="hidden sm:block">
        <Skeleton className="mb-8 h-[9.5rem] w-full rounded-card" />
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="mb-4 flex items-center justify-between gap-3">
              <Skeleton className="h-10 w-72 rounded-full" />
              <Skeleton className="h-4 w-56 rounded" />
            </div>
            <div className="mb-5 flex items-center justify-between gap-2">
              <Skeleton className="h-8 w-48 rounded" />
              <div className="flex items-center gap-1.5">
                <Skeleton className="h-9 w-20 rounded-full" />
                <Skeleton className="h-9 w-9 rounded-full" />
                <Skeleton className="h-9 w-9 rounded-full" />
              </div>
            </div>
            <MonthCard cell="min-h-[92px]" weekday="w-14" />
          </div>
          {/* The aside: "coming up", then the find-a-time card. */}
          <aside className="hidden lg:block">
            <ComingUp className="mt-0" count={3} />
            <div className="mt-8 space-y-3">
              <Skeleton className="h-5 w-28 rounded" />
              <Skeleton className="h-24 w-full rounded-card" />
            </div>
          </aside>
        </div>
        {/* Below `lg` the aside's contents run under the grid instead. */}
        <div className="lg:hidden">
          <ComingUp />
          <div className="mt-12 space-y-3">
            <Skeleton className="h-5 w-28 rounded" />
            <Skeleton className="h-16 w-full rounded-card" />
          </div>
        </div>
      </div>
    </div>
  )
}

// The month card: a tinted weekday strip over a hairline grid. The cells are
// NOT skeletons - the card's own `gap-px` on a grey background draws the same
// lines the real grid does, and 35 pulsing squares is a disco. Only the day
// numbers shimmer, and a couple of days carry an event pip: any more and the
// placeholder promises a busier month than the programme has ever had.
//
// FIVE ROWS, not six. A normal month spans five, and the real grid is sized to
// what the month needs.
function MonthCard({ cell, weekday = 'w-4' }) {
  return (
    <div className="overflow-hidden rounded-card border border-gray-100 shadow-card">
      <div className="grid grid-cols-7 border-b border-gray-100 bg-cloud">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex justify-center py-2.5">
            <Skeleton className={`h-3 rounded ${weekday}`} />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px bg-gray-100">
        {Array.from({ length: 35 }).map((_, i) => (
          <div key={i} className={`flex flex-col items-center gap-1.5 bg-white pt-2.5 ${cell}`}>
            <Skeleton className="h-3.5 w-3.5 rounded" />
            {(i === 6 || i === 19) && <Skeleton className="h-1.5 w-6 rounded-full" />}
          </div>
        ))}
      </div>
    </div>
  )
}

// "Coming up" and the event cards under it. On a phone this sits below the
// month grid; from `lg` it is the aside beside it. Same rows either way, which
// is true of the real page too.
function ComingUp({ className = 'mt-8', count = 2 }) {
  return (
    <div className={className}>
      <Skeleton className="h-5 w-32 rounded" />
      <div className="mt-3 space-y-3">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="flex gap-3.5 rounded-card border border-gray-100 p-4">
            <Skeleton className="h-12 w-12 shrink-0 rounded-xl" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 rounded" style={{ width: ['76%', '58%', '68%'][i % 3] }} />
              <Skeleton className="h-3 w-1/3 rounded" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// THE CREATOR DIRECTORY, WHICH IS NOT A LIST (7 Sep 2026).
//
// `/creators` and `/connections` were both drawing the generic `list` shape - a
// heading and six full-width rows with a round avatar. Neither page has ever
// looked like that. Both LEAD WITH A MAP, then a row of filters, then a strip
// of tabs, and only then a grid of two-across cards. So the placeholder said
// "a list is coming" and a map arrived, which is the largest possible version
// of the mismatch this file exists to remove.
//
// The map block is most of the value here: it is the tallest thing on the page
// and the slowest to arrive, so reserving its height is what stops the filters
// and the grid sliding up the screen when it lands.
export function DirectoryShape() {
  return (
    <div className="space-y-6">
      <Head />
      {/* The map. Shorter on a phone, where the page gives it less room. */}
      <Skeleton className="h-72 w-full rounded-card sm:h-[26rem]" />
      {/* Four filter fields: one across on a phone, two at `sm`, four at `lg`. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-11 w-full rounded-xl" />)}
      </div>
      {/* The tab strip: four pills inside one bordered track. */}
      <div className="flex flex-wrap gap-1.5 rounded-card border border-gray-100 p-1.5 shadow-card">
        {[72, 104, 118, 128].map((w, i) => (
          <Skeleton key={i} className="h-7 rounded-lg" style={{ width: `${w}px` }} />
        ))}
      </div>
      {/* The grid. `sm:grid-cols-2` AND NO MORE - four across is 260px a card,
          which is the rule the real page follows. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="card space-y-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-14 w-14 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 rounded" style={{ width: `${[58, 44, 66, 50, 62, 46][i]}%` }} />
                <Skeleton className="h-3 rounded" style={{ width: `${[40, 52, 34, 46, 38, 56][i]}%` }} />
              </div>
            </div>
            <Skeleton className="h-3 w-full rounded" />
            <div className="flex gap-2 pt-1">
              <Skeleton className="h-9 flex-1 rounded-full" />
              <Skeleton className="h-9 flex-1 rounded-full" />
            </div>
          </div>
        ))}
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
  directory: DirectoryShape,
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
