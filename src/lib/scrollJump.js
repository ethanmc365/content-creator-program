// HOW FAR UP IS FAR ENOUGH TO OFFER A WAY BACK DOWN.
//
// Every message scroller had one number doing two jobs: `scrollHeight -
// scrollTop - clientHeight < 90` decided both "should new messages follow the
// reader down" and "should the jump-to-latest pill appear". Ninety pixels is
// about right for the first - it is roughly one line of chat, so nudging the
// list a fraction does not stop it tracking - and far too eager for the second.
// Ethan: "if you scroll up just one message it shouldn't immediately show up
// Jump to. It should only show up after scrolling past more than five
// messages." Scrolling back one message to re-read it is the single most common
// thing anybody does in a chat, and being handed a pill for it made the pill
// mean nothing.
//
// So the two decisions are separated. `atBottom` keeps its 90px and keeps
// driving the auto-follow. The pill gets this: the summed height of the last
// N message rows actually on screen.
//
// WHY MEASURE RATHER THAN PICK A BIGGER NUMBER. Message heights here vary by an
// order of magnitude - a "haha" is 40px, a photo is 380, a five-line paragraph
// with a link preview is more. Any fixed pixel threshold is "one message" in a
// room full of pictures and "twelve messages" in a room full of reactions. The
// rows are in the DOM and they can be measured, so the count means the same
// thing in every room.
//
// Rows opt in with `data-msg` (the id attribute is `msg-` in the room and `dm-`
// in a DM, and a selector that has to know which page it is on is a bug
// waiting to happen). A scroller with no marked rows - the first paint, an
// empty room - falls back to a sensible multiple of the old figure rather than
// returning 0, because a threshold of zero shows the pill instantly, which is
// exactly the behaviour being removed.

const FALLBACK_ROW_PX = 72

export function jumpThreshold(el, count = 5) {
  if (!el) return FALLBACK_ROW_PX * count
  const rows = el.querySelectorAll('[data-msg]')
  if (!rows.length) return FALLBACK_ROW_PX * count
  let total = 0
  // From the bottom up: the rows nearest the newest message are the ones you
  // scroll past first, so they are the ones the count is about.
  for (let i = rows.length - 1, seen = 0; i >= 0 && seen < count; i--, seen++) {
    total += rows[i].offsetHeight
  }
  // A room whose last five messages are all one-liners would put the pill at
  // ~200px, which is close enough to the old behaviour to feel unchanged. The
  // floor keeps "five short messages" meaningfully further than "one".
  return Math.max(total, FALLBACK_ROW_PX * Math.min(count, 3))
}

// Distance in pixels from the bottom of the scroller.
export function distanceFromBottom(el) {
  if (!el) return 0
  return el.scrollHeight - el.scrollTop - el.clientHeight
}
