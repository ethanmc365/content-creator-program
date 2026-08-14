import { useEffect, useLayoutEffect, useState } from 'react'
import { QUICK_REACTIONS, REACTION_GROUPS } from '../lib/reactions'
import { cx } from '../lib/utils'
import Icon from './Icon'

// The reaction popover, shared by the legacy chat and the network rooms.
//
// CSS AND NOT MOTION, deliberately. Chat.jsx is eagerly routed, so anything it
// imports lands in every creator's first paint; the Motion runtime is not
// paying for itself on a popover that scales and fades. Same call as ToastHost.
//
// TWO STATES, NOT A SCROLLING WALL. Closed, it is the six reactions you use
// ninety percent of the time, which is one press. Open, it is the whole
// vocabulary grouped under headings so it can be SCANNED - a flat grid of
// sixty emoji is a search task, and nobody is willing to do a search task to
// say "nice photo".
// The nearest ancestor that clips its overflow. THAT is what a popover has to
// fit inside, not the window: a message thread is a scroll container with a
// sticky header above it, so a popover that fits the screen perfectly well can
// still be sliced off by the top of the conversation.
function clipBounds(node) {
  let el = node?.parentElement
  while (el && el !== document.body) {
    const cs = getComputedStyle(el)
    const scrolls = (v) => v === 'auto' || v === 'scroll' || v === 'hidden' || v === 'clip'
    if (scrolls(cs.overflowY) || scrolls(cs.overflowX)) {
      const r = el.getBoundingClientRect()
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }
    }
    el = el.parentElement
  }
  const w = window.innerWidth || 0
  return { top: 0, bottom: window.innerHeight || 0, left: 0, right: w }
}

export default function ReactionPicker({ onPick, onClose, align = 'left' }) {
  const [expanded, setExpanded] = useState(false)
  // WHICH WAY IT OPENS.
  //
  // THE BUG THIS FIXES. It always opened upward (`bottom-full`). Reacting to a
  // message at the TOP of a thread therefore put the popover above the top of
  // the scroller - so it was clipped by the conversation and disappeared under
  // the header showing who you are talking to. Pressing `+` made it taller and
  // made it worse, which is exactly the report: the emoji panel ends up behind
  // the name bar.
  //
  // So it measures itself once it is on screen and flips below the message when
  // there is not room above. Measured against the SCROLLER, not the window,
  // because the scroller is what does the clipping.
  const [node, setNode] = useState(null)
  const [placement, setPlacement] = useState('above')
  // AND HOW FAR SIDEWAYS IT HAS TO MOVE TO STAY ON SCREEN.
  //
  // THE BUG THIS FIXES. The panel anchored to one edge of the message's action
  // row and grew from there, and the action row sits on the FREE side of the
  // message - the right, for anybody else's message. Expanded, the panel is
  // 17rem wide, so on a 375px phone it started near the right edge and ran a
  // couple of hundred pixels off the side of the screen: Ethan's "the emoji box
  // is a bit off the screen on the right". Worse, an element sticking out of a
  // scroller makes that scroller horizontally scrollable, which is what let a
  // sideways drag shove the whole conversation to the left.
  //
  // Vertical placement was already measured; this is the same idea for the
  // other axis, and it is a NUDGE rather than a flip because there is no second
  // side to try - it just has to fit. Applied as a transform so it composites
  // and needs no layout pass.
  const [shiftX, setShiftX] = useState(0)

  // useLayoutEffect, NOT useEffect, and that is the whole fix for the flicker.
  //
  // A passive effect runs AFTER the browser has painted, so the sequence was:
  // paint the panel above (where it does not fit) -> measure -> set state ->
  // paint it below. You saw it at the top for a frame and then jump. A layout
  // effect runs after the DOM is written and BEFORE paint, and React flushes
  // the resulting re-render in the same commit, so the only frame that ever
  // reaches the screen is the correct one. Same on expand: pressing `+` makes
  // the panel ten times taller, which is exactly when it needs to move.
  useLayoutEffect(() => {
    if (!node) return
    const r = node.getBoundingClientRect()
    const limit = clipBounds(node)
    const PAD = 8
    if (placement === 'above' && r.top < limit.top + PAD) {
      // Only flip if there is genuinely more room the other way. On a very
      // short scroller neither side fits and moving it achieves nothing.
      const roomBelow = limit.bottom - r.bottom
      const roomAbove = r.top - limit.top
      if (roomBelow > roomAbove) setPlacement('below')
    } else if (placement === 'below' && r.bottom > limit.bottom - PAD) {
      const roomAbove = r.top - limit.top
      const roomBelow = limit.bottom - r.bottom
      if (roomAbove > roomBelow) setPlacement('above')
    }

    // Measure the box at its UNSHIFTED position, so the correction is absolute
    // and cannot accumulate across re-measures.
    const natural = { left: r.left - shiftX, right: r.right - shiftX }
    let dx = 0
    if (natural.left < limit.left + PAD) dx = limit.left + PAD - natural.left
    else if (natural.right > limit.right - PAD) dx = limit.right - PAD - natural.right
    // Never push it so far that it leaves the other side: on a container
    // narrower than the panel, hugging the left edge is the best available
    // answer and the panel scrolls internally from there.
    if (natural.left + dx < limit.left) dx = limit.left - natural.left
    if (Math.round(dx) !== Math.round(shiftX)) setShiftX(dx)
    // Re-measured when it grows: the six-emoji strip fits almost anywhere and
    // the full panel is ten times taller.
  }, [node, expanded, placement, shiftX])

  // Escape closes it. A popover you can only dismiss by clicking exactly the
  // right patch of backdrop is a popover people close by navigating away.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose?.() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const pick = (emoji) => { onPick(emoji); onClose?.() }
  const below = placement === 'below'

  return (
    <div
      ref={setNode}
      role="dialog"
      aria-label="Pick a reaction"
      style={shiftX ? { transform: `translateX(${Math.round(shiftX)}px)` } : undefined}
      className={cx(
        'absolute z-30 rounded-2xl border border-gray-100 bg-white shadow-lift',
        below ? 'top-full mt-1 origin-top' : 'bottom-full mb-1 origin-bottom',
        'animate-[reaction-pop_140ms_cubic-bezier(0.22,1,0.36,1)]',
        align === 'right' ? 'right-0' : 'left-0',
        // Never wider than the space it has. `max-w` plus the shift means the
        // panel is always fully reachable, even on a 320px phone.
        expanded ? 'w-[17rem] max-w-[calc(100vw-1.5rem)] p-2' : 'flex max-w-[calc(100vw-1.5rem)] items-center gap-0.5 p-1',
      )}
    >
      {!expanded ? (
        <>
          {QUICK_REACTIONS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => pick(e)}
              aria-label={`React with ${e}`}
              className="rounded-full px-1.5 py-1 text-base leading-none transition-transform hover:scale-125 active:scale-110"
            >
              {e}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setExpanded(true)}
            aria-label="More reactions"
            className="ml-0.5 flex h-6 w-6 items-center justify-center rounded-full text-smoke transition-colors hover:bg-cloud hover:text-brand"
          >
            <Icon name="plus" className="h-3.5 w-3.5" />
          </button>
        </>
      ) : (
        <div className="max-h-56 overflow-y-auto overscroll-contain pr-0.5">
          {REACTION_GROUPS.map((g) => (
            <div key={g.name} className="mb-1.5 last:mb-0">
              <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-smoke">{g.name}</p>
              <div className="grid grid-cols-8 gap-0.5">
                {g.emoji.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => pick(e)}
                    aria-label={`React with ${e}`}
                    className="rounded-lg py-1 text-base leading-none transition-transform hover:scale-125 active:scale-110"
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
