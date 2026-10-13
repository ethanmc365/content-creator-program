import { useState } from 'react'
import Icon from './Icon'
import { cx } from '../lib/utils'

// A MONTH YOU TAP DAYS ON. The native date box opened the OS picker and took one date at a time; this is a month grid in
// the platform's own look, where a tapped day turns solid brand (the picked-option rule) and several days can be picked
// at once. Days in `taken` are already used and cannot be picked; days before `min` are greyed.
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export default function DayPicker({ value = [], onChange, multiple = true, taken = [], min = null, locale = 'en-GB' }) {
  const first = value[0] ? new Date(`${value[0]}T12:00:00`) : new Date()
  const [month, setMonth] = useState(() => new Date(first.getFullYear(), first.getMonth(), 1))
  const picked = new Set(value)
  const blocked = new Set(taken)
  const today = ymd(new Date())

  // Monday-first weeks, padded to whole rows.
  const lead = (month.getDay() + 6) % 7
  const daysIn = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const cells = Array.from({ length: Math.ceil((lead + daysIn) / 7) * 7 }, (_, i) => {
    const n = i - lead + 1
    return n >= 1 && n <= daysIn ? new Date(month.getFullYear(), month.getMonth(), n) : null
  })
  const weekdays = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(locale, { weekday: 'narrow' }))

  function toggle(key) {
    if (!multiple) { onChange([key]); return }
    onChange(picked.has(key) ? value.filter((v) => v !== key) : [...value, key].sort())
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-3 shadow-card">
      <div className="mb-2 flex items-center justify-between">
        <button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="Previous month"
          className="flex h-9 w-9 items-center justify-center rounded-full text-smoke transition-colors hoverable:hover:bg-cloud hoverable:hover:text-ink">
          <Icon name="chevronLeft" className="h-4 w-4" />
        </button>
        <p className="text-sm font-bold text-ink">{month.toLocaleDateString(locale, { month: 'long', year: 'numeric' })}</p>
        <button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="Next month"
          className="flex h-9 w-9 items-center justify-center rounded-full text-smoke transition-colors hoverable:hover:bg-cloud hoverable:hover:text-ink">
          <Icon name="chevronRight" className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {weekdays.map((w, i) => <span key={i} className="pb-1 text-[11px] font-bold uppercase text-gray-400">{w}</span>)}
        {cells.map((d, i) => {
          if (!d) return <span key={i} />
          const key = ymd(d)
          const on = picked.has(key)
          const off = blocked.has(key) || (min && key < min)
          return (
            <button key={i} type="button" disabled={off} aria-pressed={on} onClick={() => toggle(key)}
              title={blocked.has(key) ? 'Already a voucher day' : undefined}
              className={cx('relative flex aspect-square items-center justify-center rounded-xl text-sm font-semibold tabular-nums transition-all duration-150',
                on ? 'bg-brand text-white shadow-card' : off ? 'cursor-not-allowed text-gray-300' : 'text-ink hoverable:hover:bg-brand-tint hoverable:hover:text-brand',
                key === today && !on && 'ring-1 ring-brand/40')}>
              {d.getDate()}
              {blocked.has(key) && <span aria-hidden className="absolute bottom-1 h-1 w-1 rounded-full bg-brand/50" />}
            </button>
          )
        })}
      </div>
    </div>
  )
}
