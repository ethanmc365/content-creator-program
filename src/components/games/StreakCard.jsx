import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import Icon from '../Icon'
import { weekOf } from '../../lib/daily'
import { FREEZES_PER_MONTH } from '../../lib/gameStreak'
import StreakLeaderboard from './StreakLeaderboard'
import { playFireWhoosh } from '../../lib/gameSounds'
import { cx } from '../../lib/utils'
import Flame from './Flame'
import { useT } from '../../lib/i18n'

// YOUR RUN, YOUR RECORD, AND WHAT IS PROTECTING IT.
//
// WHY BEST STREAK IS ON HERE AT ALL
//
// The old streak was computed on the fly and forgotten the moment it broke, so a
// forty-day run became a zero with nothing to show it ever happened. That is the
// mechanic that makes somebody stop playing rather than start again, because
// starting again means admitting the forty is gone. Keeping the record separate
// from the run means a broken streak costs you the run and nothing else.
//
// THE FREEZES ARE AUTOMATIC, AND THE CARD NOW SAYS SO
//
// FIVE a month, spent on the day they are needed, reset on the first of the
// month. Ethan's note was that the card never said the reset happens - so a
// creator who used them all in February had no way to know they were getting
// five more, which turns a safety net into a thing you have already lost. The
// line under the snowflakes says when they come back, in the words a person
// would use ("back on 1 September"), and the snowflakes themselves are drawn as
// spent or held rather than as a count you have to read.
//
// WHAT CHANGED IN THE REDESIGN
//
// It was a flat row of three numbers in a tinted box, which is a stat block. A
// streak is the thing that brings somebody back tomorrow, so it leads the page
// now: a big flame that actually burns, the last seven days drawn as dots you
// can read at a glance, and the record and the freezes as supporting detail
// rather than as equals.

const LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

// THE FLAME SAYS WHETHER TODAY IS IN THE BAG, AND IT SAYS IT IN COLOUR.
//
// It used to be one flame in one colour, with the actual answer written
// underneath it in eleven-pixel text ("Counted today. Safe until midnight
// tomorrow."). Ethan cut that line and asked for the flame to carry the state
// instead, which is the right way round: this is a badge you glance at, and a
// glance reads colour long before it reads a sentence.
//
//   LIT     today is counted (played, or a freeze is holding it).
//   EMBER   the run is alive but today is not counted yet.
//   COLD    no run at all. Flat, still, an invitation rather than a rebuke.
//
// THIS FILE USED TO DRAW ITS OWN FLAME AND THAT IS THE BUG THAT WAS HERE.
//
// components/games/Flame was rebuilt into a real fire - four temperatures,
// three tongues, four clocks that do not divide into one another - and every
// surface picked it up EXCEPT this one, because this file had a private
// `function Flame({ state })` of its own that shadowed the import. So the
// leaderboard chip, the puzzle callout and the hub pill all burned properly
// while the biggest flame on the platform, the one next to "36 days in a row",
// was still the old two-path drawing. Ethan: "beside where it says 36 days in a
// row, that little same streak icon and animation is still what it was, so you
// didn't improve it."
//
// The private copy is deleted. The shared component grew the two things it was
// missing - `state`, and a `warm` tone in white-through-amber, because this card
// is itself a brand-orange gradient and an orange flame on it is invisible - and
// there is now exactly one fire in the codebase.
//
// What stays here is the CHROME around the flame, which is this card's alone:
// the blurred halo behind it and the glass tile it sits in.

function StreakFlame({ state }) {
  const lit = state === 'lit'
  const ember = state === 'ember'
  return (
    <span className="relative flex h-20 w-20 shrink-0 items-center justify-center">
      {/* The halo. Behind the glass, so the flame keeps its edges. */}
      <span
        aria-hidden
        className={cx(
          'absolute inset-0 rounded-full blur-xl',
          lit && 'animate-flame-glow bg-amber-300/70',
          ember && 'animate-ember bg-white/20',
          !lit && !ember && 'bg-white/10',
        )}
      />
      <span
        className={cx(
          'relative flex h-16 w-16 items-center justify-center rounded-2xl ring-1 ring-inset transition-colors',
          lit ? 'bg-white/25 ring-white/40' : 'bg-white/10 ring-white/20',
        )}
      >
        <Flame className="h-10 w-10" tone="warm" state={state} sparks={lit} />
      </span>
    </span>
  )
}

// THIS WEEK, MONDAY TO SUNDAY, AND IT RESETS ON MONDAY.
//
// TWO THINGS WERE WRONG WITH THE OLD STRIP, and between them they made it
// impossible to answer the question a streak strip exists to answer.
//
//   1. IT WAS A ROLLING WINDOW, NOT A WEEK. It drew `today-6 … today` and
//      labelled the tiles with weekday letters, so on a Thursday the row began
//      on Friday and read F S S M T W T. Ethan asked whether it resets weekly -
//      it did not, and a strip headed "This week" that is not a week is worse
//      than no strip.
//   2. A PLAYED DAY WAS `bg-brand` ON A BRAND-ORANGE CARD. Orange on orange. The
//      filled tiles were very nearly invisible against the gradient, which is
//      most of why it was not clear whether anything had been counted at all.
//      A played day is a solid WHITE tile with the brand tick in it now: the
//      highest contrast available on this card, and unmistakably a "done".
//
// A day still to come is drawn faint and empty. Marking Saturday as "missed" on
// a Wednesday is a scolding for something nobody has had the chance to do yet.
// A FROZEN DAY IS NOT A BLANK DAY, AND THE STRIP NOW SHOWS THE DIFFERENCE.
//
// THE BUG THIS FIXES. The strip drew exactly two things: a white tick for a day
// you played, and an empty tile for everything else. A day that a freeze had
// silently rescued therefore looked identical to a day you simply missed - so a
// creator whose 30-day run was intact could look at a hole in their own week
// and reasonably conclude the run was broken and the number above was wrong.
// Ethan: "on the day I didn't, it should show that the freeze was used by
// showing the icon on that day."
//
// The freezes are spent automatically, so this is the ONLY place a creator ever
// finds out one was used at all. A snowflake on the day it covered is the whole
// explanation, in the place the question gets asked.
function WeekDots({ days = [], frozen = [], today, week }) {
  const played = new Set(days)
  const iced = new Set(frozen)
  return (
    <div className="flex items-end gap-1.5">
      {week.map((day) => {
        const on = played.has(day)
        // Played wins over frozen. A day you both played and (somehow) have a
        // freeze row for is a day you played.
        const froze = !on && iced.has(day)
        const isToday = day === today
        const future = day > today
        return (
          <div key={day} className="flex flex-col items-center gap-1">
            <span
              title={on ? 'Played' : froze ? 'A freeze covered this day' : future ? 'Still to come' : isToday ? 'Not played yet today' : 'Missed'}
              className={cx(
                'flex h-6 w-6 items-center justify-center rounded-lg transition-colors',
                on
                  ? 'bg-white text-brand shadow-sm'
                  // Frozen is drawn in the same COOL blue the freeze snowflakes
                  // below use, not in the white a played day gets: it kept the
                  // run alive, and it is not the same thing as having turned up.
                  : froze
                    ? 'bg-white text-sky-500 shadow-sm ring-1 ring-inset ring-sky-300'
                    : future
                      ? 'bg-white/10 ring-1 ring-inset ring-white/20'
                      : 'bg-white/15 ring-1 ring-inset ring-white/25',
                isToday && !on && !froze && 'ring-2 ring-white/80',
              )}
            >
              {on && (
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M4 12l5 5L20 6" />
                </svg>
              )}
              {froze && <Icon name="snowflake" className="h-3.5 w-3.5" />}
            </span>
            <span className={cx('text-[9px] font-semibold', isToday ? 'text-white' : 'text-white/55')}>
              {LETTERS[(((day % 7) + 3 + 7) % 7)]}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// THE FLAME MAKES A NOISE WHEN IT CATCHES.
//
// Ethan asked for "a fire flame whoosh sound when you play and gain a streak
// for the day, or if you already have a streak and just reopen travel games
// page later". So it fires on ARRIVAL with a live run, not only on the moment
// the run extends - reopening the page and hearing your streak is the point.
//
// The throttle is what keeps that from being a nuisance. Flicking between the
// games menu and a puzzle remounts this card repeatedly, and a fire noise on
// every remount is how sound gets switched off for good. Module scope, so it
// survives the remount that is the problem in the first place.
let lastFlareAt = -Infinity

export default function StreakCard({ className, days = [], today = null, myId = null }) {
  const tr = useT()
  const [s, setS] = useState(null)
  const [boardOpen, setBoardOpen] = useState(false)

  useEffect(() => {
    let alive = true
    supabase.rpc('my_game_streak').then(({ data }) => {
      if (alive) setS(Array.isArray(data) ? data[0] : data)
    })
    return () => { alive = false }
  }, [])

  // Only once the streak has actually loaded, and only when it is alight: a
  // flare for a run of zero would be celebrating nothing.
  const lit = !!s && (s.current_streak || 0) > 0
    && today != null && (days.includes(today) || (s.frozen_days || []).includes(today))
  useEffect(() => {
    if (!lit) return
    const now = typeof performance !== 'undefined' ? performance.now() : 0
    if (now - lastFlareAt < 90_000) return
    lastFlareAt = now
    playFireWhoosh()
  }, [lit])

  if (!s) return null
  const current = s.current_streak || 0
  const best = s.best_streak || 0
  const left = s.freezes_left ?? FREEZES_PER_MONTH
  const week = today != null ? weekOf(today) : []
  // HAS TODAY BEEN COUNTED YET, OR NOT.
  //
  // This is the single most important fact on the card and it was not on it.
  // The streak carries a one-day grace - today being unplayed does not end a
  // run until tomorrow does - which is kind, and which also means the number
  // says 30 whether you played this morning or not. Ethan: "it's not clear for
  // me if I have a 30 day streak or not, it appears I do but do I or not."
  // He was reading an ambiguous number correctly. The line under it now says
  // which of the two situations he is in, in words.
  const playedToday = today != null && days.includes(today)
  const frozenToday = today != null && (s.frozen_days || []).includes(today)

  return (
    <section
      className={cx(
        'relative overflow-hidden rounded-card bg-gradient-to-br from-brand to-brand-light p-5 text-white shadow-lift sm:p-6',
        className,
      )}
    >
      <div className="pointer-events-none absolute -right-14 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" />

      {/* THE WHOLE CARD OPENS THE BOARD.
          Ethan: "perhaps it shows up as a popup card when I click on the card at
          the top showing streak info." A stretched button UNDER the content
          rather than a wrapper around it, for the same reason the challenge
          board's cards work that way: everything on top keeps its own clicks,
          and the dead space between the flame and the snowflakes becomes the
          target. The visible affordance is the chip in the corner, because a
          card that is silently clickable is a card nobody clicks. */}
      <button
        type="button"
        onClick={() => setBoardOpen(true)}
        aria-label={tr("See everyone's streaks")}
        className="absolute inset-0 z-0"
      />
      <span className="pointer-events-none absolute right-4 top-4 z-10 hidden items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/90 sm:inline-flex">
        {tr("Everyone&rsquo;s streaks")}
        <Icon name="chevronRight" className="h-3 w-3" />
      </span>
      <div className="pointer-events-none relative z-10 flex flex-wrap items-center gap-x-8 gap-y-5">
        {/* THE FLAME LEADS, AND IT IS THE STATE. See the note on <Flame>: lit
            when today is counted, embers when the run is alive but today is
            still to be earned, cold at zero. */}
        <div className="flex items-center gap-4">
          <StreakFlame state={current === 0 ? 'cold' : (playedToday || frozenToday) ? 'lit' : 'ember'} />
          <div>
            <p className="text-4xl font-bold leading-none tabular-nums sm:text-5xl">{current}</p>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-widest text-white/75">
              {current === 1 ? 'day in a row' : 'days in a row'}
            </p>
            {/* ONLY THE LINE THAT ASKS FOR SOMETHING.
                "Counted today. Safe until midnight tomorrow." was cut at
                Ethan's request, and the flame above replaced it: a lit flame IS
                "counted today", and it says so without spending a line of the
                card confirming that nothing needs doing. The nudge stays,
                because that one is asking for a puzzle. */}
            {today != null && current > 0 && !playedToday && (
              <p className="mt-1.5 flex items-center gap-1.5 text-[11px] font-medium text-white/85">
                <span className={cx('h-1.5 w-1.5 shrink-0 rounded-full', frozenToday ? 'bg-sky-200' : 'bg-white/40')} />
                {frozenToday
                  ? 'A freeze is holding today for you.'
                  : 'Not counted today yet. One puzzle keeps it.'}
              </p>
            )}
            {today != null && current === 0 && (
              <p className="mt-1.5 text-[11px] font-medium text-white/85">
                {tr("Play any one of today&rsquo;s three puzzles to start one.")}
              </p>
            )}
          </div>
        </div>

        {today != null && (
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-white/75">
              {tr("This week")}
            </p>
            <WeekDots days={days} frozen={s.frozen_days || []} today={today} week={week} />
          </div>
        )}

        <div>
          <p className="text-2xl font-bold leading-none tabular-nums">{best}</p>
          <p className="mt-1 text-[11px] font-semibold uppercase tracking-widest text-white/75">{tr("Best ever")}</p>
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            {Array.from({ length: FREEZES_PER_MONTH }, (_, i) => i).map((i) => (
              <span
                key={i}
                title={i < left ? 'Freeze available' : 'Freeze used this month'}
                className={cx(
                  // h-7 rather than h-8: five tiles in the space three had.
                  'flex h-7 w-7 items-center justify-center rounded-lg transition-colors',
                  // BLUE, PROPERLY. Ethan: "the streak freeze icons should be a
                  // bit more prominently blue."
                  // An available freeze used to be a BRAND ORANGE snowflake on
                  // a white tile, which is the one colour on this card that
                  // does not mean cold - and on an orange card the tile read as
                  // a hole rather than as an object. A saturated sky-blue
                  // snowflake on white is the only genuinely cool thing on the
                  // whole card, which is exactly what a freeze should look
                  // like, and the ring stops it floating.
                  i < left
                    ? 'bg-white text-sky-500 shadow-sm ring-1 ring-inset ring-sky-300'
                    : 'bg-white/15 text-white/35',
                )}
              >
                <Icon name="snowflake" className="h-4 w-4" strokeWidth={2} />
              </span>
            ))}
          </div>
          <p className="mt-1.5 max-w-[16rem] text-[11px] leading-snug text-white/80">
            {/* TWO SHORT SENTENCES, AND THAT IS THE WHOLE STORY.
                It said "2 of 3 freezes left this month, 1 already spent for you.
                All three come back on 1 September." Ethan kept the first half
                and cut the rest, and he is right: the snowflakes above already
                draw which ones are spent, so the clause repeats them in words,
                and a specific date is more precision than "monthly" earns on a
                line nobody came here to read. */}
            {left} of {FREEZES_PER_MONTH} freezes left this month. Streak freezes reset monthly.
          </p>
        </div>
      </div>

      <StreakLeaderboard open={boardOpen} onClose={() => setBoardOpen(false)} myId={myId} />

      {/* THE PER-PUZZLE CHIPS ARE GONE.
          There was a row here reading "Guess the Country 3d · Flight Path 3d ·
          Guess the language 2d". Ethan removed it, and the reason is that the
          same three runs are already on the three daily cards directly below
          this one, as a badge on the card each run belongs to - which is both
          nearer to the thing it describes and one less row of small text on the
          card somebody actually opened this page to look at. */}
    </section>
  )
}
