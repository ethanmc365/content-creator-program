import PlaceSwitcher, { flagFromIso } from './PlaceSwitcher'
import { cx } from '../../lib/utils'
import Reveal from './Reveal'

// Frame for the network pages that are ABOUT choosing and comparing places: the
// Worldwide hub, a market's home, a market's settings.
//
// Pages that are about being somewhere rather than choosing somewhere (chat,
// most obviously) deliberately do NOT use this. A switcher above a conversation
// makes the conversation feel like a tab in a directory instead of a room you
// are in.
//
// WIDTH
//
// This used to cap at max-w-4xl and then render `.page` inside itself, which is
// max-w-6xl with its own padding. The narrower one won, so the hub sat in a
// 56rem column on a 1920px screen with two gutters of dead space, and every
// child paid for padding twice. The pages now bring their own vertical rhythm
// and this owns the width, once.
//
// THE RAIL
//
// Passing `rail` gives a sticky right column on desktop and a plain section
// below the content on mobile, in that DOM order. That ordering is the whole
// point: the rail is context (who is here, what is running, what to do next),
// so on a phone it belongs after the thing it is context for, not before it.
//
// THE RAIL SCROLLS ITSELF
//
// `sticky top-24` alone only works while the rail is shorter than the viewport.
// The moment it is taller - five cards on the Worldwide hub, which is the normal
// case - the bottom of it is simply unreachable except by scrolling the PAGE,
// and the page's length is set by the article, not by the rail. That is exactly
// the reported symptom: having to scroll the left column to the bottom to see
// the bottom of the right one, and the wheel over the rail moving the page
// anyway, because the rail was not a scroll container and had nothing to give.
//
// Capping it at the viewport and letting it scroll makes the wheel land where
// the pointer is. `overscroll-contain` stops the page from taking over the
// moment the rail hits its end, which is the other half of the same complaint.
// `ready` IS WHAT MAKES THE TWO COLUMNS ARRIVE TOGETHER.
//
// THE BUG THIS FIXES. Everything in the article is behind `if (!data)`, because
// a page that draws sections and then inserts four more into the middle of them
// is a page that jumps. The rail was not - it rendered immediately with a
// skeleton inside its top card - so the right-hand column ran its whole entrance
// on the first frame, the data landed a few hundred milliseconds later, and only
// then did the left column begin to move. That is exactly Ethan's report: "the
// bigger cards on the left side are delayed, the cards on the right and the left
// should appear in smoothly at the same time." It was never the delay ladder;
// the two columns were waiting for different things.
//
// So the rail waits for the same thing the article waits for. Until then the
// aside holds a plain skeleton with NO Reveal on it - mounting the Reveal early
// and swapping its children later would burn the entrance on the skeleton and
// the real cards would simply appear.
export default function NetworkLayout({ children, switcher = true, rail = null, width = 'default', ready = true }) {
  const max = width === 'narrow' ? 'max-w-4xl' : width === 'full' ? 'max-w-[1600px]' : 'max-w-7xl'
  return (
    <div className={cx('mx-auto w-full px-4 py-6 sm:px-6 lg:px-8 lg:py-8', max)}>
      {switcher && <PlaceSwitcher />}
      {rail ? (
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-8 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="min-w-0">{children}</div>
          <aside
            className={cx(
              'mt-10 lg:mt-0',
              'lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto overscroll-contain lg:overscroll-contain',
              // The scrollbar is hidden because the rail is chrome, not content:
              // a permanent grey gutter down the side of five white cards reads
              // as a seam. The region is still keyboard and wheel scrollable.
              'lg:[scrollbar-width:none] lg:[&::-webkit-scrollbar]:hidden',
              // Room for the last card's shadow, which a hard overflow edge
              // would otherwise slice off.
              'lg:pb-4 lg:pr-1',
            )}
          >
            {/* The rail arrives from the side it lives on, a beat behind the
                article. Two columns that enter identically read as one block
                fading in; two columns that enter from where they sit read as a
                layout assembling itself. */}
            {/* THE TWO COLUMNS START TOGETHER.
                The rail was given a small head start so it would not race the
                article, but the article's own ladder was uneven (see stepDelay
                in GlobalHome) so the rail still finished first and the effect
                was the opposite of intended: thin cards on the right snapping in
                while the big cards on the left were still waiting their turn.
                Zero delay here and zero on the first section there means the top
                of both columns arrives on the same frame, and only the sections
                BELOW the fold ladder down. */}
            {ready ? (
              <Reveal className="space-y-4" from="right" stagger={0.06}>{rail}</Reveal>
            ) : (
              // Three cards' worth of height, so the column does not resize when
              // the real rail replaces it. `aria-hidden` because a skeleton is
              // furniture, not content.
              <div className="space-y-4" aria-hidden>
                <div className="h-40 rounded-card bg-cloud" />
                <div className="h-48 rounded-card bg-cloud" />
                <div className="h-32 rounded-card bg-cloud" />
              </div>
            )}
          </aside>
        </div>
      ) : (
        children
      )}
    </div>
  )
}

// A rail card. Small, quiet, and always the same shape, so the column reads as
// one column rather than as five unrelated widgets.
export function RailCard({ icon, title, action, children, className }) {
  return (
    <section className={cx('rounded-card border border-gray-100 bg-white p-4 shadow-card', className)}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-smoke">
            {icon}
            {title}
          </h3>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export { flagFromIso }
