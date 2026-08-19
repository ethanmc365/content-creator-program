import { Link } from 'react-router-dom'
import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import Icon from '../Icon'
import Flame from './Flame'
import { dailyStreak, untilNextUkMidnight } from '../../lib/daily'
import { DAILY_PUZZLES, useDailyPuzzles } from '../../lib/dailyPuzzles'
import { cx } from '../../lib/utils'

// TODAY'S PUZZLES, ON THE PAGE PEOPLE ACTUALLY OPEN.
//
// The games live behind a link in a menu, which means the daily puzzles - the
// one piece of this product designed to be a habit - are only ever found by
// somebody who already has the habit. A section on the hub, between the
// announcement and the map, is the whole intervention.
//
// ONE CARD, THREE PUZZLES ACROSS - the same shape the UK home page has always
// used (`components/DailyGamesCard`). It was three separate stacked cards here,
// which on a hub already made of full-width cards read as three more sections
// to scroll past rather than one thing to do. Ethan: "instead of being 3
// separate cards, one card where the 3 puzzles are side by side."
//
// WHY THREE AND NOT "the one you have not played". It used to offer the single
// unplayed puzzle, which sounds tidier and is worse: it hid the fact that there
// are three, so nobody knew what they were missing, and "done for today"
// appeared the moment you finished the last one rather than showing the three
// ticks you had earned.
//
// WHAT EACH COLUMN SAYS, AND WHY THAT AND NOTHING ELSE
//
//   what it is        the puzzle's name, so it is a specific thing, not "a game"
//   played or not     green and ticked, INDEPENDENTLY of the other two
//   who else played   the count today. This is the social proof and it is the
//                     reason the section works: 11 creators played this morning
//                     is a different invitation from "play a game".
//
// Your streak rides on the heading rather than on each column: it is one streak
// across the three, and printing it three times would read as three.
//
// THE COLUMN IS NEUTRAL. THE BUTTON IS THE ONLY THING THAT TURNS GREEN.
//
// This rule is absolute, because every softer version of it has been read as a
// colour change to the card. Ethan: "if I play one game, the entire game card
// turns to the green colour... the card should always be orange and after I
// play it just the play button should turn green." So nothing outside the
// button may vary with `done` - same tile, same puzzle icon, same hover -
// which also means a row of three is one consistent set at every stage of the
// day rather than three that drift apart as you work through them.
//
// NO MOTION IMPORT. The hub is eagerly routed; entrance animation is the page's
// own `Reveal`, which is CSS-only for exactly this reason. What motion the card
// does have is CSS: the tile grows and the button slides on hover, and the
// dividers are borders rather than gaps so the three read as one surface.

function PuzzleColumn({ puzzle, done, count, first }) {
  return (
    <Link
      to={`/game?daily=${puzzle.key}`}
      className={cx(
        'group flex items-center gap-3 px-4 py-4 transition-colors duration-200 hover:bg-cloud/50 sm:px-5',
        // Dividers, not gaps: one card with three compartments. The rule turns
        // from horizontal to vertical at the same breakpoint the grid does.
        !first && 'border-t border-gray-50 sm:border-l sm:border-t-0',
      )}
    >
      {/* The puzzle's OWN icon, always. Swapping it for a tick was half of "the
          whole card changed": the tile is the column's identity, and an identity
          that changes when you finish is a different thing. The tick lives on
          the button, next to the word that explains it. */}
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand text-white shadow-card transition-transform duration-200 group-hover:scale-110">
        <Icon name={puzzle.icon} className="h-5 w-5" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-ink">{puzzle.title}</span>
        <span className="mt-0.5 block truncate text-xs text-smoke">
          {/* The count is the point, so it wins the line whenever there is one.
              "Nobody yet" is not a discouragement here, it is an opening. */}
          {count == null
            ? puzzle.short
            : count === 0
              ? puzzle.short
              : `${count} ${count === 1 ? 'creator has' : 'creators have'} played`}
        </span>
      </span>

      {/* Fixed width, so three columns have their buttons on the same vertical
          line. "Played" and "Play" are different lengths and a right-aligned
          pair of them would stagger across the row. */}
      <span
        className={cx(
          'flex w-[5.25rem] shrink-0 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold transition-all duration-200',
          done
            ? 'bg-green-50 text-green-700 ring-1 ring-inset ring-green-500/30'
            : 'bg-brand text-white shadow-card group-hover:scale-105',
        )}
      >
        {done ? (
          <>
            <Icon name="check" className="h-3.5 w-3.5" />
            Played
          </>
        ) : (
          <>
            Play
            <Icon name="chevronRight" className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
          </>
        )}
      </span>
    </Link>
  )
}

export default function DailyPuzzleCallout({ className }) {
  const { user } = useAuth()
  // Read once on mount: this is a countdown to the top of the day, not a clock,
  // and re-rendering the hub every minute to move it is not worth a frame.
  const [nextIn] = useState(() => untilNextUkMidnight(Date.now()))
  const { played, counts, streakDays } = useDailyPuzzles(user?.id)
  const streak = dailyStreak(streakDays)
  const doneCount = DAILY_PUZZLES.filter((p) => played.has(p.key)).length
  const allDone = doneCount === DAILY_PUZZLES.length

  return (
    <section className={className}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Icon name="joystick" className="h-5 w-5 text-brand" />
          Daily puzzles
        </h2>
        <span className="flex items-center gap-2">
          {streak > 0 && (
            // A LIT FLAME ON A WHITE PILL, not a flat white glyph on a brand
            // one. The pill was solid orange with the flame knocked out of it
            // in white, which is the one background a fire cannot be drawn on:
            // every colour that says "burning" is a shade of the thing behind
            // it. See components/games/Flame.
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-tint px-2 py-0.5 text-[10px] font-bold text-brand">
              <Flame className="h-3.5 w-3.5" />
              {streak} day{streak === 1 ? '' : 's'}
            </span>
          )}
          <Link to="/game" className="text-sm font-medium text-brand hover:underline">All games &rarr;</Link>
        </span>
      </div>

      {/* `counts` is null until the query lands and an OBJECT afterwards. A
          puzzle nobody has played is absent from the tally, not zero in it, so
          reading it as `counts?.[key] ?? null` made "nobody yet"
          indistinguishable from "still loading" and the column would keep
          showing its tagline for ever. */}
      <div className="card !p-0 overflow-hidden">
        <div className="grid grid-cols-1 sm:grid-cols-3">
          {DAILY_PUZZLES.map((p, i) => (
            <PuzzleColumn
              key={p.key}
              puzzle={p}
              first={i === 0}
              done={played.has(p.key)}
              count={counts ? (counts[p.key] ?? 0) : null}
            />
          ))}
        </div>
        {/* The foot is the set's status line, and it is the reason this works as
            ONE card: three separate cards had nowhere to say "two of three" that
            was not repeated three times. */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-50 bg-cloud/40 px-5 py-2.5">
          <p className="flex items-center gap-2 text-xs text-smoke">
            <span className="relative flex h-2 w-2" aria-hidden>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-60 motion-reduce:hidden" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
            </span>
            {allDone ? 'All three done. Nicely played.' : `${doneCount} of ${DAILY_PUZZLES.length} done today`}
          </p>
          <p className="text-[11px] text-smoke">New puzzles in {nextIn}</p>
        </div>
      </div>
    </section>
  )
}
