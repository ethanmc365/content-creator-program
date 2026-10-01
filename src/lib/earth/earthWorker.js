import { feature } from 'topojson-client'
import { createEarthScene, prepareLand } from './earthScene'

// The turning Earth's own thread. The page hands over its canvas (transferControlToOffscreen) and from then on every
// frame is drawn here, so scrolling, taps and the page's other animations never wait for the globe.
let scene = null
let canvas = null
let lambda = -10
let speed = 7
let quiet = false
let running = false
let visible = true
let last = 0
let clock = 0
let timer = 0

const raf = typeof self.requestAnimationFrame === 'function'
  ? (fn) => self.requestAnimationFrame(fn)
  : (fn) => setTimeout(() => fn(performance.now()), 16)
const caf = typeof self.cancelAnimationFrame === 'function' ? (id) => self.cancelAnimationFrame(id) : clearTimeout

function frame(now) {
  timer = 0
  if (!running || !visible) return
  const dt = last ? Math.min(100, now - last) : 0
  last = now
  clock += dt
  lambda = (lambda + (speed * dt) / 1000) % 360
  scene.draw(clock, lambda)
  timer = raf(frame)
}
function start() {
  if (quiet || !scene) { scene?.draw(0, lambda); return }
  if (!timer && running && visible) { last = 0; timer = raf(frame) }
}

self.onmessage = (e) => {
  const m = e.data || {}
  if (m.type === 'init') {
    canvas = m.canvas
    speed = m.speed ?? 7
    quiet = !!m.quiet
    const ctx = canvas.getContext('2d')
    scene = createEarthScene(ctx, { tilt: m.tilt ?? -18, makePath2D: (d) => new Path2D(d) })
    scene.resize(m.size, m.dpr)
    scene.draw(0, lambda)
    running = true
    fetch(m.geoUrl)
      .then((r) => r.json())
      .then((topo) => {
        scene.setLand(prepareLand(feature(topo, topo.objects.countries)))
        scene.draw(clock, lambda)
        start()
      })
      .catch(() => start())
  } else if (m.type === 'resize' && scene) {
    scene.resize(m.size, m.dpr)
    scene.draw(clock, lambda)
  } else if (m.type === 'visible') {
    visible = !!m.visible
    if (visible) start()
    else if (timer) { caf(timer); timer = 0 }
  } else if (m.type === 'stop') {
    running = false
    if (timer) caf(timer)
    self.close()
  }
}
