import { useEffect, useState } from 'react'
import { challengeDeadline } from '../lib/utils'

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
    <span className="tabular-nums">
      {String(value).padStart(2, '0').split('').map((ch, i) => (
        <span key={i} className="inline-block w-[1ch] text-center">{ch}</span>
      ))}
    </span>
  )
}

export default function CountdownTimer({ endDate, compact = false, hero = false }) {
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
        Challenge closed
      </span>
    )
  }

  if (compact) {
    return (
      <span className="text-sm font-semibold text-brand">
        {left.days}d {left.hours}h {left.minutes}m left
      </span>
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
        className="grid w-full max-w-2xl grid-cols-4 gap-3 sm:gap-4"
        role="timer"
        aria-label={`${left.days} days ${left.hours} hours ${left.minutes} minutes remaining`}
      >
        {cells.map((c) => (
          <div key={c.label} className="flex flex-col items-center rounded-2xl bg-white px-3 py-4 shadow-[0_8px_24px_rgba(0,0,0,0.12)] sm:px-5 sm:py-6">
            <span className="text-4xl font-bold leading-none text-ink sm:text-6xl">
              <Digits value={c.value} />
            </span>
            <span className="mt-2 text-[10px] font-semibold uppercase tracking-widest text-smoke sm:text-sm">{c.label}</span>
          </div>
        ))}
      </div>
    )
  }

  return (
    // Cells shrink to fit narrow screens (flex-1, no fixed min-width) so the
    // timer never forces the parent card wider than the viewport on mobile.
    <div className="flex w-full max-w-xs gap-2 sm:max-w-none sm:gap-3" role="timer" aria-label={`${left.days} days ${left.hours} hours remaining`}>
      {cells.map((c) => (
        <div key={c.label} className="flex flex-1 flex-col items-center rounded-xl bg-white/90 px-1.5 py-2 shadow-card sm:min-w-[72px] sm:px-4">
          <span className="text-xl font-semibold text-ink sm:text-2xl"><Digits value={c.value} /></span>
          <span className="text-[10px] font-medium uppercase tracking-wide text-smoke">{c.label}</span>
        </div>
      ))}
    </div>
  )
}
