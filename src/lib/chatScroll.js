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
// shown. 1200ms, then it appears wherever it is, which is the old behaviour as
// a floor rather than as the plan.
//
// 2 Sep 2026: STILL WRONG ON THE ROOMS WITH OLD PHOTOGRAPHS IN THEM, and the
// reason is worth writing down because rule 1 above hides it. Ethan: "on
// desktop, if I'm on general and I refresh, rather than showing the last
// messages it starts scrolled up to the message above the photo I sent. Refresh
// again and it's the same, again and it goes up even more, again and it's back
// where it was."
//
// A zero-height <img> IS A STABLE HEIGHT. The loop asks "has scrollHeight
// stopped changing", and an attachment that has not started decoding answers
// yes - so the thread was declared settled, revealed, and then shoved by
// however many pictures happened to land afterwards, in whatever order the
// network and the disk cache chose. That is the "different every refresh".
//
// Two things fix it, and both were needed:
//   * the eight legacy room attachments had their real dimensions measured and
//     written (they predate migration 163, so they carried none), so the box is
//     reserved before the bytes arrive;
//   * and `waitingOnMedia` below makes "not started" different from "finished",
//     for anything near the bottom, so the reveal cannot happen while a picture
//     the reader is about to see is still coming.

const STABLE_FRAMES = 2
// 1200ms, up from 700. The cap is the floor of the promise, not the plan, and
// 700 was landing INSIDE the window a legacy attachment needs to decode - so a
// thread with one older photograph in it revealed itself, then got yanked when
// the picture arrived. Which is exactly the report this module was written for,
// still happening, on the messages that predate migration 163.
const MAX_MS = 1200
// The fallback tick, for when rAF is not running. 16ms is a frame; a throttled
// tab will stretch it and hit the cap instead, which is the correct outcome
// there.
const TICK_MS = 16

// IS SOMETHING NEAR THE BOTTOM STILL DECODING?
//
// Only near the bottom, and this is the whole subtlety: the thread is
// `loading="lazy"`, so a photograph two hundred messages up may never load at
// all, and waiting on every <img> in the scroller would mean waiting for the
// cap every single time. What matters is what is about to be ON SCREEN when the
// thread is revealed, so the question is asked of the images within a screen or
// so of the viewport - the ones whose arrival would move what you are looking
// at.
const NEAR_PX = 600

function waitingOnMedia(el) {
  const view = el.getBoundingClientRect()
  const imgs = el.querySelectorAll('img')
  for (const img of imgs) {
    if (img.complete) continue
    const r = img.getBoundingClientRect()
    // A zero-height box has no meaningful top or bottom yet, which is exactly
    // the case this exists for - so an unsized image inside the scroller's own
    // vertical span counts, however thin it currently is.
    if (r.bottom >= view.top - NEAR_PX && r.top <= view.bottom + NEAR_PX) return true
  }
  return false
}

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
    // A HEIGHT THAT HAS NOT MOVED YET IS NOT THE SAME AS A HEIGHT THAT IS
    // FINISHED. An <img> with no reserved box sits at zero height for as long
    // as its bytes take, and zero is a perfectly stable number - so the loop
    // read "settled", revealed the thread, and then the picture landed and
    // shoved it. Anything still decoding near the bottom holds it open.
    if (waitingOnMedia(el)) stable = 0
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
