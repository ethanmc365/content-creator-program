// A SCROLL THAT ARRIVES, NOT ONE THAT YANKS (9 Oct 2026).
//
// Ethan, on the VIP page: "if I'm on the leaderboard and I click on my videos, then I scroll down a bit and click on another
// pop-up (Earn more), the animation pulls you up really quickly. It should be smoother." The page called
// `window.scrollTo({ top: 0, behavior: 'smooth' })` the moment a section was chosen; with `scroll-behavior: smooth` already on the
// page and the content underneath changing height in the same instant, the browser covered the whole distance in a few frames.
//
// This takes a target (a pixel, or an element's top minus a margin), moves there with an ease-in-out over a time that grows with the
// distance (about half a second for a normal hop, never more than 0.75s), starts only AFTER the new section has been drawn, and
// stops the instant the reader touches, wheels or presses a key - a scroll animation must never fight a thumb. Reduced-motion
// readers get an instant jump.
let running = null

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2)

export function gentleScrollTo(targetY, { maxMs = 750 } = {}) {
  if (typeof window === 'undefined') return
  if (running) running()
  const start = window.scrollY
  const to = Math.max(0, Math.round(targetY))
  const dist = to - start
  if (Math.abs(dist) < 8) return
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { window.scrollTo({ top: to, behavior: 'instant' }); return }

  const root = document.documentElement
  const previous = root.style.scrollBehavior
  root.style.scrollBehavior = 'auto' // the page-wide smooth setting would otherwise animate every one of our own steps
  const ms = Math.min(maxMs, 320 + Math.abs(dist) * 0.18)
  let raf = 0
  let t0 = 0
  const stop = () => {
    cancelAnimationFrame(raf)
    root.style.scrollBehavior = previous
    window.removeEventListener('wheel', stop)
    window.removeEventListener('touchstart', stop)
    window.removeEventListener('keydown', stop)
    if (running === stop) running = null
  }
  running = stop
  window.addEventListener('wheel', stop, { passive: true })
  window.addEventListener('touchstart', stop, { passive: true })
  window.addEventListener('keydown', stop)
  const step = (now) => {
    if (!t0) t0 = now
    const p = Math.min(1, (now - t0) / ms)
    window.scrollTo({ top: start + dist * ease(p), left: 0, behavior: 'instant' })
    if (p < 1) raf = requestAnimationFrame(step)
    else stop()
  }
  // One frame later, so the section that was just chosen has been laid out before the page starts moving towards it.
  raf = requestAnimationFrame(() => { raf = requestAnimationFrame(step) })
}

/** Bring the top of the first visible element matching `selector` into view, `margin` px below the top of the screen. */
export function gentleScrollToSelector(selector, margin = 76) {
  const el = [...document.querySelectorAll(selector)].find((n) => n.offsetParent !== null || getComputedStyle(n).position === 'fixed')
  if (!el) { gentleScrollTo(0); return }
  const top = el.getBoundingClientRect().top + window.scrollY - margin
  if (window.scrollY > top + 8) gentleScrollTo(top)
}
