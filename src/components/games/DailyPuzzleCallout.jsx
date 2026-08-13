import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import Icon from '../Icon'
import { dailyStreak } from '../../lib/daily'
import { DAILY_PUZZLES, useDailyPuzzles } from '../../lib/dailyPuzzles'
import { cx } from '../../lib/utils'

// TODAY'S PUZZLES, ON THE PAGE PEOPLE ACTUALLY OPEN.
//
// The games live behind a link in a menu, which means the daily puzzles - the
// one piece of this product designed to be a habit - are only ever found by
// somebody who already has the habit. A section on the hub, between the
// announcement and the map, is the whole intervention.
//
// WHY THREE CARDS AND NOT ONE STRIP. It used to offer the single puzzle you had
// not played, which sounds tidier and is worse: it hid the fact that there are
// three, so nobody knew what they were missing, and "done for today" appeared
// the moment you finished the last one rather than showing the three ticks you
// had earned. Ethan asked for all three, each highlighting green on its own,
// and that is also the version that makes the set legible.
//
// WHAT EACH CARD SAYS, AND WHY THAT AND NOTHING ELSE
//
//   what it is        the puzzle's name, so it is a specific thing, not "a game"
//   played or not     green and ticked, INDEPENDENTLY of the other two
//   who else played   the count today. This is the social proof and it is the
//                     reason the section works: 11 creators played this morning
//                     is a different invitation from "play a game".
//
// Your streak rides on the heading rather than on each card: it is one streak
// across the three, and printing it three times would read as three.
//
// NO MOTION IMPORT. The hub is eagerly routed; entrance animation is the page's
// own `Reveal`, which is CSS-only for exactly this reason.

function PuzzleCard({ puzzle, done, count }) {
  return (
    <Link
      to={`/game?daily=${puzzle.key}`}
      className={cx(
        'group flex items-center gap-3.5 rounded-card border px-4 py-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift',
        done
          // PLAYED IS GREEN, AND ONLY PLAYED IS GREEN. The whole card carries it
          // so the state is readable at a glance down a column of three, rather
          // than living in a tick somebody has to hunt for.
          ? 'border-green-500/40 bg-green-50/70 hover:border-green-500/70'
          : 'border-brand/25 bg-gradient-to-r from-brand-tint/50 to-brand-tint/20 hover:border-brand/50',
      )}
    >
      <span
        className={cx(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-white shadow-card transition-transform duration-200 group-hover:scale-110',
          done ? 'bg-green-600' : 'bg-brand',
        )}
      >
        <Icon name={done ? 'check' : puzzle.icon} className="h-5 w-5" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-ink">{puzzle.title}</span>
          {done && (
            <span className="shrink-0 rounded-full bg-green-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
              Played
            </span>
          )}
        </span>
        <span className="mt-0.5 block truncate text-xs text-smoke">
          {/* The count is the point, so it wins the line whenever there is one.
              "Nobody yet" is not a discouragement here, it is an opening. */}
          {count == null
            ? puzzle.short
            : count === 0
              ? `${puzzle.short} Nobody has played it yet today.`
              : `${count} ${count === 1 ? 'creator has' : 'creators have'} played it today`}
        </span>
      </span>

      <Icon
        name="chevronRight"
        className={cx('h-5 w-5 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5', done ? 'text-green-600' : 'text-brand')}
      />
    </Link>
  )
}

export default function DailyPuzzleCallout({ className }) {
  const { user } = useAuth()
  const { played, counts, streakDays } = useDailyPuzzles(user?.id)
  const streak = dailyStreak(streakDays)
  const doneCount = DAILY_PUZZLES.filter((p) => played.has(p.key)).length

  return (
    <section className={className}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Icon name="joystick" className="h-5 w-5 text-brand" />
          Daily puzzles
        </h2>
        <span className="flex items-center gap-2">
          {streak > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold text-white">
              <svg viewBox="0 0 24 24" className="h-2.5 w-2.5" fill="currentColor" aria-hidden>
                <path d="M12 2.5c.5 2.6-.8 4-2 5.2-1.4 1.4-2.6 2.6-2.6 5A6.6 6.6 0 0 0 12 21.5a6.6 6.6 0 0 0 6.6-6.6c0-4-2.6-6-4-8.4-.5 1.3-1.3 2.1-2.2 2.6.4-2.3-.2-4.6-.4-6.6Z" />
              </svg>
              {streak} day{streak === 1 ? '' : 's'}
            </span>
          )}
          <span className="text-xs text-smoke">
            {doneCount === DAILY_PUZZLES.length
              ? 'All three done. New ones at midnight.'
              : `${doneCount} of ${DAILY_PUZZLES.length} done today`}
          </span>
        </span>
      </div>

      {/* `counts` is null until the query lands and an OBJECT afterwards. A
          puzzle nobody has played is absent from the tally, not zero in it, so
          reading it as `counts?.[key] ?? null` made "nobody yet"
          indistinguishable from "still loading" and the card would keep showing
          its tagline for ever. */}
      <div className="grid gap-2.5">
        {DAILY_PUZZLES.map((p) => (
          <PuzzleCard key={p.key} puzzle={p} done={played.has(p.key)} count={counts ? (counts[p.key] ?? 0) : null} />
        ))}
      </div>
    </section>
  )
}
