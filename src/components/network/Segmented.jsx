import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { cx } from '../../lib/utils'

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
// It was `options.map(o => o.value).join('-')`, which is IDENTICAL for any two controls offering the same choices - and
// the flight community page has exactly that: a year/all-time toggle over the map and another over the leaderboards. A
// `layoutId` is a shared-element IDENTITY, so Motion read the two pills as one pill in two places and did the thing it
// is designed to do: animated it from one to the other.
//
// `useId` is stable across renders and unique per mounted component, which is exactly the scope a highlight belongs to.
// An explicit `id` still wins, for the case where two controls SHOULD share one highlight. `shape="tabs"` is the strip
// for pages with many views (the VIP tools). The strip IS the scroller, full width, with softly rounded corners and no
// hidden overflow outside it, so nothing is clipped by a parent; each tab is a rounded square and the one that is on is
// scrolled into view. AS WIDE AS ITS TABS: "the grey bar shouldn't be fully expanded unless there are actually more
// markets" - it ends after the last tab, and scrolls only once the tabs are wider than the page.
export default function Segmented({ value, onChange, options, size = 'md', label, className, shape = 'pill' }) {
  const tabs = shape === 'tabs'
  const root = useRef(null)
  // THE PICKED PILL SLIDES INSIDE ITS OWN ROW (14 Oct 2026). It was a shared-layout animation, which measures against
  // the whole page: inside a card that was itself still animating in (or a list re-rendering beneath it) the pill
  // "jumps all over the place" (Money > Every balance). Now it is one span positioned from the picked button's own
  // offset in this row, so nothing outside the row can move it.
  const [pill, setPill] = useState(null)
  useLayoutEffect(() => {
    const measure = () => {
      const el = root.current?.querySelector('[aria-checked="true"]')
      if (el) setPill({ left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight })
    }
    measure()
    const observer = new ResizeObserver(measure)
    if (root.current) {
      observer.observe(root.current)
      root.current.querySelectorAll('button').forEach((button) => observer.observe(button))
    }
    return () => observer.disconnect()
  }, [value, options.length])
  // A LONG CONTROL IN A SCROLLING ROW (the VIP tabs on a phone) must show which option is on. Only the row's own
  // horizontal scroll moves - never the page - and only when the row actually overflows.
  useEffect(() => {
    const el = root.current?.querySelector('[aria-checked="true"]')
    const row = tabs ? root.current : root.current?.parentElement
    if (!el || !row || row.scrollWidth <= row.clientWidth + 1) return
    const a = el.getBoundingClientRect()
    const b = row.getBoundingClientRect()
    row.scrollTo({ left: row.scrollLeft + a.left - b.left - (b.width - a.width) / 2 })
  }, [value, tabs])
  return (
    <div
      ref={root}
      role="radiogroup"
      aria-label={label}
      className={cx(
        'relative',
        tabs ? 'scrollbar-none inline-flex w-auto max-w-full overflow-x-auto rounded-xl bg-cloud p-1 align-top' : 'inline-flex rounded-full bg-cloud p-1',
        size === 'sm' ? 'gap-0.5' : 'gap-1',
        className,
      )}
    >
      {pill && (
        <span aria-hidden className={cx('pointer-events-none absolute left-0 top-0 bg-brand shadow-card transition-[transform,width,height] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]', tabs ? 'rounded-lg' : 'rounded-full')}
          style={{ width: pill.width, height: pill.height, transform: `translate(${pill.left}px, ${pill.top}px)` }} />
      )}
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
            {on && !pill && <span className={cx('absolute inset-0 bg-brand', tabs ? 'rounded-lg' : 'rounded-full')} />}
            <span className="relative flex items-center gap-1.5 whitespace-nowrap">{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}
