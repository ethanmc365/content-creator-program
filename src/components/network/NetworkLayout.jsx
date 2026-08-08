import PlaceSwitcher, { flagFromIso } from './PlaceSwitcher'
import { cx } from '../../lib/utils'

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
export default function NetworkLayout({ children, switcher = true, rail = null, width = 'default' }) {
  const max = width === 'narrow' ? 'max-w-4xl' : width === 'full' ? 'max-w-[1600px]' : 'max-w-7xl'
  return (
    <div className={cx('mx-auto w-full px-4 py-6 sm:px-6 lg:px-8 lg:py-8', max)}>
      {switcher && <PlaceSwitcher />}
      {rail ? (
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-8 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="min-w-0">{children}</div>
          <aside className="mt-10 space-y-4 lg:mt-0 lg:sticky lg:top-24">{rail}</aside>
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
