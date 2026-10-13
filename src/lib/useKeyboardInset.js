import { useEffect, useState } from 'react'

// Tracks the on-screen (software) keyboard + visual viewport so the chat can be
// laid out WhatsApp-style on mobile: composer hugging the top of the keyboard,
// page chrome collapsing away, and the whole surface staying pinned to the
// visible area even on iOS (where focusing an input scrolls the page).
//
// Two iOS quirks this handles:
//  1. Opening the keyboard does NOT change the *layout* viewport
//     (`window.innerHeight`); it shrinks the *visual* viewport
//     (`visualViewport.height`). A `position: fixed` element is anchored to the
//     layout viewport, so it ends up mis-placed (floating mid-screen, behind the
//     keyboard). Countering that needs `translateY(offsetTop)` + sizing to
//     `visualViewport.height`.
//  2. iOS frequently does NOT fire `visualViewport` `resize` when the keyboard
//     opens - only a later `scroll` (e.g. the user scrolling) announces the new
//     size, which is why it looked broken until you scrolled. The metrics are
//     always readable though, so we (a) drive "keyboard open" off input focus so
//     chrome collapses instantly, and (b) POLL the metrics for ~1s after focus
//     changes to pick up the settled size without waiting for an event.
function isEditable(el) {
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable
}

function readViewport(focused) {
  const vv = typeof window !== 'undefined' ? window.visualViewport : null
  if (!vv) {
    const h = typeof window !== 'undefined' ? window.innerHeight : 0
    return { height: h, offsetTop: 0, keyboard: 0, focused: !!focused }
  }
  // Keyboard height is layout height minus visible height. It must NOT subtract
  // offsetTop: on iOS the page scrolls when the keyboard opens, so offsetTop
  // grows and subtracting it wrongly yields 0.
  //
  // BROWSER CHROME IS NOT A KEYBOARD, AND THAT IS WHY THE TAB BAR VANISHED
  // (4 Sep 2026). Ethan, starting the walkthrough on his phone: "the bar at
  // the bottom just completely disappeared - the worldwide, challenges, rooms,
  // DMs bar completely disappeared, so obviously I wasn't able to do it."
  //
  // On iOS Safari `window.innerHeight` measures the LAYOUT viewport, which
  // includes the strip behind the collapsing address bar and the strip behind
  // the bottom toolbar. `visualViewport.height` does not. So a page sitting
  // at the top of its scroll, with both toolbars expanded and nothing focused
  // anywhere, reports a shrink of 90-130px - and anything over 120 was being
  // called a keyboard. AppLayout hides the bottom tab bar on that signal, so
  // the five tabs slid off the screen with no keyboard within a mile of it.
  // It is intermittent because it depends on which toolbars are showing, which
  // depends on which way the page was last scrolled, which is why it happened
  // "one time" - the walkthrough's own `scrollIntoView` is a scroll.
  //
  // A KEYBOARD ONLY EXISTS WHERE SOMETHING IS BEING TYPED INTO. The focus
  // signal was already the primary one (it is instant, and iOS often never
  // fires the resize at all); requiring it here means a viewport shrink is
  // read as a keyboard only when there is a caret to justify it, and browser
  // chrome can never be mistaken for one again.
  const raw = Math.round(window.innerHeight - vv.height)
  const keyboard = focused && raw > 120 ? raw : 0
  if (keyboard) rememberKeyboard(keyboard)
  return {
    height: Math.round(vv.height),
    offsetTop: Math.round(vv.offsetTop),
    keyboard,
    focused: !!focused,
  }
}

// Full visual-viewport state, incl. keyboardOpen which is true as soon as an
// editable field is focused (instant chrome collapse) OR a keyboard is measured.
// RE-RENDER ONLY ON A REAL CHANGE (8 Oct 2026). iOS fires visualViewport `scroll` on every frame while the
// keyboard is up and the caret moves, and this used to hand React a new object each time - so AppLayout, which
// only needs to know WHETHER a keyboard is open, re-rendered the whole shell sixty times a second under somebody
// typing their About You. `project` picks what the caller needs; an equal answer keeps the old state.
function sameShape(a, b) {
  if (a === b) return true
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false
  const ka = Object.keys(a)
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k])
}

const asIs = (v) => v

// `project` must be a module-level function (stable identity): it is an effect dependency.
export function useVisualViewport(project = asIs) {
  const [vp, setVpRaw] = useState(() => project(readViewport(false)))

  useEffect(() => {
    const setVp = (next) => {
      const v = project(next)
      setVpRaw((prev) => (sameShape(prev, v) ? prev : v))
    }
    const vv = window.visualViewport
    let raf = 0
    let timers = []
    // Track focus of editable elements ourselves so we don't depend on the
    // laggy resize event to know the keyboard is coming.
    let focused = isEditable(document.activeElement)

    // ARMED TWO WAYS, BECAUSE rAF DOES NOT ALWAYS RUN.
    //
    // This was `requestAnimationFrame` alone, and rAF is throttled to a stop in
    // a background tab, in a hidden window and under automation - so in any of
    // those the whole hook is frozen at whatever it last measured. That is the
    // same hole `lib/chatScroll` and the walkthrough's geometry loop were both
    // fixed for, and it is worth closing here for the same reason: everything
    // downstream (the bottom tab bar, the chat overlay's height, the
    // walkthrough card getting out of the way of a form) reads as broken rather
    // than as stale. Whichever of the frame and the timer arrives first wins and
    // cancels the other.
    let tick = 0
    const apply = () => {
      cancelAnimationFrame(raf)
      clearTimeout(tick)
      const once = () => {
        cancelAnimationFrame(raf)
        clearTimeout(tick)
        // THE LIVE ANSWER, NOT THE LAST EVENT (12 Oct 2026). iOS fires no focusout when the focused composer is
        // REMOVED (swiping back out of a chat with the keyboard up) or when the app goes to the background, so the
        // flag stayed true: the tab bar stayed hidden and the inbox overlay kept covering the header ("the header and
        // the footer with the buttons disappear"). Whatever the events said, read what actually has focus.
        focused = isEditable(document.activeElement) && document.visibilityState !== 'hidden'
        setVp(readViewport(focused))
      }
      raf = requestAnimationFrame(once)
      tick = setTimeout(once, 48)
    }
    // Read repeatedly for a second so we catch the keyboard's final size even
    // when iOS never fires a resize event.
    const poll = () => {
      timers.forEach(clearTimeout)
      timers = [0, 60, 120, 200, 320, 480, 700, 1000].map((t) => setTimeout(apply, t))
    }
    // WHILE A FIELD HAS FOCUS, CHECK IT IS STILL THERE (12 Oct 2026). Leaving a chat with the composer focused removes
    // the composer, and removal fires no focusout - so nothing re-measured and the tab bar stayed away on the next
    // screen. A cheap check twice a second, only while something is focused, catches it.
    let watch = 0
    const stopWatch = () => { clearInterval(watch); watch = 0 }
    const startWatch = () => {
      if (watch) return
      watch = setInterval(() => {
        if (!isEditable(document.activeElement) || !document.activeElement.isConnected) { focused = false; stopWatch(); poll() }
      }, 450)
    }
    const onFocusIn = (e) => { if (isEditable(e.target)) { focused = true; startWatch(); poll() } }
    const onFocusOut = () => { focused = false; poll() }
    // LEAVING THE APP WITH THE KEYBOARD UP (12 Oct 2026). Ethan: "I started typing a message and then exited the app
    // ... when clicking on the bar the keyboard came up and the type bar didn't appear above as it should ... the bar
    // below that shows rooms, challenges ... had disappeared". Coming back, iOS had put the keyboard away but the
    // composer still held focus, so nothing changed when it was tapped again and no focus event ever re-measured.
    // Let go of the field on the way out (the draft is kept); the next tap is a real focus with a fresh measurement.
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        const el = document.activeElement
        if (isEditable(el)) el.blur()
        focused = false
      }
      poll()
    }

    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pageshow', poll)
    window.addEventListener('popstate', poll)
    if (vv) {
      vv.addEventListener('resize', apply)
      vv.addEventListener('scroll', apply)
    }
    apply()
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(tick)
      stopWatch()
      timers.forEach(clearTimeout)
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pageshow', poll)
      window.removeEventListener('popstate', poll)
      if (vv) {
        vv.removeEventListener('resize', apply)
        vv.removeEventListener('scroll', apply)
      }
    }
  }, [project])

  return project === asIs ? { ...vp, keyboardOpen: vp.focused || vp.keyboard > 0 } : vp
}

const keyboardOpenOf = (v) => v.focused || v.keyboard > 0

// Just the boolean, for the app shell: changes twice per keyboard, not once per frame.
export function useKeyboardOpen() {
  return useVisualViewport(keyboardOpenOf)
}

// Backwards-compatible helper: just the keyboard height in CSS px, 0 when closed.
const keyboardOf = (v) => v.keyboard

export function useKeyboardInset() {
  return useVisualViewport(keyboardOf)
}

// One media query, kept in sync on resize/orientation change. The two hooks
// below are the two breakpoints this app actually reasons about in JS; anything
// else belongs in a Tailwind class.
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches
  )
  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = () => setMatches(mq.matches)
    mq.addEventListener('change', onChange)
    onChange()
    return () => mq.removeEventListener('change', onChange)
  }, [query])
  return matches
}

// True below the `lg` breakpoint (Tailwind default 1024px). Used to apply the
// mobile chat overlay geometry only on phones/tablets and leave the desktop card
// layout untouched.
export function useIsMobile() {
  return useMediaQuery('(max-width: 1023.98px)')
}

// True below `sm` (640px): an actual phone, held in one hand. Where a tablet is
// happy with a two-column grid of described cards, this is the width at which a
// description under every tile turns a hub into a scroll.
export function useIsPhone() {
  return useMediaQuery('(max-width: 639.98px)')
}

/**
 * HOLD A FIXED OVERLAY ON THE VISIBLE SCREEN, FRAME BY FRAME (12 Oct 2026).
 *
 * Ethan: "when I press on the message bar ... the profile pictures at the top and that header reanimates and appears a
 * second time, rather than just staying where it is". When the keyboard opens iOS pans the visual viewport up to keep
 * the field in view, which carries a fixed overlay (and its header) up with it. The overlay's own `translateY(offsetTop)`
 * came through React after a frame and a 48ms timer, so the header visibly left and slid back. This writes the
 * transform straight onto the element, on every frame while the viewport is moving (a short burst after any focus
 * change or viewport event), so the header never leaves. Phones only; React no longer sets `transform` on the overlay.
 */
export function useViewportPin(ref, enabled) {
  useEffect(() => {
    const el = ref.current
    const vv = window.visualViewport
    if (!enabled || !el || !vv) {
      if (el) el.style.transform = ''
      return undefined
    }
    let raf = 0
    let until = 0
    let timer = 0
    const write = () => { el.style.transform = `translate3d(0, ${Math.max(0, Math.round(vv.offsetTop))}px, 0)` }
    const frame = () => {
      write()
      raf = performance.now() < until ? requestAnimationFrame(frame) : 0
    }
    const burst = () => {
      write()
      until = performance.now() + 700
      if (!raf) raf = requestAnimationFrame(frame)
      // Never only a frame loop (a hidden pane does not run it): one late write as well.
      clearTimeout(timer)
      timer = setTimeout(write, 720)
    }
    write()
    vv.addEventListener('resize', burst)
    vv.addEventListener('scroll', burst)
    document.addEventListener('focusin', burst)
    document.addEventListener('focusout', burst)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(timer)
      vv.removeEventListener('resize', burst)
      vv.removeEventListener('scroll', burst)
      document.removeEventListener('focusin', burst)
      document.removeEventListener('focusout', burst)
    }
  }, [ref, enabled])
}

/**
 * THE KEYBOARD'S HEIGHT, REMEMBERED, SO THE CHAT CAN MAKE ROOM BEFORE IT ARRIVES (13 Oct 2026).
 *
 * Ethan, of the rooms and the DMs on his iPhone: "whenever I click on the message, the keyboard shows up ... there's a
 * weird animation where the whole screen jumps. That header should lock in place, the chat should move up a bit, and the
 * keyboard should come up." The jump is iOS: when a field near the bottom of the screen is focused, Safari pans the
 * whole visual viewport up to keep it above the keyboard, and the header goes with it. useViewportPin chases that pan a
 * frame at a time and can never be exactly on it. The way out is to give iOS nothing to pan: the moment a finger lands
 * on the message box (touchstart, well before the focus that brings the keyboard), the chat shrinks to the height it
 * will have with the keyboard up, so the box is already above where the keyboard lands. The height is the one measured
 * the last time a keyboard was open on this phone (a sensible guess the first time).
 *
 * iOS ONLY. Android resizes the layout viewport itself, so the same subtraction there would count the keyboard twice.
 */
const KB_KEY = 'tryp_kb_h'
let kbMemo = null
function rememberKeyboard(px) {
  if (!isIOS() || Math.abs((kbMemo || 0) - px) < 4) return
  kbMemo = px
  try { localStorage.setItem(KB_KEY, String(px)) } catch { /* private mode */ }
}
export function isIOS() {
  if (typeof navigator === 'undefined') return false
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}
export function expectedKeyboard() {
  const h = typeof window !== 'undefined' ? window.innerHeight : 800
  if (kbMemo == null) {
    try { kbMemo = Number(localStorage.getItem(KB_KEY)) || 0 } catch { kbMemo = 0 }
  }
  return kbMemo > 120 && kbMemo < h * 0.75 ? kbMemo : Math.round(h * 0.42)
}

/**
 * True from the moment a finger touches an empty-of-focus text field inside `ref` until the keyboard has been measured
 * (or a second and a half has passed, or the field never took focus). Phones on iOS only; false everywhere else.
 */
export function useKeyboardPrepare(ref, enabled) {
  const [expecting, setExpecting] = useState(false)
  useEffect(() => {
    const root = ref.current
    if (!enabled || !root || !isIOS()) return undefined
    let timer = 0
    const stop = () => { clearTimeout(timer); setExpecting(false) }
    const onTouch = (e) => {
      const t = e.target
      const field = t?.closest?.('textarea, input:not([type="checkbox"]):not([type="radio"]):not([type="file"]), [contenteditable="true"]')
      if (!field || field === document.activeElement || !root.contains(field)) return
      setExpecting(true)
      clearTimeout(timer)
      timer = setTimeout(stop, 1500)
    }
    root.addEventListener('touchstart', onTouch, { passive: true, capture: true })
    return () => { clearTimeout(timer); root.removeEventListener('touchstart', onTouch, { capture: true }) }
  }, [ref, enabled])
  return [expecting, setExpecting]
}
