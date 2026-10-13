import { useEffect, useLayoutEffect, useRef, useState } from 'react'

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

export function isIOS() {
  if (typeof navigator === 'undefined') return false
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

/**
 * THE CARET STAYS OUT OF THE MOVEMENT (13 Oct 2026).
 *
 * Ethan: "the blue text bar, the bar that flashes, kind of glitches and doesn't go with the smooth animation". iOS draws
 * the caret natively, on top of the page, and it does not follow a CSS transform: while the thread glides it stays put
 * (or sits where useNoFocusPan briefly lifted the field) and then jumps. So while the chat is moving it is transparent
 * (`[data-kb-moving]` in index.css), and it reappears where the box has come to rest. `ms` is the longest the hold can
 * last if nothing releases it.
 */
function holdCaret(el, ms) {
  if (!el) return
  clearTimeout(el.__caretTimer)
  el.setAttribute('data-kb-moving', '')
  el.__caretTimer = setTimeout(() => el.removeAttribute('data-kb-moving'), ms)
}
function releaseCaret(el) {
  if (!el) return
  clearTimeout(el.__caretTimer)
  // A frame after the layout lands, so the caret is drawn at its final place.
  el.__caretTimer = setTimeout(() => el.removeAttribute('data-kb-moving'), 40)
}

/**
 * GIVE iOS NOTHING TO PAN (13 Oct 2026).
 *
 * Ethan: "The top bar showing chat name or dm name and profile picture is still like reloading and animating when
 * keyboard shows, rather than staying in place." When a field near the bottom of the screen takes focus, Safari pans the
 * whole visual viewport up to keep it above the keyboard, carrying the chat header with it; useViewportPin chases that
 * pan a frame behind. Safari decides whether to pan from where the field is AT THE MOMENT IT TAKES FOCUS, and it does
 * not reveal a field it cannot see. So for that moment the field is transparent and lifted out of the way, and it is
 * put back two frames later. With no pan, offsetTop stays 0, the header never moves, and the overlay simply shortens to
 * the keyboard (useVisualViewport polls for it).
 *
 * Applied only to a field inside `ref` and only on iOS. Replaces the 13 Oct touchstart pre-shrink, which jumped the
 * message bar to the middle of the screen on any stray touch and ran ahead of the keyboard on a real tap.
 */
export function useNoFocusPan(ref, enabled) {
  useEffect(() => {
    const root = ref.current
    if (!enabled || !root || !isIOS()) return undefined
    const timers = new Set()
    const onFocus = (e) => {
      const el = e.target
      if (!isEditable(el) || !root.contains(el)) return
      // Until the chat has finished moving for the keyboard (useChatOverlayHeight releases it), or 1.2s if it never does.
      holdCaret(root, 1200)
      const { opacity, transform } = el.style
      el.style.opacity = '0'
      el.style.transform = 'translate3d(0, -100vh, 0)'
      const restore = () => {
        el.style.opacity = opacity
        el.style.transform = transform
      }
      let a = 0
      a = requestAnimationFrame(() => { a = requestAnimationFrame(restore) })
      // Never only frames (a background tab does not run them).
      const t = setTimeout(() => { cancelAnimationFrame(a); restore(); timers.delete(t) }, 60)
      timers.add(t)
    }
    root.addEventListener('focusin', onFocus, true)
    return () => {
      timers.forEach(clearTimeout)
      root.removeEventListener('focusin', onFocus, true)
    }
  }, [ref, enabled])
}

// THE KEYBOARD'S LAST MEASURED HEIGHT ON THIS PHONE (iOS only), so the chat can start moving the moment the field takes
// focus instead of waiting for Safari to report the new viewport (often only once the keyboard has finished arriving).
// Used only after a real focus, never on a touch: see useNoFocusPan for why touch-driven geometry was removed.
const KB_KEY = 'tryp_kb_h'
let kbMemo = null
function rememberKeyboard(px) {
  if (!isIOS() || Math.abs((kbMemo || 0) - px) < 4) return
  kbMemo = px
  try { localStorage.setItem(KB_KEY, String(px)) } catch { /* private mode */ }
}
export function rememberedKeyboard() {
  if (!isIOS()) return 0
  if (kbMemo == null) {
    try { kbMemo = Number(localStorage.getItem(KB_KEY)) || 0 } catch { kbMemo = 0 }
  }
  const h = typeof window !== 'undefined' ? window.innerHeight : 800
  return kbMemo > 120 && kbMemo < h * 0.75 ? kbMemo : 0
}

// env(safe-area-inset-top/bottom) in px, measured once from a probe (and again on rotation).
let insets = null
function readInsets() {
  if (typeof document === 'undefined') return { top: 0, bottom: 0 }
  const el = document.createElement('div')
  el.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;top:0;left:0;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)'
  document.body.appendChild(el)
  const cs = getComputedStyle(el)
  const out = { top: parseFloat(cs.paddingTop) || 0, bottom: parseFloat(cs.paddingBottom) || 0 }
  el.remove()
  return out
}
function useSafeInsets() {
  const [v, setV] = useState(() => insets || (insets = readInsets()))
  useEffect(() => {
    const on = () => { insets = readInsets(); setV(insets) }
    window.addEventListener('orientationchange', on)
    return () => window.removeEventListener('orientationchange', on)
  }, [])
  return v
}

const GLIDE_MS = 260
// The iOS keyboard's own feel: fast out of the blocks, long soft landing.
const glideEase = (p) => 1 - (1 - p) ** 4

/**
 * THE CHAT GLIDES WITH THE KEYBOARD (13 Oct 2026).
 *
 * Ethan: "when the keyboard moves up and the text box moves up, that animation should be much smoother. currently its
 * juttery." The overlay's height used to follow every reading of the viewport: on focus it first DROPPED to the bottom
 * edge (the tab bar leaves before any keyboard is measured), then snapped up in steps as polled readings came in.
 *
 * Now the height is computed in px from one target, and a keyboard-caused change of it is played as a glide, with the
 * layout changing once, at whichever end leaves no gap:
 *  - the DOCK (`dockRef`: composer, typing line, anything under the thread) rides on `transform`;
 *  - the THREAD moves by SCROLLING, never by transforming the scroller or anything around it. Round two moved one
 *    wrapper around thread and composer, and on an iPhone a transform on an ancestor of a scrolling list re-hosts the
 *    list's layer: "the previous messages flash, disappear and reappear". The scroller is given room to scroll into
 *    (extra bottom padding) for the length of the glide, and its scrollTop follows the same curve as the dock, frame
 *    by frame, so the messages slide up with the box.
 * Shrinking (keyboard up): glide, then snap the height and drop the padding. Growing (keyboard down): snap the height
 * with the padding in place, then glide back down. Either way not a pixel moves on the snap frame. While it runs the
 * scroller carries `data-glide`, which lib/chatScroll reads as "not the reader" (no pin, no at-bottom change).
 *
 * While a keyboard is expected but not measured yet, the chat holds where it is (no drop); with a keyboard remembered on
 * this phone it goes straight to that height, so it rises WITH the keyboard. Changes that are not the keyboard (the app
 * header coming and going) still snap, as they always have.
 */
// `tuck`: px of the composer's bottom padding to let run behind the top of the keyboard, so the bar sits snug on the keys
// (Ethan, 13 Oct: "a slight bit of extra space below the message bar and keyboard ... cut that out"). Done with the
// height rather than the padding so nothing inside the chat moves at the moment of the tap.
export function useChatOverlayHeight({ enabled, chromeHidden, overlayRef, dockRef, scrollerRef, tuck = 0 }) {
  const { height: vpHeight, keyboardOpen, keyboard } = useVisualViewport()
  const safe = useSafeInsets()
  const remembered = rememberedKeyboard()

  // Expecting a keyboard that has not been measured yet: from the focus, until it is measured or a second passes (a
  // hardware keyboard never brings one).
  const [waiting, setWaiting] = useState(false)
  const [wasOpen, setWasOpen] = useState(keyboardOpen)
  if (wasOpen !== keyboardOpen) {
    setWasOpen(keyboardOpen)
    setWaiting(keyboardOpen && !(keyboard > 0))
  }
  if (waiting && keyboard > 0) setWaiting(false)
  useEffect(() => {
    if (!waiting) return undefined
    const t = setTimeout(() => setWaiting(false), 1000)
    return () => clearTimeout(t)
  }, [waiting])

  const innerH = typeof window !== 'undefined' ? window.innerHeight : vpHeight
  // Keyboard on its way out: Safari still reports the small viewport for a moment after the field lets go. A gap that
  // large is no toolbar (those are under 130px), so the screen is the full height.
  const base = !keyboardOpen && innerH - vpHeight > 150 ? innerH : vpHeight
  const closedH = base - (chromeHidden ? 0 : 64 + safe.top) - 72 - safe.bottom
  let target
  if (!keyboardOpen) target = closedH
  else if (waiting) target = remembered ? Math.max(240, innerH - remembered + tuck) : closedH + (chromeHidden ? 0 : 64 + safe.top)
  else target = vpHeight + (keyboard > 0 ? tuck : 0)
  target = Math.round(target)

  const waitingRef = useRef(waiting)
  const [shown, setShown] = useState(target)
  const shownRef = useRef(target)
  const glide = useRef({ land: null, to: 0, closedAt: 0, open: keyboardOpen })

  useLayoutEffect(() => {
    const g = glide.current
    const keyboardChange = g.open !== keyboardOpen || keyboardOpen || Date.now() - g.closedAt < 800
    if (g.open && !keyboardOpen) g.closedAt = Date.now()
    g.open = keyboardOpen
    const dock = dockRef.current
    const overlay = overlayRef.current
    const scroller = scrollerRef.current
    waitingRef.current = waiting
    // Already gliding to exactly this height (a remembered keyboard, now confirmed by Safari): let it finish; its
    // landing reads waitingRef and lets the caret back.
    if (g.land && g.to === target) return
    // Whatever was in flight lands where it was going.
    g.land?.()
    if (target === shownRef.current) {
      // Focus held the caret for a move that turned out not to be needed (keyboard already the remembered height).
      if (keyboardOpen && !waiting) releaseCaret(overlay)
      return
    }
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const snap = () => { shownRef.current = target; setShown(target) }
    if (!enabled || !dock || !overlay || !scroller || !keyboardChange || reduce) { snap(); releaseCaret(overlay); return }
    holdCaret(overlay, GLIDE_MS + 600)
    g.to = target
    const d = shownRef.current - target // > 0: getting shorter (keyboard up)
    const dist = Math.abs(d)
    const s0 = scroller.scrollTop
    const pad0 = scroller.style.paddingBottom
    const padPx = parseFloat(getComputedStyle(scroller).paddingBottom) || 0
    scroller.dataset.glide = '1'
    // Room to scroll into for the length of the glide (up: below the end; down: so the taller box does not clamp).
    scroller.style.paddingBottom = `${padPx + dist}px`
    if (d < 0) overlay.style.height = `${target}px`
    // Up: scroll from s0 to s0 + d, dock from 0 to -d. Down: scroll from s0 to s0 - dist, dock from -dist to 0.
    const frame = (p) => {
      const e = glideEase(p)
      scroller.scrollTop = d > 0 ? s0 + dist * e : s0 - dist * e
      dock.style.transform = `translate3d(0, ${d > 0 ? -dist * e : -dist * (1 - e)}px, 0)`
    }
    frame(0)
    const t0 = performance.now()
    let raf = 0
    const tick = () => {
      const p = Math.min(1, (performance.now() - t0) / GLIDE_MS)
      frame(p)
      raf = p < 1 ? requestAnimationFrame(tick) : 0
      if (p >= 1) g.land?.()
    }
    raf = requestAnimationFrame(tick)
    // Never only frames (a background tab does not run them).
    const timer = setTimeout(() => g.land?.(), GLIDE_MS + 40)
    g.land = () => {
      g.land = null
      cancelAnimationFrame(raf)
      clearTimeout(timer)
      if (d > 0) overlay.style.height = `${target}px`
      scroller.style.paddingBottom = pad0
      dock.style.transform = ''
      scroller.scrollTop = d > 0 ? s0 + dist : s0 - dist
      delete scroller.dataset.glide
      if (d > 0) snap()
      // Still waiting on Safari's own measurement: keep holding, the next target lands it.
      if (!waitingRef.current) releaseCaret(overlay)
    }
    if (d < 0) snap()
  }, [target, keyboardOpen, waiting, enabled, dockRef, overlayRef, scrollerRef])

  useEffect(() => () => glide.current.land?.(), [])

  return { kbOpen: keyboardOpen, height: shown }
}
