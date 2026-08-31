import { useState } from 'react'
import Icon from '../Icon'
import ReactionPicker from '../ReactionPicker'
import { cx } from '../../lib/utils'

// EVERYTHING YOU CAN DO TO A MESSAGE, IN ONE PLACE, FOR EVERY CHAT.
//
// One component for the rooms and the DMs, because two implementations drifted
// into two different behaviours - which is exactly what Ethan reported: "on
// rooms it always shows up at the bottom and on dms it always shows at the
// top", and "for announcements and general it is different".
//
// THE PILL IS ALWAYS BELOW THE BUBBLE. NO MEASURING, NO FLIPPING.
//
// It used to decide per message: above normally, below near the top of the
// thread or on anything taller than 160px. Three positions for one control,
// chosen by a layout read, and the result was a UI that behaved differently
// depending on where you had scrolled to. A control you cannot predict is a
// control you have to hunt for. Below, always, on every surface.
//
// AND IT SITS ON THE OPPOSITE SIDE FROM THE CHIPS AND THE RECEIPT.
//
// "Below" on its own would have made the worst bug worse: the reaction chips,
// the edited note and "Seen by" all live under the message too, so the pill
// landed straight on top of them. Ethan: "when I try click on seen to see who
// read the message, it just shows up the reaction button and I can't see."
//
// So the bottom of a message is one row with two ends. The chips and the
// footer start at the message's own edge - left under somebody else's message,
// right under yours - and the pill is anchored to the OTHER end. They share a
// line and never share a pixel, so the pill can be permanently at the bottom
// without ever covering the thing you were trying to press.
//
// CSS, NOT MOTION. Both chat surfaces are reachable without a route split and
// the DMs are eagerly routed, so pulling the animation runtime in for a hover
// state would cost every creator on their first paint.
export default function MessageActions({
  children,
  // 'right' for your own messages, 'left' for everybody else's. Decides which
  // way the pill, the chips and the footer align.
  side = 'left',
  // [{ icon, label, title, onClick, danger }]
  actions = [],
  // [[emoji, count, mine, names]] - `names` is who reacted, for the tooltip.
  reactions = [],
  onToggleReaction,
  // The phone's answer to hover: the parent sets this when the row is tapped.
  revealed = false,
  // "Seen by", the edited note - anything that belongs under this message.
  // Passed in rather than rendered as a sibling so that it shares the bottom
  // row with the pill and this component can keep the two apart.
  footer = null,
  className,
}) {
  const [picking, setPicking] = useState(false)
  const mine = side === 'right'
  const canReact = !!onToggleReaction
  const hasPill = actions.length > 0 || canReact
  const hasBottomRow = reactions.length > 0 || !!footer

  return (
    <div className={cx('relative', className)}>
      {/* THE BUBBLE REGION. The pill is anchored to the BOTTOM OF THIS, which
          is the bottom edge of the message itself - not the bottom of the whole
          message block. Everything that comes after (chips, edited, "Seen by")
          therefore starts below the pill and can never be underneath it. */}
      <div className="relative">
        {children}
      {hasPill && (
        <div
          data-msg-pill
          // THE GAP IS PADDING, NOT MARGIN, AND THAT IS THE HOVER FIX.
          //
          // A margin here would be four transparent pixels between the
          // message and the pill, and a gap is a hole: moving the pointer
          // from the message to the emoji button crossed it, `group-hover`
          // dropped, and the pill vanished under the cursor mid-reach.
          // Ethan: "if I hover over a message and then try to hover over the
          // emoji button, I find it quite difficult, it seems to disappear
          // immediately." As padding on the positioned wrapper the same
          // pixels are part of the hoverable element.
          //
          // z-40, above neighbouring rows and above the picker's own catcher:
          // "it should always pop out above everything". This is also the fix
          // for "on dms ... it was showing at the bottom but hidden behind
          // other text" - it was being painted under the next message.
          className={cx(
            'absolute bottom-0 z-40 flex items-center pt-1',
            // THE OUTER END OF THE COLUMN, NOT THE EDGE OF THE BUBBLE.
            //
            // A bubble shrinks to fit its text, so a two-word message is a
            // two-word bubble, and a pill anchored to that bubble's own edge is
            // wider than the message and covers the whole of it. The COLUMN is
            // always the full width of the message area and the bubble sits at
            // one end of it, so the far end is empty on exactly the short
            // messages where covering would matter. On a full-width paragraph
            // the pill lands over the end of the last line instead, which is
            // where a wrapped paragraph reliably has room. Neither end is the
            // screen: the column is capped at 82%, so both sides are inboard.
            mine ? 'left-0' : 'right-0',
            'transition-[opacity,transform] duration-150 ease-out',
            picking || revealed
              ? 'pointer-events-auto translate-y-0 opacity-100'
              : 'pointer-events-none translate-y-1 opacity-0 focus-within:pointer-events-auto focus-within:translate-y-0 focus-within:opacity-100 group-hover/msg:pointer-events-auto group-hover/msg:translate-y-0 group-hover/msg:opacity-100',
          )}
        >
          <div className="flex items-center gap-0.5 rounded-full border border-gray-100 bg-white/95 px-1 py-0.5 shadow-lift backdrop-blur">
            {canReact && (
              // The picker anchors to THIS button, so it stays first: the
              // panel is 17rem wide and opening it from the far end of the
              // pill is what used to push it off the side.
              <div className="relative">
                <ActionButton
                  icon="smile"
                  label="Add a reaction"
                  onClick={() => setPicking((p) => !p)}
                  active={picking}
                />
                {picking && (
                  <>
                    {/* A full-screen catcher, so the next press anywhere
                        closes the panel instead of doing whatever it was
                        going to do. */}
                    <div className="fixed inset-0 z-30" onClick={() => setPicking(false)} />
                    {/* The pill is at the bottom of the message, so the panel
                        opens upward - away from the message and away from the
                        edge of the thread. ReactionPicker still overrules
                        this when there is no room above. */}
                    <ReactionPicker
                      align={mine ? 'left' : 'right'}
                      prefer="above"
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
      </div>

      {/* ------------------------------------------------------- the bottom row
          Chips and footer, at the message's own edge. No `min-h` and no
          always-present row: an unreacted message with no receipt reserves no
          height at all, which is what used to leave a gap under every single
          message. */}
      <div className={cx(hasBottomRow && 'mt-1')}>
        {reactions.length > 0 && (
          <div data-msg-chips className={cx('flex flex-wrap items-center gap-1', mine && 'justify-end')}>
            {reactions.map(([emoji, count, isMine, names]) => (
              <button
                key={emoji}
                type="button"
                onClick={() => onToggleReaction?.(emoji)}
                aria-pressed={isMine}
                // WHO REACTED, BACK ON THE HOVER.
                // This was lost when the two chat surfaces were merged onto one
                // component - the merged chip took the emoji, the count and
                // whether it was mine, and dropped the names. A count with
                // nobody attached to it is the one thing a reaction is not.
                title={reactorTitle(names, count)}
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

        {footer && <div data-msg-footer>{footer}</div>}

      </div>
    </div>
  )
}

// "Ana, Ben and Chi reacted" - and a plain count when the names did not come
// through, which is better than an empty tooltip.
export function reactorTitle(names, count) {
  const list = (names || []).filter(Boolean)
  if (!list.length) return `${count} ${count === 1 ? 'reaction' : 'reactions'}`
  if (list.length === 1) return `${list[0]} reacted`
  if (list.length === 2) return `${list[0]} and ${list[1]} reacted`
  if (list.length === 3) return `${list[0]}, ${list[1]} and ${list[2]} reacted`
  return `${list.slice(0, 3).join(', ')} and ${list.length - 3} more reacted`
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
