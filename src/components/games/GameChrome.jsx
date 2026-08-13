import { useEffect, useState } from 'react'
import Icon from '../Icon'
import { soundOn, setSoundOn } from '../../lib/gameSounds'
import { cx } from '../../lib/utils'

// ONE HEADER FOR EVERY GAME.
//
// Each mode had grown its own: the quiz round had a badge, three stacked stats
// and a hairline bar; Guess the language had a thick brand progress bar and
// nothing else; the two daily puzzles had neither. So five games that share a
// page looked like five games from five different products, and the one piece
// of chrome Ethan actually liked - the percentage bar on top of Say hello - was
// the one that existed in a single place.
//
// This is that bar, plus the three numbers worth knowing, plus the way out. Any
// mode built later gets it by importing it.
//
// THE BAR FILLS AS YOU ANSWER, NOT AS YOU ARRIVE. `done / total`, so finishing
// the last question fills it to the end. Measuring `index / total` leaves the
// bar a question short of the finish line at the moment you finish, which reads
// as the game losing count.

/** The sound toggle. Small, always in the same corner, remembered per device. */
export function SoundToggle({ className }) {
  const [on, setOn] = useState(() => soundOn())
  const flip = () => { const next = !on; setOn(next); setSoundOn(next) }
  return (
    <button
      type="button"
      onClick={flip}
      aria-pressed={on}
      aria-label={on ? 'Turn sound off' : 'Turn sound on'}
      title={on ? 'Sound on' : 'Sound off'}
      className={cx(
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors',
        on ? 'text-brand hover:bg-brand-tint' : 'text-gray-300 hover:bg-cloud hover:text-smoke',
        className,
      )}
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 5 6 9H3v6h3l5 4V5Z" />
        {on
          ? <><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M18.5 5.5a9 9 0 0 1 0 13" /></>
          : <path d="M16 9l5 6M21 9l-5 6" />}
      </svg>
    </button>
  )
}

/**
 * The round header.
 *
 * @param {string} title    what is being played
 * @param {number} done     questions answered
 * @param {number} total    questions in the round
 * @param {number} correct  how many were right
 * @param {string} time     already formatted, or null to hide the clock
 * @param {function} onQuit
 */
export default function GameChrome({ icon = 'joystick', title, done, total, correct, time, onQuit, children }) {
  const pct = total ? Math.round((done / total) * 100) : 0
  return (
    <div className="rounded-card border border-gray-100 bg-white px-4 py-3.5 shadow-card sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="flex min-w-0 items-center gap-2 text-sm font-semibold">
          <Icon name={icon} className="h-4 w-4 shrink-0 text-brand" />
          <span className="truncate">{title}</span>
        </p>
        <div className="flex items-center gap-4 sm:gap-6">
          <Stat label="Question" value={`${Math.min(done + 1, total)}/${total}`} />
          {time != null && <Stat label="Time" value={time} mono />}
          <Stat label="Correct" value={correct} brand />
          <SoundToggle />
          {onQuit && (
            <button onClick={onQuit} className="text-xs font-medium text-smoke transition-colors hover:text-brand">
              Quit
            </button>
          )}
        </div>
      </div>

      {/* THE BAR. Same height, same colour, same easing in every mode. */}
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-cloud">
        <div
          className="h-full rounded-full bg-gradient-to-r from-brand to-brand-light transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>

      {children}
    </div>
  )
}

function Stat({ label, value, brand, mono }) {
  return (
    <div className="text-center leading-tight">
      <span className="block text-[10px] font-medium uppercase tracking-wide text-smoke">{label}</span>
      <span className={cx('block text-sm font-semibold tabular-nums', brand ? 'text-brand' : 'text-ink', mono && 'font-mono')}>
        {value}
      </span>
    </div>
  )
}

// A FLASH OF COLOUR IS THE FASTEST FEEDBACK THERE IS.
//
// Ethan asked for the green and the red, and they matter more than the sound:
// a colour lands before you have finished reading the word next to it, and it
// works with the sound off. The whole card flashes, not just the answer, so it
// is unmissable on a phone where the answer might be under your thumb.
//
// `key` on the wrapper is what makes it re-run per question - a class that is
// already applied does not restart its own animation.
export function AnswerFlash({ state, children, className }) {
  return (
    <div
      className={cx(
        'rounded-card transition-colors duration-200',
        state === 'right' && 'animate-flash-right',
        state === 'wrong' && 'animate-flash-wrong',
        className,
      )}
    >
      {children}
    </div>
  )
}

/** Fire a sound once per answer, without the caller remembering to. */
export function useAnswerSound(answered, onRight, onWrong) {
  useEffect(() => {
    if (!answered) return
    if (answered.right) onRight?.()
    else onWrong?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answered])
}
