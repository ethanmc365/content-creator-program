import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { Badge, Confetti } from '../ui'
import Icon from '../Icon'
import { dayIndex } from '../../lib/pinpoint'
import { generateZip, zipIndexForDay, ZIP_LAYOUT_COUNT } from '../../lib/zip'
import { cx } from '../../lib/utils'

// Zip: Flight Path. Drag the plane through the numbered stops in order, leaving
// a contrail behind you, until every cell of the grid is covered. One daily
// layout (same for everyone, solve time on the leaderboard) plus unscored
// practice layouts afterwards. All layouts are generated with a solution by
// construction and verified solvable in the test suite.
const BRAND = '#d94407'
const BRAND_LIGHT = '#f5853f'
const STORE_KEY = 'tryp_zip'
const CELL = 100 // svg units per cell

const fmtTime = (ms) => {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function loadStored(day) {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null')
    return s && s.day === day ? s : null
  } catch { return null }
}

// The Tryp plane, nose-up at origin (same silhouette as the creator map).
function PlaneIcon({ x, y, angle, scale = 2 }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle + 90}) scale(${scale})`} style={{ pointerEvents: 'none' }}>
      <path
        d="M0 -11 C1.1 -11 1.8 -9 1.8 -6.2 L1.8 -4.4 L10 1 L10 3.1 L1.8 -0.2 L1.8 5 L4.4 7.6 L4.4 9.2 L0 7.7 L-4.4 9.2 L-4.4 7.6 L-1.8 5 L-1.8 -0.2 L-10 3.1 L-10 1 L-1.8 -4.4 L-1.8 -6.2 C-1.8 -9 -1.1 -11 0 -11 Z"
        fill={BRAND} stroke="#ffffff" strokeWidth={1.3} strokeLinejoin="round"
        style={{ filter: 'drop-shadow(0 1px 2px rgba(20,20,30,0.35))' }}
      />
    </g>
  )
}

export default function ZipGame({ onExit }) {
  const { user } = useAuth()
  const [day] = useState(() => dayIndex())
  const stored = useState(() => loadStored(day))[0]

  // null = today's daily; a number = practice layout index (unscored).
  const [practiceIndex, setPracticeIndex] = useState(null)
  const isDaily = practiceIndex === null
  const layoutIndex = isDaily ? zipIndexForDay(day) : practiceIndex
  const puzzle = useMemo(() => generateZip(layoutIndex), [layoutIndex])
  const { size, dots } = puzzle
  const N = size * size
  const numberAt = useMemo(() => new Map(dots.map((d) => [d.cell, d.n])), [dots])
  const startCell = dots[0].cell
  const lastN = dots.length

  const [path, setPath] = useState([startCell])
  // The pointer handlers read and write the path synchronously (several steps
  // can land in one pointermove), so the live value is mirrored in a ref and
  // state is only the render copy.
  const pathRef = useRef(path)
  const setPathLive = (p) => { pathRef.current = p; setPath(p) }
  const [solved, setSolved] = useState(isDaily && stored ? true : false)
  const [solveMs, setSolveMs] = useState(isDaily && stored ? stored.time_ms : null)
  const alreadyDone = isDaily && !!stored // solved on an earlier visit today
  const [shake, setShake] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const startRef = useRef(0)
  const draggingRef = useRef(false)
  const svgRef = useRef(null)

  // Reset the board whenever the layout changes (daily → practice etc.)
  useEffect(() => {
    setPathLive([puzzle.dots[0].cell])
    if (!(isDaily && stored)) { setSolved(false); setSolveMs(null) }
    startRef.current = Date.now()
    setElapsed(0)
  }, [puzzle]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (solved) return
    startRef.current = Date.now()
    const t = setInterval(() => setElapsed(Date.now() - startRef.current), 500)
    return () => clearInterval(t)
  }, [solved, puzzle])

  // Next stop number the path still has to reach. Order is enforced on every
  // step, so this is simply how many stops we've collected so far + 1.
  const expected = useMemo(() => {
    let n = 0
    for (const c of path) if (numberAt.has(c)) n++
    return n + 1
  }, [path, numberAt])

  function blocked() {
    setShake(true)
    setTimeout(() => setShake(false), 450)
  }

  function win() {
    const time_ms = Date.now() - startRef.current
    setSolved(true)
    setSolveMs(time_ms)
    if (isDaily && !stored) {
      localStorage.setItem(STORE_KEY, JSON.stringify({ day, time_ms }))
      supabase.from('game_scores').insert({
        player_id: user.id, mode: 'zip', region: 'Daily',
        correct: 1, total: 1, time_ms,
      }).then(() => {})
    }
  }

  // Try to walk to `cell`, interpolating straight-line drags, with every rule
  // enforced per step. Runs on the live ref so multi-step drags stay in sync.
  function walkTo(target) {
    if (solved) return
    const cur = [...pathRef.current]
    let guard = size * 2
    while (guard-- > 0) {
      const head = cur[cur.length - 1]
      if (target === head) break
      const rh = Math.floor(head / size), ch = head % size
      const rt = Math.floor(target / size), ct = target % size
      // Move one orthogonal step toward the target; diagonals are ignored
      // until the pointer commits to a row or column.
      let next
      if (rh === rt && ch !== ct) next = head + Math.sign(ct - ch)
      else if (ch === ct && rh !== rt) next = head + Math.sign(rt - rh) * size
      else break
      // Backtrack: stepping onto the previous cell retracts the contrail.
      if (cur.length > 1 && next === cur[cur.length - 2]) { cur.pop(); continue }
      if (cur.includes(next)) break // can't cross your own contrail
      const num = numberAt.get(next)
      let exp = 1
      for (const c of cur) if (numberAt.has(c)) exp++
      if (num != null && num !== exp) { blocked(); break } // stops must be in order
      // Don't land on the final stop until the grid is full.
      if (num === lastN && cur.length + 1 !== N) { blocked(); break }
      cur.push(next)
    }
    setPathLive(cur)
    if (cur.length === N && numberAt.get(cur[cur.length - 1]) === lastN) win()
  }

  function cellFromEvent(e) {
    const rect = svgRef.current.getBoundingClientRect()
    const c = Math.min(size - 1, Math.max(0, Math.floor(((e.clientX - rect.left) / rect.width) * size)))
    const r = Math.min(size - 1, Math.max(0, Math.floor(((e.clientY - rect.top) / rect.height) * size)))
    return r * size + c
  }

  function onPointerDown(e) {
    if (solved) return
    e.preventDefault()
    try { svgRef.current.setPointerCapture?.(e.pointerId) } catch { /* synthetic events have no active pointer */ }
    const cell = cellFromEvent(e)
    const idx = pathRef.current.indexOf(cell)
    draggingRef.current = true
    if (idx >= 0) {
      // Grab the trail anywhere along it: cut back to that point and drag on.
      setPathLive(pathRef.current.slice(0, idx + 1))
    } else {
      walkTo(cell)
    }
  }
  function onPointerMove(e) {
    if (!draggingRef.current || solved) return
    walkTo(cellFromEvent(e))
  }
  function onPointerUp() { draggingRef.current = false }

  function undo() {
    if (solved) return
    if (pathRef.current.length > 1) setPathLive(pathRef.current.slice(0, -1))
  }
  function restart() {
    if (solved) return
    setPathLive([startCell])
  }
  function practice() {
    setPracticeIndex(Math.floor(Math.random() * ZIP_LAYOUT_COUNT))
  }

  // Geometry helpers for rendering.
  const centre = (cell) => [(cell % size) * CELL + CELL / 2, Math.floor(cell / size) * CELL + CELL / 2]
  const head = path[path.length - 1]
  const [hx, hy] = centre(head)
  let angle = -90 // nose up before the first move
  if (path.length > 1) {
    const [px, py] = centre(path[path.length - 2])
    angle = (Math.atan2(hy - py, hx - px) * 180) / Math.PI
  }
  const points = path.map((c) => centre(c).join(',')).join(' ')
  const covered = new Set(path)
  const progress = Math.round((path.length / N) * 100)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Badge tone="light"><Icon name="plane" className="h-3.5 w-3.5" /> Flight Path · {isDaily ? 'Daily puzzle' : `Practice #${layoutIndex + 1}`}</Badge>
        <div className="flex items-center gap-5">
          <div className="text-center leading-tight">
            <span className="block text-[10px] font-medium uppercase tracking-wide text-smoke">Filled</span>
            <span className="block text-sm font-semibold tabular-nums text-ink">{progress}%</span>
          </div>
          <div className="text-center leading-tight">
            <span className="block text-[10px] font-medium uppercase tracking-wide text-smoke">Time</span>
            <span className="block font-mono text-sm font-semibold tabular-nums text-ink">{solved ? fmtTime(solveMs ?? 0) : fmtTime(elapsed)}</span>
          </div>
          <button onClick={onExit} className="text-xs font-medium text-smoke hover:text-brand">Back to games</button>
        </div>
      </div>

      <div className="card !p-4 sm:!p-6">
        <p className="mb-4 text-center text-sm text-smoke">
          Fly through every stop <span className="font-semibold text-ink">in order</span>, filling the whole sky. Drag the plane, drag backwards to undo.
        </p>

        <div className={cx('relative mx-auto w-full max-w-[520px]', shake && 'animate-shake')}>
          <svg
            ref={svgRef}
            viewBox={`0 0 ${size * CELL} ${size * CELL}`}
            className="block w-full select-none rounded-card"
            style={{ touchAction: 'none', background: '#eef4fb' }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            aria-label="Flight path puzzle board"
          >
            {/* sky cells */}
            {Array.from({ length: N }).map((_, cell) => {
              const x = (cell % size) * CELL, y = Math.floor(cell / size) * CELL
              return (
                <rect
                  key={cell}
                  x={x + 3} y={y + 3} width={CELL - 6} height={CELL - 6} rx={14}
                  fill={covered.has(cell) ? '#fdf0e7' : '#ffffff'}
                  stroke={covered.has(cell) ? '#f9c9a7' : '#e5eaf1'}
                  strokeWidth={1.5}
                  style={{ transition: 'fill 0.15s' }}
                />
              )
            })}

            {/* the flight route + contrail */}
            {path.length > 1 && (
              <>
                <polyline points={points} fill="none" stroke={BRAND_LIGHT} strokeOpacity={0.4} strokeWidth={46} strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: 'none' }} />
                <polyline points={points} fill="none" stroke="#ffffff" strokeWidth={5} strokeDasharray="3 16" strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: 'none' }} />
              </>
            )}

            {/* numbered stops */}
            {dots.map((d) => {
              const [x, y] = centre(d.cell)
              const visited = covered.has(d.cell)
              return (
                <g key={d.n} style={{ pointerEvents: 'none' }}>
                  <circle cx={x} cy={y} r={27} fill={visited ? BRAND : '#ffffff'} stroke={visited ? '#ffffff' : BRAND} strokeWidth={4} />
                  <text x={x} y={y + 1} textAnchor="middle" dominantBaseline="central" fontSize={26} fontWeight="700" fill={visited ? '#ffffff' : BRAND}>
                    {d.n}
                  </text>
                </g>
              )
            })}

            {/* the plane at the head of the trail */}
            {!solved && <PlaneIcon x={hx} y={hy} angle={angle} />}
          </svg>

          {solved && (
            <div className="absolute inset-0 flex items-center justify-center rounded-card bg-white/85 backdrop-blur-[2px]">
              <div className="flex flex-col items-center gap-3 p-6 text-center animate-pop-in">
                <Confetti count={40} />
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand text-white shadow-lift">
                  <Icon name="plane" className="h-7 w-7" />
                </span>
                <p className="text-xl font-bold text-ink">{alreadyDone ? 'Solved today' : 'Smooth landing!'}</p>
                <p className="text-sm text-smoke">
                  {isDaily ? "Today's flight" : 'Practice flight'} completed{solveMs != null ? ` in ${fmtTime(solveMs)}` : ''}.
                </p>
                <div className="flex flex-wrap justify-center gap-3">
                  <button onClick={practice} className="btn-primary !py-2 text-sm">Practice another layout</button>
                  <button onClick={onExit} className="btn-secondary !py-2 text-sm">Back to games</button>
                </div>
              </div>
            </div>
          )}
        </div>

        {!solved && (
          <div className="mt-4 flex items-center justify-center gap-3">
            <button onClick={undo} className="btn-secondary !py-2 text-sm">Undo</button>
            <button onClick={restart} className="btn-secondary !py-2 text-sm">Restart</button>
            <span className="text-xs text-smoke">Next stop: <span className="font-semibold text-brand">{Math.min(expected, lastN)}</span></span>
          </div>
        )}
      </div>
    </div>
  )
}
