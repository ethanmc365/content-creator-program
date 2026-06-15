// Small, reusable UI building blocks. Keeping them in one file makes the
// design system easy to scan - every visual primitive lives here.
import { useEffect, useState } from 'react'
import { cx } from '../../lib/utils'

/** Circular profile photo with an initials fallback. */
export function Avatar({ src, name = '', size = 'md', className = '' }) {
  const sizes = { xs: 'h-7 w-7 text-[10px]', sm: 'h-9 w-9 text-xs', md: 'h-12 w-12 text-sm', lg: 'h-20 w-20 text-xl', xl: 'h-28 w-28 text-3xl' }
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
  return src ? (
    <img src={src} alt={name} className={cx('rounded-full object-cover ring-2 ring-white', sizes[size], className)} />
  ) : (
    <div
      aria-label={name}
      className={cx('flex items-center justify-center rounded-full bg-brand-tint font-semibold text-brand ring-2 ring-white', sizes[size], className)}
    >
      {initials || '?'}
    </div>
  )
}

/** Pill badge - tone: brand | light | grey | green | amber | red */
export function Badge({ tone = 'grey', children, className = '' }) {
  const tones = {
    brand: 'bg-brand text-white',
    light: 'bg-brand-tint text-brand',
    grey: 'bg-cloud text-smoke',
    green: 'bg-green-50 text-green-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-600',
  }
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium', tones[tone], className)}>
      {children}
    </span>
  )
}

/** Spinner for in-flight actions (buttons etc.). */
export function Spinner({ className = 'h-5 w-5' }) {
  return (
    <svg className={cx('animate-spin text-current', className)} viewBox="0 0 24 24" fill="none" aria-label="Loading">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  )
}

/** Airplane loader - used for full-page / route loading instead of a plain circle. */
export function PlaneLoader({ label = 'Loading…', className = '' }) {
  return (
    <div className={cx('flex flex-col items-center gap-4', className)}>
      <div className="relative h-8 w-24 overflow-hidden">
        {/* dashed flight path */}
        <div className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 border-t-2 border-dashed border-brand/25" />
        <svg className="absolute top-1/2 h-6 w-6 -translate-y-1/2 animate-fly text-brand" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
        </svg>
      </div>
      {label && <span className="text-sm font-medium text-smoke">{label}</span>}
    </div>
  )
}

/** Grey shimmer block - compose these into loading skeletons, never blank screens. */
export function Skeleton({ className = '' }) {
  return <div className={cx('animate-pulse rounded-xl bg-cloud', className)} />
}

/** A standard card-shaped loading skeleton used by list pages. */
export function SkeletonCards({ count = 3 }) {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card space-y-4">
          <Skeleton className="h-14 w-14 rounded-full" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  )
}

/** Friendly branded empty state. */
export function EmptyState({ emoji = '🌍', title, hint, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-card border border-dashed border-gray-200 bg-white px-8 py-16 text-center">
      <div className="text-4xl" aria-hidden>{emoji}</div>
      <h3 className="text-lg font-semibold">{title}</h3>
      {hint && <p className="max-w-sm text-sm text-smoke">{hint}</p>}
      {action}
    </div>
  )
}

/** Page heading with consistent generous spacing. */
export function PageHeader({ title, subtitle, action }) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:mb-10 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-2 max-w-xl text-smoke">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

/** Simple stat tile used on dashboards. */
export function StatCard({ label, value, hint, accent = false }) {
  return (
    <div className={cx('card', accent && 'border-brand-tint bg-brand-tint/40')}>
      <p className="text-sm font-medium text-smoke">{label}</p>
      <p className={cx('mt-2 text-3xl font-bold tracking-tight', accent && 'text-brand')}>{value}</p>
      {hint && <p className="mt-1 text-xs text-smoke">{hint}</p>}
    </div>
  )
}

/** Accessible modal dialog. Closes on Escape and backdrop click. */
export function Modal({ open, onClose, title, children, wide = false }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <button aria-label="Close" className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div className={cx('relative max-h-[90vh] w-full overflow-y-auto rounded-t-card bg-white p-6 shadow-lift animate-fade-up sm:rounded-card sm:p-8', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded-full p-2 text-smoke hover:bg-cloud hover:text-ink" aria-label="Close dialog">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

/** Lightweight confetti celebration (pure CSS, respects reduced motion). */
export function Confetti({ count = 40 }) {
  const colors = ['#d94407', '#f5853f', '#fdf0e7', '#1A1A1A', '#fbbf24']
  // Randomise each piece once (in state) so re-renders don't reshuffle them.
  const [pieces] = useState(() =>
    Array.from({ length: count }, (_, i) => ({
      left: `${Math.random() * 100}%`,
      backgroundColor: colors[i % colors.length],
      animationDelay: `${Math.random() * 1.2}s`,
      animationDuration: `${2.2 + Math.random() * 1.5}s`,
    }))
  )
  return (
    <div className="pointer-events-none fixed inset-0 z-[60] overflow-hidden" aria-hidden>
      {pieces.map((style, i) => (
        <span key={i} className="absolute top-0 block h-2.5 w-2.5 rounded-sm animate-confetti" style={style} />
      ))}
    </div>
  )
}
