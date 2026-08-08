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
export default function Segmented({ value, onChange, options, size = 'md', id, label, className }) {
  const key = id || options.map((o) => o.value).join('-')
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
