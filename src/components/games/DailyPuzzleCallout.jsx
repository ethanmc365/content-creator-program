import { Link } from 'react-router-dom'
import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import Icon from '../Icon'
import { untilNextUkMidnight } from '../../lib/daily'
import { useGameStreak } from '../../lib/gameStreak'
import { DAILY_PUZZLES, useDailyPuzzles } from '../../lib/dailyPuzzles'
import { cx } from '../../lib/utils'
import { StreakChip } from '../ui'
import { useT } from '../../lib/i18n'

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
// THE ICON TILE IS BACK, AND IT IS THE TILE THAT CARRIES "PLAYED".
//
// This has been argued round in a full circle and the screenshot settled it.
// The tile was removed here to save height on mobile, on the reasoning that a
// magnifying glass next to the words "Guess the Country" is decoration. That is
// true of the ICON and false of the TILE: a 36px square that goes from orange to
// green with a tick in it is the fastest read on the card, and with it gone the
// only signal was a small pill at the end of a line of text.
//
// Ethan, holding the UK home card next to this one: "I'm gonna share a
// screenshot of how the one that's currently on the UK community looks, I think
// it looks better... you can condense how the UK one looks slightly, still fit
// it in, and I think it will look much better. Keep the same structure like the
// icon shows green with the little tick whenever it's played."
//
// So this is `components/DailyGamesCard` - the UK card - laid out horizontally
// at every width, with the sizes taken in one notch: a 36px tile rather than 40,
// px-4 rather than px-5, and the count line at 11px. THE HUB IS NARROWER THAN
// THE UK HOME PAGE, by the width of the right rail, and that is the only reason
// the two files are not now identical.
//
// The old rule this replaces - "the button is the only thing that turns green",
// which came from Ethan objecting to a green RING appearing around the orange
// tile - is not contradicted by any of this. A ring around an orange tile is a
// decoration on an unchanged thing; a tile that becomes green and holds a tick
// is the state itself, drawn once. The card behind them stays white either way,
// which is what that rule was really protecting.
//
// NO MOTION IMPORT. The hub is eagerly routed; entrance animation is the page's
// own `Reveal`, which is CSS-only for exactly this reason. What motion the card
// does have is CSS: the tile grows and the button slides on hover, and the
// dividers are borders rather than gaps so the three read as one surface.

function PuzzleColumn({ puzzle, done, count, first }) {
  const tr = useT()
  return (
    <Link
      to={`/game?daily=${puzzle.key}`}
      className={cx(
        // ONE ROW SHAPE AT EVERY WIDTH. It used to be a row below `sm` and a
        // centred stack above it, which meant the thing being looked at on a
        // laptop was not the thing that had been tuned on a phone. A row works
        // at both: tile, then name and count, then the button hard right.
        'group flex items-center gap-3 px-4 py-3.5 transition-colors duration-200 hover:bg-cloud/50',
        !first && 'border-t border-gray-50 sm:border-l sm:border-t-0',
      )}
    >
      {/* 36px, not the UK card's 40. Three of these plus their buttons have to
          sit inside a hub column that is a rail narrower than the UK home page,
          and the tile is the one element with slack in it. */}
      <span
        className={cx(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white transition-transform duration-200 group-hover:scale-110',
          done ? 'bg-green-600' : 'bg-brand',
        )}
      >
        <Icon name={done ? 'check' : puzzle.icon} className="h-5 w-5" strokeWidth={2.2} />
      </span>

      <span className="min-w-0 flex-1">
        {/* `truncate`, unlike the stacked version, because a name that wraps to
            two lines makes this row taller than the two beside it and the three
            stop reading as one strip. At this width all three fit. */}
        <span className="block truncate text-sm font-semibold leading-tight text-ink">{puzzle.title}</span>
        <span className="mt-0.5 block truncate text-[11px] leading-tight text-smoke">
          {/* The count is the point, so it wins the line whenever there is one.
              "Nobody yet" is not a discouragement here, it is an opening.
              `counts` is null until the query lands and an OBJECT afterwards - a
              puzzle nobody has played is ABSENT from the tally, not zero in it,
              so this has to separate null from 0 or "nobody yet" and "still
              loading" become the same thing and the tagline never leaves. */}
          {count == null || count === 0 ? puzzle.short : `${count} played today`}
        </span>
      </span>

      <span
        className={cx(
          'flex shrink-0 items-center justify-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold transition-all duration-200',
          done
            ? 'bg-green-50 text-green-700 ring-1 ring-inset ring-green-500/30'
            : 'bg-brand text-white shadow-card group-hover:scale-105',
        )}
      >
        {done ? (
          <>
            <Icon name="check" className="h-3.5 w-3.5" />
            {tr("Played")}
          </>
        ) : 'Play'}
      </span>
    </Link>
  )
}

export default function DailyPuzzleCallout({ className }) {
  const { user } = useAuth()
  // Read once on mount: this is a countdown to the top of the day, not a clock,
  // and re-rendering the hub every minute to move it is not worth a frame.
  const [nextIn] = useState(() => untilNextUkMidnight(Date.now()))
  const { played, counts } = useDailyPuzzles(user?.id)
  // THE SAME STREAK THE GAMES PAGE SHOWS. This used to be
  // `dailyStreak(streakDays)` - the daily puzzles only, client-side, no freezes
  // - which is why the pill said 8 while the games page said 36 on the same
  // afternoon. See lib/gameStreak.
  const { streak } = useGameStreak()
  const doneCount = DAILY_PUZZLES.filter((p) => played.has(p.key)).length
  const allDone = doneCount === DAILY_PUZZLES.length

  return (
    <section className={className}>
      {/* "TODAY'S PUZZLES", NOT "DAILY PUZZLES", and the streak pill sits on the
          heading rather than off on its own. Both are the UK card's, and the
          reason to copy them is that this is the same section: two names for one
          thing across two surfaces of one product is how a platform starts
          feeling like two products.
          THE PILL IS THE SHARED `StreakChip` NOW. This file had its own copy -
          same idea, same lit flame, but "8 day streak" against the UK card's
          "8 days", and 10px against 11px. Two near-identical chips is one chip
          that will drift again, so there is one. */}
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Icon name="joystick" className="h-5 w-5 shrink-0 text-brand" />
          Today&rsquo;s puzzles
          {streak > 0 && <StreakChip n={streak} title={`${streak}-day streak`} />}
        </h2>
        <Link to="/game" className="shrink-0 text-sm font-medium text-brand hover:underline">All games &rarr;</Link>
      </div>

      {/* `counts` is null until the query lands and an OBJECT afterwards. A
          puzzle nobody has played is absent from the tally, not zero in it, so
          reading it as `counts?.[key] ?? null` made "nobody yet"
          indistinguishable from "still loading" and the column would keep
          showing its tagline for ever. */}
      <div className="card !p-0 overflow-hidden">
        <div className="grid grid-cols-1 items-stretch sm:grid-cols-3">
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
