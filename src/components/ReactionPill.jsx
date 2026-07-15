import { cx } from '../lib/utils'

// A single reaction chip shown under a chat / DM message. On hover (or focus)
// it reveals a small popup listing the creators who added that reaction.
// `names` is the ordered list of reactor names ("You" for the current user);
// `align` puts the popup's edge on the left or right so it never overflows a
// right-aligned (own) bubble.
export default function ReactionPill({ emoji, count, mine, names = [], onToggle, align = 'left' }) {
  const label = names.length
    ? names.length <= 8
      ? names.join(', ')
      : `${names.slice(0, 8).join(', ')} +${names.length - 8} more`
    : null

  return (
    <span className="group/react relative inline-flex">
      <button
        type="button"
        onClick={onToggle}
        aria-label={`${emoji} ${count} reaction${count === 1 ? '' : 's'}${label ? ` from ${label}` : ''}`}
        className={cx(
          'rounded-full border px-2 py-0.5 text-xs transition-colors',
          mine ? 'border-brand bg-brand-tint text-brand' : 'border-gray-200 bg-white text-smoke hover:border-brand'
        )}
      >
        {emoji} {count}
      </button>
      {label && (
        <span
          role="tooltip"
          className={cx(
            'pointer-events-none absolute bottom-full z-30 mb-1.5 hidden w-max max-w-[220px] whitespace-normal rounded-lg bg-ink px-2.5 py-1.5 text-left text-[11px] font-medium leading-snug text-white shadow-lift group-hover/react:block',
            align === 'right' ? 'right-0' : 'left-0'
          )}
        >
          <span className="mr-1">{emoji}</span>{label}
        </span>
      )}
    </span>
  )
}
