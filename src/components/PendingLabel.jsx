import { useEffect, useState } from 'react'
import { cx } from '../lib/utils'

// "Sending…" / "Waiting for signal", but only once it is worth saying.
//
// WHY IT WAITS.
//
// Every message goes through the outbox, so `pending` is true for the couple of
// hundred milliseconds a normal send takes. The label was therefore flashing up
// under every single message on a perfectly good connection, which is exactly
// the report: "it immediately flashes up waiting for signal, it shouldn't do
// this". Status text that appears when nothing is wrong is not reassurance, it
// is noise - and it trains you to stop reading the one that matters.
//
// So nothing is drawn for the first few seconds. A send that completes inside
// the grace period is silent, which is what a working send should be. One that
// does not gets the label, and by then it is true.
//
// A message that has already had a try come back empty (`tries > 0`) skips the
// wait: that one IS waiting for signal, it has the failed attempt to prove it,
// and hiding that for another four seconds would be the original lie in the
// other direction.

const GRACE_MS = 4000

export default function PendingLabel({ tries = 0, className, prefix = '' }) {
  const proven = tries > 0
  const [show, setShow] = useState(proven)

  useEffect(() => {
    if (proven) { setShow(true); return undefined }
    const t = setTimeout(() => setShow(true), GRACE_MS)
    return () => clearTimeout(t)
  }, [proven])

  if (!show) return null
  const text = proven ? 'Waiting for signal' : 'Sending…'
  return <span className={cx(className)}>{prefix}{text}</span>
}
