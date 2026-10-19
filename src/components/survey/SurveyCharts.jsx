import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Avatar } from '../ui'
import Icon from '../Icon'
import { cx } from '../../lib/utils'
import { useT } from '../../lib/i18n'

// THE SURVEY RESULTS, QUESTION BY QUESTION (19 Oct 2026).
//
// They were recharts bars, and the team listed what was wrong with them: pressing a bar grew it over its own number so
// the number could not be read, the tooltip said "5" where it meant "5 stars: 10 answers", an option nobody picked drew
// nothing at all (not even the empty track), and there was no way to see WHO gave an answer. Now each answer is a row:
// its label, a grey track that is always there, the filled part, and the count and share OUTSIDE the track where
// nothing covers them. Pressing a row opens a small card on it with the people who gave that answer.

/** `who(row)` -> { id, name, photo, market }; set once by the results page. */
export const SurveyPeople = createContext(() => ({ name: '' }))

/** A five-point star, filled. The outline icon at a lower opacity read as "not given" even when it was. */
export function Star({ on = true, className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 24 24" className={cx(className, on ? 'text-brand' : 'text-gray-200')} aria-hidden>
      <path fill="currentColor" d="M11.48 3.5a.56.56 0 0 1 1.04 0l2.13 5.11c.08.2.26.33.47.35l5.52.44c.5.04.7.66.32.99l-4.2 3.6a.56.56 0 0 0-.18.56l1.28 5.38a.56.56 0 0 1-.84.61l-4.72-2.88a.56.56 0 0 0-.59 0l-4.72 2.88a.56.56 0 0 1-.84-.61l1.28-5.38a.56.56 0 0 0-.18-.56l-4.2-3.6a.56.56 0 0 1 .32-.99l5.52-.44c.2-.02.39-.15.47-.35z" />
    </svg>
  )
}

/** The people behind one answer, as a small card. Closes on a click outside or Escape. */
function PeoplePop({ rows, title, onClose, align = 'left' }) {
  const tr = useT()
  const who = useContext(SurveyPeople)
  const ref = useRef(null)
  useEffect(() => {
    const off = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    const esc = (e) => { if (e.key === 'Escape') onClose() }
    // A tick later, so the press that opened it does not close it.
    const t = setTimeout(() => { document.addEventListener('pointerdown', off); document.addEventListener('keydown', esc) }, 0)
    return () => { clearTimeout(t); document.removeEventListener('pointerdown', off); document.removeEventListener('keydown', esc) }
  }, [onClose])
  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={title}
      className={cx('absolute top-full z-30 mt-1.5 w-72 max-w-[calc(100vw-3rem)] rounded-xl border border-gray-100 bg-white p-3 shadow-lift animate-pop-in', align === 'right' ? 'right-0' : 'left-0')}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-xs font-bold text-ink">{title}</p>
        <button type="button" onClick={onClose} aria-label={tr('Close')} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-smoke transition-colors hoverable:hover:bg-cloud hoverable:hover:text-ink">
          <Icon name="close" className="h-3.5 w-3.5" />
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="py-2 text-xs text-smoke">{tr('Nobody picked this.')}</p>
      ) : (
        <ul className="max-h-56 space-y-0.5 overflow-y-auto overscroll-contain">
          {rows.map((r, i) => {
            const w = who(r)
            const inner = (
              <>
                <Avatar src={w.photo} name={w.name} size="xs" />
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">{w.name}</span>
                {w.market && <span className="shrink-0 text-xs text-smoke">{tr(w.market)}</span>}
              </>
            )
            return (
              <li key={r.id ?? i}>
                {w.id
                  ? <Link to={`/profile/${w.id}`} className="flex items-center gap-2 rounded-lg px-1.5 py-1.5 transition-colors hoverable:hover:bg-cloud">{inner}</Link>
                  : <span className="flex items-center gap-2 px-1.5 py-1.5">{inner}</span>}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/**
 * One horizontal bar per answer. `items` = [{ key, label (node), title (text), count, rows, strong }].
 * `total` is what the share is out of.
 */
export function AnswerBars({ items, total, labelWidth = 'w-28 sm:w-40' }) {
  const tr = useT()
  const [open, setOpen] = useState(null)
  const max = Math.max(1, ...items.map((x) => x.count))
  return (
    <ul className="space-y-2">
      {items.map((x, i) => {
        const pct = total ? Math.round((x.count / total) * 100) : 0
        const isOpen = open === x.key
        return (
          <li key={x.key} className={cx('relative', isOpen && 'z-30')}>
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : x.key)}
              aria-expanded={isOpen}
              className={cx(
                'group flex w-full items-center gap-3 rounded-lg px-1.5 py-1 text-left transition-all duration-200',
                isOpen ? 'bg-cloud' : 'hoverable:hover:bg-cloud/70',
              )}
            >
              <span className={cx('shrink-0 truncate text-[13px] font-semibold text-ink', labelWidth)} title={x.title}>{x.label}</span>
              <span className="relative h-3 min-w-0 flex-1 overflow-hidden rounded-full bg-gray-100">
                <span
                  className={cx('absolute inset-y-0 left-0 rounded-full survey-bar-grow', x.strong ? 'bg-gradient-to-r from-brand-light to-brand' : 'bg-brand/45')}
                  style={{ width: `${(x.count / max) * 100}%`, animationDelay: `${i * 60}ms` }}
                />
              </span>
              <span className="w-20 shrink-0 text-right text-[13px] tabular-nums">
                <strong className="font-bold text-ink">{x.count}</strong>
                <span className="text-smoke"> · {pct}%</span>
              </span>
            </button>
            {isOpen && (
              <PeoplePop
                rows={x.rows || []}
                title={`${x.title}: ${x.count === 1 ? tr('1 person') : tr('{n} people', { n: x.count })}`}
                onClose={() => setOpen(null)}
              />
            )}
          </li>
        )
      })}
    </ul>
  )
}

/** 0-10 as columns; every column keeps its grey track, pressing one shows who chose it. */
export function ScaleColumns({ spread, pickers }) {
  const tr = useT()
  const [open, setOpen] = useState(null)
  const max = Math.max(1, ...spread)
  return (
    <div className={cx('relative', open != null && 'z-30')}>
      <div className="flex h-32 items-end gap-1 sm:gap-1.5">
        {spread.map((count, n) => {
          const band = n >= 9 ? 'bg-emerald-500' : n >= 7 ? 'bg-amber-400' : 'bg-brand'
          return (
            <button
              key={n}
              type="button"
              onClick={() => setOpen(open === n ? null : n)}
              aria-expanded={open === n}
              aria-label={tr('{n} out of 10: {c} answers', { n, c: count })}
              className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
            >
              <span className={cx('text-xs font-bold tabular-nums', count ? 'text-ink' : 'text-gray-300')}>{count}</span>
              <span className={cx('relative w-full flex-1 overflow-hidden rounded-md bg-gray-100 transition-transform duration-200', open === n ? 'ring-2 ring-ink/80' : 'hoverable:group-hover:-translate-y-0.5')}>
                <span className={cx('absolute inset-x-0 bottom-0 rounded-md survey-col-grow', band)} style={{ height: `${(count / max) * 100}%`, animationDelay: `${n * 40}ms` }} />
              </span>
              <span className="text-xs font-semibold tabular-nums text-smoke">{n}</span>
            </button>
          )
        })}
      </div>
      {open != null && (
        <PeoplePop
          rows={pickers?.[open] || []}
          title={tr('{n} out of 10: {c}', { n: open, c: spread[open] === 1 ? tr('1 person') : tr('{n} people', { n: spread[open] }) })}
          onClose={() => setOpen(null)}
          align={open > 5 ? 'right' : 'left'}
        />
      )}
    </div>
  )
}
