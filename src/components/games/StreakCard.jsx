import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import Icon from '../Icon'
import { cx } from '../../lib/utils'

// Your streak, your best, and the freezes you have left.
//
// WHY BEST STREAK IS ON HERE AT ALL
//
// The old streak was computed on the fly and forgotten the moment it broke, so a
// forty-day run became a zero with nothing to show it ever happened. That is the
// mechanic that makes somebody stop playing rather than start again, because
// starting again means admitting the forty is gone. Keeping the record separate
// from the run means a broken streak costs you the run and nothing else.
//
// THE FREEZES ARE AUTOMATIC
//
// Three a month, spent on the day they are needed, reset on the first. A freeze
// you have to remember to spend is a freeze you find out about the day after you
// needed it. This card only reports what has already happened.
export default function StreakCard({ className }) {
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
  const used = (s.frozen_days || []).length

  return (
    <div className={cx(
      'flex flex-wrap items-center gap-x-8 gap-y-4 rounded-card border border-brand/25 bg-brand-tint/25 px-5 py-4',
      className,
    )}>
      <div className="flex items-center gap-3">
        {/* The flame only burns when there is a streak. A grey flame beside a
            zero is a reminder that you failed at something. */}
        <span className={cx(
          'flex h-11 w-11 items-center justify-center rounded-2xl',
          current > 0 ? 'bg-brand text-white' : 'bg-white text-gray-300',
        )}>
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden>
            <path d="M12 2.5c.5 2.6-.8 4-2 5.2-1.4 1.4-2.6 2.6-2.6 5A6.6 6.6 0 0 0 12 21.5a6.6 6.6 0 0 0 6.6-6.6c0-4-2.6-6-4-8.4-.5 1.3-1.3 2.1-2.2 2.6.4-2.3-.2-4.6-.4-6.6Z" />
          </svg>
        </span>
        <div>
          <p className="text-2xl font-bold leading-none tabular-nums">{current}</p>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-smoke">
            {current === 1 ? 'Day streak' : 'Day streak'}
          </p>
        </div>
      </div>

      <div>
        <p className="text-lg font-bold leading-none tabular-nums text-ink">{best}</p>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-smoke">Best ever</p>
      </div>

      <div className="min-w-0">
        <div className="flex items-center gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              title={i < left ? 'Freeze available' : 'Freeze used this month'}
              className={cx(
                'flex h-5 w-5 items-center justify-center rounded-md',
                i < left ? 'bg-white text-brand' : 'bg-white/40 text-gray-300',
              )}
            >
              <Icon name="snowflake" className="h-3 w-3" />
            </span>
          ))}
        </div>
        <p className="mt-1 text-[11px] text-smoke">
          {left === 3
            ? 'Three streak freezes this month'
            : `${left} of 3 freezes left${used ? ` · ${used} used so far` : ''}`}
        </p>
      </div>
    </div>
  )
}
