import { format } from 'date-fns'
import { zoneOffsetLabel } from '../../lib/timezone'

// THE TIME, ON ONE CLOCK, AND IT IS THE READER'S.
//
// This used to print the reader's time with the HOST's underneath whenever the
// two disagreed. The reasoning was that a bare "18:00" is ambiguous between
// "converted for you" and "typed by somebody in London". The owner overruled
// it: "I think there's no need to show the host time, it could just be
// confusing, always keep everything synced with the local time."
//
// He is right, and the reason the first version was wrong is worth keeping. A
// second clock on every card is a permanent tax paid to answer a question that
// only arises when somebody travels - and it answers it badly, because it hands
// the reader two numbers and leaves them to work out which one applies. The
// ambiguity is real; a second line is not the fix for it.
//
// THE FIX IS TO SAY SOMETHING ONCE, WHEN IT CHANGES. Land in a new country and
// the calendar asks, once, which clock you want. See
// components/calendar/TimezonePrompt and lib/timezone.
//
// `zone` is the creator's EFFECTIVE zone: whatever they pinned in Settings, or
// the device's. With no zone passed it falls back to the browser's own
// rendering, which is what every other date on the platform does.
export default function EventTime({ at, zone, prefix = '', className = '' }) {
  const date = new Date(at)
  let time
  if (zone) {
    try {
      time = new Intl.DateTimeFormat('en-GB', {
        timeZone: zone, hour: '2-digit', minute: '2-digit', hour12: false,
      }).format(date)
    } catch {
      // An engine that has never heard of the zone must still print a time.
      time = format(date, 'HH:mm')
    }
  } else {
    time = format(date, 'HH:mm')
  }
  const label = zoneOffsetLabel(zone)
  return (
    <span className={className} title={zone ? `${time} in ${zone.split('/').pop().replace(/_/g, ' ')}` : undefined}>
      {prefix}{time}{label ? ` ${label}` : ''}
    </span>
  )
}
