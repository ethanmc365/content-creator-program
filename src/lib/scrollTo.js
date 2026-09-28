// AN EASED SCROLL WE CONTROL (28 Sep 2026).
//
// Ethan, on the results page: clicking a creator in the sync panel "shows it at
// the top, but it's a little bit laggy in the way it scrolls down."
//
// `scrollIntoView({ behavior: 'smooth' })` hands the whole thing to the
// browser, which picks its own duration from the distance (on Chrome, long
// jumps crawl), starts it on whatever frame it likes, and keeps going while the
// list under it is being re-sorted - so the page stutters as the target moves.
// This one measures the target once the list has settled, runs a fixed-length
// ease-out on requestAnimationFrame, and gives the page straight back to the
// reader the moment they touch the wheel or the screen.

const reduced = () => typeof window !== 'undefined'
  && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

let cancelCurrent = null

// `html { scroll-behavior: smooth }` is set globally (index.css), so a plain
// `scrollTo(0, y)` on every frame is itself smoothed by the browser - two
// animations chasing each other, which is exactly what reads as lag. Each frame
// is therefore an INSTANT jump; the easing is ours.
const jump = (y) => window.scrollTo({ top: y, left: 0, behavior: 'instant' })

/** easeOutCubic: fast away, gentle landing. */
export const easeOut = (t) => 1 - (1 - t) ** 3

/** Duration for a jump of `px`: short hops are quick, long ones capped. */
export function scrollDuration(px) {
  return Math.round(Math.min(650, Math.max(260, 220 + Math.abs(px) * 0.12)))
}

/**
 * Scroll the window so `el`'s top sits `offset` px below the top of the viewport.
 * @returns {Promise<void>} resolves when the scroll lands or is interrupted
 */
export function scrollToElement(el, { offset = 96 } = {}) {
  if (!el || typeof window === 'undefined') return Promise.resolve()
  cancelCurrent?.()
  const start = window.scrollY
  const target = Math.max(0, start + el.getBoundingClientRect().top - offset)
  const delta = target - start
  if (Math.abs(delta) < 2) return Promise.resolve()
  if (reduced()) {
    jump(target)
    return Promise.resolve()
  }
  const duration = scrollDuration(delta)
  return new Promise((resolve) => {
    let raf = 0
    const t0 = performance.now()
    const stop = () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('wheel', stop)
      window.removeEventListener('touchstart', stop)
      window.removeEventListener('keydown', stop)
      if (cancelCurrent === stop) cancelCurrent = null
      resolve()
    }
    cancelCurrent = stop
    window.addEventListener('wheel', stop, { passive: true })
    window.addEventListener('touchstart', stop, { passive: true })
    window.addEventListener('keydown', stop)
    const step = (now) => {
      const t = Math.min(1, (now - t0) / duration)
      jump(start + delta * easeOut(t))
      if (t < 1) raf = requestAnimationFrame(step)
      else stop()
    }
    raf = requestAnimationFrame(step)
  })
}
