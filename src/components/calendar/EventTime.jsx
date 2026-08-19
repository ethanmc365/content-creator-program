import { eventClock } from '../../lib/eventTime'

// THE TIME, ON THE READER'S CLOCK, WITH THE HOST'S UNDERNEATH.
//
// See lib/eventTime for why. The short version: a bare "18:00" is ambiguous
// between "converted for you" and "typed by somebody in London", and the two
// readings are two hours apart for half the network.
//
// The second line appears ONLY when the two zones actually disagree at that
// instant, which is not the same as "the zones are different" - Lisbon and
// London agree all year round, and a duplicate line every time would train
// people to skip it on the day it matters.
export default function EventTime({ at, hostZone, prefix = '', className = '', stacked = true }) {
  const c = eventClock(at, hostZone)
  return (
    <span className={className} title={c.title}>
      <span>{prefix}{c.local}{c.localZone ? ` ${c.localZone}` : ''}</span>
      {c.host && (
        <span className={stacked ? 'block text-[11px] text-smoke' : 'ml-1.5 text-[11px] text-smoke'}>
          {c.host}{c.hostZone ? ` ${c.hostZone}` : ''} for the host
        </span>
      )}
    </span>
  )
}
