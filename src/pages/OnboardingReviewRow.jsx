import { cx } from '../lib/utils'
import { useT } from '../lib/i18n'

// A REVIEW ROW THAT FITS ON A PHONE.
//
// Ethan: "it shows the ready to submit - I would just tidy up the UI here."
//
// It was a horizontal row with a FIXED 8rem label column, on a screen 375px
// wide inside a card with 24px of padding either side. That leaves about 140px
// for the answer - so "About you", which is the longest thing anybody writes in
// this whole flow and the paragraph an admin actually reads, was set two or
// three words to a line down a narrow gutter, ten lines tall, with a "Fix"
// button floating beside the top of it.
//
// Under `sm` the label goes ABOVE its value and the value gets the full width.
// The horizontal layout is right on a desktop, where there is room for it, and
// is kept. Same content, same component, one breakpoint.
export function ReviewRow({ label, value, onJump, optional, multiline, hint }) {
  const tr = useT()
  const empty = !value?.trim?.()
  return (
    <div className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:gap-4 sm:py-2.5">
      <dt className="flex items-baseline justify-between gap-2 text-xs text-smoke sm:w-32 sm:shrink-0 sm:justify-start">
        <span>
          {label}
          {hint && <span className="mt-0.5 block text-[10px] opacity-80">{hint}</span>}
        </span>
        {/* On a phone the Edit control belongs beside its LABEL, not beside the
            top of a ten-line paragraph, so it is drawn here and hidden at `sm`
            where the row layout puts it back on the right. */}
        <button
          type="button"
          onClick={onJump}
          className="shrink-0 text-xs font-semibold text-brand transition-transform duration-200 hover:scale-105 sm:hidden"
        >
          {tr("Edit")}
        </button>
      </dt>
      <dd className="min-w-0 flex-1 text-sm">
        {empty
          ? <span className={cx('text-xs', optional ? 'text-gray-400' : 'font-medium text-brand')}>{optional ? tr('Not added') : tr('Missing')}</span>
          : <span className={cx('block', multiline ? 'line-clamp-3 leading-relaxed' : 'truncate')}>{value}</span>}
      </dd>
      <button
        type="button"
        onClick={onJump}
        className="hidden shrink-0 text-xs font-semibold text-brand transition-transform duration-200 hover:scale-105 sm:block"
      >
        {tr("Edit")}
      </button>
    </div>
  )
}
