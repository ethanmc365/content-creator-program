import { useEffect, useRef, useState } from 'react'
import Icon from '../Icon'
import { cx } from '../../lib/utils'

// WHO SEES THIS, AS A REAL CONTROL.
//
// Ethan: "we kind of have this already but please improve the design and the
// selection drop down as its currently just apple style, also add in the
// ability to select multiple, like spain and germany, not just 1."
//
// The old one was a native `<select>`, which on a Mac is the OS roller and on a
// phone is a full-screen wheel, and which can hold exactly one value. Two
// problems, one control. This is a menu of checkable rows with a summary line,
// so "Spain and Germany" is one event rather than two.
//
// EMPTY MEANS EVERYBODY, and the control says so in words rather than leaving a
// blank box that could equally mean "nobody" or "not decided yet". That is also
// the shape the data takes: `community_ids = '{}'` is a global event, which is
// what every event created before markets existed already is.
export default function MarketPicker({ chapters = [], value = [], onChange, id = 'market-picker' }) {
  const [open, setOpen] = useState(false)
  const boxRef = useRef(null)
  const menuRef = useRef(null)

  // THE MENU IS IN THE FLOW, SO THE CARD GROWS INSTEAD OF THE MENU FLOATING.
  //
  // It used to be an absolutely-positioned overlay that measured its room on
  // open and flipped upwards when there was not enough. That is the standard
  // answer and it was the wrong one here: inside a modal there is almost never
  // 300px below the control, so the picker flipped nearly every time and opened
  // UP over the fields you had just filled in. Ethan: "the popup shows up above
  // which is weird, it should be below and the card can be extended when it's
  // pressed so the design looks good."
  //
  // An in-flow menu cannot be clipped and cannot cover anything, because it is
  // not on top of the layout - it IS the layout. The modal grows, its own
  // scroller takes over if it has to, and the direction is always down. No
  // measuring, no flip state, no breakpoint guess.
  useEffect(() => {
    if (!open) return undefined
    // Growing downwards can put the new rows past the fold, so bring them in.
    // `nearest` scrolls the least that will do, which leaves the button in view.
    menuRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    const onDown = (e) => { if (!boxRef.current?.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const selected = chapters.filter((c) => value.includes(c.id))
  const summary = selected.length === 0
    ? 'Everyone, every market'
    : selected.length <= 2
      ? selected.map((c) => c.name).join(' and ')
      : `${selected[0].name} and ${selected.length - 1} more`

  function toggle(id_) {
    onChange(value.includes(id_) ? value.filter((v) => v !== id_) : [...value, id_])
  }

  return (
    <div ref={boxRef}>
      <button
        id={id}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cx(
          'flex w-full items-center gap-3 rounded-xl border bg-white px-4 py-3 text-left transition-all duration-200',
          open ? 'border-brand ring-2 ring-brand/20' : 'border-gray-200 hover:border-brand/50',
        )}
      >
        <span className={cx(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors',
          selected.length ? 'bg-brand text-white' : 'bg-cloud text-smoke',
        )}>
          <Icon name={selected.length ? 'flag' : 'globe'} className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-ink">{summary}</span>
          <span className="block text-xs text-smoke">
            {selected.length === 0
              ? 'On every creator’s calendar'
              : `Only creators in ${selected.length === 1 ? 'this market' : 'these markets'}`}
          </span>
        </span>
        <Icon name="chevronRight" className={cx('h-4 w-4 shrink-0 text-smoke transition-transform duration-200', open && 'rotate-90')} />
      </button>

      {open && (
        <div
          ref={menuRef}
          // In the flow, directly under the button, always downwards. See the
          // note on the effect above for why this is not an absolute overlay.
          // `max-h-72` keeps a seven-market list from taking the whole form and
          // gives the menu its own scroller; the border and shadow tie it to the
          // button so the two read as one control that has opened.
          className="relative z-10 mt-1.5 max-h-72 overflow-y-auto overscroll-contain rounded-card border border-gray-100 bg-white p-1 shadow-lift animate-menu-in"
        >
          <button
            type="button"
            onClick={() => { onChange([]); setOpen(false) }}
            className={cx(
              'flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm transition-colors hover:bg-cloud',
              value.length === 0 ? 'font-semibold text-brand' : 'text-ink',
            )}
          >
            {/* THE PLAIN TICK, WITH NOTHING ROUND IT.
                It was a 16px bordered square that filled orange when selected -
                a checkbox drawn by hand. The owner: "when you click a box it
                shows up a tick with a circle around it, it should just be the
                standard tick used elsewhere on the platform, no box around it."
                He is right: every other multi-select on this platform (the
                daily puzzles, the aircraft filter, the reminder days) marks a
                chosen row with a bare tick, and an empty box on every unchosen
                row is a column of furniture the eye has to skip. The row itself
                already turns brand-coloured and bold. */}
            <span className="flex h-4 w-4 shrink-0 items-center justify-center">
              {value.length === 0 && <Icon name="check" className="h-4 w-4" strokeWidth={2.6} />}
            </span>
            Everyone, every market
          </button>
          <div className="my-1 border-t border-gray-50" />
          {chapters.map((c) => {
            const on = value.includes(c.id)
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => toggle(c.id)}
                className={cx(
                  'flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm transition-colors hover:bg-cloud',
                  on ? 'font-semibold text-brand' : 'text-ink',
                )}
              >
                <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                  {on && <Icon name="check" className="h-4 w-4" strokeWidth={2.6} />}
                </span>
                {/* One line, always. "UK & Ireland" is the longest market name
                    and it was the one that wrapped, breaking after the
                    ampersand and pushing the row to double height in a list
                    where every other row was single. */}
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
