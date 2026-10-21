import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { STATUS, addMonths, monthLabel, monthRange, parseMonth } from '../../../../lib/cccTargets'
import { money } from '../../../../lib/vip'
import { cx } from '../../../../lib/utils'
import { Floating } from '../../../../components/ui'
import Icon from '../../../../components/Icon'

// Small shared pieces of the Targets & profit tab.

export const eur = (n, cents = false) => (n == null ? '-' : money(n, 'EUR', { cents }))
export const views = (n) => (n == null ? '-' : Math.round(Number(n)).toLocaleString('en-GB'))
export const pct = (f, digits = 0) => (f == null ? '-' : `${(f * 100).toFixed(digits)}%`)
export const signedPct = (f) => (f == null ? '-' : `${f >= 0 ? '+' : ''}${(f * 100).toFixed(1)}%`)

// A FIGURE TYPED THE WAY PEOPLE SAY IT: "17m", "16,954k", "16954000", "1.2M". Null when it is not a number.
export function parseViews(text) {
  const s = String(text ?? '').trim().toLowerCase().replace(/[\s,]/g, '')
  if (!s) return null
  const m = s.match(/^(\d+(?:\.\d+)?)([km])?$/)
  if (!m) return null
  const n = Number(m[1]) * (m[2] === 'm' ? 1e6 : m[2] === 'k' ? 1e3 : 1)
  return Number.isFinite(n) ? Math.round(n) : null
}

const TONES = {
  good: 'bg-emerald-50 text-emerald-700 ring-emerald-600/15',
  warn: 'bg-amber-50 text-amber-700 ring-amber-600/15',
  bad: 'bg-red-50 text-red-600 ring-red-600/15',
  idle: 'bg-cloud text-smoke ring-gray-200',
}
const DOTS = { good: 'bg-emerald-500', warn: 'bg-amber-500', bad: 'bg-red-500', idle: 'bg-gray-300' }
export const toneOf = (status) => STATUS[status]?.tone || 'idle'
export const toneText = { good: 'text-emerald-600', warn: 'text-amber-600', bad: 'text-red-600', idle: 'text-smoke' }

export function StatusChip({ status, live = false, className }) {
  const s = STATUS[status] || STATUS['no-target']
  return (
    <span className={cx('inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[13px] font-semibold ring-1 ring-inset', TONES[s.tone], className)}>
      <span className={cx('h-1.5 w-1.5 rounded-full', DOTS[s.tone], live && 'animate-pulse')} />
      {s.label}
    </span>
  )
}

/** A choice of a few, with the picked one solid brand and a pill that slides between them. */
export function Segmented({ value, options, onChange, size = 'md', full = false, className }) {
  const row = useRef(null)
  const [pill, setPill] = useState(null)
  useLayoutEffect(() => {
    const measure = () => {
      const el = row.current?.querySelector('[aria-pressed="true"]')
      if (el) setPill({ left: el.offsetLeft, width: el.offsetWidth })
    }
    measure()
    // A full-width switch changes size with the window; the pill follows.
    const ro = typeof ResizeObserver === 'function' && row.current ? new ResizeObserver(measure) : null
    ro?.observe(row.current)
    return () => ro?.disconnect()
  }, [value, options.length])
  return (
    <div ref={row} className={cx('relative flex shrink-0 items-center gap-0.5 rounded-full bg-cloud p-1', full ? 'w-full' : 'w-fit', className)}>
      {pill && (
        <span aria-hidden className="absolute bottom-1 top-1 rounded-full bg-brand shadow-card transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{ left: pill.left, width: pill.width }} />
      )}
      {options.map((o) => (
        <button key={o.key} type="button" onClick={() => onChange(o.key)} aria-pressed={value === o.key} title={o.hint}
          className={cx('relative z-10 whitespace-nowrap rounded-full font-semibold transition-colors duration-200', full && 'flex-1 lg:flex-none',
            size === 'sm' ? 'px-3 py-1 text-[13px]' : 'px-3.5 py-1.5 text-sm',
            value === o.key ? 'text-white' : 'text-smoke hoverable:hover:text-ink',
            !pill && value === o.key && 'bg-brand')}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

/**
 * Progress against a target: the filled part is what is in, a lighter run shows where the pace lands, and a tick marks
 * where the month should be by today if it is to finish on target.
 */
export function ProgressBar({ value, projected, target, expected, tone = 'brand', dark = false, className }) {
  const max = Math.max(1, target || 0, projected || 0, value || 0)
  const w = (n) => `${Math.min(100, Math.max(0, ((n || 0) / max) * 100))}%`
  const [shown, setShown] = useState(false)
  useLayoutEffect(() => { const t = setTimeout(() => setShown(true), 60); return () => clearTimeout(t) }, [])
  return (
    <div className={cx('relative h-3 w-full overflow-hidden rounded-full', dark ? 'bg-white/20' : 'bg-cloud', className)}>
      {projected != null && projected > (value || 0) && (
        <span className={cx('absolute inset-y-0 left-0 rounded-full transition-[width] duration-700 ease-out', dark ? 'bg-white/35' : 'bg-brand/20')}
          style={{ width: shown ? w(projected) : 0 }} />
      )}
      <span className={cx('absolute inset-y-0 left-0 rounded-full transition-[width] duration-[600ms] ease-out',
        dark ? 'bg-white' : tone === 'good' ? 'bg-gradient-to-r from-emerald-500 to-emerald-400' : 'bg-gradient-to-r from-brand to-brand-light')}
        style={{ width: shown ? w(value) : 0 }} />
      {target > 0 && projected != null && projected > target && (
        <span aria-hidden className={cx('absolute inset-y-0 w-0.5', dark ? 'bg-brand' : 'bg-ink/50')} style={{ left: w(target) }} />
      )}
      {expected != null && expected > 0 && (
        <span aria-hidden title="Where the month should be by today" className={cx('absolute -inset-y-0 w-[3px] rounded-full', dark ? 'bg-ink/70' : 'bg-ink')} style={{ left: `calc(${w(expected)} - 1px)` }} />
      )}
    </div>
  )
}

export function Card({ className, delay = 0, children, as: Tag = 'section' }) {
  return (
    <Tag className={cx('animate-rise rounded-card border border-gray-100 bg-white shadow-card', className)} style={delay ? { animationDelay: `${delay}ms` } : undefined}>
      {children}
    </Tag>
  )
}

// ---- WHAT THE WORDS MEAN ------------------------------------------------------------------------------------------
// Ethan: "I don't get what EPM is". Every term on the page that is not plain English opens a short explanation where it
// is used, instead of a glossary nobody scrolls to.
export const TERMS = {
  epm: { title: 'EPM (earnings per 1,000 views)', body: 'What every 1,000 views are worth to Tryp.com. Earnings = views ÷ 1,000 × EPM. Set in the plan (0.90 € by default) and changeable per month.' },
  cpm: { title: 'Target CPM (cost per 1,000 views)', body: 'What we aim to pay for every 1,000 views. Planned costs = view target ÷ 1,000 × target CPM. Lower is better.' },
  actualCpm: { title: 'Actual CPM', body: 'What 1,000 views really cost: actual costs ÷ views achieved × 1,000. Green when it is under the target CPM.' },
  margin: { title: 'Margin', body: 'Earnings minus costs: what Tryp.com keeps.' },
  pace: { title: 'On pace for', body: 'Where the month lands if views keep coming in at the rate they have so far: views so far ÷ the share of the month gone.' },
  target: { title: 'View target', body: 'From the growth plan: one anchor month (for example January = 17M) and a monthly growth (7%). Every other month follows on its own, forwards and backwards. A month can also be set by hand.' },
  achieved: { title: 'Views achieved', body: 'Views GAINED inside the month on every entry, read from the platform (the same count as Weekly views), plus challenges that ran off the platform, spread over the days they ran. VIP months before October come from the VIP sheet.' },
  costs: { title: 'Actual costs', body: 'Counted automatically: every challenge prize pot (or what was paid, if more) and its vouchers, spread over the days it ran; other rewards (milestones, weekly prizes); VIP and official creator pay; plus any other costs added to the plan.' },
  other: { title: 'Other costs', body: 'Spend the platform cannot see, such as staff, ads or tools. Optional, per month.' },
}

/** A term with its explanation one tap away. */
export function Term({ k, children, className, light = false }) {
  const t = TERMS[k]
  const anchor = useRef(null)
  const inner = useRef(null)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return undefined
    const close = (e) => { if (!anchor.current?.contains(e.target) && !inner.current?.contains(e.target)) setOpen(false) }
    const esc = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', esc) }
  }, [open])
  if (!t) return children
  return (
    <>
      <button ref={anchor} type="button" onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }} aria-expanded={open}
        className={cx('group/term inline-flex items-center gap-1 text-left underline decoration-dotted decoration-1 underline-offset-[3px] transition-colors',
          light ? 'decoration-white/50 hoverable:hover:text-white' : 'decoration-gray-300 hoverable:hover:text-brand hoverable:hover:decoration-brand', className)}>
        {children ?? t.title}
        <Icon name="info" className={cx('h-3.5 w-3.5 shrink-0 opacity-60 transition-opacity group-hover/term:opacity-100', light ? 'text-white' : 'text-brand')} />
      </button>
      <Floating anchor={anchor} open={open} innerRef={inner} estimate={160}>
        <div role="dialog" className="w-72 animate-pop-in rounded-2xl border border-gray-100 bg-white p-4 text-left shadow-lift">
          <p className="text-sm font-bold text-ink">{t.title}</p>
          <p className="mt-1 text-[13px] leading-relaxed text-smoke">{t.body}</p>
        </div>
      </Floating>
    </>
  )
}

// ---- WHICH MONTHS ---------------------------------------------------------------------------------------------------
// A real picker: a year of months, click the first and then the last (or the same one twice for a single month), plus
// a few plain-English shortcuts. Replaces "Whole plan / Last 3, next 3 / So far", which the team found unclear.
export function MonthRangePicker({ from, to, nowKey, onChange }) {
  const anchor = useRef(null)
  const inner = useRef(null)
  const [open, setOpen] = useState(false)
  const [year, setYear] = useState(() => parseMonth(from).year)
  const [first, setFirst] = useState(null) // the first click of a new range
  const [hover, setHover] = useState(null)
  useEffect(() => {
    if (!open) return undefined
    const close = (e) => { if (!anchor.current?.contains(e.target) && !inner.current?.contains(e.target)) { setOpen(false); setFirst(null) } }
    const esc = (e) => { if (e.key === 'Escape') { setOpen(false); setFirst(null) } }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', esc) }
  }, [open])
  const pick = (k) => {
    // One click is a month by itself and applies at once; a second click stretches it into a range.
    if (!first) { setFirst(k); onChange(k, k); return }
    const [a, b] = first <= k ? [first, k] : [k, first]
    setFirst(null)
    setOpen(false)
    onChange(a, b)
  }
  const quick = [
    { label: 'This month', range: [nowKey, nowKey] },
    { label: 'Last 3 months', range: [addMonths(nowKey, -2), nowKey] },
    { label: 'Next 3 months', range: [addMonths(nowKey, 1), addMonths(nowKey, 3)] },
  ]
  const lo = first ? (hover && hover < first ? hover : first) : from
  const hi = first ? (hover && hover > first ? hover : first) : to
  const label = from === to ? monthLabel(from, 'pick') : `${monthLabel(from, 'pick')} – ${monthLabel(to, 'pick')}`
  const months = monthRange(`${year}-01`, `${year}-12`)
  return (
    <>
      <button ref={anchor} type="button" onClick={() => { setYear(parseMonth(from).year); setOpen((o) => !o) }} aria-expanded={open}
        className="inline-flex h-9 items-center gap-2 rounded-full border border-gray-200 bg-white px-3.5 text-sm font-semibold text-ink shadow-sm transition-all duration-200 hoverable:hover:-translate-y-0.5 hoverable:hover:border-brand/40">
        <Icon name="calendar" className="h-4 w-4 text-brand" />
        <span className="whitespace-nowrap tabular-nums">{label}</span>
        <Icon name="chevronDown" className={cx('h-4 w-4 text-smoke transition-transform duration-200', open && 'rotate-180')} />
      </button>
      <Floating anchor={anchor} open={open} innerRef={inner} estimate={330}>
        <div className="flex w-[min(30rem,calc(100vw-16px))] animate-pop-in flex-col gap-3 rounded-2xl border border-gray-100 bg-white p-3 shadow-lift sm:flex-row">
          <div className="flex flex-wrap gap-1.5 sm:w-36 sm:flex-col sm:border-r sm:border-gray-100 sm:pr-3">
            {quick.map((q) => {
              const on = q.range[0] === from && q.range[1] === to
              return (
                <button key={q.label} type="button" onClick={() => { setOpen(false); setFirst(null); onChange(q.range[0], q.range[1]) }}
                  className={cx('rounded-full px-3 py-1.5 text-left text-[13px] font-semibold transition-colors sm:rounded-lg', on ? 'bg-brand text-white' : 'bg-cloud text-ink hoverable:hover:bg-brand-tint hoverable:hover:text-brand sm:bg-transparent')}>
                  {q.label}
                </button>
              )
            })}
          </div>
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex items-center justify-between">
              <button type="button" onClick={() => setYear((y) => y - 1)} aria-label="Previous year" className="rounded-full p-1.5 text-smoke transition-colors hoverable:hover:bg-cloud hoverable:hover:text-ink"><Icon name="chevronLeft" className="h-4 w-4" /></button>
              <span className="text-sm font-bold tabular-nums text-ink">{year}</span>
              <button type="button" onClick={() => setYear((y) => y + 1)} aria-label="Next year" className="rounded-full p-1.5 text-smoke transition-colors hoverable:hover:bg-cloud hoverable:hover:text-ink"><Icon name="chevronRight" className="h-4 w-4" /></button>
            </div>
            <div className="grid grid-cols-4 gap-1" onMouseLeave={() => setHover(null)}>
              {months.map((k) => {
                const inRange = k >= lo && k <= hi
                const edge = k === lo || k === hi
                return (
                  <button key={k} type="button" onClick={() => pick(k)} onMouseEnter={() => setHover(k)}
                    className={cx('relative rounded-lg py-2 text-[13px] font-semibold transition-colors',
                      edge ? 'bg-brand text-white' : inRange ? 'bg-brand-tint text-brand' : 'text-ink hoverable:hover:bg-cloud')}>
                    {monthLabel(k, 'month').slice(0, 3)}
                    {k === nowKey && <span className={cx('absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full', edge ? 'bg-white' : 'bg-brand')} />}
                  </button>
                )
              })}
            </div>
            <p className="mt-2 text-[13px] text-smoke">{first ? 'Showing one month. Pick another to make a range.' : 'Pick a month, or two for a range.'}</p>
          </div>
        </div>
      </Floating>
    </>
  )
}
