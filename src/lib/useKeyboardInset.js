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
  return {
    height: Math.round(vv.height),
    offsetTop: Math.round(vv.offsetTop),
    keyboard,
    focused: !!focused,
  }
}

// Full visual-viewport state, incl. keyboardOpen which is true as soon as an
// editable field is focused (instant chrome collapse) OR a keyboard is measured.
export function useVisualViewport() {
  const [vp, setVp] = useState(() => readViewport(false))

  useEffect(() => {
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
    const onFocusIn = (e) => { if (isEditable(e.target)) { focused = true; poll() } }
    const onFocusOut = () => { focused = false; poll() }

    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    if (vv) {
      vv.addEventListener('resize', apply)
      vv.addEventListener('scroll', apply)
    }
    apply()
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(tick)
      timers.forEach(clearTimeout)
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
      if (vv) {
        vv.removeEventListener('resize', apply)
        vv.removeEventListener('scroll', apply)
      }
    }
  }, [])

  return { ...vp, keyboardOpen: vp.focused || vp.keyboard > 0 }
}

// Backwards-compatible helper: just the keyboard height in CSS px, 0 when closed.
export function useKeyboardInset() {
  return useVisualViewport().keyboard
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
