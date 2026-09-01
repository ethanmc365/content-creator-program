import { useEffect, useState } from 'react'
import Icon from './Icon'
import { queuedFor, subscribeOutbox, retryQueued, dropQueued, flushOutbox } from '../lib/outbox'
import { useT } from '../lib/i18n'

// THE HONEST LINE ABOVE THE COMPOSER.
//
// The whole point of the outbox is that you can walk into a tunnel, type, press
// send and put the phone away. That only works if the app says so. Without this
// the message simply sits in the queue looking exactly like a message that has
// been delivered, which is a worse lie than the old red error was - at least
// the error was wrong out loud.
//
// It is deliberately quiet: no red, no alarm, brand tint and one line. Nothing
// has gone wrong. A message is waiting, the way a message in a tunnel should.
export default function OutboxNotice({ scope }) {
  const tr = useT()
  const [queued, setQueued] = useState(() => queuedFor(scope))
  // `navigator.onLine` is only trustworthy in one direction: false means there
  // is definitely nothing, true means very little. So it is used here for the
  // one honest sentence it can support - "you are offline, and that is fine" -
  // and never to decide whether to attempt a send.
  const [offline, setOffline] = useState(() => !navigator.onLine)

  // A SEND THAT IS ABOUT TO SUCCEED IS NOT "WAITING FOR SIGNAL".
  //
  // Every message goes through the outbox, so the queue is non-empty for the
  // 200ms a normal send takes - and the banner appeared for exactly that long,
  // on every single message, on a good connection. A warning that fires when
  // nothing is wrong is worse than no warning: it teaches you to ignore the one
  // time it matters.
  //
  // So an item has to have been sitting there for GRACE_MS before it counts.
  // `now` is STATE rather than a `Date.now()` in the render body: reading the
  // clock while rendering is impure, and the component has to re-render as time
  // passes anyway - without that a message queued at t=0 with nothing else
  // happening would never become visible at t=4s.
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    setQueued(queuedFor(scope))
    return subscribeOutbox(() => setQueued(queuedFor(scope)))
  }, [scope])

  useEffect(() => {
    if (queued.length === 0) return undefined
    setNow(Date.now())
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [queued.length])

  useEffect(() => {
    const on = () => setOffline(false)
    const off = () => setOffline(true)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  // A failed item is shown at once whatever its age - that one HAS gone wrong,
  // and it got there by exhausting its retries, which already took time.
  const GRACE_MS = 4000
  const slow = queued.filter((i) => i.failed || now - (i.createdAt || 0) > GRACE_MS)

  // Offline with an empty queue is still worth one line: it is the difference
  // between a composer that will hold what you write and a composer you are
  // about to type into for nothing.
  if (slow.length === 0) {
    if (!offline) return null
    return (
      <div className="mb-2 flex items-center gap-2 rounded-xl border border-brand/15 bg-brand-tint/60 px-3 py-2">
        <Icon name="clock" className="h-4 w-4 shrink-0 text-brand" />
        <p className="min-w-0 flex-1 text-xs text-ink">
          {tr("No connection.")} <span className="text-smoke">{tr("Write anyway. Anything you send waits here and goes out the moment you are back.")}</span>
        </p>
      </div>
    )
  }

  const failed = slow.filter((i) => i.failed)
  const waiting = slow.length - failed.length

  return (
    <div className="mb-2 space-y-1.5">
      {waiting > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-brand/15 bg-brand-tint/60 px-3 py-2">
          <Icon name="clock" className="h-4 w-4 shrink-0 text-brand" />
          <p className="min-w-0 flex-1 text-xs text-ink">
            {waiting === 1 ? 'Waiting for signal.' : `${waiting} messages waiting for signal.`}{' '}
            <span className="text-smoke">
              {waiting === 1 ? 'It sends by itself the moment you are back.' : 'They send by themselves the moment you are back.'}
            </span>
          </p>
          <button
            type="button"
            onClick={() => flushOutbox()}
            className="shrink-0 text-xs font-semibold text-brand underline"
          >
            Try now
          </button>
        </div>
      )}

      {failed.map((item) => (
        <div key={item.id} className="flex items-center gap-2 rounded-xl border border-brand/15 bg-white px-3 py-2">
          <Icon name="alert" className="h-4 w-4 shrink-0 text-brand" />
          <p className="min-w-0 flex-1 truncate text-xs text-ink">
            {tr("Still not sent:")} <span className="text-smoke">{item.display?.body?.trim() || 'your attachment'}</span>
          </p>
          <button type="button" onClick={() => retryQueued(item.id)} className="shrink-0 text-xs font-semibold text-brand underline">
            {tr("Retry")}
          </button>
          <button type="button" onClick={() => dropQueued(item.id)} className="shrink-0 text-xs font-semibold text-smoke underline">
            {tr("Discard")}
          </button>
        </div>
      ))}
    </div>
  )
}
