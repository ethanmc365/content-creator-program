import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import Icon from '../Icon'
import { Avatar } from '../ui'
import { flagFromIso } from '../../lib/flags'
import { cx } from '../../lib/utils'
import { SPRING } from '../../lib/motion'

// Choosing a person, with their face.
//
// This replaces a native `<select>` holding three hundred names. A native
// select renders as the OS's own list (the grey scrolling wheel on a Mac, a
// full-screen roller on iOS), which cannot show an avatar, cannot be searched
// past the first letter, and looks nothing like the rest of the product. For
// picking a human out of a crowd, the face IS the identifier: people recognise
// a photo far faster than they read a name.
//
// Multi-select is supported because adding one creator at a time to a market is
// the tedious version of the same job.

export default function PeoplePicker({
  open,
  onClose,
  people,
  onConfirm,
  title = 'Add creators',
  hint,
  confirmLabel = 'Add',
  multi = true,
  busy = false,
}) {
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState([])
  const inputRef = useRef(null)

  useEffect(() => {
    if (!open) return
    setQuery('')
    setPicked([])
    const t = setTimeout(() => inputRef.current?.focus(), 120)
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      clearTimeout(t)
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q
      ? people.filter((p) =>
          p.name?.toLowerCase().includes(q)
          || p.city?.toLowerCase().includes(q)
          || p.country?.toLowerCase().includes(q))
      : people
    // Picked people float to the top so a long list never hides what you
    // already chose behind a scroll.
    const pickedSet = new Set(picked)
    return [...list].sort((a, b) => (pickedSet.has(b.id) ? 1 : 0) - (pickedSet.has(a.id) ? 1 : 0))
  }, [people, query, picked])

  const toggle = (id) =>
    setPicked((cur) => {
      if (!multi) return cur.includes(id) ? [] : [id]
      return cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
    })

  if (!open) return null

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
          className="absolute inset-0 bg-ink/45 backdrop-blur-[3px]"
        />
        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.98 }}
          transition={SPRING}
          className={cx(
            'relative flex max-h-[86vh] w-full flex-col overflow-hidden bg-white shadow-lift',
            'rounded-t-[28px] sm:max-w-lg sm:rounded-card',
          )}
        >
          <div className="shrink-0 border-b border-gray-100 px-5 pb-4 pt-5">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold">{title}</h2>
                {hint && <p className="mt-0.5 text-sm text-smoke">{hint}</p>}
              </div>
              <button onClick={onClose} aria-label="Close"
                className="rounded-lg p-1.5 text-smoke transition-colors hover:bg-cloud hover:text-ink">
                <Icon name="close" className="h-4 w-4" />
              </button>
            </div>
            <div className="relative">
              <Icon name="magnifier" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-smoke" />
              <input
                ref={inputRef}
                className="input !pl-10 text-base sm:text-sm"
                placeholder="Search by name or city"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
            {results.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-smoke">
                Nobody matches &ldquo;{query}&rdquo;.
              </p>
            ) : (
              results.map((p) => {
                const on = picked.includes(p.id)
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggle(p.id)}
                    aria-pressed={on}
                    className={cx(
                      'flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors',
                      on ? 'bg-brand-tint' : 'hover:bg-cloud',
                    )}
                  >
                    <Avatar src={p.photo_url} name={p.name} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-semibold">{p.name}</span>
                        {p.country_code && (
                          <span className="shrink-0 text-xs" aria-hidden>{flagFromIso(p.country_code)}</span>
                        )}
                      </span>
                      <span className="block truncate text-xs text-smoke">
                        {[p.city, p.country].filter(Boolean).join(', ') || 'Creator'}
                      </span>
                    </span>
                    <span
                      aria-hidden
                      className={cx(
                        'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors',
                        on ? 'border-brand bg-brand text-white' : 'border-gray-200 text-transparent',
                      )}
                    >
                      <Icon name="check" className="h-3.5 w-3.5" />
                    </span>
                  </button>
                )
              })
            )}
          </div>

          <div className="shrink-0 border-t border-gray-100 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className="flex items-center gap-3">
              <button onClick={onClose} className="btn-ghost">Cancel</button>
              <button
                onClick={() => onConfirm(picked)}
                disabled={picked.length === 0 || busy}
                className="btn-primary ml-auto disabled:opacity-40"
              >
                {busy ? 'Adding…' : `${confirmLabel}${picked.length ? ` ${picked.length}` : ''}`}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
