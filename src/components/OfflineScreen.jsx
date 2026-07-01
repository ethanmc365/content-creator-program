import { useEffect, useRef, useState } from 'react'
import Icon from './Icon'

// A friendly full-screen takeover when the device loses its connection, with a
// little "fly the plane" mini-game (Flappy-Bird style) to pass the time. Shown
// while the app is open and the network drops; it clears itself on reconnect.
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
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-tint text-brand">
          <Icon name="plane" className="h-8 w-8" />
        </span>
        <h1 className="mt-4 text-2xl font-bold">You're offline</h1>
        <p className="mt-1 text-sm text-smoke">
          No internet connection right now. We'll reconnect you automatically — fancy a quick flight while you wait?
        </p>
      </div>
      <PlaneGame />
      <p className="text-xs text-smoke">Tap the game or press space to fly. Avoid the clouds.</p>
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
    const PLANE_X = 64
    const GAP = 132
    const GATE_W = 46
    const SPEED = 2.4

    let planeY = H / 2
    let vel = 0
    let gates = []
    let frame = 0
    let localScore = 0
    let mode = 'ready'
    let raf = 0

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
      const top = 34 + Math.random() * (H - GAP - 74)
      gates.push({ x: W, top, scored: false })
    }

    function drawCloud(x, y, w, h) {
      ctx.fillStyle = '#fcd9c4'
      const r = Math.min(w, 26)
      ctx.beginPath()
      ctx.moveTo(x + r, y)
      ctx.arcTo(x + w, y, x + w, y + h, r)
      ctx.arcTo(x + w, y + h, x, y + h, r)
      ctx.arcTo(x, y + h, x, y, r)
      ctx.arcTo(x, y, x + w, y, r)
      ctx.closePath()
      ctx.fill()
    }

    function loop() {
      ctx.fillStyle = '#fff7f2'
      ctx.fillRect(0, 0, W, H)

      if (mode === 'playing') {
        vel += GRAVITY
        planeY += vel
        frame++
        if (frame % 100 === 0) spawn()
      }

      for (const g of gates) {
        if (mode === 'playing') g.x -= SPEED
        drawCloud(g.x, -10, GATE_W, g.top + 10)
        drawCloud(g.x, g.top + GAP, GATE_W, H - (g.top + GAP) + 10)
        if (!g.scored && g.x + GATE_W < PLANE_X) {
          g.scored = true; localScore++; setScore(localScore)
        }
        if (PLANE_X + 15 > g.x && PLANE_X - 15 < g.x + GATE_W && (planeY - 9 < g.top || planeY + 9 > g.top + GAP)) {
          gameOver()
        }
      }
      gates = gates.filter((g) => g.x + GATE_W > -10)

      if (planeY > H - 9 || planeY < 9) {
        gameOver()
        planeY = Math.max(9, Math.min(H - 9, planeY))
      }

      // Plane, tilting with velocity.
      ctx.save()
      ctx.translate(PLANE_X, planeY)
      ctx.rotate(Math.max(-0.4, Math.min(0.6, vel * 0.05)))
      ctx.fillStyle = '#d94407'
      ctx.beginPath()
      ctx.moveTo(18, 0)
      ctx.lineTo(-14, -11)
      ctx.lineTo(-7, 0)
      ctx.lineTo(-14, 11)
      ctx.closePath()
      ctx.fill()
      ctx.restore()

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
      <div className="pointer-events-none absolute inset-x-0 top-3 text-center text-lg font-bold text-brand">{score}</div>
      {phase !== 'playing' && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-2xl bg-white/70">
          {phase === 'over' ? (
            <>
              <p className="text-lg font-bold text-ink">Crashed!</p>
              <p className="text-sm text-smoke">Score {score} · Best {best}</p>
              <p className="mt-1 text-xs font-medium text-brand">Tap to fly again</p>
            </>
          ) : (
            <p className="text-sm font-medium text-smoke">Tap to start</p>
          )}
        </div>
      )}
    </div>
  )
}
