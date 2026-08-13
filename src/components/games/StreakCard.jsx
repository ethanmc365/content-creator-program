import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import Icon from '../Icon'
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

/** The last seven UK days, filled where the creator played. */
function WeekDots({ days = [], today }) {
  const played = new Set(days)
  const cells = []
  for (let i = 6; i >= 0; i--) {
    const day = today - i
    cells.push({ day, on: played.has(day), isToday: i === 0 })
  }
  const LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
  // The UK day index is days since the epoch; the epoch was a Thursday, so
  // `(day + 3) % 7` puts Monday at 0. Written out because getting it wrong is
  // silent - the dots still draw, they are just labelled with the wrong days.
  return (
    <div className="flex items-end gap-1.5">
      {cells.map(({ day, on, isToday }) => (
        <div key={day} className="flex flex-col items-center gap-1">
          <span
            title={on ? 'Played' : 'Missed'}
            className={cx(
              'h-6 w-6 rounded-lg transition-colors',
              on ? 'bg-brand' : 'bg-white/70 ring-1 ring-inset ring-black/5',
              isToday && !on && 'ring-2 ring-brand/40',
            )}
          />
          <span className={cx('text-[9px] font-semibold', isToday ? 'text-brand' : 'text-smoke')}>
            {LETTERS[((day % 7) + 3 + 7) % 7]}
          </span>
        </div>
      ))}
    </div>
  )
}

/** "1 September" - when the freezes come back. */
function nextResetLabel(now = new Date()) {
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  return next.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })
}

export default function StreakCard({ className, days = [], today = null }) {
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
  const used = 3 - left

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
          </div>
        </div>

        {today != null && (
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-white/75">This week</p>
            <WeekDots days={days} today={today} />
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
            {/* THE RESET IS THE PART THAT WAS MISSING. Somebody who has used all
                three needs to know they are getting three more, or the safety
                net reads as gone for good. */}
            {left === 3
              ? `Three streak freezes. If you miss a day, one is spent for you. They reset on ${nextResetLabel()}.`
              : `${left} of 3 freezes left this month${used ? `, ${used} already spent for you` : ''}. All three come back on ${nextResetLabel()}.`}
          </p>
        </div>
      </div>
    </section>
  )
}
