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

// 3 Sep 2026: AND STILL WRONG, BECAUSE THE READER'S OWN SCROLL HANDLER WAS
// TURNING THE PIN OFF WHILE IT RAN.
//
// Ethan, again: "if I click on general it opens the page scrolled up rather
// than at the bottom. Even if I reload on that general page it still scrolls up
// again. It's the same with announcements, the same across every tab, and the
// same with DMs."
//
// Everything above is about the HEIGHT changing. This is about the second
// mechanism nobody accounted for: both chat surfaces keep an `atBottomRef` that
// their `onScroll` handler recomputes as `scrollHeight - scrollTop -
// clientHeight < 80`, and `pinToBottom` asks that same ref for permission
// before every correction (`shouldPin`).
//
// A scroll event is ASYNCHRONOUS. The pin writes `scrollTop = scrollHeight`;
// the browser clamps it and queues a scroll event for the next frame. If a
// photograph, a link preview or a font lands in that gap, the handler runs
// against a scroller that is now hundreds of pixels taller, computes a distance
// far greater than 80, and concludes THE READER SCROLLED UP. `atBottomRef` goes
// false, `shouldPin()` returns false for the rest of the room's life, and every
// remaining correction is skipped - so the thread is revealed exactly where the
// last growth left it.
//
// That is the whole report. It explains why it is worse in rooms with old
// photographs, why it differs between refreshes (the growth has to land inside
// one frame's window), why it happens on both surfaces, and why none of the
// height-watching work above could ever have fixed it: the loop was working
// perfectly and being told it was not wanted.
//
// THE FIX: while a pin is in flight the scroller carries `data-pinning`, and
// both handlers refuse to revise `atBottom` while it is set. The pin owns the
// scroller until it settles - which is at most MAX_MS, and during which the
// thread is not even visible - and the reader owns it forever after. Two
// mechanisms writing one value is what this file's own header calls "the
// jitter"; this is the same mistake one level up.

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

  // WHATEVER ELSE HAPPENS, THE THREAD IS AT THE BOTTOM WHEN IT IS REVEALED.
  //
  // 3 Sep 2026, and this is the last of it. Ethan: "the chat issue where the
  // chat doesn't open on the last message still persists."
  //
  // Everything above makes the loop converge. What nobody had covered is the
  // path where it DOES NOT: `cap` fires at MAX_MS and reveals the thread
  // wherever the last correction left it. That is rare on a desktop with warm
  // images and completely ordinary on a phone opening a room with photographs
  // in it over mobile data - the exact case being reported, and the reason it
  // was never reproducible on a laptop.
  //
  // So the reveal itself pins, one final time, unconditionally as far as the
  // loop is concerned. `shouldPin` is still honoured because a reader who has
  // deliberately scrolled up must not be yanked - but if they have not, the
  // frame the thread becomes visible in is a frame where it is at the bottom.
  // There is now no path through this function that reveals a thread anywhere
  // else.
  const finish = () => {
    if (stopped) return
    stopped = true
    unschedule()
    clearTimeout(cap)
    const el = getEl()
    if (el && shouldPin()) el.scrollTop = el.scrollHeight
    delete el?.dataset.pinning
    el?.removeEventListener('load', onLoad, true)
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
  // THE SCROLLER IS THE PIN'S UNTIL IT SETTLES. See the note above the
  // constants: without this the reader's own scroll handler mistakes a growth
  // spurt for a deliberate scroll-up and switches the pin off mid-flight.
  const el0 = getEl()
  if (el0) el0.dataset.pinning = '1'
  schedule()

  return () => {
    if (stopped) return
    stopped = true
    unschedule()
    clearTimeout(cap)
    delete getEl()?.dataset.pinning
    getEl()?.removeEventListener('load', onLoad, true)
  }
}

/**
 * Is a pin currently in flight on this scroller?
 *
 * Both chat surfaces call this from their `onScroll` before revising whatever
 * "the reader is at the bottom" ref they keep. A scroll event that arrives
 * while this is true was caused by the pin or by the content growing under it,
 * never by the reader - the thread is still at `opacity-0` at that point, so
 * there is nothing on screen to have scrolled.
 *
 * @param {HTMLElement|null} el
 */
export function isPinning(el) {
  return !!el && el.dataset.pinning === '1'
}

/**
 * KEEP A THREAD AT THE BOTTOM FOR AS LONG AS IT IS OPEN, not just while it is
 * arriving.
 *
 * 3 Sep 2026. `pinToBottom` converges and then stops, which was right while the
 * only things that grew a thread late were images and fonts. It is not right
 * any more: the market rooms now render live poll, game and resource cards, and
 * each of those fetches its own contents and grows from nothing to ~150px
 * whenever that returns - long after the loop has settled and gone.
 *
 * MEASURED, on the worldwide rooms: Announcements opened 104px from the bottom
 * and Content tips 53px, every time, while General - which has no cards in it -
 * opened at 1px. That is precisely the "chat doesn't open on the last message"
 * report, and it is now a regression I introduced by putting the real cards in
 * the rooms rather than a link to them.
 *
 * A chat should stick to the bottom whenever the reader is already there. That
 * is not a loading concern, it is what a chat IS, so this lives for as long as
 * the room does.
 *
 * THREE SIGNALS, because content grows in three different ways:
 *   MUTATION  a card renders its options - new nodes, no size change to observe
 *   RESIZE    the scroller itself changes (keyboard, rotation, toolbar)
 *   LOAD      an image or iframe decodes - no mutation, no scroller resize
 *
 * `shouldPin` is honoured throughout: a reader who has scrolled up to read
 * history is never yanked back down.
 *
 * @param {() => HTMLElement|null} getEl
 * @param {() => boolean} shouldPin
 * @returns {() => void} cancel
 */
export function stickToBottom(getEl, shouldPin) {
  const el = getEl()
  if (!el) return () => {}
  let last = el.scrollHeight

  const check = () => {
    const e = getEl()
    if (!e) return
    if (e.scrollHeight === last) return
    last = e.scrollHeight
    if (shouldPin()) e.scrollTop = e.scrollHeight
  }

  const mo = new MutationObserver(check)
  mo.observe(el, { childList: true, subtree: true, characterData: true })

  let ro = null
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(check)
    ro.observe(el)
  }

  // Capture, because `load` does not bubble - the same reason pinToBottom uses
  // it. This catches a photograph or an embed that decodes minutes later.
  el.addEventListener('load', check, true)

  return () => {
    mo.disconnect()
    ro?.disconnect()
    el.removeEventListener('load', check, true)
  }
}
