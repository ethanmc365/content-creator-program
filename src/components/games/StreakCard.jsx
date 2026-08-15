import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import Icon from '../Icon'
import { dailyStreak, weekOf } from '../../lib/daily'
import { DAILY_PUZZLES } from '../../lib/dailyPuzzles'
import { cx } from '../../lib/utils'

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
// Three a month, spent on the day they are needed, reset on the first of the
// month. Ethan's note was that the card never said the reset happens - so a
// creator who used all three in February had no way to know they were getting
// three more, which turns a safety net into a thing you have already lost. The
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
function WeekDots({ days = [], today, week }) {
  const played = new Set(days)
  return (
    <div className="flex items-end gap-1.5">
      {week.map((day) => {
        const on = played.has(day)
        const isToday = day === today
        const future = day > today
        return (
          <div key={day} className="flex flex-col items-center gap-1">
            <span
              title={on ? 'Played' : future ? 'Still to come' : isToday ? 'Not played yet today' : 'Missed'}
              className={cx(
                'flex h-6 w-6 items-center justify-center rounded-lg transition-colors',
                on
                  ? 'bg-white text-brand shadow-sm'
                  : future
                    ? 'bg-white/10 ring-1 ring-inset ring-white/20'
                    : 'bg-white/15 ring-1 ring-inset ring-white/25',
                isToday && !on && 'ring-2 ring-white/80',
              )}
            >
              {on && (
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M4 12l5 5L20 6" />
                </svg>
              )}
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

export default function StreakCard({ className, days = [], today = null, byPuzzle = null }) {
  const [s, setS] = useState(null)

  useEffect(() => {
    let alive = true
    supabase.rpc('my_game_streak').then(({ data }) => {
      if (alive) setS(Array.isArray(data) ? data[0] : data)
    })
    return () => { alive = false }
  }, [])

  if (!s) return null
  const current = s.current_streak || 0
  const best = s.best_streak || 0
  const left = s.freezes_left ?? 3
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
      <div className="relative flex flex-wrap items-center gap-x-8 gap-y-5">
        {/* THE FLAME. It only burns when there is something burning - a lit
            flame beside a zero is a lie, and a grey one is a reminder that you
            failed at something. At zero it is an invitation instead. */}
        <div className="flex items-center gap-4">
          <span className={cx(
            'flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl',
            current > 0 ? 'bg-white/20 text-white' : 'bg-white/10 text-white/50',
          )}>
            <svg viewBox="0 0 24 24" className={cx('h-8 w-8', current > 0 && 'animate-flicker')} fill="currentColor" aria-hidden>
              <path d="M12 2.5c.5 2.6-.8 4-2 5.2-1.4 1.4-2.6 2.6-2.6 5A6.6 6.6 0 0 0 12 21.5a6.6 6.6 0 0 0 6.6-6.6c0-4-2.6-6-4-8.4-.5 1.3-1.3 2.1-2.2 2.6.4-2.3-.2-4.6-.4-6.6Z" />
            </svg>
          </span>
          <div>
            <p className="text-4xl font-bold leading-none tabular-nums">{current}</p>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-widest text-white/75">
              {current === 1 ? 'day in a row' : 'days in a row'}
            </p>
            {/* THE NUMBER, DISAMBIGUATED. */}
            {today != null && current > 0 && (
              <p className="mt-1.5 flex items-center gap-1.5 text-[11px] font-medium text-white/85">
                <span className={cx('h-1.5 w-1.5 shrink-0 rounded-full', playedToday || frozenToday ? 'bg-white' : 'bg-white/40')} />
                {playedToday
                  ? 'Counted today. Safe until midnight tomorrow.'
                  : frozenToday
                    ? 'A freeze is holding today for you.'
                    : 'Not counted today yet. One puzzle keeps it.'}
              </p>
            )}
            {today != null && current === 0 && (
              <p className="mt-1.5 text-[11px] font-medium text-white/85">
                Play any one of today&rsquo;s three puzzles to start one.
              </p>
            )}
          </div>
        </div>

        {today != null && (
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-white/75">
              This week
            </p>
            <WeekDots days={days} today={today} week={week} />
          </div>
        )}

        <div>
          <p className="text-2xl font-bold leading-none tabular-nums">{best}</p>
          <p className="mt-1 text-[11px] font-semibold uppercase tracking-widest text-white/75">Best ever</p>
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                title={i < left ? 'Freeze available' : 'Freeze used this month'}
                className={cx(
                  'flex h-7 w-7 items-center justify-center rounded-lg transition-colors',
                  i < left ? 'bg-white text-brand' : 'bg-white/15 text-white/40',
                )}
              >
                <Icon name="snowflake" className="h-4 w-4" />
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
            {left} of 3 freezes left this month. Streak freezes reset monthly.
          </p>
        </div>
      </div>

      {/* ---- A RUN PER PUZZLE, UNDER THE RUN ACROSS ALL OF THEM ----
          Ethan: "streak should be counted separate for each daily puzzle but
          accumulated". Both are true at once and they are different facts. The
          big number above is the accumulated one and one puzzle a day keeps it,
          which is the promise that makes the habit startable. These three are
          the harder thing: turning up for the SAME puzzle every day. Somebody
          on a 40-day overall run who has never done Flight Path twice in a row
          should be able to see that, and until now the card averaged the two
          into one number that told them neither. */}
      {byPuzzle && (
        <div className="relative mt-5 border-t border-white/20 pt-4">
          <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-widest text-white/75">
            Each puzzle on its own
          </p>
          <div className="flex flex-wrap gap-2">
            {DAILY_PUZZLES.map((p) => {
              const run = dailyStreak(byPuzzle[p.key] || [], today ?? undefined)
              return (
                <span
                  key={p.key}
                  className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-xs"
                >
                  <Icon name={p.icon} className="h-3.5 w-3.5 shrink-0 text-white/80" />
                  <span className="font-medium text-white/90">{p.title}</span>
                  <span className={cx('font-bold tabular-nums', run > 0 ? 'text-white' : 'text-white/50')}>
                    {run > 0 ? `${run}d` : '—'}
                  </span>
                </span>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}
