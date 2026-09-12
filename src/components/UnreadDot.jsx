import { cx } from '../lib/utils'
import { useT, usePlural } from '../lib/i18n'

// THE ONE MARK THAT SAYS "SOMETHING WAS SAID HERE AND YOU HAVE NOT READ IT".
//
// Ethan: "there should be an orange dot pulsing to show that there is new
// messages that I have not seen yet... when the messages are read the pulsing
// orange dot should go away, this is for mobile and desktop."
//
// TWO LAYERS, NOT ONE ANIMATED DOT. The solid centre never moves and never
// fades: it is the thing you count, and a dot that spends half its cycle at 30%
// opacity is a dot you cannot count in a list of eight rooms. The HALO behind
// it is the part that breathes - a second copy of the same orange, scaled and
// faded on a 2.4s loop, which is slow enough to read as a heartbeat rather than
// as an alert. `animate-ping-slow` is the platform's existing version of this
// and the calendar's live-now dot already uses it, so the two read as the same
// idea rather than as two different ones.
//
// IT IS `pointer-events-none` AND `aria-hidden` WHEN IT SITS INSIDE A LINK that
// already names itself; where it stands alone (the nav tabs) the caller passes
// a label. A screen reader announcing "New messages" twice for one row is worse
// than not announcing it at all.
//
// REDUCED MOTION IS HANDLED BY THE PLATFORM RULE, not here: `data-reduce-motion`
// on <html> flattens every animation-duration in the document, so the halo goes
// still and the solid dot is untouched. That is the right degradation - the
// information survives, the movement does not.
export default function UnreadDot({ className, size = 'md', label }) {
  const tr = useT()
  const box = size === 'sm' ? 'h-1.5 w-1.5' : size === 'lg' ? 'h-2.5 w-2.5' : 'h-2 w-2'
  return (
    <span
      className={cx('relative flex shrink-0 items-center justify-center', box, className)}
      role={label ? 'status' : undefined}
      aria-label={label ? tr('New messages') : undefined}
      aria-hidden={label ? undefined : true}
    >
      <span className={cx('absolute inset-0 rounded-full bg-brand/60 animate-ping-slow')} />
      <span className={cx('relative rounded-full bg-brand', box)} />
    </span>
  )
}

// The same signal with a number on it, for a card that stands for several rooms
// (a market in the sidebar, a place on the rooms index). Below ten it is a
// count; above it, "9+", because the exact number stops mattering and the pill
// stops fitting.
export function UnreadCount({ n, className }) {
  const tr = useT()
  const pl = usePlural()
  if (!n) return null
  return (
    <span
      className={cx(
        'relative inline-flex shrink-0 items-center justify-center rounded-full bg-brand px-2 py-0.5 text-[11px] font-bold leading-none text-white',
        className,
      )}
      role="status"
      // ONE OR MANY IS TWO SENTENCES, not a number in front of a plural. It
      // read "1 New messages", which is the shape `${n} ${tr('New messages')}`
      // always produces. `usePlural` writes both forms out in full so the
      // translator sees two real sentences - Spanish agrees the noun as well as
      // the number. See lib/i18n.
      aria-label={pl(n, '1 room with new messages', '{n} rooms with new messages')}
    >
      <span className="absolute inset-0 rounded-full bg-brand/50 animate-ping-slow" aria-hidden />
      <span className="relative">{n > 9 ? '9+' : n} {tr('new')}</span>
    </span>
  )
}
