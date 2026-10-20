import { useLayoutEffect, useRef, useState } from 'react'
import { STATUS } from '../../../../lib/cccTargets'
import { money } from '../../../../lib/vip'
import { cx } from '../../../../lib/utils'

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
    <div ref={row} className={cx('relative flex shrink-0 items-center gap-0.5 rounded-full bg-cloud p-1', full && 'w-full', className)}>
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
        <span className={cx('absolute inset-y-0 left-0 rounded-full transition-[width] duration-[1100ms] ease-out', dark ? 'bg-white/35' : 'bg-brand/20')}
          style={{ width: shown ? w(projected) : 0 }} />
      )}
      <span className={cx('absolute inset-y-0 left-0 rounded-full transition-[width] duration-[900ms] ease-out',
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
