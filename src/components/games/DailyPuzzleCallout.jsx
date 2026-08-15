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

// THE ACTION LIVES ON THE RIGHT, AND IT LOOKS LIKE A BUTTON.
//
// Ethan: "I think move the play and played button to the right side of each
// card, just make the design better."
//
// What was there was a bare chevron in the right margin plus a "Played" pill
// wedged in beside the title, so the state was on the left, the affordance was
// on the right, and neither read as something to press. Now the right-hand end
// of every card is one control that says exactly what pressing it does: Play,
// or Played with a tick. The whole card is still the link - the button is a
// target, not the only one - which is why it is a span and not a nested button.
//
// The row also lost its tinted background. Three full-width gradient panels
// stacked up were the loudest thing on the hub, and the coloured icon tile plus
// the coloured button already carry the state twice over. White cards with a
// brand-tinted left edge is the same language as everything else on the page.
// GREEN IS THE STATE. ORANGE IS THE PLACE.
//
// Every element on a finished card used to turn green at once - border, icon
// tile and button - so three completed puzzles made a green block on a hub that
// is otherwise entirely white and Tryp orange, and the section read as
// belonging to some other product. Ethan: "it appears slightly too green, still
// need some tryp.com orange, perhaps for the card borders and just the buttons
// appear green."
//
// So green is now spent in exactly one place, the button, where it is doing
// real work: it is the only thing on the card that means "you have done this
// one". The border and the icon tile stay brand, which is what tells you at a
// glance that this is Tryp, and the finished card gets a STRONGER orange border
// rather than a different colour, so completion still reads from across the
// page without a second hue.
function PuzzleCard({ puzzle, done, count }) {
  return (
    <Link
      to={`/game?daily=${puzzle.key}`}
      className={cx(
        'group flex items-center gap-3.5 rounded-card border bg-white px-4 py-3.5 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift',
        done ? 'border-brand/35 hover:border-brand/70' : 'border-gray-100 hover:border-brand/50',
      )}
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand text-white shadow-card transition-transform duration-200 group-hover:scale-110">
        <Icon name={done ? 'check' : puzzle.icon} className="h-5 w-5" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-ink">{puzzle.title}</span>
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

      {/* Fixed width, so three cards have their buttons on the same vertical
          line. "Played" and "Play" are different lengths and a right-aligned
          pair of them would stagger down the column. */}
      <span
        className={cx(
          'flex w-[5.5rem] shrink-0 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold transition-all duration-200',
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
          {/* Nothing once they are all done, for the same reason the games
              page dropped its version of this line: three green Played buttons
              directly underneath already say so, and "New ones at midnight" is
              the app telling somebody who just finished to come back tomorrow,
              in the place the reason to stay should be. */}
          {doneCount < DAILY_PUZZLES.length && (
            <span className="text-xs text-smoke">{doneCount} of {DAILY_PUZZLES.length} done today</span>
          )}
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
