import { useCallback, useState } from 'react'
import { useLocation } from 'react-router-dom'

// STATE THAT COMES BACK WHEN YOU DO (20 Oct 2026). Tap a creator on a challenge's Entries tab, press Back, and the page
// used to remount on its default tab (the leaderboard, for a finished challenge) with the list cut back to its first
// page, so the scroll position had nothing to land on. A value kept here is stored against the HISTORY ENTRY (the
// router's location key): Back/Forward return to the same key and get the value again; a fresh visit is a new key and
// starts from the default. sessionStorage, so it dies with the tab and never leaks between visits.
const PREFIX = 'restore:'

function read(key, fallback) {
  try {
    const raw = sessionStorage.getItem(PREFIX + key)
    return raw == null ? fallback : JSON.parse(raw)
  } catch { return fallback }
}

export function useRestorableState(name, initial) {
  const { key: locKey } = useLocation()
  const key = `${locKey}:${name}`
  const [value, setValue] = useState(() => read(key, typeof initial === 'function' ? initial() : initial))
  const set = useCallback((next) => {
    setValue((prev) => {
      const v = typeof next === 'function' ? next(prev) : next
      try { sessionStorage.setItem(PREFIX + key, JSON.stringify(v)) } catch { /* private mode / full */ }
      return v
    })
  }, [key])
  return [value, set]
}
