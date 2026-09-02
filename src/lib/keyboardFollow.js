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

/**
 * Bring the focused field above the keyboard, if it is not already.
 * Safe to call at any time; does nothing when nothing is covered.
 */
export function revealFocusedField() {
  const el = document.activeElement
  if (!isField(el)) return
  const rect = el.getBoundingClientRect()
  const bottom = visibleBottom()
  const over = rect.bottom + MARGIN - bottom
  if (over <= 0) return

  const scroller = scrollableAncestor(el)
  if (scroller) {
    // BEHAVIOUR IS EXPLICITLY INSTANT. `html { scroll-behavior: smooth }` is set
    // platform-wide, and a smooth programmatic scroll here loses a race with
    // the keyboard's own relayout - the same trap `scrollLock`'s restore paid
    // for, where a restore was starting a thousand-pixel animation towards a
    // position the relayout then moved. A correction is not a journey.
    scroller.scrollTop += over
    // The dialog may have had no room left to give; if so the page itself has
    // to move, which on a fixed dialog it will not - so fall through to
    // scrollIntoView, which walks every scrollable ancestor including the
    // document.
    const after = el.getBoundingClientRect()
    if (after.bottom + MARGIN <= bottom) return
  }
  el.scrollIntoView({ block: 'center', behavior: 'instant', inline: 'nearest' })
}

/**
 * Install the watcher. Returns an uninstall function.
 * Idempotent per call site; AppLayout mounts exactly one.
 */
export function installKeyboardFollow() {
  if (typeof window === 'undefined') return () => {}
  let timers = []

  const clear = () => { timers.forEach(clearTimeout); timers = [] }
  const check = () => { clear(); timers = RECHECKS.map((t) => setTimeout(revealFocusedField, t)) }

  const onFocusIn = (e) => { if (isField(e.target)) check() }
  document.addEventListener('focusin', onFocusIn)

  const vv = window.visualViewport
  // The keyboard arriving IS a viewport resize, and on the browsers that do
  // report it this is the accurate signal - the timers above are the fallback
  // for the ones that do not.
  if (vv) {
    vv.addEventListener('resize', revealFocusedField)
    vv.addEventListener('scroll', revealFocusedField)
  }

  return () => {
    clear()
    document.removeEventListener('focusin', onFocusIn)
    if (vv) {
      vv.removeEventListener('resize', revealFocusedField)
      vv.removeEventListener('scroll', revealFocusedField)
    }
  }
}
