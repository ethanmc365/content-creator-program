import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../Icon'
import { Avatar } from '../ui'
import { loadFeed, tagInfo } from '../../lib/board'
import { formatMessageTime } from '../../lib/utils'

// THE BOARD, ON THE HUB.
//
// A feature nobody knows about is a feature that does not exist, and the board's
// failure mode is specific: it only works if somebody answers, so the very first
// unanswered question has to be seen by people who are not looking for it. This
// card is that. It sits under "Creators on the move", which is the last place on
// the hub where the reader is still thinking about other people.
//
// IT LEADS WITH WHAT IS UNANSWERED. Not the newest, not the most popular - the
// ones somebody is waiting on. Those are the only ones a passing reader can
// actually do anything about, and "three people are waiting for an answer" is a
// far better invitation than "here is a board".
//
// If everything is answered it says so and shows the newest instead, because a
// card that goes blank on a good day looks broken.

export default function BoardCard({ className }) {
  const [waiting, setWaiting] = useState(null)
  const [recent, setRecent] = useState([])

  useEffect(() => {
    let alive = true
    Promise.all([
      loadFeed({ state: 'unanswered', limit: 3 }).catch(() => []),
      loadFeed({ limit: 3 }).catch(() => []),
    ]).then(([open, all]) => {
      if (!alive) return
      setWaiting(open)
      setRecent(all)
    })
    return () => { alive = false }
  }, [])

  if (waiting === null) return null
  const showing = waiting.length ? waiting : recent
  // Nothing has ever been asked. Rather than a card apologising for an empty
  // table, this is the one moment where "be the first" is literally true.
  if (!showing.length) {
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
            {waiting.length
              ? `${waiting.length === 3 ? 'Three' : waiting.length === 2 ? 'Two' : 'One'} ${waiting.length === 1 ? 'question is' : 'questions are'} waiting for somebody who knows.`
              : 'Everything has been answered. Ask the next one.'}
          </p>
        </div>
        <Link to="/board" className="shrink-0 text-sm font-medium text-brand transition-transform duration-200 hover:scale-105">
          Open the board →
        </Link>
      </div>

      <div className="space-y-2">
        {showing.map((q) => {
          const t = tagInfo(q.tag)
          const answers = Number(q.answer_count || 0)
          return (
            <Link
              key={q.id}
              to={`/board/${q.id}`}
              className="group flex items-center gap-3.5 rounded-card border border-gray-100 bg-white px-4 py-3.5 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-lift"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand">
                <Icon name={t.icon} className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold transition-colors group-hover:text-brand">
                  {q.title}
                </span>
                <span className="mt-0.5 block truncate text-xs text-smoke">
                  {q.author_name} · {formatMessageTime(q.created_at)}
                  {q.tag === 'country' && q.country ? ` · ${q.country}` : ''}
                </span>
              </span>
              {answers === 0 ? (
                <span className="hidden shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 sm:inline">
                  Needs an answer
                </span>
              ) : (
                <span className="flex shrink-0 -space-x-2">
                  {(q.answerers || []).slice(0, 3).map((a) => (
                    <span key={a.id} className="rounded-full ring-2 ring-white">
                      <Avatar src={a.photo_url} name={a.name} size="xs" />
                    </span>
                  ))}
                </span>
              )}
              <Icon name="chevronRight" className="h-4 w-4 shrink-0 text-gray-300" />
            </Link>
          )
        })}
      </div>
    </section>
  )
}
