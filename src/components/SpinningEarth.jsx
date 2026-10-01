import { useEffect, useRef } from 'react'
import { GEO_URL, loadMapFeatures, atlasReady } from '../lib/mapCountries'
import { useSlowNetwork } from '../lib/netQuality'
import { createEarthScene, prepareLand } from '../lib/earth/earthScene'
import { cx } from '../lib/utils'

// THE EARTH BEHIND THE GLOBAL CHALLENGE (21 Sep 2026): the real atlas on an orthographic projection, turning, with
// cities as points of light and a few Tryp.com routes flown by aeroplanes.
//
// OFF THE MAIN THREAD (1 Oct 2026). Ethan found the whole platform laggy, and this was most of it: 240 countries
// redrawn sixty times a second on the thread that also scrolls the page. Now the canvas is handed to a Web Worker
// (lib/earth/earthWorker.js) and drawn there, so the page never waits for it. A browser that cannot hand a canvas
// over runs the same scene here at 30fps with the far side of the planet skipped. Either way the loop stops whenever
// the card is off screen or the tab is hidden, and reduced motion gets one still frame.

const quietMotion = () => document.documentElement.hasAttribute('data-reduce-motion')
  || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

function measure(canvas) {
  const r = canvas.getBoundingClientRect()
  return { size: Math.max(1, Math.round(Math.min(r.width, r.height))), dpr: Math.min(1.75, window.devicePixelRatio || 1) }
}

export default function SpinningEarth({ className = '', tilt = -18, speed = 7 }) {
  const hostRef = useRef(null)
  // DECORATION WAITS FOR A GOOD CONNECTION (1 Oct 2026): the globe is the world
  // atlas, and on a slow line that download competes with the page itself. If
  // the atlas is already here it costs nothing, so it draws.
  const slow = useSlowNetwork()
  const skip = slow && !atlasReady()

  useEffect(() => {
    const host = hostRef.current
    if (!host || skip) return undefined
    // A canvas made per run: one that has been handed to a worker can never be handed over (or drawn on) again, and
    // React runs an effect twice in development.
    const canvas = document.createElement('canvas')
    canvas.style.cssText = 'display:block;width:100%;height:100%'
    host.appendChild(canvas)
    const unmount = () => canvas.remove()
    const quiet = quietMotion()
    let alive = true
    let cleanup = unmount

    const canOffscreen = typeof canvas.transferControlToOffscreen === 'function' && typeof Worker === 'function'
    if (canOffscreen) {
      let worker = null
      try {
        worker = new Worker(new URL('../lib/earth/earthWorker.js', import.meta.url), { type: 'module' })
        const off = canvas.transferControlToOffscreen()
        const { size, dpr } = measure(canvas)
        worker.postMessage({ type: 'init', canvas: off, size, dpr, tilt, speed, quiet, geoUrl: new URL(GEO_URL, location.href).href }, [off])
      } catch {
        worker?.terminate()
        worker = null
      }
      if (worker) {
        const ro = new ResizeObserver(() => worker.postMessage({ type: 'resize', ...measure(canvas) }))
        ro.observe(canvas)
        let onScreen = true
        const tell = () => worker.postMessage({ type: 'visible', visible: onScreen && !document.hidden })
        const io = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; tell() })
        io.observe(canvas)
        document.addEventListener('visibilitychange', tell)
        return () => {
          ro.disconnect(); io.disconnect()
          document.removeEventListener('visibilitychange', tell)
          worker.postMessage({ type: 'stop' })
          setTimeout(() => worker.terminate(), 50)
          unmount()
        }
      }
    }

    // Main-thread fallback.
    const ctx = canvas.getContext('2d')
    if (!ctx) return unmount
    const scene = createEarthScene(ctx, { tilt, makePath2D: typeof Path2D === 'function' ? (d) => new Path2D(d) : null })
    let raf = 0
    let last = 0
    let clock = 0
    let lambda = -10
    let visible = true
    const resize = () => { const { size, dpr } = measure(canvas); scene.resize(size, Math.min(dpr, 1.5)); scene.draw(clock, lambda) }
    const loop = (now) => {
      raf = 0
      if (!alive || !visible || document.hidden) return
      if (now - last >= 32) {
        const dt = last ? Math.min(100, now - last) : 0
        last = now
        clock += dt
        lambda = (lambda + (speed * dt) / 1000) % 360
        scene.draw(clock, lambda)
      }
      raf = requestAnimationFrame(loop)
    }
    const start = () => {
      if (quiet) { scene.draw(0, lambda); return }
      if (!raf && visible && !document.hidden) { last = 0; raf = requestAnimationFrame(loop) }
    }
    resize()
    loadMapFeatures().then((fc) => { if (!alive) return; scene.setLand(prepareLand(fc)); scene.draw(clock, lambda); start() })
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) start() })
    io.observe(canvas)
    document.addEventListener('visibilitychange', start)
    cleanup = () => {
      alive = false
      if (raf) cancelAnimationFrame(raf)
      ro.disconnect(); io.disconnect()
      document.removeEventListener('visibilitychange', start)
      unmount()
    }
    return () => cleanup()
  }, [tilt, speed, skip])

  return <span ref={hostRef} aria-hidden className={cx('pointer-events-none block aspect-square', className)} />
}
