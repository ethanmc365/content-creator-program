import { useEffect, useState } from 'react'

// Tracks the on-screen (software) keyboard + visual viewport so the chat can be
// laid out WhatsApp-style on mobile: composer hugging the top of the keyboard,
// page chrome collapsing away, and the whole surface staying pinned to the
// visible area even on iOS (where focusing an input scrolls the page).
//
// The important iOS detail: opening the keyboard does NOT change the *layout*
// viewport (`window.innerHeight`); it shrinks the *visual* viewport
// (`visualViewport.height`) and, to reveal the focused field, gives it a
// positive `offsetTop`. A `position: fixed` element is anchored to the layout
// viewport, so it ends up mis-placed (floating mid-screen, behind the keyboard).
// Countering that requires `translateY(offsetTop)` + sizing to `visualViewport`.
function readViewport() {
  const vv = typeof window !== 'undefined' ? window.visualViewport : null
  if (!vv) {
    const h = typeof window !== 'undefined' ? window.innerHeight : 0
    return { height: h, offsetTop: 0, keyboard: 0 }
  }
  // Keyboard height is simply layout height minus visible height. It must NOT
  // subtract offsetTop: on iOS the page scrolls when the keyboard opens, so
  // offsetTop grows to ~keyboard height and subtracting it wrongly yields 0
  // (the old bug that left the tab bar + toolbar visible while typing).
  const keyboard = Math.max(0, Math.round(window.innerHeight - vv.height))
  return {
    height: Math.round(vv.height),
    offsetTop: Math.round(vv.offsetTop),
    // Ignore small deltas (browser toolbars showing/hiding) - only a real
    // keyboard is >~120px tall.
    keyboard: keyboard > 120 ? keyboard : 0,
  }
}

// Full visual-viewport state: { height, offsetTop, keyboard, keyboardOpen }.
export function useVisualViewport() {
  const [vp, setVp] = useState(readViewport)

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    let raf = 0
    const update = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => setVp(readViewport()))
    }
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    update()
    return () => {
      cancelAnimationFrame(raf)
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])

  return { ...vp, keyboardOpen: vp.keyboard > 0 }
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
