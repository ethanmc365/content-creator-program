// OPENING A THREAD AT THE BOTTOM, ONCE, WITHOUT ANYBODY WATCHING IT GET THERE.
//
// Ethan, about every room and every DM: "there is still the weird lag when
// first opening a chat, for example it flashes, glitches and then shows the
// current chats, sometimes it's scrolled up a bit, its inconsistent, sometimes
// it jutters more. I think it could be with the elements loading in like
// messages, reactions, seen by etc, also like scrolling to the right place."
//
// He is right about the cause and it is worth stating precisely, because two
// previous attempts treated the symptom.
//
// A CHAT SCROLLER IS PINNED TO A HEIGHT THAT IS STILL CHANGING. The pin is
// `scrollTop = scrollHeight`, and `scrollHeight` on the first paint is wrong
// for as long as anything in the thread has not settled: an <img> with no
// dimensions is a zero-height box until it decodes, a link preview arrives from
// the network, a web font reflows every line of every message. Each one grows
// the document AFTER the pin, and each growth is a visible yank. Because the
// order they land in depends on the network, no two openings look the same -
// which is exactly "sometimes it jutters more".
//
// THE FIRST FIX IS UPSTREAM AND IT IS THE REAL ONE: attachments now record
// their own shape at upload (migration 163), so the box is reserved before the
// picture decodes and the scroll height is right immediately. This module is
// what handles the rest - legacy attachments with no stored shape, link
// previews, and fonts.
//
// TWO RULES:
//
//  1. PIN UNTIL IT STOPS MOVING, not on a fixed schedule. The old version fired
//     at 60, 200, 500 and 1200ms whatever was happening, so it was still
//     yanking a settled thread at 1.2 seconds and had given up on a slow one at
//     1.3. This watches `scrollHeight` and re-pins whenever it CHANGES, then
//     stops as soon as it has been stable for two consecutive frames.
//  2. NOTHING IS SHOWN UNTIL RULE 1 IS DONE. `settled` gates opacity only - the
//     thread is laid out and measured the whole time, which is what the pinning
//     needs - so what appears is already at the bottom and has never been
//     anywhere else.
//
// THE HARD CAP IS NOT OPTIONAL. A thread whose height genuinely never settles -
// a video still buffering, an image that will never arrive - must still be
// shown. 700ms, then it appears wherever it is, which is the old behaviour as a
// floor rather than as the plan.

const STABLE_FRAMES = 2
const MAX_MS = 700
// The fallback tick, for when rAF is not running. 16ms is a frame; a throttled
// tab will stretch it and hit the cap instead, which is the correct outcome
// there.
const TICK_MS = 16

/**
 * Pin a scroller to its bottom until its height stops changing.
 *
 * @param {() => HTMLElement|null} getEl   reads the scroller (a ref's current)
 * @param {() => boolean} shouldPin        false once the reader has scrolled up
 * @param {(settled: boolean) => void} onSettled  told once, when it is done
 * @returns {() => void} cancel
 */
export function pinToBottom(getEl, shouldPin, onSettled) {
  let stopped = false
  let stable = 0
  let lastHeight = -1
  let raf = 0
  let tick = 0

  const unschedule = () => {
    cancelAnimationFrame(raf)
    clearTimeout(tick)
  }

  // ARMED TWO WAYS, ON PURPOSE.
  //
  // `requestAnimationFrame` DOES NOT RUN in a background tab, in a hidden
  // preview pane, or under some automation - a trap this codebase has already
  // paid for twice (see the notes on `Reveal` and on the boot loader). A
  // pinning loop that only advances on rAF simply stops in those places, and
  // the thread is then left wherever the FIRST pin put it: measured at 53px
  // off the bottom in a hidden pane, which is exactly the "sometimes it's
  // scrolled up a bit" this whole module exists to remove.
  //
  // So each step arms an rAF and a timer, and whichever arrives first runs -
  // cancelling the other. Foreground gets frame-accurate pinning; anywhere
  // without rAF still converges, just on the timer.
  const schedule = () => {
    unschedule()
    const once = () => { unschedule(); step() }
    raf = requestAnimationFrame(once)
    tick = setTimeout(once, TICK_MS)
  }

  const finish = () => {
    if (stopped) return
    stopped = true
    unschedule()
    clearTimeout(cap)
    getEl()?.removeEventListener('load', onLoad, true)
    onSettled?.(true)
  }

  const step = () => {
    if (stopped) return
    const el = getEl()
    if (!el) { schedule(); return }
    const h = el.scrollHeight
    if (shouldPin()) el.scrollTop = h
    // Two ticks at the same height is "nothing is still arriving". One is not
    // enough: a layout that changes every other frame (a font swapping in, an
    // image decoding) would read as stable on the ticks it happened to match.
    stable = h === lastHeight ? stable + 1 : 0
    lastHeight = h
    if (stable >= STABLE_FRAMES) return finish()
    schedule()
  }

  // A capture-phase `load` catches EVERY descendant image and iframe, including
  // ones inserted seconds later by a link preview - `load` does not bubble, so
  // the capture phase is the only way to hear about them from up here.
  const onLoad = () => {
    stable = 0
    const el = getEl()
    if (el && shouldPin()) el.scrollTop = el.scrollHeight
  }

  const cap = setTimeout(finish, MAX_MS)
  getEl()?.addEventListener('load', onLoad, true)
  schedule()

  return () => {
    if (stopped) return
    stopped = true
    unschedule()
    clearTimeout(cap)
    getEl()?.removeEventListener('load', onLoad, true)
  }
}
