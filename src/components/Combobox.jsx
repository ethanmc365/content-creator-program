import { useEffect, useRef, useState } from 'react'
import { cx } from '../lib/utils'
import Icon from './Icon'

// A clean, searchable dropdown that replaces the native <select>. Type to
// filter the options; click or press Enter to choose. An empty string value
// means the placeholder / "any" option is selected.
export default function Combobox({ value, onChange, options, placeholder = 'Select…', ariaLabel }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const rootRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  useEffect(() => {
    if (open) { setQuery(''); setActive(0); requestAnimationFrame(() => inputRef.current?.focus()) }
  }, [open])

  const q = query.trim().toLowerCase()
  const filtered = q ? options.filter((o) => o.toLowerCase().includes(q)) : options

  const pick = (v) => { onChange(v); setOpen(false) }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cx('input flex w-full items-center justify-between gap-2 text-left', !value && 'text-smoke')}
      >
        <span className="truncate">{value || placeholder}</span>
        <Icon name="chevronRight" className={cx('h-4 w-4 shrink-0 text-smoke transition-transform', open ? '-rotate-90' : 'rotate-90')} />
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-card border border-gray-100 bg-white shadow-lift">
          <div className="border-b border-gray-100 p-2">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setActive(0) }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') { setOpen(false); return }
                if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, filtered.length)) }
                if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
                if (e.key === 'Enter') {
                  e.preventDefault()
                  if (active === 0) pick('')
                  else if (filtered[active - 1] != null) pick(filtered[active - 1])
                }
              }}
              placeholder="Type to search…"
              className="w-full rounded-lg bg-cloud px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40"
              aria-label="Search options"
            />
          </div>
          <ul role="listbox" className="max-h-60 overflow-y-auto py-1">
            <li>
              <button
                type="button"
                onClick={() => pick('')}
                className={cx('flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-cloud', active === 0 && 'bg-cloud', !value && 'font-semibold text-brand')}
              >
                {placeholder}
                {!value && <Icon name="check" className="h-4 w-4 shrink-0" />}
              </button>
            </li>
            {filtered.map((o, i) => (
              <li key={o}>
                <button
                  type="button"
                  onClick={() => pick(o)}
                  className={cx('flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-cloud', active === i + 1 && 'bg-cloud', value === o && 'font-semibold text-brand')}
                >
                  <span className="truncate">{o}</span>
                  {value === o && <Icon name="check" className="h-4 w-4 shrink-0" />}
                </button>
              </li>
            ))}
            {filtered.length === 0 && <li className="px-3 py-3 text-center text-xs text-smoke">No matches</li>}
          </ul>
        </div>
      )}
    </div>
  )
}
