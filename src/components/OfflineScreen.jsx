import { useEffect, useRef, useState } from 'react'

// A friendly full-screen takeover when the device loses its connection, with a
// little "fly the plane" mini-game (Flappy-Bird style) to pass the time. Shown
// while the app is open and the network drops, and — because the service worker
// caches the app shell — also when the app is opened/refreshed with no signal.
// It clears itself the moment the connection returns.
export default function OfflineScreen() {
  const [offline, setOffline] = useState(() => !navigator.onLine)

  useEffect(() => {
    const goOnline = () => setOffline(false)
    const goOffline = () => setOffline(true)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  if (!offline) return null

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6 bg-white px-6 text-center">
      <div className="max-w-xs">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-tint">
          <svg viewBox="0 0 24 24" className="h-8 w-8" fill="#d94407" aria-hidden="true">
            <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
          </svg>
        </span>
        <h1 className="mt-4 text-2xl font-bold">You're offline</h1>
        <p className="mt-1 text-sm text-smoke">
          No internet connection right now. We'll reconnect you automatically. Fancy a quick flight while you wait?
        </p>
      </div>
      <PlaneGame />
      <p className="text-xs text-smoke">Tap the game or press space to fly. Dodge the clouds.</p>
    </div>
  )
}

function PlaneGame() {
  const canvasRef = useRef(null)
  const [score, setScore] = useState(0)
  const [best, setBest] = useState(0)
  const [phase, setPhase] = useState('ready') // ready | playing | over

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const W = canvas.width
    const H = canvas.height
    const GRAVITY = 0.42
    const FLAP = -6.6
    const PLANE_X = 66
    const GAP = 138
    const GATE_W = 48
    const SPEED = 2.4

    let planeY = H / 2
    let vel = 0
    let gates = []
    let frame = 0
    let localScore = 0
    let mode = 'ready'
    let raf = 0
    // Slow decorative background clouds (no collision) for a bit of atmosphere.
    const bgClouds = Array.from({ length: 4 }, () => ({
      x: Math.random() * W,
      y: 30 + Math.random() * (H - 90),
      s: 0.5 + Math.random() * 0.5,
      v: 0.15 + Math.random() * 0.25,
    }))

    const sky = ctx.createLinearGradient(0, 0, 0, H)
    sky.addColorStop(0, '#bfe3ff')
    sky.addColorStop(1, '#eaf6ff')

    const setPhaseSafe = (p) => { mode = p; setPhase(p) }

    function reset() {
      planeY = H / 2; vel = 0; gates = []; frame = 0; localScore = 0
      setScore(0); setPhaseSafe('ready')
    }
    function flap() {
      if (mode === 'over') { reset(); return }
      if (mode === 'ready') setPhaseSafe('playing')
      vel = FLAP
    }
    function gameOver() {
      if (mode !== 'playing') return
      setBest((b) => Math.max(b, localScore))
      setPhaseSafe('over')
    }
    function spawn() {
      const top = 40 + Math.random() * (H - GAP - 90)
      gates.push({ x: W, top, scored: false })
    }

    function puff(x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill() }

    // A fluffy vertical cloud filling the gate column between two y values.
    function drawCloud(xLeft, from, to) {
      const cx = xLeft + GATE_W / 2
      // soft shadow underside
      ctx.fillStyle = 'rgba(140,170,200,0.18)'
      for (let y = from; y <= to; y += 15) { puff(cx - 6 + 3, y + 3, 18); puff(cx + 10 + 3, y + 3, 15) }
      // white body
      ctx.fillStyle = '#ffffff'
      for (let y = from; y <= to; y += 15) {
        puff(cx - 8, y, 18)
        puff(cx + 10, y, 15)
        puff(cx + 1, y, 20)
      }
    }

    function drawBgCloud(x, y, s) {
      ctx.fillStyle = 'rgba(255,255,255,0.6)'
      puff(x, y, 16 * s)
      puff(x + 16 * s, y + 4 * s, 20 * s)
      puff(x + 36 * s, y, 15 * s)
      puff(x + 18 * s, y - 8 * s, 15 * s)
    }

    function drawPlane() {
      ctx.save()
      ctx.translate(PLANE_X, planeY)
      ctx.rotate(Math.max(-0.4, Math.min(0.6, vel * 0.05)))
      // fuselage
      ctx.fillStyle = '#d94407'
      ctx.beginPath()
      ctx.moveTo(20, 0)
      ctx.quadraticCurveTo(6, -9, -12, -6)
      ctx.quadraticCurveTo(-20, -3, -20, 0)
      ctx.quadraticCurveTo(-20, 3, -12, 6)
      ctx.quadraticCurveTo(6, 9, 20, 0)
      ctx.closePath()
      ctx.fill()
      // tail fin
      ctx.beginPath(); ctx.moveTo(-11, -5); ctx.lineTo(-17, -16); ctx.lineTo(-5, -5); ctx.closePath(); ctx.fill()
      // wing
      ctx.fillStyle = '#a83308'
      ctx.beginPath(); ctx.moveTo(3, 2); ctx.lineTo(-7, 15); ctx.lineTo(-11, 3); ctx.closePath(); ctx.fill()
      // window
      ctx.fillStyle = '#eaf6ff'
      puff(9, -1, 2.6)
      ctx.restore()
    }

    function loop() {
      ctx.fillStyle = sky
      ctx.fillRect(0, 0, W, H)

      for (const c of bgClouds) {
        c.x -= c.v
        if (c.x < -50) { c.x = W + 30; c.y = 30 + Math.random() * (H - 90) }
        drawBgCloud(c.x, c.y, c.s)
      }

      if (mode === 'playing') {
        vel += GRAVITY
        planeY += vel
        frame++
        if (frame % 100 === 0) spawn()
      }

      for (const g of gates) {
        if (mode === 'playing') g.x -= SPEED
        drawCloud(g.x, -20, g.top)
        drawCloud(g.x, g.top + GAP, H + 20)
        if (!g.scored && g.x + GATE_W < PLANE_X) { g.scored = true; localScore++; setScore(localScore) }
        if (PLANE_X + 15 > g.x && PLANE_X - 15 < g.x + GATE_W && (planeY - 9 < g.top || planeY + 9 > g.top + GAP)) {
          gameOver()
        }
      }
      gates = gates.filter((g) => g.x + GATE_W > -30)

      if (planeY > H - 9 || planeY < 9) {
        gameOver()
        planeY = Math.max(9, Math.min(H - 9, planeY))
      }

      drawPlane()
      raf = requestAnimationFrame(loop)
    }
    loop()

    const onKey = (e) => { if (e.code === 'Space') { e.preventDefault(); flap() } }
    const onPointer = (e) => { e.preventDefault(); flap() }
    window.addEventListener('keydown', onKey)
    canvas.addEventListener('pointerdown', onPointer)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', onKey)
      canvas.removeEventListener('pointerdown', onPointer)
    }
  }, [])

  return (
    <div className="relative select-none">
      <canvas
        ref={canvasRef}
        width={320}
        height={360}
        className="touch-none rounded-2xl border border-gray-200 shadow-card"
      />
      <div className="pointer-events-none absolute inset-x-0 top-3 text-center text-lg font-bold text-white drop-shadow">{score}</div>
      {phase !== 'playing' && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-2xl bg-ink/10">
          {phase === 'over' ? (
            <>
              <p className="rounded-lg bg-white/90 px-3 py-1 text-lg font-bold text-ink">Crashed!</p>
              <p className="mt-1 rounded bg-white/80 px-2 text-sm text-smoke">Score {score} · Best {best}</p>
              <p className="mt-1 text-xs font-semibold text-white drop-shadow">Tap to fly again</p>
            </>
          ) : (
            <p className="rounded-lg bg-white/90 px-3 py-1.5 text-sm font-semibold text-ink">Tap to start</p>
          )}
        </div>
      )}
    </div>
  )
}
