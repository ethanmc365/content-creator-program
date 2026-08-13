import { useEffect, useState } from 'react'
import { localTimeLine } from '../lib/localTime'
import { cx } from '../lib/utils'

// "3:41pm for them".
//
// The one thing you want to know before pressing Message, and the app already
// had every piece of it: a country code, and a longitude for anybody who set a
// town. See lib/localTime for how the zone is chosen.
//
// It ticks. A clock that is right when the page loads and wrong ten minutes
// later is worse than no clock, because you stop checking it. Thirty seconds is
// a cheap interval for a component that renders one string, and it means the
// minute rolls over roughly when it really does rather than up to a minute late.
//
// It renders NOTHING when the profile cannot be placed - see the note in
// localTime about the countries we refuse to guess at. A wrong time here would
// be read as a fact and acted on.
export default function LocalTime({ profile, className, showNote = true }) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(iv)
  }, [])

  const line = localTimeLine(profile, now)
  if (!line) return null

  const isSame = line.note === 'same time as you'

  return (
    <span
      className={cx('inline-flex items-center gap-1.5', className)}
      title={showNote && line.note ? `${line.zone} · ${line.note}` : line.zone}
    >
      <svg className="h-4 w-4 shrink-0 text-brand" fill="none" stroke="currentColor" strokeWidth="1.7" viewBox="0 0 24 24" aria-hidden>
        <circle cx="12" cy="12" r="8.5" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 7.5V12l3 1.75" />
      </svg>
      <span>
        <span className="font-medium text-ink">{line.time}</span>
        {isSame ? ' for them, same as you' : ' for them'}
      </span>
    </span>
  )
}
