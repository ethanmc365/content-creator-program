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

function readViewport(focused, smooth) {
  const vv = typeof window !== 'undefined' ? window.visualViewport : null
  if (!vv) {
    const h = typeof window !== 'undefined' ? window.innerHeight : 0
    return { height: h, offsetTop: 0, keyboard: 0, focused: !!focused, smooth: !!smooth }
  }
  // Keyboard height is layout height minus visible height. It must NOT subtract
  // offsetTop: on iOS the page scrolls when the keyboard opens, so offsetTop
  // grows and subtracting it wrongly yields 0.
  const raw = Math.round(window.innerHeight - vv.height)
  const keyboard = raw > 120 ? raw : 0
  return {
    height: Math.round(vv.height),
    offsetTop: Math.round(vv.offsetTop),
    keyboard,
    focused: !!focused,
    // Whether this update should be CSS-animated. Live visualViewport events
    // (browsers) already track the keyboard ~per-frame, so animating them makes
    // the panel trail and stutter - update instantly. Poll-driven updates
    // (installed PWA, where iOS fires no events) arrive in coarse steps, so we
    // let CSS interpolate those into a clean slide.
    smooth: !!smooth,
  }
}

// Full visual-viewport state, incl. keyboardOpen which is true as soon as an
// editable field is focused (instant chrome collapse) OR a keyboard is measured.
export function useVisualViewport() {
  const [vp, setVp] = useState(() => readViewport(false, false))

  useEffect(() => {
    const vv = window.visualViewport
    let raf = 0
    let timers = []
    // Track focus of editable elements ourselves so we don't depend on the
    // laggy resize event to know the keyboard is coming.
    let focused = isEditable(document.activeElement)
    // Timestamp of the last live visualViewport event, so poll updates know
    // whether the browser is already tracking the keyboard natively. Seeded to
    // "now" so a browser firing live events never briefly flags as smooth.
    let lastNative = performance.now()

    const commit = (smooth) => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => setVp(readViewport(focused, smooth)))
    }
    // Live browser events already track the keyboard smoothly - update instantly.
    const onNative = () => { lastNative = performance.now(); commit(false) }
    // Read repeatedly for a second so we catch the keyboard's final size even
    // when iOS never fires a resize event. Only animate these steps if the
    // browser isn't already firing live events (else we'd double up and stutter).
    const poll = () => {
      timers.forEach(clearTimeout)
      timers = [0, 60, 120, 200, 320, 480, 700, 1000].map((t) =>
        setTimeout(() => commit(performance.now() - lastNative > 250), t)
      )
    }
    const onFocusIn = (e) => { if (isEditable(e.target)) { focused = true; poll() } }
    const onFocusOut = () => { focused = false; poll() }

    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    if (vv) {
      vv.addEventListener('resize', onNative)
      vv.addEventListener('scroll', onNative)
    }
    commit(false)
    return () => {
      cancelAnimationFrame(raf)
      timers.forEach(clearTimeout)
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
      if (vv) {
        vv.removeEventListener('resize', onNative)
        vv.removeEventListener('scroll', onNative)
      }
    }
  }, [])

  return { ...vp, keyboardOpen: vp.focused || vp.keyboard > 0 }
}

// Backwards-compatible helper: just the keyboard height in CSS px, 0 when closed.
export function useKeyboardInset() {
  return useVisualViewport().keyboard
}

// True below the `lg` breakpoint (Tailwind default 1024px), kept in sync on
// resize/orientation change. Used to apply the mobile chat overlay geometry
// only on phones/tablets and leave the desktop card layout untouched.
export function useIsMobile() {
  const [mobile, setMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 1023.98px)').matches
  )
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023.98px)')
    const onChange = () => setMobile(mq.matches)
    mq.addEventListener('change', onChange)
    onChange()
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return mobile
}
