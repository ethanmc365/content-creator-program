import { useEffect, useState } from 'react'

// Live countdown to a challenge deadline, updating every second.
// Shown prominently on the home page and challenge pages.
function getTimeLeft(endDate) {
  const diff = new Date(endDate) - new Date()
  if (diff <= 0) return null
  return {
    days: Math.floor(diff / 86400000),
    hours: Math.floor((diff % 86400000) / 3600000),
    minutes: Math.floor((diff % 3600000) / 60000),
    seconds: Math.floor((diff % 60000) / 1000),
  }
}

export default function CountdownTimer({ endDate, compact = false }) {
  const [left, setLeft] = useState(() => getTimeLeft(endDate))

  useEffect(() => {
    const t = setInterval(() => setLeft(getTimeLeft(endDate)), 1000)
    return () => clearInterval(t)
  }, [endDate])

  if (!left) {
    return <span className="text-sm font-medium text-smoke">Challenge closed</span>
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

  return (
    // Cells shrink to fit narrow screens (flex-1, no fixed min-width) so the
    // timer never forces the parent card wider than the viewport on mobile.
    <div className="flex w-full max-w-xs gap-2 sm:max-w-none sm:gap-3" role="timer" aria-label={`${left.days} days ${left.hours} hours remaining`}>
      {cells.map((c) => (
        <div key={c.label} className="flex flex-1 flex-col items-center rounded-xl bg-white/90 px-1.5 py-2 shadow-card sm:min-w-[64px] sm:px-3">
          <span className="text-xl font-bold tabular-nums text-ink sm:text-2xl">{String(c.value).padStart(2, '0')}</span>
          <span className="text-[10px] font-medium uppercase tracking-wide text-smoke">{c.label}</span>
        </div>
      ))}
    </div>
  )
}
