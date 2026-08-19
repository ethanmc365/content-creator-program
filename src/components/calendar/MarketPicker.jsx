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

  useEffect(() => {
    if (!open) return undefined
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
    <div ref={boxRef} className="relative">
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
        <div className="absolute inset-x-0 top-[calc(100%+0.375rem)] z-40 max-h-72 overflow-y-auto rounded-card border border-gray-100 bg-white p-1 shadow-lift animate-menu-in">
          <button
            type="button"
            onClick={() => { onChange([]); setOpen(false) }}
            className={cx(
              'flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm transition-colors hover:bg-cloud',
              value.length === 0 ? 'font-semibold text-brand' : 'text-ink',
            )}
          >
            <span className={cx(
              'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
              value.length === 0 ? 'border-brand bg-brand text-white' : 'border-gray-300',
            )}>
              {value.length === 0 && <Icon name="check" className="h-3 w-3" />}
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
                <span className={cx(
                  'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
                  on ? 'border-brand bg-brand text-white' : 'border-gray-300',
                )}>
                  {on && <Icon name="check" className="h-3 w-3" />}
                </span>
                {c.name}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
