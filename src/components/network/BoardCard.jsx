import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../Icon'
import { Skeleton } from '../ui'
import { loadFeed, tagInfo } from '../../lib/board'
import { cx, formatMessageTime } from '../../lib/utils'
import { useT } from '../../lib/i18n'
import { useCachedPage, writePageCache } from '../../lib/pageCache'

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

// THE NOTES ARE GONE HERE TOO, AND THEY HAD TO GO TOGETHER.
//
// This card existed to make the board familiar before you opened it: the same
// pinned, tilted paper on the hub as on the wall, so tapping through was
// continuous. That argument still holds and it now points the other way - the
// board is cards, so this is cards, and a hub still showing post-it notes
// would be the one place on the platform where the old design survived.
//
// Three rows of the same object the board lists, at hub scale.

// See lib/pageCache. This card is on the hub, which is the most re-entered
// page in the app, and it drew four grey blocks every single time it mounted.
const CACHE_KEY = 'hub-board-card'

export default function BoardCard({ className }) {
  const tr = useT()
  const cached = useCachedPage(CACHE_KEY)
  const [rows, setRows] = useState(cached ?? null)

  useEffect(() => {
    let alive = true
    loadFeed({ limit: 3 })
      .then((data) => { if (alive) { setRows(data); writePageCache(CACHE_KEY, data) } })
      .catch(() => { if (alive) setRows((cur) => cur ?? []) })
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

  if (!rows.length) {
    return (
      <section className={className}>
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Icon name="chat" className="h-5 w-5 shrink-0 text-brand" /> {tr("Community board")}
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
            <span className="block text-sm font-semibold">{tr("Nobody has asked anything yet")}</span>
            <span className="mt-0.5 block text-xs text-smoke">
              {tr("Somebody here has been where you are going. Ask them.")}
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
            <Icon name="chat" className="h-5 w-5 shrink-0 text-brand" /> {tr("Community board")}
          </h2>
          {/* NO COUNT OF WHAT IS UNANSWERED. "3 are still waiting for somebody
              who knows" reads as a chore list on a hub whose job is to invite
              you in, and the notes themselves already say "No answers yet". */}
        </div>
        <Link to="/board" className="shrink-0 text-sm font-medium text-brand transition-transform duration-200 hover:scale-105">
          {tr("Open the board →")}
        </Link>
      </div>

      {/* THE THREE NOTES ARRIVE ONE AFTER ANOTHER, and the stagger is on a
          WRAPPER rather than on the note. `.reveal-item` animates `transform`,
          and the note carries an inline `rotate` for its tilt - an inline style
          beats a stylesheet rule, so putting both on one element means the note
          arrives with no motion at all and simply appears. The wrapper does the
          travelling and the note does the tilting. CSS and not Motion because
          the hub is eagerly routed. */}
      <div className="reveal is-in grid gap-3 pt-1 sm:grid-cols-3">
        {rows.map((q, i) => {
          const t = tagInfo(q.tag)
          const answers = Number(q.answer_count || 0)
          const open = answers === 0
          return (
            <div key={q.id} className="reveal-item" style={{ '--reveal-i': i }}>
              <Link
                to={`/board/${q.id}`}
                className={cx(
                  'group flex h-full flex-col rounded-card border border-gray-100 bg-white p-4 shadow-card',
                  'transition-all duration-200 hover:-translate-y-1 hover:border-brand/40 hover:shadow-lift',
                )}
              >
                <span className="mb-2 flex items-center gap-1.5">
                  <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-brand-tint px-2 py-0.5 text-[10px] font-semibold text-brand">
                    <Icon name={t.icon} className="h-3 w-3 shrink-0" />
                    <span className="truncate">{q.tag === 'country' && q.country ? q.country : t.short}</span>
                  </span>
                  {/* The state, as the one coloured thing on the card, and it
                      says what it means. It used to read "Open" for a question
                      nobody had answered and a bare number otherwise - so the
                      two states were a word and a digit in the same chip, and
                      neither said what it was counting. "Open" is also
                      genuinely ambiguous: open as opposed to closed? Locked?
                      Ethan: "I don't get the 'open' thing." */}
                  <span className={cx(
                    'ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                    open ? 'bg-brand-tint text-brand' : 'bg-green-50 text-green-700',
                  )}>
                    {open
                      ? tr('No answers yet')
                      : answers === 1 ? tr('1 answer') : tr('{n} answers', { n: answers })}
                  </span>
                </span>

                {/* THE QUESTION AND NOTHING ELSE. This is a doorway, not the
                    board: three questions in three glances, everything else one
                    tap away on a page built to hold it. */}
                <span className="line-clamp-4 text-[14px] font-semibold leading-snug text-ink transition-colors group-hover:text-brand">
                  {q.title}
                </span>
                <span className="mt-auto flex items-center gap-1.5 pt-3 text-[10px] font-medium uppercase tracking-wide text-gray-400">
                  {formatMessageTime(q.created_at)}
                  <Icon name="chevronRight" className="ml-auto h-3.5 w-3.5 text-gray-300 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-brand" />
                </span>
              </Link>
            </div>
          )
        })}
      </div>
    </section>
  )
}
