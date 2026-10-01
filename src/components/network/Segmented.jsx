import { useEffect, useId, useRef } from 'react'
import { motion } from 'motion/react'
import { cx } from '../../lib/utils'
import { SPRING } from '../../lib/motion'

// A segmented control: every option visible, the current one obvious.
//
// It replaces a button whose LABEL WAS ITS STATE. "Everyone posts" as a button
// is unreadable in both directions: you cannot tell whether it is describing
// the room or offering to change it, and clicking flips a consequential setting
// with no warning and nothing to undo it with. Showing both options and
// highlighting one removes the ambiguity entirely.
//
// The highlight is a single shared element moved with `layoutId`, so switching
// slides it rather than cross-fading two backgrounds. That is the detail that
// makes it feel native rather than like two divs.
// `id` keeps the sliding highlight unique per control; `label` is what a screen
// reader announces. They were one prop, which meant the accessible name was a
// uuid.
//
// THE FALLBACK KEY MUST BE PER-INSTANCE, NOT PER-OPTION-LIST.
//
// It was `options.map(o => o.value).join('-')`, which is IDENTICAL for any two
// controls offering the same choices - and the flight community page has
// exactly that: a year/all-time toggle over the map and another over the
// leaderboards. A `layoutId` is a shared-element IDENTITY, so Motion read the
// two pills as one pill in two places and did the thing it is designed to do:
// animated it from one to the other. Ethan: "both for map and the leaderboard,
// for some reason these buttons seem to be using the same orange card when
// clicked and it's moving up and down the screen and one of them is always
// without it."
//
// `useId` is stable across renders and unique per mounted component, which is
// exactly the scope a highlight belongs to. An explicit `id` still wins, for
// the case where two controls SHOULD share one highlight.
// `shape="tabs"` (1 Oct 2026) is the strip for pages with many views (the VIP tools). Ethan: "I like that you can scroll,
// but it's a bit cut off ... the sides are always squared but a bit rounded at the corners." The strip IS the scroller,
// full width, with softly rounded corners and no hidden overflow outside it, so nothing is clipped by a parent; each tab
// is a rounded square and the one that is on is scrolled into view.
export default function Segmented({ value, onChange, options, size = 'md', id, label, className, shape = 'pill' }) {
  const tabs = shape === 'tabs'
  const autoId = useId()
  const key = id || autoId
  const root = useRef(null)
  // A LONG CONTROL IN A SCROLLING ROW (the VIP tabs on a phone) must show which option is on. Only the row's own
  // horizontal scroll moves - never the page - and only when the row actually overflows.
  useEffect(() => {
    const el = root.current?.querySelector('[aria-checked="true"]')
    const row = tabs ? root.current : root.current?.parentElement
    if (!el || !row || row.scrollWidth <= row.clientWidth + 1) return
    const a = el.getBoundingClientRect()
    const b = row.getBoundingClientRect()
    row.scrollLeft += a.left - b.left - (b.width - a.width) / 2
  }, [value, tabs])
  return (
    <div
      ref={root}
      role="radiogroup"
      aria-label={label}
      className={cx(
        tabs ? 'scrollbar-none flex w-full max-w-full overflow-x-auto rounded-xl bg-cloud p-1' : 'inline-flex rounded-full bg-cloud p-1',
        size === 'sm' ? 'gap-0.5' : 'gap-1',
        className,
      )}
    >
      {options.map((o) => {
        const on = value === o.value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            title={o.hint}
            onClick={() => !on && onChange(o.value)}
            className={cx(
              'relative font-medium transition-colors duration-150',
              tabs ? 'shrink-0 rounded-lg' : 'rounded-full',
              size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm',
              on ? 'text-white' : 'text-smoke hover:text-ink',
            )}
          >
            {on && (
              <motion.span
                layoutId={`seg-${key}`}
                transition={SPRING}
                className={cx('absolute inset-0 bg-brand', tabs ? 'rounded-lg' : 'rounded-full')}
              />
            )}
            <span className="relative flex items-center gap-1.5 whitespace-nowrap">{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}
