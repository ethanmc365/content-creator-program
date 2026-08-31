import { useCallback, useEffect, useRef, useState } from 'react'
import Icon from '../Icon'
import ReactionPicker from '../ReactionPicker'
import { cx } from '../../lib/utils'

// EVERYTHING YOU CAN DO TO A MESSAGE, IN ONE PLACE, FOR EVERY CHAT.
//
// There were two implementations - one in the rooms, one in the DMs - and both
// had the same three problems, arrived at independently:
//
//   1. THE PILL STRADDLED THE MESSAGE. Anchored with `-translate-y-1/2` on an
//      edge, half of it lay across the words. On a short message ("thanks") the
//      pill is wider than the bubble, so it covered the entire message.
//   2. IT MOVED WHEN SOMEBODY REACTED. It was positioned against the message
//      COLUMN, which also holds the reaction chips and the read receipt, so the
//      moment a chip appeared the pill jumped a row down and hung level with
//      nothing.
//   3. IT RAN OFF THE SIDE. Anchored to the outer edge of a bubble that is
//      already at the outer edge of the screen.
//
// THE ANSWER IS ONE RULE: the pill lives FULLY ABOVE the bubble, aligned to the
// bubble's inner edge, and it is `absolute` so it reserves no height. Above,
// because that is the only region guaranteed to be free of this message's own
// content at every length - a short message has no room beside it and a long
// one has none below it. Inner edge, because the outer edge is the screen.
// It covers a sliver of the message above, which is what every chat product
// does and what nobody has ever complained about.
//
// The chips sit in the FLOW underneath, which is where content belongs, and
// they are what the pill deliberately does not move for.
//
// CSS, NOT MOTION. Both chat surfaces are reachable without a route split and
// the DMs are eagerly routed, so pulling the animation runtime in for a hover
// state would cost every creator on their first paint.
export default function MessageActions({
  children,
  // 'right' for your own messages, 'left' for everybody else's. Decides which
  // way the pill and the chips align.
  side = 'left',
  // [{ icon, label, title, onClick, danger }]
  actions = [],
  // [[emoji, count, mine]]
  reactions = [],
  onToggleReaction,
  // The phone's answer to hover: the parent sets this when the row is tapped.
  revealed = false,
  className,
}) {
  const [picking, setPicking] = useState(false)
  const mine = side === 'right'
  const canReact = !!onToggleReaction

  // WHICH SIDE OF THE MESSAGE THE PILL SITS ON, decided by measurement.
  //
  // Above was right for an ordinary message and wrong in two cases Ethan hit:
  //
  //   * A MESSAGE AT THE TOP OF THE THREAD. `bottom-full` put the pill above
  //     the scroll container's own top edge, which clips it - "it's cut off at
  //     the top, so I'm not able to see it".
  //   * A TALL MESSAGE. On a paragraph the pill ends up level with the first
  //     line, an inch or more from where your eye actually finishes reading -
  //     "if there's a really big message the reaction and reply button
  //     appearing at the top is quite weird, it might be better at the bottom".
  //
  // Both resolve to the same answer, so there is one rule: go BELOW when there
  // is not room above, or when the message is tall enough that the top is the
  // wrong end of it. Measured against the nearest scrolling ancestor, because
  // that is what does the clipping - the window is not the constraint here.
  const wrapRef = useRef(null)
  const [below, setBelow] = useState(false)

  const measure = useCallback(() => {
    const el = wrapRef.current
    if (!el) return
    const box = el.getBoundingClientRect()
    let scroller = el.parentElement
    while (scroller && scroller !== document.body) {
      const oy = getComputedStyle(scroller).overflowY
      if (oy === 'auto' || oy === 'scroll') break
      scroller = scroller.parentElement
    }
    const top = scroller && scroller !== document.body
      ? scroller.getBoundingClientRect().top
      : 0
    // 44px is the pill plus its gap. Tall is 160px, which is about five lines.
    setBelow(box.top - top < 44 || box.height > 160)
  }, [])

  // Measured when the pill is about to be needed rather than on every render:
  // a thread is 200 messages and this is a layout read.
  useEffect(() => { if (revealed) measure() }, [revealed, measure])

  return (
    <div
      ref={wrapRef}
      className={cx('relative', className)}
      onPointerEnter={measure}
    >
      {/* ---------------------------------------------------------- the pill
          `bottom-full` is measured against THIS wrapper, whose top edge is the
          top of the bubble, so the pill lands fully above the message and
          cannot cover it at any length. `mb-1` is the only gap it needs.

          It stays put when a reaction lands, because the chips are rendered
          after `children` and this is anchored to the wrapper's top, not its
          bottom. That was bug (2). */}
      {(actions.length > 0 || canReact) && (
        <div
          // THE GAP IS PADDING, NOT MARGIN, AND THAT IS THE HOVER FIX.
          //
          // `mb-1` put four transparent pixels between the message and the
          // pill, and a gap is a hole: moving the pointer from the message to
          // the emoji button crossed it, `group-hover` dropped, and the pill
          // vanished under the cursor mid-reach. Ethan: "if I hover over a
          // message and then try to hover over the emoji button, I find it
          // quite difficult, it seems to disappear immediately."
          // As PADDING on this positioned wrapper the same four pixels are part
          // of the hoverable element, so the pointer never leaves anything.
          //
          // z-30, over the picker's own catcher and over any neighbouring row:
          // "it should always pop out above everything".
          className={cx(
            'absolute z-30 flex items-center gap-0.5',
            below ? 'top-full pt-1' : 'bottom-full pb-1',
            // The INNER edge. A bubble sits against the outer edge of the
            // thread, so anchoring the pill there is what pushed it off screen.
            mine ? 'right-0' : 'left-0',
            'transition-[opacity,transform] duration-150 ease-out',
            picking || revealed
              ? 'pointer-events-auto translate-y-0 opacity-100'
              : 'pointer-events-none translate-y-1 opacity-0 focus-within:pointer-events-auto focus-within:translate-y-0 focus-within:opacity-100 group-hover/msg:pointer-events-auto group-hover/msg:translate-y-0 group-hover/msg:opacity-100',
          )}
        >
        <div className="flex items-center gap-0.5 rounded-full border border-gray-100 bg-white/95 px-1 py-0.5 shadow-lift backdrop-blur">
          {canReact && (
            // The picker anchors to THIS button, so it stays first: the panel
            // is 17rem wide and opening it from the far end of the pill is what
            // used to push it off the side.
            <div className="relative">
              <ActionButton
                icon="smile"
                label="Add a reaction"
                onClick={() => setPicking((p) => !p)}
                active={picking}
              />
              {picking && (
                <>
                  {/* A full-screen catcher, so the next press anywhere closes
                      the panel instead of doing whatever it was going to do. */}
                  <div className="fixed inset-0 z-30" onClick={() => setPicking(false)} />
                  <ReactionPicker
                    align={mine ? 'right' : 'left'}
                    // The panel opens away from the message: with the pill
                    // above it opens further up, with the pill below it opens
                    // further down. ReactionPicker still overrules either when
                    // the side it was asked for does not fit.
                    prefer={below ? 'below' : 'above'}
                    onPick={(emoji) => { onToggleReaction(emoji); setPicking(false) }}
                    onClose={() => setPicking(false)}
                  />
                </>
              )}
            </div>
          )}
          {actions.map((a) => (
            <ActionButton
              key={a.label}
              icon={a.icon}
              label={a.label}
              title={a.title}
              danger={a.danger}
              onClick={a.onClick}
            />
          ))}
        </div>
        </div>
      )}

      {children}

      {/* --------------------------------------------------------- the chips
          In the flow, under the message, aligned to the same side. `mt-1` only
          when there is something to show, so an unreacted message reserves no
          space at all - an `opacity-0` row still has a height, which is what
          used to leave a gap under every single message. */}
      {reactions.length > 0 && (
        <div className={cx('mt-1 flex flex-wrap items-center gap-1', mine && 'justify-end')}>
          {reactions.map(([emoji, count, isMine]) => (
            <button
              key={emoji}
              type="button"
              onClick={() => onToggleReaction?.(emoji)}
              aria-pressed={isMine}
              className={cx(
                'reaction-chip flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-all duration-150 hover:scale-105',
                isMine
                  ? 'border-brand bg-brand-tint text-brand'
                  : 'border-gray-200 bg-white text-smoke hover:border-brand/40',
              )}
            >
              <span aria-hidden>{emoji}</span>
              <span className="font-semibold tabular-nums">{count}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function ActionButton({ icon, label, title, onClick, danger, active }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={title || label}
      className={cx(
        'flex h-7 w-7 items-center justify-center rounded-full text-smoke transition-colors',
        danger ? 'hover:bg-red-50 hover:text-red-600' : 'hover:bg-cloud hover:text-brand',
        active && 'bg-brand-tint text-brand',
      )}
    >
      <Icon name={icon} className="h-4 w-4" />
    </button>
  )
}
