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
// THE FREEZE TILES CAME OFF AND WENT BACK ON, SMALLER (2 -> 3 Sep 2026)
//
// They were five large snowflake tiles plus a sentence explaining the monthly
// reset - the biggest block on a card about a streak, for a mechanic nobody
// operates. Ethan cut them: "remove the freezes, the five freezes thing down
// below."
//
// A day later: "the streak freezes is completely gone, which is weird. It
// should be back." Both readings are right, and they are about different
// things. The tiles were the wrong WEIGHT, not the wrong CONTENT - a safety net
// you cannot see is a safety net you do not trust, and with them gone the only
// place "am I still covered" got answered was the foot of a popup.
//
// So the block is back as a count and five small pips with the explanation in
// its tooltip, sitting third in the row after the week strip. See
// <StreakFreezes>. The MECHANIC never changed through any of this: five a
// month, spent automatically on the day they are needed, reset on the first.
//
// WHAT CHANGED IN THE REDESIGN
//
// It was a flat row of three numbers in a tinted box, which is a stat block. A
// streak is the thing that brings somebody back tomorrow, so it leads the page
// now: a big flame that actually burns, and the last seven days drawn as dots
// you can read at a glance.
//
// AND IT IS TWO ROWS NOW, AT EVERY WIDTH.
//
// It was a `flex-wrap` line of four blocks of wildly different heights, which
// at 375px wrapped into three ragged rows whose contents were all centred
// against each other - "Best ever" floating halfway up the block beside it,
// nothing sharing a baseline with anything. Ethan: "it's just still up and to
// the right beside 'this week'... improve the UI of that card."
//
// With the freezes gone there are exactly three things left, and they group
// cleanly: the RUN is the headline and takes its own row, and the two pieces of
// supporting evidence - the week you have had, and the best you have ever done -
// sit side by side underneath it on ONE shared baseline, with the same label
// treatment. That is the same shape on a phone and on a desktop, so there is
// one layout to look at rather than two that drift.

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

// WHAT IS PROTECTING THE RUN, AT THE SIZE IT DESERVES.
//
// Five freezes a month, spent automatically on the day they are needed, reset
// on the first. Nobody presses anything - which is exactly why this was cut on
// 2 Sep as "a safety net you never operate", and exactly why it had to come
// back: a net you cannot see is one you do not trust. "Am I still covered" is a
// real question and the only answer left was at the foot of a popup.
//
// What is different from the version that was removed is the WEIGHT. That one
// was five large tiles and a sentence explaining the monthly reset, and it was
// the biggest block on a card about a streak. This is a number and five pips.
// The explanation lives in the tooltip, where an explanation belongs.
//
// A SPENT PIP IS DRAWN, NOT MISSING. Three of five left has to look different
// from "there were only ever three", so the two spent ones stay as hollow
// outlines - the same promise the week strip makes about a frozen day.
function StreakFreezes({ left, tr }) {
  const total = FREEZES_PER_MONTH
  const remaining = Math.max(0, Math.min(total, left))
  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-white/75">
        {tr("Streak freezes")}
      </p>
      {/* THE WEEK STRIP'S TWIN. Same 24px tile, same 6px gap, same caption
          line underneath - see the note at the call site. A spent pip is drawn
          as a hollow outline rather than left out, because "three of five left"
          has to look different from "there were only ever three". */}
      <div
        className="flex items-end gap-1.5"
        title={tr("{n} of {total} left this month. A freeze is spent automatically on a day you miss, and they reset on the 1st.", { n: remaining, total })}
      >
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className="flex flex-col items-center gap-1">
            <span
              aria-hidden
              className={cx(
                'flex h-6 w-6 items-center justify-center rounded-lg transition-colors',
                i < remaining
                  ? 'bg-white text-sky-500 shadow-sm'
                  : 'text-white/30 ring-1 ring-inset ring-white/25',
              )}
            >
              <Icon name="snowflake" className="h-3.5 w-3.5" />
            </span>
            {/* The weekday letters' counterpart: it holds the block to the
                same height and marks which pips are still yours. */}
            <span className={cx('text-[9px] font-semibold', i < remaining ? 'text-white' : 'text-white/40')}>
              {i < remaining ? '\u2022' : '\u00b7'}
            </span>
          </span>
        ))}
      </div>
      <span className="sr-only">
        {tr("{n} of {total} streak freezes left this month", { n: remaining, total })}
      </span>
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

      {/* THE WHOLE CARD OPENS THE BOARD, AND NOW IT IS THE ONLY WAY IN.
          Ethan: "under the everyone's streaks, make that smaller or actually
          remove that completely, and just tapping on that card brings up
          everyone's streaks and the all-time best."

          THE LABELLED CHIP IN THE CORNER IS GONE. It said "Everyone's streaks"
          (half again as long in Spanish), it was absolutely positioned so
          nothing in the flow knew it was there, and every other block on the
          card had to reserve a corner it could not see - which is what the
          `pr-20` and `sm:pr-44` in here used to be for. Removing it removed
          that whole class of collision rather than tuning it again.

          A bare chevron is what is left: the smallest mark that still says
          "there is something behind this", with no label to translate, no pill
          to size and nothing for the content to dodge. The button itself is
          still a stretched one UNDER the content, so everything on top keeps
          its own clicks and the dead space between the flame and the week strip
          is part of the target. */}
      <button
        type="button"
        onClick={() => setBoardOpen(true)}
        aria-label={tr("See everyone's streaks")}
        className="absolute inset-0 z-0"
      />
      <Icon
        name="chevronRight"
        className="pointer-events-none absolute right-4 top-5 z-10 h-4 w-4 text-white/50"
      />

      {/* TWO ROWS: THE RUN, THEN THE EVIDENCE. See the note at the head of this
          file. `items-end` on the second row is what puts the week strip and the
          record on one baseline - they are different heights, and centring two
          different heights against each other is what made the old card read as
          "a bit off". */}
      <div className="pointer-events-none relative z-10 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
        {/* THE FLAME LEADS, AND IT IS THE STATE. See the note on <Flame>: lit
            when today is counted, embers when the run is alive but today is
            still to be earned, cold at zero. */}
        <div className="flex items-center gap-4 pr-8 sm:pr-0">
          <StreakFlame state={current === 0 ? 'cold' : (playedToday || frozenToday) ? 'lit' : 'ember'} />
          <div className="min-w-0">
            <p className="text-4xl font-bold leading-none tabular-nums sm:text-5xl">{current}</p>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-widest text-white/75">
              {current === 1 ? tr('day in a row') : tr('days in a row')}
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
                  ? tr('A freeze is holding today for you.')
                  : tr('Not counted today yet. Any travel game keeps it.')}
              </p>
            )}
            {today != null && current === 0 && (
              <p className="mt-1.5 text-[11px] font-medium text-white/85">
                {tr("Play any travel game today to start one.")}
              </p>
            )}
          </div>
        </div>

        {/* THE WEEK, THEN THE FREEZES, THEN THE RECORD (3 Sep 2026).

            Ethan: "I like how the travel games card looks on mobile, but on
            desktop it should be improved - streak freezes should be to the
            left and best ever streak to the right, they should be proportional
            and streak freeze should match the size and design of this week."

            THE THREE BLOCKS WERE THREE DIFFERENT OBJECTS. "This week" was seven
            24px tiles with a letter under each; the freezes were five 20px pips
            with nothing under them; "Best ever" was a number. Three different
            tile sizes and three different heights in one row, which is why the
            row read as assembled rather than designed.

            The freezes are the week strip's twin now: same 24px rounded tile,
            same 6px gap, same label above and same 9px caption line below, so
            the two blocks are the same height and sit on one baseline without
            anything being nudged. That also puts the two STRIPS next to each
            other and the two NUMBERS - the run on the left of the card, the
            record on the right - at the two ends, which is the order Ethan
            asked for and also the one that reads.

            MOBILE IS UNCHANGED IN WEIGHT because he said it is right: the week
            takes its own row and the other two share the one below it. */}
        <div className="flex flex-col gap-5 border-t border-white/15 pt-5 sm:flex-row sm:items-end sm:gap-8 sm:border-t-0 sm:pr-8 sm:pt-0">
          {today != null && (
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-white/75">
                {tr("This week")}
              </p>
              <WeekDots days={days} frozen={s.frozen_days || []} today={today} week={week} />
            </div>
          )}

          {/* `sm:contents` dissolves this wrapper on a wide card, so the two
              become direct items of the row and the desktop layout is genuinely
              one row of three rather than a row of two with a pair inside it. */}
          <div className="flex items-end justify-between gap-6 sm:contents">
            <StreakFreezes left={s.freezes_left ?? FREEZES_PER_MONTH} tr={tr} />

            {/* THE RECORD'S FLAME ALWAYS BURNS. Ethan: "the best ever streak
                should always have the animation, not just after you've played a
                game." It was an `ember` - the state meaning "alive but not
                counted today" - so the record's fire went quiet on any day you
                had not played, which reads as the record being provisional. It
                is not. Lit whenever there is one, cold only when there never
                was.

                It sits LAST and right-aligned on a desktop: it is the one thing
                in this row that is a fact about the past rather than about this
                week, so it belongs at the end. */}
            <div className="text-right sm:ml-auto">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-white/75">
                {tr("Best ever")}
              </p>
              <p className="flex h-6 items-center justify-end gap-1.5 text-xl font-bold leading-none tabular-nums">
                <Flame className="h-4 w-4" tone="warm" state={best > 0 ? 'lit' : 'cold'} sparks={best > 0} />
                {best}
              </p>
              {/* The same 9px caption line the other two blocks carry, so all
                  three are the same height and the baseline holds. */}
              <p className="mt-1 text-[9px] font-semibold text-white/55">
                {best === 1 ? tr('day') : tr('days')}
              </p>
            </div>
          </div>
        </div>
      </div>

      <StreakLeaderboard
        open={boardOpen}
        onClose={() => setBoardOpen(false)}
        myId={myId}
        freezesLeft={s.freezes_left}
      />

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
