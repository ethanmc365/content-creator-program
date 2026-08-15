import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../Icon'
import { Skeleton } from '../ui'
import { loadFeed, tagInfo } from '../../lib/board'
import { cx, formatMessageTime } from '../../lib/utils'

// THE BOARD, ON THE HUB - AS THREE NOTES, NOT AS THREE ROWS.
//
// A feature nobody knows about is a feature that does not exist, and the board's
// failure mode is specific: it only works if somebody answers, so a question has
// to be seen by people who are not looking for it. This card is that.
//
// WHAT CHANGED. It was three list rows - an icon square, a title, a subtitle, a
// chevron - which is the shape of every other list on the hub and told a reader
// nothing about what they were about to open. Ethan: "maybe 3 little post-it
// notes showing only the question, and they look cool and move like the others
// when you hover over them and they are clickable to open up better on the
// board." So they are the same object as the notes on the wall: pinned paper,
// tilted a degree, straightening as you reach for them. Seeing them here means
// the board is already familiar the first time you open it.
//
// THE THREE MOST RECENT, ALWAYS. It used to lead with UNANSWERED questions and
// fall back to recent ones, which was a defensible idea and had one bad
// property: the card could sit on a question from six weeks ago for a month
// because nobody had answered it, so the hub looked stale on precisely the days
// the board was busiest. Recency is the honest signal that a place is alive, and
// whether a question needs an answer is drawn on the note anyway.
//
// ONLY THE QUESTION. No body, no answer previews, no author line. This is a
// doorway, not the board - three questions in three glances, and everything
// else is one tap away on a page built to hold it.

// Same hash and the same four angles as the board itself. A note has to be at
// the same angle in both places or moving between them looks like a glitch.
function noteHash(id = '') {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  return Math.abs(h)
}

function MiniPin({ hue }) {
  return (
    <span className="pointer-events-none absolute -top-2 left-1/2 z-10 -translate-x-1/2" aria-hidden>
      <svg viewBox="0 0 24 24" className="h-5 w-5" style={{ filter: 'drop-shadow(0 2px 2px rgba(20,20,30,0.28))' }}>
        <circle cx="12" cy="9" r="6" fill={hue} />
        <circle cx="10" cy="7" r="2" fill="#ffffff" fillOpacity="0.55" />
        <path d="M12 15v6" stroke="#8a8a94" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </span>
  )
}

export default function BoardCard({ className }) {
  const [rows, setRows] = useState(null)

  useEffect(() => {
    let alive = true
    loadFeed({ limit: 3 })
      .then((data) => { if (alive) setRows(data) })
      .catch(() => { if (alive) setRows([]) })
    return () => { alive = false }
  }, [])

  // A SKELETON, NOT NOTHING. Returning null while it loads means the hub
  // reflows the moment the query lands and everything below this jumps - the
  // same reason every other section here holds its space.
  if (rows === null) {
    return (
      <section className={className}>
        <div className="mb-4 h-7 w-48"><Skeleton className="h-full w-full" /></div>
        <div className="grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-32" />)}
        </div>
      </section>
    )
  }

  const waiting = rows.filter((q) => Number(q.answer_count || 0) === 0).length

  if (!rows.length) {
    return (
      <section className={className}>
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Icon name="chat" className="h-5 w-5 shrink-0 text-brand" /> Community board
          </h2>
        </div>
        <Link
          to="/board"
          className="flex items-center gap-4 rounded-card border border-dashed border-gray-200 bg-white px-5 py-6 transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/50 hover:shadow-card"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-tint text-brand">
            <Icon name="chat" className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold">Nobody has asked anything yet</span>
            <span className="mt-0.5 block text-xs text-smoke">
              Somebody here has been where you are going. Ask them.
            </span>
          </span>
          <Icon name="chevronRight" className="ml-auto h-4 w-4 shrink-0 text-gray-300" />
        </Link>
      </section>
    )
  }

  return (
    <section className={className}>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Icon name="chat" className="h-5 w-5 shrink-0 text-brand" /> Community board
          </h2>
          <p className="mt-1 text-sm text-smoke">
            {waiting
              ? `The latest questions. ${waiting === 1 ? 'One is' : `${waiting} are`} still waiting for somebody who knows.`
              : 'The latest questions, and every one of them has an answer.'}
          </p>
        </div>
        <Link to="/board" className="shrink-0 text-sm font-medium text-brand transition-transform duration-200 hover:scale-105">
          Open the board →
        </Link>
      </div>

      {/* `pt-3` reserves the pin's overhang. The notes are `-top-2` pins on an
          otherwise flush row, and without the padding the top of each pin is
          clipped by whatever sits above this section. */}
      <div className="grid gap-4 pt-3 sm:grid-cols-3">
        {rows.map((q) => {
          const t = tagInfo(q.tag)
          const answers = Number(q.answer_count || 0)
          const open = answers === 0
          const tilt = [-1.6, -0.8, 0.8, 1.6][noteHash(q.id) % 4]
          return (
            <Link
              key={q.id}
              to={`/board/${q.id}`}
              style={{ transform: `rotate(${tilt}deg)` }}
              className={cx(
                'group relative flex min-h-[8rem] flex-col rounded-lg border bg-white shadow-card transition-all duration-300 ease-out',
                'hover:z-10 hover:-translate-y-1.5 hover:!rotate-0 hover:shadow-lift',
                open ? 'border-brand/25 hover:border-brand/50' : 'border-green-200 hover:border-green-400',
              )}
            >
              <MiniPin hue={open ? '#d94407' : '#16a34a'} />
              <span className={cx('h-1.5 w-full shrink-0 rounded-t-lg', open ? 'bg-brand' : 'bg-green-500')} aria-hidden />
              <span className="flex flex-1 flex-col p-3.5 pt-3">
                <span className="mb-2 flex items-center gap-1.5">
                  <span className={cx(
                    'inline-flex min-w-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                    open ? 'bg-brand-tint text-brand' : 'bg-green-50 text-green-700',
                  )}>
                    <Icon name={t.icon} className="h-3 w-3 shrink-0" />
                    <span className="truncate">{q.tag === 'country' && q.country ? q.country : t.short}</span>
                  </span>
                  {!open && (
                    <span className="ml-auto shrink-0 text-[10px] font-bold text-green-700">{answers}</span>
                  )}
                </span>
                {/* THE QUESTION AND NOTHING ELSE. */}
                <span className="line-clamp-4 text-[14px] font-semibold leading-snug text-ink transition-colors group-hover:text-brand">
                  {q.title}
                </span>
                <span className="mt-auto pt-2.5 text-[10px] font-medium uppercase tracking-wide text-gray-400">
                  {formatMessageTime(q.created_at)}
                </span>
              </span>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
