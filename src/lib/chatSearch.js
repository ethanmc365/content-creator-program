import { useEffect, useState } from 'react'

// THE HEADER'S SEARCH BUTTON, POINTED AT WHATEVER CHAT IS OPEN.
//
// WHY THIS EXISTS
//
// A room used to carry its own search field in a bar under the tab strip. On a
// 375px phone that bar was a permanent ~40px band saying the room's name (the
// tab above it is already highlighted) with a search box in it - so the one
// screen in the app whose entire job is showing messages spent a tenth of
// itself on chrome. Ethan: "it shouldn't show up the second bar below the tabs
// saying announcements or general with the search bar, this takes up too much
// space... instead when opened on a specific chat, the search bar at the top
// beside admin or notifications will be able to be used to search."
//
// The header lives in AppLayout and the search state lives in the room, three
// route levels down. Threading a setter through the layout would put chat
// plumbing into the shell that every page pays for, so the two talk through a
// tiny module-level channel instead - the same shape as lib/photoEvents.
//
// A room REGISTERS itself while it is open and deregisters on the way out, so
// the header's button only ever becomes a chat search when there is a chat to
// search. Everywhere else it opens the command palette exactly as before.

let target = null
const listeners = new Set()

function emit() {
  for (const fn of listeners) fn(target)
}

/**
 * Called by a chat while it is on screen.
 * @param {{label: string, value: string, onChange: (v: string) => void}} t
 * @returns an unsubscribe that clears the registration
 */
export function registerChatSearch(t) {
  target = t
  emit()
  return () => {
    // Only clear if we are still the registered one. Two chats can overlap for
    // a frame during a route change, and the OUTGOING one must not wipe the
    // incoming one's registration.
    if (target === t) { target = null; emit() }
  }
}

/** What the header should do with its search button right now. */
export function useChatSearchTarget() {
  const [t, setT] = useState(target)
  useEffect(() => {
    const fn = (next) => setT(next)
    listeners.add(fn)
    setT(target)
    return () => listeners.delete(fn)
  }, [])
  return t
}
