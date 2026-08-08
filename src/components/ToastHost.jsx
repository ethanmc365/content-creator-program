import { useCallback, useEffect, useRef, useState } from 'react'
import Icon from './Icon'
import { _setToastHandler } from '../lib/toast'
import { cx } from '../lib/utils'

// Where toasts live. One host, mounted once in App.
//
// NO `motion` IMPORT IN THIS FILE, DELIBERATELY.
//
// This host is mounted eagerly for every signed-in page, so anything it imports
// lands in the initial bundle that all 43 UK creators download. Importing
// `motion` here would pull the ~40kB gzipped animation runtime back in, which is
// the exact regression a flag helper caused a build ago. A toast is a spring
// slide and a fade; CSS does that perfectly well, and the exit is handled by
// keeping the item around for one transition before unmounting it.
//
// PLACEMENT
//
// Bottom centre on a phone, above the tab bar; bottom right on desktop. Not top
// centre: on mobile that is where the notch, the header and the pull-to-refresh
// gesture already are, and a toast landing there covers the thing you pressed.

const TONES = {
  default: 'border-gray-200 bg-white text-ink',
  success: 'border-brand/30 bg-white text-ink',
  warn: 'border-amber-300 bg-amber-50 text-amber-900',
}

const ICON_TONES = {
  default: 'bg-cloud text-smoke',
  success: 'bg-brand text-white',
  warn: 'bg-amber-400 text-white',
}

const EXIT_MS = 180

let seq = 0

export default function ToastHost() {
  const [items, setItems] = useState([])
  const timers = useRef(new Map())

  const clearTimersFor = (id) => {
    const t = timers.current.get(id)
    if (t) { t.forEach(clearTimeout); timers.current.delete(id) }
  }

  const dismiss = useCallback((id) => {
    clearTimersFor(id)
    // Mark it leaving, then unmount after the transition. Removing it outright
    // would make it vanish rather than slide away.
    setItems((cur) => cur.map((t) => (t.id === id ? { ...t, leaving: true } : t)))
    const t = setTimeout(() => setItems((cur) => cur.filter((x) => x.id !== id)), EXIT_MS)
    timers.current.set(id, [t])
  }, [])

  useEffect(() => {
    _setToastHandler((message, options) => {
      const id = ++seq
      const duration = options.duration ?? (options.action ? 6000 : 3200)
      // At most three on screen. A stack taller than that is a log, and the
      // oldest is always the least relevant.
      setItems((cur) => [...cur.filter((t) => !t.leaving).slice(-2), { id, message, ...options }])
      const t = setTimeout(() => dismiss(id), duration)
      timers.current.set(id, [t])
    })
    const map = timers.current
    return () => {
      _setToastHandler(null)
      map.forEach((list) => list.forEach(clearTimeout))
      map.clear()
    }
  }, [dismiss])

  if (items.length === 0) return null

  return (
    <div
      aria-live="polite"
      className={cx(
        'pointer-events-none fixed z-[80] flex flex-col items-center gap-2',
        'inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] px-4',
        'lg:inset-x-auto lg:bottom-6 lg:right-6 lg:items-end lg:px-0',
      )}
    >
      {items.map((t) => (
        <div
          key={t.id}
          className={cx(
            'pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl border px-3.5 py-3 shadow-lift',
            'motion-safe:transition-all motion-safe:duration-200 motion-safe:ease-out',
            t.leaving
              ? 'translate-y-1 scale-[0.97] opacity-0'
              : 'translate-y-0 scale-100 opacity-100 motion-safe:animate-toast-in',
            TONES[t.tone] || TONES.default,
          )}
        >
          <span className={cx('flex h-7 w-7 shrink-0 items-center justify-center rounded-full', ICON_TONES[t.tone] || ICON_TONES.default)}>
            <Icon name={t.icon || 'check'} className="h-4 w-4" />
          </span>
          <p className="min-w-0 flex-1 text-sm font-medium">{t.message}</p>
          {t.action && (
            <button
              onClick={() => { t.action.onClick(); dismiss(t.id) }}
              className="shrink-0 rounded-full px-3 py-1 text-xs font-semibold text-brand transition-colors hover:bg-brand-tint"
            >
              {t.action.label}
            </button>
          )}
          <button
            onClick={() => dismiss(t.id)}
            aria-label="Dismiss"
            className="shrink-0 rounded-lg p-1 text-smoke transition-colors hover:bg-cloud hover:text-ink"
          >
            <Icon name="close" className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}
