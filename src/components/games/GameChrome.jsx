import { useEffect, useRef, useState } from 'react'
import Icon from '../Icon'
import { soundOn, setSoundOn } from '../../lib/gameSounds'
import { cx } from '../../lib/utils'
import { useT } from '../../lib/i18n'

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
  // Settings has the same switch now, and both can be open at once. `storage`
  // covers other tabs; the custom event covers this one.
  useEffect(() => {
    const sync = () => setOn(soundOn())
    window.addEventListener('storage', sync)
    window.addEventListener('tryp-sound-pref', sync)
    return () => {
      window.removeEventListener('storage', sync)
      window.removeEventListener('tryp-sound-pref', sync)
    }
  }, [])
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
export default function GameChrome({ icon = 'joystick', title, tag, done, total, correct, time, onQuit, children }) {
  const tr = useT()
  const pct = total ? Math.round((done / total) * 100) : 0
  return (
    // TWO ROWS, AT EVERY WIDTH.
    //
    // Ethan, on Guess the language: "the volume button and quit seem really
    // squashed in there." They were: one row was carrying a title, three
    // numbers, an icon button and a text button, and on a phone the two
    // controls ended up as a 30px huddle in the corner with no space around
    // either. `flex-wrap` only made it worse - the row broke in a different
    // place depending on how long the title was, so the header changed shape
    // between games.
    //
    // So the row is split by what the things ARE. The top line is identity and
    // the way out; the second is the three numbers you glance at while playing.
    // Same shape on a phone and on a desktop, which is the other half of the
    // ask: "make sure it's consistent with the other puzzle games."
    <div className="rounded-card border border-gray-100 bg-white px-4 py-3 shadow-card sm:px-5 sm:py-3.5">
      <div className="flex items-center justify-between gap-3">
        {/* THE TITLE IS ALLOWED TO WRAP, NOT TRUNCATE. At 375px "Guess the
            language" plus a chip plus two controls came to an ellipsis, and a
            game whose name is cut off mid-word is worse than a header one line
            taller. `leading-tight` keeps that second line cheap. */}
        <p className="flex min-w-0 items-center gap-1.5 text-[13px] font-semibold leading-tight sm:gap-2 sm:text-sm">
          <Icon name={icon} className="h-4 w-4 shrink-0 text-brand" />
          <span className="min-w-0">{title}</span>
          {/* "DAILY", AS A CHIP. It used to be part of the title as
              "Guess the language · today", which Ethan called out - a middle dot
              and a lowercase word reads as a subtitle that got stuck on the end
              of a heading. The other two daily puzzles already wear a chip. */}
          {tag && (
            <span className="shrink-0 rounded-full bg-brand-tint px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand">
              {tag}
            </span>
          )}
        </p>
        <div className="flex shrink-0 items-center gap-1.5">
          <SoundToggle />
          {onQuit && (
            <button
              onClick={onQuit}
              className="rounded-full border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-smoke transition-colors hover:border-brand hover:text-brand"
            >
              Quit
            </button>
          )}
        </div>
      </div>

      <div className="mt-2.5 flex items-center gap-5 sm:gap-7">
        <Stat label={tr("Question")} value={`${Math.min(done + 1, total)}/${total}`} />
        {time != null && <Stat label={tr("Time")} value={time} mono />}
        <Stat label={tr("Correct")} value={correct} brand />
      </div>

      {/* THE BAR. Same height, same colour, same easing in every mode. */}
      <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-cloud">
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

/**
 * Fire a sound once per answer, without the caller remembering to.
 *
 * IT ALSO COUNTS THE RUN. `onRight` is handed how many you have got right in a
 * row INCLUDING this one, and `playCorrect` transposes itself up by that much -
 * so a streak is something you hear building rather than something you would
 * have to be watching the Correct counter to notice. A wrong answer resets it
 * to zero, which is the whole point: the drop back to the root note is the
 * feedback, and it costs no extra sound to say it.
 *
 * The counter is a REF. It is not rendered, it must survive a re-render without
 * restarting, and putting it in state would re-run the effect that reads it.
 */
export function useAnswerSound(answered, onRight, onWrong) {
  const runRef = useRef(0)
  useEffect(() => {
    if (!answered) return
    if (answered.right) { runRef.current += 1; onRight?.(runRef.current) }
    else { runRef.current = 0; onWrong?.() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answered])
}
