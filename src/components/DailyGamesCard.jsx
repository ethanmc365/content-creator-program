import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Icon from './Icon'
import { StreakChip } from './ui'
import { untilNextUkMidnight, dailyStreak } from '../lib/daily'
import { useState } from 'react'
import { DAILY_PUZZLES, useDailyPuzzles } from '../lib/dailyPuzzles'

// Home page teaser for the daily puzzles: quick-play buttons, the creator's
// daily streak, and how many creators have played each one today.
//
// THREE NOW, AND FROM THE SHARED LIST. It hard-coded the two puzzles and its own
// pair of queries, so the day Guess the language became a daily this card was
// the one surface that had not heard about it - and a home page that offers two
// puzzles above a games page offering three reads as one of them being broken.
// `DAILY_PUZZLES` is the single list and `useDailyPuzzles` is the single answer
// to "have I played this, and how many others have".

export default function DailyGamesCard() {
  const { user } = useAuth()
  const [nextIn] = useState(() => untilNextUkMidnight(Date.now()))
  const { played, counts, streakDays } = useDailyPuzzles(user?.id)
  const streak = dailyStreak(streakDays)
  const doneCount = DAILY_PUZZLES.filter((p) => played.has(p.key)).length

  return (
    <section>
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Icon name="joystick" className="h-5 w-5 text-brand" /> Today&rsquo;s puzzles
          {streak > 0 && <StreakChip n={streak} title={`${streak}-day daily streak`} />}
        </h2>
        <Link to="/game" className="text-sm font-medium text-brand hover:underline">All games →</Link>
      </div>
      <div className="card !p-0">
        {/* Three across on anything wider than a phone. */}
        <div className="grid grid-cols-1 sm:grid-cols-3">
          {DAILY_PUZZLES.map((p, i) => {
            const done = played.has(p.key)
            const count = counts ? (counts[p.key] ?? 0) : null
            return (
              <div
                key={p.key}
                className={`flex items-center gap-3 px-5 py-4 ${i > 0 ? 'border-t border-gray-50 sm:border-l sm:border-t-0' : ''}`}
              >
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white ${done ? 'bg-green-600' : 'bg-brand'}`}>
                  <Icon name={done ? 'check' : p.icon} className="h-6 w-6" strokeWidth={2.2} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{p.title}</p>
                  <p className="truncate text-xs text-smoke">
                    {count == null || count === 0 ? p.short : `${count} played today`}
                  </p>
                </div>
                <Link
                  to={`/game?daily=${p.key}`}
                  className={done
                    ? 'inline-flex shrink-0 items-center gap-1.5 rounded-full bg-green-100 px-3 py-1.5 text-xs font-semibold text-green-700 transition-transform hover:scale-105'
                    : 'btn-primary shrink-0 !px-4 !py-1.5 text-xs'}
                >
                  {done ? (
                    <>
                      <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 12l5 5L20 6" /></svg>
                      Played
                    </>
                  ) : 'Play'}
                </Link>
              </div>
            )
          })}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-50 bg-cloud/40 px-5 py-2.5">
          <p className="flex items-center gap-2 text-xs text-smoke">
            <span className="relative flex h-2 w-2" aria-hidden>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-60 motion-reduce:hidden" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
            </span>
            {doneCount === DAILY_PUZZLES.length
              ? 'All three done. Nicely played.'
              : `${doneCount} of ${DAILY_PUZZLES.length} done today`}
          </p>
          <p className="text-[11px] text-smoke">New puzzles in {nextIn}</p>
        </div>
      </div>
    </section>
  )
}
