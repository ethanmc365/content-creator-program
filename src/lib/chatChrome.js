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
const listeners = new Set()

export function setChatChromeHidden(next) {
  if (hidden === next) return
  hidden = next
  for (const fn of listeners) fn(hidden)
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
