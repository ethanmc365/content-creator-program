import { useEffect, useState } from 'react'
import Icon from '../Icon'
import ReactionPicker from '../ReactionPicker'
import { cx } from '../../lib/utils'

// EVERYTHING YOU CAN DO TO A MESSAGE, IN ONE PLACE, FOR EVERY CHAT.
//
// One component for the rooms and the DMs, so the two cannot drift apart.
//
// YOU OPEN IT BY PRESSING THE MESSAGE. THERE IS NO HOVER.
//
// This is the third answer to "when should the bar be visible", and it is the
// one the phones had all along. Hover-on-contact opened every message a cursor
// crossed while scrolling, and each of those re-flows moved the thread under the
// cursor, which opened the next one. Hover-with-a-delay fixed the scrolling but
// left a control that appears because you paused, disappears because you moved,
// and can never be relied on to still be there when you reach for it. Ethan:
// "I prefer how it is on mobile, and I want this to be implemented for desktop
// too... rather than just hovering over a message it shouldn't show up. Only
// clicking on the actual message."
//
// So: press a message, the bar opens under it and STAYS. Press the message
// again, or do anything with the bar, and it closes. One rule, one code path,
// identical on a laptop and a phone - and a control that is only ever on screen
// because somebody asked for it.
//
// THE BAR OPENS THE MESSAGE, IT DOES NOT FLOAT OVER IT.
//
// Three designs got this wrong before, all of them by trying to put a ~130px
// control somewhere without taking any room for it:
//
//   1. ABOVE THE BUBBLE. Covered the sender's name and the timestamp, and on
//      the first message in a thread it was clipped by the top of the scroller.
//   2. ANCHORED TO THE BUBBLE'S OWN EDGE. A bubble shrinks to fit, so a
//      two-word message is a 75px bubble under a 128px bar - it swallowed the
//      message whole.
//   3. ANCHORED TO THE FAR END OF THE COLUMN. Nothing was covered, but on a
//      short message or an image the bar sat right across the thread from the
//      thing it belonged to: "it's floating away over on the side away from the
//      message". And on a wide bubble the far end IS the message, so it went
//      back to covering text - "it's now sometimes appearing in the corner,
//      covering text".
//
// There is no free space under a message, because that is where the reaction
// chips, the edited note and "Seen by" already live. So the bar stops competing
// for space and MAKES space: the row is a grid that animates from 0fr to 1fr,
// so the message opens by about thirty pixels when you press it and closes
// again after. Nothing is ever overlapped, at any message length, and the bar
// is always immediately under the bubble it belongs to and on the same side as
// it - so it is never further from the message than the message's own width.
//
// ORDER UNDER THE BUBBLE: actions, then chips, then "Seen by". The actions are
// what you came for; the receipt is the thing you must be able to press, so
// nothing is ever drawn on top of it.
//
// CSS, NOT MOTION. Both chat surfaces are reachable without a route split and
// the DMs are eagerly routed, so pulling the animation runtime in for an
// open/close state would cost every creator on their first paint.
export default function MessageActions({
  children,
  // 'right' for your own messages, 'left' for everybody else's. Decides which
  // way the bar, the chips and the footer align.
  side = 'left',
  // [{ icon, label, title, onClick, danger }]
  actions = [],
  // [[emoji, count, mine, names]] - `names` is who reacted, for the tooltip.
  reactions = [],
  onToggleReaction,
  // Is this message's bar open. The parent owns it, because only one message's
  // bar may be open at a time and only the parent knows about the others.
  open = false,
  // Called when the bar has finished its job: an action was pressed, or a
  // reaction was picked, or Escape. The parent clears its own state.
  onClose,
  // "Seen by", the edited note - anything that belongs under this message.
  // Passed in rather than rendered as a sibling so that this component owns the
  // order of everything below the bubble and can keep the bar clear of it.
  footer = null,
  className,
}) {
  const [picking, setPicking] = useState(false)
  const mine = side === 'right'
  const canReact = !!onToggleReaction
  const hasBar = actions.length > 0 || canReact

  // The picker cannot outlive the bar. Closing the message while the panel is
  // up would otherwise leave `picking` true, so the panel would be waiting
  // inside the collapsed box the next time the message was opened.
  useEffect(() => { if (!open) setPicking(false) }, [open])

  // Escape closes the message, not just the picker. ReactionPicker already
  // stops the event when IT is the thing open, so this only ever fires for a
  // bar with no panel over it.
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // DOING THE THING CLOSES THE BAR. Replying, editing, deleting, reporting or
  // reacting are all "I am finished with this message", and leaving a bar open
  // under a message you have just replied to means the next thing you press is
  // a control you had forgotten was there. Wrapped here rather than asked of
  // every caller, because the two chat pages had already drifted on exactly
  // this - some of their handlers cleared the state and some did not.
  const run = (fn) => (...args) => { fn?.(...args); onClose?.() }

  return (
    <div className={cx('relative', className)}>
      {children}

      {hasBar && (
        <div
          data-msg-bar
          data-open={open ? 'true' : 'false'}
          className={cx(
            // 0fr -> 1fr is the height animation that needs no fixed height,
            // which matters because the bar wraps to two rows on a narrow
            // phone when a message has five actions on it.
            'grid transition-[grid-template-rows] duration-[220ms] ease-[cubic-bezier(0.22,1,0.36,1)]',
            open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
          )}
        >
          {/* THE CLIP IS RELEASED WHILE THE EMOJI PANEL IS UP, AND THAT IS THE
              WHOLE REACTION BUG.
              The overflow hider is what makes 0fr actually hide something - but
              the panel is rendered inside the bar, so it was also clipping a
              17rem popover to the bar's own 40px. You pressed the smiley and got
              a two-pixel strip of its top edge. Ethan: "whenever I click it
              nothing happens, it does show up like a faint gray box". The
              handler was never broken. Clipping is only needed while the height
              is animating, and the panel can only be opened once the bar has
              finished opening, so the two never need to be true at once. */}
          <div style={{ overflow: picking ? 'visible' : 'hidden' }}>
            <div className={cx('pt-1.5', mine && 'flex justify-end')}>
              {/* THE PILL HAS NO SHADOW, and that is deliberate. `shadow-card`
                  is a 16px blur, and the clip box above it is exactly the pill's
                  own height - so three of its four sides were sliced off square
                  and what you actually saw was a grey rectangle behind a white
                  oval. A border on white does the same lifting job and cannot be
                  clipped into a corner. It rises and fades the last few pixels
                  into place, which is what reads as depth here. */}
              <div className={cx(
                'flex w-fit items-center gap-0.5 rounded-full border border-gray-200 bg-white px-1 py-0.5',
                'transition-[opacity,transform] duration-[220ms] ease-[cubic-bezier(0.22,1,0.36,1)]',
                mine ? 'ml-auto origin-top-right' : 'origin-top-left',
                open ? 'translate-y-0 scale-100 opacity-100' : '-translate-y-1 scale-95 opacity-0',
              )}>
                {canReact && (
                  // The picker anchors to THIS button, so it stays first: the
                  // panel is 17rem wide and opening it from the far end of the
                  // bar is what used to push it off the side.
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
                        {/* The bar is below the message, so the panel opens
                            upward, away from the bottom of the thread where the
                            composer is. ReactionPicker overrules this when
                            there is no room above. */}
                        <ReactionPicker
                          align={mine ? 'right' : 'left'}
                          prefer="above"
                          onPick={(emoji) => { setPicking(false); run(onToggleReaction)(emoji) }}
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
                    onClick={run(a.onClick)}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {reactions.length > 0 && (
        <div data-msg-chips className={cx('mt-1 flex flex-wrap items-center gap-1', mine && 'justify-end')}>
          {reactions.map(([emoji, count, isMine, names]) => (
            <ReactionChip
              key={emoji}
              emoji={emoji}
              count={count}
              mine={isMine}
              names={names}
              side={side}
              onClick={() => onToggleReaction?.(emoji)}
            />
          ))}
        </div>
      )}

      {footer && <div data-msg-footer className="mt-0.5">{footer}</div>}
    </div>
  )
}

// A reaction, and who is behind it.
//
// The names were being handed to the browser as a `title` attribute, which is a
// native tooltip: it takes about a second to appear, it cannot be styled, and
// on a chip that also has `hover:scale-105` it frequently never showed up at
// all. Ethan: "hovering over a reaction icon is still not showing who reacted
// as it should." So it is drawn, like everything else in this UI.
//
// `title` stays as well, because a tooltip that only exists on hover is no
// tooltip at all for a keyboard or a screen reader.
function ReactionChip({ emoji, count, mine, names, side, onClick }) {
  const label = reactorTitle(names, count)
  return (
    <span className="group/chip relative inline-flex">
      <button
        type="button"
        onClick={onClick}
        aria-pressed={mine}
        aria-label={`${emoji} ${label}`}
        title={label}
        className={cx(
          'reaction-chip flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors duration-150',
          mine
            ? 'border-brand bg-brand-tint text-brand'
            : 'border-gray-200 bg-white text-smoke hover:border-brand/40',
        )}
      >
        <span aria-hidden>{emoji}</span>
        <span className="font-semibold tabular-nums">{count}</span>
      </button>
      {/* Above the chip, so it never covers the message. Clipped to the thread
          rather than the screen, hence max-w and wrapping: forty people can
          react to one message and a single-line tooltip would run off. */}
      <span
        role="tooltip"
        className={cx(
          'pointer-events-none absolute bottom-full z-50 mb-1 hidden max-w-[14rem] rounded-lg bg-ink px-2 py-1 text-[11px] leading-snug text-white shadow-lift',
          'group-hover/chip:block group-focus-within/chip:block',
          side === 'right' ? 'right-0' : 'left-0',
        )}
      >
        {label}
      </span>
    </span>
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
