// THE FIELD YOU ARE TYPING IN IS NEVER UNDER THE KEYBOARD.
//
// Ethan, on a phone: "if I click to schedule a message and click to type in the
// search bar it works for general and shows the keyboard nicely with the
// message just above. But if I try typing the day or the time, it's covered by
// the keyboard, so that needs to be fixed - it should automatically appear just
// above the keyboard. This is the same when typing into other things like
// posting a game challenge, where the challenge title is slightly covered, and
// the same with creating a poll and typing in the options."
//
// THREE REPORTS, ONE FAULT, SO IT IS FIXED ONCE HERE. The chat composer already
// handles this - it is pinned to the visual viewport by `useKeyboardInset` -
// which is why the one field he named as working is the one field that had been
// specifically built for it. Every other input in the product is an ordinary
// field in an ordinary dialog, and the browser's own "scroll the focused
// element into view" is unreliable in exactly the case that matters:
//
//   * iOS often does not fire `visualViewport` `resize` when the keyboard
//     opens, so nothing knows the viewport shrank until something else happens;
//   * a `position: fixed` dialog is anchored to the LAYOUT viewport, which does
//     not shrink at all, so the browser has no page scroll to perform - the
//     field is inside a box the browser considers fully visible;
//   * and the scroll that would help is the DIALOG's own, which only the dialog
//     can perform.
//
// So this watches for a field being focused, waits for the keyboard to actually
// arrive, and if the field is below the visible area it scrolls the field's own
// scrollable ancestor until it is not. It is installed once, from AppLayout, and
// it costs nothing until somebody focuses something.

// How much clear air to leave under the field. Enough that the line below it -
// a validation message, the next field - is visible too, which is what makes it
// read as "above the keyboard" rather than "flush against it".
const MARGIN = 24

// The keyboard does not open on the frame the field is focused, and iOS in
// particular takes its time. These are re-checks, not a poll: each one is a
// cheap rect read that does nothing unless the field is actually covered.
const RECHECKS = [0, 80, 180, 300, 450, 650]

function isField(el) {
  if (!el) return false
  const tag = el.tagName
  if (tag === 'INPUT') {
    // A checkbox or a button does not open a keyboard, and scrolling to one
    // that somebody merely tabbed past would move the page under them.
    const type = (el.type || 'text').toLowerCase()
    return !['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'range', 'color'].includes(type)
  }
  return tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

/** The nearest ancestor that can actually scroll, or null. */
function scrollableAncestor(el) {
  let node = el?.parentElement
  while (node && node !== document.body) {
    const style = getComputedStyle(node)
    const scrolls = /(auto|scroll|overlay)/.test(`${style.overflowY} ${style.overflow}`)
    if (scrolls && node.scrollHeight > node.clientHeight + 1) return node
    node = node.parentElement
  }
  return null
}

/** The bottom of what the reader can actually see, in client coordinates. */
function visibleBottom() {
  const vv = window.visualViewport
  if (!vv) return window.innerHeight
  // `offsetTop` matters on iOS, where focusing a field scrolls the layout
  // viewport under the visual one.
  return vv.height + vv.offsetTop
}

// HOW TALL THE KEYBOARD IS, OR ZERO IF THERE IS NOT ONE.
//
// The layout viewport does not shrink when a software keyboard opens; the
// VISUAL one does. The difference between them is the keyboard. The 120px
// floor is there because a mobile browser's own collapsing address bar moves
// the two apart by forty or fifty pixels all by itself.
export function keyboardInset() {
  const vv = typeof window !== 'undefined' ? window.visualViewport : null
  if (!vv) return 0
  const raw = Math.round(window.innerHeight - vv.height)
  return raw > 120 ? raw : 0
}

// NOTHING IN THIS FILE RUNS WHEN THERE IS NO KEYBOARD (2 Sep 2026).
//
// THE BUG THIS FIXES. `revealFocusedField` asked "is the bottom of this field
// below the bottom of the visible area", which on a DESKTOP is a perfectly
// ordinary thing for a field to be - it just means the page is long. So
// focusing the guess box on Guess the Country scrolled a desktop page down to
// bring the box up, on every focus, and the field is re-focused after every
// guess. Ethan: "on desktop it should always be scrolled up to the very top,
// and it should never change that unless a person changes it. I don't know why
// after I type a word and press guess, it's moving down a bit."
//
// A desktop browser has no keyboard to hide behind, handles focus scrolling
// itself, and was never the reason this file exists. Measuring the inset is
// the honest test - better than a width query, because a small laptop window
// is not a phone and a large tablet with a keyboard up is.
function keyboardUp() {
  return keyboardInset() > 0
}

// WHAT HAS TO BE VISIBLE IS THE FIELD *AND ITS BUTTON*.
//
// Ethan, on Guess the Country on a phone: "if I'm scrolled up to the very top
// and then I click to type the country, the type bar and the guess button are
// hidden behind the keyboard."
//
// The old measurement was the input's own rect, so the input could be lifted
// to a pixel above the keys and the submit button directly underneath it stayed
// buried. A form is the natural group - the field and the button that sends it
// are the same control - so the whole form is what gets cleared, as long as it
// is small enough to fit in what is left of the screen. If it is not, the field
// alone is the target again: a tall form cannot be fully revealed and trying
// would push its head off the top.
function revealTarget(el, visibleHeight) {
  const group = el.closest('[data-kb-group], form')
  if (!group) return el
  const h = group.getBoundingClientRect().height
  return h > 0 && h <= visibleHeight - MARGIN * 2 ? group : el
}

/**
 * Bring the focused field above the keyboard, if it is not already.
 * Safe to call at any time; does nothing when nothing is covered, and nothing
 * at all when there is no software keyboard on the screen.
 */
export function revealFocusedField() {
  if (!keyboardUp()) return
  const el = document.activeElement
  if (!isField(el)) return

  const vv = window.visualViewport
  const top = vv ? vv.offsetTop : 0
  const bottom = visibleBottom()
  const rect = revealTarget(el, bottom - top).getBoundingClientRect()

  // How far it has to move. Positive means it is under the keyboard; negative
  // means the keyboard pushed the page far enough that the field went off the
  // TOP, which happens on a short screen with a tall keyboard and is just as
  // broken.
  let by = 0
  if (rect.bottom + MARGIN > bottom) by = rect.bottom + MARGIN - bottom
  else if (rect.top < top + MARGIN) by = rect.top - top - MARGIN
  // A pixel or two either way is the browser's rounding, not a fault. Chasing
  // those makes the page twitch on every viewport event.
  if (Math.abs(by) <= 2) return

  // EVERY MOVE IS INSTANT, and this is not a preference.
  //
  // `html { scroll-behavior: smooth }` is set platform-wide, so a bare
  // `scrollBy` animates for a few hundred milliseconds - which is the same
  // window the keyboard is animating in. The corrections then queue up and
  // cancel each other, and what a reader sees is the page sliding about under
  // their thumb while they type. Ethan, on Guess the Country: "it kind of
  // glitchy scrolls down a bit as I'm typing, which is weird - just fix it so
  // it properly snaps into place immediately." A correction is not a journey.
  const scroller = scrollableAncestor(el)
  if (scroller) {
    const before = scroller.scrollTop
    scroller.scrollTop = before + by
    const moved = scroller.scrollTop - before
    by -= moved
    if (Math.abs(by) <= 2) return
  }
  // Whatever the scroller could not give, the page gives. Measured against the
  // VISUAL viewport, which is the only thing that knows where the keyboard's
  // top edge is - `scrollIntoView` centres inside the LAYOUT viewport, which on
  // a phone still includes the strip the keyboard is covering.
  window.scrollBy({ top: by, left: 0, behavior: 'instant' })
}

/**
 * Install the watcher. Returns an uninstall function.
 * Idempotent per call site; AppLayout mounts exactly one.
 */
// THERE HAS TO BE SOMEWHERE TO SCROLL TO.
//
// THE SECOND HALF OF THE "HIDDEN BEHIND THE KEYBOARD" BUG, and the half no
// amount of measuring could have fixed. `window.scrollBy` can only move a page
// that has further to go. A short puzzle page is already at the bottom of its
// own document, so the correction was computed correctly, issued, and did
// nothing: the browser had no scroll left to give.
//
// A keyboard's worth of padding under the body while a keyboard is up gives the
// page exactly the room it needs and no more, and it is removed the moment the
// keyboard goes. It is set as a custom property rather than an inline style so
// that a surface which handles its own keyboard geometry (the chat overlay,
// which is `position: fixed` and locks the body) is unaffected either way.
function applyScrollRoom() {
  const px = keyboardInset()
  const root = document.documentElement
  if (px > 0) root.style.setProperty('--kb-room', `${px}px`)
  else root.style.removeProperty('--kb-room')
}

export function installKeyboardFollow() {
  if (typeof window === 'undefined') return () => {}
  let timers = []

  const clear = () => { timers.forEach(clearTimeout); timers = [] }
  const tick = () => { applyScrollRoom(); revealFocusedField() }
  const check = () => { clear(); timers = RECHECKS.map((t) => setTimeout(tick, t)) }

  const onFocusIn = (e) => { if (isField(e.target)) check() }
  const onFocusOut = () => { clear(); timers = [setTimeout(applyScrollRoom, 250)] }
  document.addEventListener('focusin', onFocusIn)
  document.addEventListener('focusout', onFocusOut)

  const vv = window.visualViewport
  // The keyboard arriving IS a viewport resize, and on the browsers that do
  // report it this is the accurate signal - the timers above are the fallback
  // for the ones that do not.
  if (vv) {
    vv.addEventListener('resize', tick)
    vv.addEventListener('scroll', revealFocusedField)
  }

  return () => {
    clear()
    document.documentElement.style.removeProperty('--kb-room')
    document.removeEventListener('focusin', onFocusIn)
    document.removeEventListener('focusout', onFocusOut)
    if (vv) {
      vv.removeEventListener('resize', tick)
      vv.removeEventListener('scroll', revealFocusedField)
    }
  }
}
