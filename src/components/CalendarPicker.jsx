import { useState } from 'react'
import Icon from './Icon'
import { cx, dateTag } from '../lib/utils'
import { useT } from '../lib/i18n'

// ONE DAY, PICKED FROM A MONTH (14 Oct 2026). Every typed date field on the platform (DateTimeFields.DateField) opens
// this from its calendar button, so a date can be typed OR clicked. The title switches to a year of months, so a date
// two years away is two presses rather than twenty-four.
//
// Why it exists: Marta's "Spooky Season" bonus was saved ending on 14 Oct 2029 because the year was typed by hand, and
// the card then told creators it ran "until Sunday". Clicking a day in a calendar that opens on the current month
// cannot produce that.
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export default function CalendarPicker({ value, onPick, min, max, rangeFrom, rangeTo, embedded = false }) {
  const tr = useT()
  const locale = dateTag()
  const seed = value ? new Date(`${value}T12:00:00`) : new Date()
  const [month, setMonth] = useState(() => new Date(seed.getFullYear(), seed.getMonth(), 1))
  const [mode, setMode] = useState('days')
  const today = ymd(new Date())
  const out = (key) => (min && key < min) || (max && key > max)

  const lead = (month.getDay() + 6) % 7
  const daysIn = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const cells = Array.from({ length: Math.ceil((lead + daysIn) / 7) * 7 }, (_, i) => {
    const n = i - lead + 1
    return n >= 1 && n <= daysIn ? new Date(month.getFullYear(), month.getMonth(), n) : null
  })
  const weekdays = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(locale, { weekday: 'narrow' }))
  const step = (n) => setMonth((m) => (mode === 'days' ? new Date(m.getFullYear(), m.getMonth() + n, 1) : new Date(m.getFullYear() + n, m.getMonth(), 1)))
  const navBtn = 'flex h-8 w-8 items-center justify-center rounded-full text-smoke transition-colors hoverable:hover:bg-cloud hoverable:hover:text-ink'

  return (
    <div className={cx("w-[17rem] rounded-2xl bg-white p-3", !embedded && "animate-menu-in border border-gray-100 shadow-lift")} onMouseDown={(e) => e.preventDefault()}>
      <div className="mb-2 flex items-center justify-between">
        <button type="button" onClick={() => step(-1)} aria-label={mode === 'days' ? tr('Previous month') : tr('Previous year')} className={navBtn}>
          <Icon name="chevronLeft" className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => setMode((m) => (m === 'days' ? 'months' : 'days'))}
          className="rounded-lg px-2 py-1 text-sm font-bold text-ink transition-colors hoverable:hover:bg-cloud">
          {mode === 'days' ? month.toLocaleDateString(locale, { month: 'long', year: 'numeric' }) : month.getFullYear()}
          <Icon name={mode === 'days' ? 'chevronDown' : 'chevronUp'} className="ml-1 inline h-3.5 w-3.5 text-smoke" />
        </button>
        <button type="button" onClick={() => step(1)} aria-label={mode === 'days' ? tr('Next month') : tr('Next year')} className={navBtn}>
          <Icon name="chevronRight" className="h-4 w-4" />
        </button>
      </div>

      {mode === 'months' ? (
        <div key="months" className="grid grid-cols-3 gap-1.5 animate-tab-in">
          {Array.from({ length: 12 }, (_, i) => {
            const on = i === month.getMonth()
            return (
              <button key={i} type="button" onClick={() => { setMonth(new Date(month.getFullYear(), i, 1)); setMode('days') }}
                className={cx('rounded-xl py-2.5 text-sm font-semibold transition-colors',
                  on ? 'bg-brand text-white' : 'text-ink hoverable:hover:bg-brand-tint hoverable:hover:text-brand')}>
                {new Date(2024, i, 1).toLocaleDateString(locale, { month: 'short' })}
              </button>
            )
          })}
        </div>
      ) : (
        <div key={`d${month.getTime()}`} className="grid grid-cols-7 gap-0.5 text-center animate-tab-in">
          {weekdays.map((w, i) => <span key={i} className="pb-1 text-[11px] font-bold uppercase text-gray-400">{w}</span>)}
          {cells.map((d, i) => {
            if (!d) return <span key={i} />
            const key = ymd(d)
            const on = key === value || key === rangeFrom || key === rangeTo
            const inside = rangeFrom && rangeTo && key > rangeFrom && key < rangeTo
            const off = out(key)
            return (
              <button key={i} type="button" disabled={off} aria-pressed={on} aria-label={d.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })} onClick={() => onPick(key)}
                className={cx('flex aspect-square items-center justify-center rounded-xl text-sm font-semibold tabular-nums transition-colors',
                  on ? 'bg-brand text-white shadow-card' : inside ? 'bg-brand-tint text-brand' : off ? 'cursor-not-allowed text-gray-300' : 'text-ink hoverable:hover:bg-brand-tint hoverable:hover:text-brand',
                  key === today && !on && 'ring-1 ring-brand/40')}>
                {d.getDate()}
              </button>
            )
          })}
        </div>
      )}

      <div className="mt-2 flex justify-between border-t border-gray-50 pt-2">
        <button type="button" disabled={out(today)} onClick={() => onPick(today)} className="rounded-lg px-2 py-1 text-xs font-semibold text-brand transition-colors hoverable:hover:bg-brand-tint disabled:opacity-40">
          {tr('Today')}
        </button>
        {value && (
          <button type="button" onClick={() => onPick('')} className="rounded-lg px-2 py-1 text-xs font-semibold text-smoke transition-colors hoverable:hover:bg-cloud">
            {tr('Clear')}
          </button>
        )}
      </div>
    </div>
  )
}
