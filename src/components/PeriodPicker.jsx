import { useRef, useState } from 'react'
import { Floating, Select } from './ui'
import Icon from './Icon'
import { DateField } from './DateTimeFields'
import { PERIODS } from '../lib/analyticsPeriod'
import { cx } from '../lib/utils'

// THE PERIOD CONTROL (2 Oct 2026). The house dropdown (never the OS menu - see ui/Select) with the presets, and
// "Custom dates" opening a small card of two day fields under it. The custom range is only applied on "Show", so
// typing a date does not reload the page a digit at a time.
export default function PeriodPicker({ value, from, to, onChange, disabled = false, periods = PERIODS, className, width = 'w-40' }) {
  const [open, setOpen] = useState(false)
  const anchor = useRef(null)
  const [draft, setDraft] = useState({ from, to })
  const options = periods.map((p) => ({
    value: p.key,
    label: p.key === 'custom' && value === 'custom' && from && to ? `${from.slice(8, 10)}/${from.slice(5, 7)} to ${to.slice(8, 10)}/${to.slice(5, 7)}` : p.label,
  }))
  const valid = draft.from && draft.to && draft.from <= draft.to
  return (
    <div
      ref={anchor}
      aria-hidden={disabled || undefined}
      className={cx('relative flex shrink-0 items-center', className ?? 'border-gray-100 sm:border-l sm:pl-3', disabled && 'pointer-events-none select-none opacity-35')}
    >
      <Icon name="calendar" className="mr-1.5 h-4 w-4 text-brand" />
      <Select
        value={value}
        variant="chip"
        className={width}
        ariaLabel="Period"
        search={false}
        options={options}
        onChange={(v) => {
          if (v === 'custom') { setDraft({ from, to }); setOpen(true); return }
          setOpen(false)
          onChange(v)
        }}
      />
      <Floating anchor={anchor} open={open} align="right" offset={8} estimate={240}>
        <div className="w-[16rem] animate-menu-in rounded-card border border-gray-100 bg-white p-4 shadow-lift">
          <p className="mb-3 text-sm font-semibold">Custom dates</p>
          <div className="grid grid-cols-1 gap-3">
            <DateField id="an-from" label="From" value={draft.from} onChange={(v) => setDraft((d) => ({ ...d, from: v }))} />
            <DateField id="an-to" label="To" value={draft.to} onChange={(v) => setDraft((d) => ({ ...d, to: v }))} />
          </div>
          {draft.from && draft.to && !valid && <p className="mt-2 text-[11px] font-medium text-brand">The end is before the start.</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="btn-ghost !px-3 !py-2 text-xs">Cancel</button>
            <button type="button" disabled={!valid} onClick={() => { setOpen(false); onChange('custom', draft.from, draft.to) }} className="btn-primary !px-4 !py-2 text-xs">Show</button>
          </div>
        </div>
      </Floating>
    </div>
  )
}

