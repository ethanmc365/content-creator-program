import { useEffect, useState } from 'react'

// THE APP HEADER, GOT OUT OF THE WAY WHILE YOU ARE READING A CONVERSATION.
//
// A phone showing a chat spends 64px on a logo, a search button, a bell and an
// avatar - none of which you are using while you read - on top of a tab strip,
// a message list and a composer. Ethan: "the sticky header showing the Tryp.com
// logo, notification icon and profile picture can temporarily disappear to give
// more room for reading texts... tapping near the top should smoothly bring
// back the header, and scrolling through the chat or typing a message should
// put it away again."
//
// So the room asks for it, the shell obeys, and nothing else in the app knows
// this exists. Same module-level channel as lib/chatSearch, for the same
// reason: threading a setter from a route three levels down through the layout
// would put chat plumbing into the shell every other page pays for.
//
// IT IS ALWAYS RELEASED ON THE WAY OUT. A header hidden by a screen you have
// left is a header nobody can get back.

let hidden = false
let lastFlip = 0
const listeners = new Set()

export function setChatChromeHidden(next) {
  if (hidden === next) return
  hidden = next
  lastFlip = Date.now()
  for (const fn of listeners) fn(hidden)
}

// ONLY A SCROLL THE READER MADE MAY MOVE THE HEADER (1 Oct 2026).
//
// Ethan, on a phone: "whenever I click to translate a message, the screen
// started shaking super fast and didn't stop." It was a loop between two
// correct pieces of code. On a short thread with the header away, the
// translation adds a line, so the thread can now scroll by a few pixels and the
// bottom-pin scrolls it there. The scroll handler sees `scrollTop < 12` and
// brings the header back, which takes 64px off the box; the pin follows the
// bottom down, `scrollTop` passes 12, the header goes away again, the box grows
// back, `scrollTop` clamps under 12 ... for ever, a few times a frame.
//
// Any growth near the end of a short thread could start it (a photo decoding, a
// reaction row); translating was simply the commonest. The cure is the rule the
// feature always meant: the header follows the READER, so a scroll caused by
// the app (a pin, a clamp, content growing) never moves it. A reader's scroll
// is one that follows a touch drag, a wheel or a key within a moment.
// `flipGuard` is the second lock: whatever the cause, the header cannot change
// its mind faster than a person can, so no loop can ever form again.
let gestureUntil = 0
export function noteReaderGesture() { gestureUntil = Date.now() + 1200 }
export const chromeGestureHandlers = {
  onTouchMove: noteReaderGesture,
  onWheel: noteReaderGesture,
  onKeyDown: noteReaderGesture,
}
export function readerMovedChrome() {
  return Date.now() < gestureUntil && Date.now() - lastFlip > 350
}

export function useChatChromeHidden() {
  const [h, setH] = useState(hidden)
  useEffect(() => {
    const fn = (v) => setH(v)
    listeners.add(fn)
    setH(hidden)
    return () => listeners.delete(fn)
  }, [])
  return h
}
