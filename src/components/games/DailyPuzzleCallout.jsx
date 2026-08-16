import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import Icon from '../Icon'
import Flame from './Flame'
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
// THE CARD IS ORANGE. THE BUTTON IS THE ONLY THING THAT TURNS GREEN.
//
// This is the third pass at it and the rule is now absolute, because every
// softer version of it has been read as a colour change to the card. First the
// border, icon tile and button all went green together, which made three
// finished puzzles a green block on a hub that is otherwise white and Tryp
// orange. Then green was confined to the button but the border strengthened and
// the icon became a tick - so a played card still LOOKED like a different card,
// and with one played and two not the odd one out read as green. Ethan: "if I
// play one game, the entire game card turns to the green colour... the card
// should always be orange and after I play it just the play button should turn
// green."
//
// So nothing outside the button may vary with `done`. Same border, same hover,
// same brand tile, same puzzle icon, whether you have played it or not - which
// also means a row of three is one consistent set of cards at every stage of
// the day rather than three that drift apart as you work through them.
const CARD_CLS =
  'group flex items-center gap-3.5 rounded-card border border-brand/25 bg-white px-4 py-3.5 shadow-card ' +
  'transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/60 hover:shadow-lift'

function PuzzleCard({ puzzle, done, count }) {
  return (
    <Link to={`/game?daily=${puzzle.key}`} className={CARD_CLS}>
      {/* The puzzle's OWN icon, always. Swapping it for a tick was the other
          half of "the whole card changed": the tile is the card's identity, and
          an identity that changes when you finish is a different card. The tick
          lives on the button, next to the word that explains it. */}
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
