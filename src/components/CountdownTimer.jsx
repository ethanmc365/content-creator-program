import { useEffect, useState } from 'react'
import { challengeDeadline } from '../lib/utils'
import { cx } from '../lib/utils'
import { useT } from '../lib/i18n'

// Live countdown to a challenge deadline, updating every second.
// Shown prominently on the home page and challenge pages.
function getTimeLeft(endDate) {
  const diff = challengeDeadline(endDate) - new Date()
  if (diff <= 0) return null
  return {
    days: Math.floor(diff / 86400000),
    hours: Math.floor((diff % 86400000) / 3600000),
    minutes: Math.floor((diff % 3600000) / 60000),
    seconds: Math.floor((diff % 60000) / 1000),
  }
}

// Fixed-width digits so a tile never shifts or resizes as the numbers tick
// (e.g. seconds 41 -> 40). Poppins has no true tabular figures, so Tailwind's
// `tabular-nums` alone doesn't stop the wobble; giving each character an equal
// advance does. `ch` is the width of "0" in the current font/size, so every
// digit lines up perfectly.
function Digits({ value }) {
  return (
    // inline-flex so the two digit cells always sit on one line - on a narrow
    // phone tile the inline-blocks could otherwise wrap the number onto a second
    // row.
    <span className="inline-flex tabular-nums">
      {String(value).padStart(2, '0').split('').map((ch, i) => (
        <span key={i} className="inline-block w-[1ch] text-center">{ch}</span>
      ))}
    </span>
  )
}

export default function CountdownTimer({ endDate, compact = false, hero = false, onDark = false }) {
  const tr = useT()
  const [left, setLeft] = useState(() => getTimeLeft(endDate))

  useEffect(() => {
    const t = setInterval(() => setLeft(getTimeLeft(endDate)), 1000)
    return () => clearInterval(t)
  }, [endDate])

  if (!left) {
    // White pill so it stays readable on the orange challenge cards as well as
    // the light challenge-detail panel.
    return (
      <span className="inline-flex items-center rounded-xl bg-white/95 px-4 py-2 text-sm font-semibold text-ink shadow-card">
        {tr('Challenge closed')}
      </span>
    )
  }

  // THE PHONE GETS THE SAME CLOCK, NOT A SENTENCE.
  //
  // Ethan: "I don't like the way the time now shows just like normally. I think
  // it can still be how it is on desktop where it shows the five days, nine
  // hours, forty one minutes, and it should be in that nice style rather than
  // just writing it. But obviously it should be much smaller, kind of like how
  // the current size is."
  //
  // It was one line of text - "5d 9h 41m left" - which is the correct
  // information in the wrong voice: the desktop card treats the deadline as a
  // thing you look AT, and the phone treated it as a thing you read. Same
  // tiles, a third of the size.
  //
  // NO SECONDS. A ticking seconds cell on a card you scroll past is motion for
  // its own sake, and at this size the digit is too small to read anyway - it
  // just makes the tile flicker. Days, hours, minutes is the whole answer.
  //
  // AND NO "LEFT". Ethan: "I don't say left because it says closes in, so
  // there's no reason to say left." Every caller of this variant puts "Closes
  // in" directly above it.
  if (compact) {
    const small = [
      { label: 'Days', value: left.days },
      { label: 'Hrs', value: left.hours },
      { label: 'Min', value: left.minutes },
    ]
    return (
      <div
        className="grid w-full max-w-[16rem] grid-cols-3 gap-1.5"
        role="timer"
        aria-label={tr('{d} days {h} hours {m} minutes remaining', { d: left.days, h: left.hours, m: left.minutes })}
      >
        {small.map((c) => (
          <div
            key={c.label}
            className={cx(
              'flex min-w-0 flex-col items-center rounded-xl px-1 py-1.5',
              // On the orange card the tile is the white one the desktop
              // version uses, shrunk. On a white panel that would be invisible,
              // so it is a tinted chip with brand digits instead.
              onDark ? 'bg-white shadow-[0_4px_14px_rgba(0,0,0,0.14)]' : 'bg-brand-tint/60',
            )}
          >
            <span className={cx('text-base font-bold leading-none', onDark ? 'text-ink' : 'text-brand')}>
              <Digits value={c.value} />
            </span>
            <span className={cx('mt-0.5 text-[8px] font-semibold uppercase tracking-widest', onDark ? 'text-smoke' : 'text-brand/70')}>
              {tr(c.label)}
            </span>
          </div>
        ))}
      </div>
    )
  }

  const cells = [
    { label: 'Days', value: left.days },
    { label: 'Hours', value: left.hours },
    { label: 'Mins', value: left.minutes },
    { label: 'Secs', value: left.seconds },
  ]

  // Big, clean hero variant for the home page: larger tiles, brand-orange digits
  // on white, with the label tucked under each number. Reads clearly across the
  // whole card.
  if (hero) {
    return (
      <div
        className="grid w-full max-w-xl grid-cols-4 gap-2 sm:gap-3.5"
        role="timer"
        aria-label={tr('{d} days {h} hours {m} minutes remaining', { d: left.days, h: left.hours, m: left.minutes })}
      >
        {/* The digit size steps up with the breakpoint rather than jumping
            straight to 5xl at `sm`. A tile is only as wide as the column it is
            given, and on a card that also carries two buttons that column can
            be 88px: two 48px digits plus 32px of padding does not fit in it,
            which is what made this clock look broken. Padding shrinks with it
            for the same reason. */}
        {cells.map((c) => (
          <div key={c.label} className="flex min-w-0 flex-col items-center rounded-2xl bg-white px-1 py-3 shadow-[0_8px_24px_rgba(0,0,0,0.12)] sm:px-2 sm:py-5 lg:px-3">
            <span className="text-2xl font-bold leading-none text-ink sm:text-3xl lg:text-4xl xl:text-5xl">
              <Digits value={c.value} />
            </span>
            <span className="mt-1.5 text-[9px] font-semibold uppercase tracking-widest text-smoke sm:mt-2 sm:text-xs lg:text-sm">{tr(c.label)}</span>
          </div>
        ))}
      </div>
    )
  }

  return (
    // Cells shrink to fit narrow screens (flex-1, no fixed min-width) so the
    // timer never forces the parent card wider than the viewport on mobile.
    <div className="flex w-full max-w-xs gap-2 sm:max-w-none sm:gap-3" role="timer" aria-label={tr('{d} days {h} hours remaining', { d: left.days, h: left.hours })}>
      {cells.map((c) => (
        <div key={c.label} className="flex flex-1 flex-col items-center rounded-xl bg-white/90 px-1.5 py-2 shadow-card sm:min-w-[72px] sm:px-4">
          <span className="text-xl font-semibold text-ink sm:text-2xl"><Digits value={c.value} /></span>
          <span className="text-[10px] font-medium uppercase tracking-wide text-smoke">{tr(c.label)}</span>
        </div>
      ))}
    </div>
  )
}
