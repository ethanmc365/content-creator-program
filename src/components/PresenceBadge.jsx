import { useEffect, useState } from 'react'
import { isOnlineAt } from '../lib/presence'
import { timeAgo, formatDateTimeTz, cx } from '../lib/utils'

// WHO IS HERE RIGHT NOW, ON A PROFILE (11 Oct 2026). Ethan: "on the profiles I want to see the last online time, and a
// green dynamic dot on the profile icon if they're live right now."
//
// Both read `profiles.last_seen_at`, which the app beats every minute while a tab is visible (lib/presence, 5 minute
// window). A 30 second tick re-asks the question against the clock so a dot goes out by itself, with no database read.
function useNow(ms = 30000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

/** The pulsing green dot, pinned to the bottom-right of an avatar (the parent must be `relative`). */
export function OnlineDot({ lastSeenAt, className }) {
  const now = useNow()
  if (!isOnlineAt(lastSeenAt, now)) return null
  return (
    <span aria-label="Online now" title="Online now" className={cx('pointer-events-none absolute bottom-1.5 right-1.5 flex h-5 w-5 sm:bottom-2 sm:right-2', className)}>
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-60" />
      <span className="relative inline-flex h-5 w-5 rounded-full bg-green-500 ring-[3px] ring-white" />
    </span>
  )
}

/** "Online now" or "Last online 3 hours ago". */
export function LastOnline({ lastSeenAt, className }) {
  const now = useNow()
  if (isOnlineAt(lastSeenAt, now)) {
    return (
      <span className={cx('inline-flex items-center gap-1.5 text-xs font-semibold text-green-600', className)}>
        <span className="h-2 w-2 rounded-full bg-green-500" /> Online now
      </span>
    )
  }
  if (!lastSeenAt) return <span className={cx('text-xs text-gray-400', className)}>Has not opened the app yet</span>
  const ago = timeAgo(lastSeenAt).replace(/^about /, '').replace(/^almost /, '').replace(/^over /, '')
  return (
    <span title={formatDateTimeTz(lastSeenAt)} className={cx('text-xs text-smoke', className)}>
      Last online {ago}
    </span>
  )
}
