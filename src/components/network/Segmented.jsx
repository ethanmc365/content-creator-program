import { useId } from 'react'
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
export default function Segmented({ value, onChange, options, size = 'md', id, label, className }) {
  const autoId = useId()
  const key = id || autoId
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cx(
        'inline-flex rounded-full bg-cloud p-1',
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
              'relative rounded-full font-medium transition-colors duration-150',
              size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm',
              on ? 'text-white' : 'text-smoke hover:text-ink',
            )}
          >
            {on && (
              <motion.span
                layoutId={`seg-${key}`}
                transition={SPRING}
                className="absolute inset-0 rounded-full bg-brand"
              />
            )}
            <span className="relative flex items-center gap-1.5 whitespace-nowrap">{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}
