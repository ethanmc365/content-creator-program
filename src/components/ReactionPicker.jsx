import { useEffect, useState } from 'react'
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
export default function ReactionPicker({ onPick, onClose, align = 'left' }) {
  const [expanded, setExpanded] = useState(false)

  // Escape closes it. A popover you can only dismiss by clicking exactly the
  // right patch of backdrop is a popover people close by navigating away.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose?.() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const pick = (emoji) => { onPick(emoji); onClose?.() }

  return (
    <div
      role="dialog"
      aria-label="Pick a reaction"
      className={cx(
        'absolute bottom-full z-30 mb-1 rounded-2xl border border-gray-100 bg-white shadow-lift',
        'animate-[reaction-pop_140ms_cubic-bezier(0.22,1,0.36,1)] origin-bottom',
        align === 'right' ? 'right-0' : 'left-0',
        expanded ? 'w-[17rem] p-2' : 'flex items-center gap-0.5 p-1',
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
