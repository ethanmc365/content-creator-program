import { useEffect, useState } from 'react'

// Mount a heavy child only once it is close to the screen.
//
// THE PROBLEM IT SOLVES IS A TIMING ONE, NOT A BANDWIDTH ONE. The world map
// fetches a megabyte of TopoJSON, parses it, and lays out something like 240
// SVG paths. When that happens on the same frames as the page's arrival
// animation, the main thread is busy and every card mid-slide drops frames -
// which reads as a judder a second or so after the page appears, exactly when
// the reader has decided the animation is finished. Nothing is wrong with the
// animation; something else took the thread.
//
// Deferring the mount until the map is nearly in view moves that work to a
// moment when nothing else is animating. `rootMargin` is generous on purpose:
// the point is to be ready BEFORE the reader arrives, not to make them wait.
//
// The fallback must reserve the child's height or deferring the mount just
// trades a judder for a jump.
export default function WhenVisible({ children, fallback = null, rootMargin = '400px' }) {
  const [node, setNode] = useState(null)
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (!node || show) return undefined
    // No observer (old browser, test env, headless pane) must never mean "no
    // content": show it and move on.
    if (typeof IntersectionObserver === 'undefined') { setShow(true); return undefined }
    const io = new IntersectionObserver(
      (entries) => { if (entries.some((e) => e.isIntersecting)) setShow(true) },
      { rootMargin },
    )
    io.observe(node)
    return () => io.disconnect()
  }, [node, show, rootMargin])

  // BELT AND BRACES, AND THE SAME ONE `Reveal` CARRIES.
  //
  // An observer that never fires must never mean "no content". It happens: a
  // backgrounded tab, an embedded pane that freezes rAF, an engine that
  // throttles observers on a page nobody is looking at. So after a moment we
  // check for ourselves - if the element is genuinely within (or above) the
  // viewport, or the viewport cannot answer at all, the content wins. Below the
  // fold, waiting is still the correct behaviour, and we keep waiting.
  useEffect(() => {
    if (show || !node) return undefined
    const t = setTimeout(() => {
      const vh = window.innerHeight || 0
      if (vh === 0) { setShow(true); return }
      if (node.getBoundingClientRect().top < vh) setShow(true)
    }, 1500)
    return () => clearTimeout(t)
  }, [show, node])

  return <div ref={setNode}>{show ? children : fallback}</div>
}
