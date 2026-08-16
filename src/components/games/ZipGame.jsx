import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { Badge, StreakChip } from '../ui'
import Icon from '../Icon'
import { generateZip, zipIndexForDay, wallKey } from '../../lib/zip'
import { ukDayIndex, ukDayStartIso, untilNextUkMidnight, dailyStreak } from '../../lib/daily'
import { cx } from '../../lib/utils'
import { playCelebrate, playCoin, playWrong, playGearThud, engineThrust, engineStop } from '../../lib/gameSounds'

// Flight Path: drag the plane through the numbered stops in order, leaving a
// contrail behind you, until every cell of the sky is covered. One layout per
// (UK) day, same for everyone; difficulty varies through the year and harder
// days add no-fly walls. The game_scores row is the source of truth for
// "played today" so devices stay in sync.
const BRAND = '#d94407'
const BRAND_LIGHT = '#f5853f'
const STORE_KEY = 'tryp_zip'
const CELL = 100 // svg units per cell

// Trail gradient: full BRAND_LIGHT at the plane, fading to this lighter peach
// at the tail. A winding stroke can't take a real SVG gradient, so the solid
// body is drawn as per-segment strokes with interpolated colour (round caps
// blend the steps into a smooth ramp).
const TRAIL_TAIL = '#fbd4b6'
const lerpHex = (a, b, t) => {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16))
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16))
  return '#' + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('')
}

const fmtTime = (ms) => {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
const DIFF_LABEL = { easy: 'Easy', medium: 'Medium', hard: 'Hard', expert: 'Expert', extreme: 'Extreme', ultra: 'Ultra', legend: 'Legendary' }
const HARD_DIFFS = ['hard', 'expert', 'extreme', 'ultra', 'legend']

function loadStored(day) {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null')
    return s && s.day === day ? s : null
  } catch { return null }
}

// Turn the cell-centre points into a smooth path: straight runs stay straight,
// every 90-degree turn gets a rounded corner (quadratic curve through the
// corner point) so the contrail sweeps like a real flight line.
function roundedPath(pts, r = 32) {
  if (pts.length < 2) return ''
  let d = `M ${pts[0][0]} ${pts[0][1]}`
  for (let i = 1; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i - 1]
    const [x1, y1] = pts[i]
    const [x2, y2] = pts[i + 1]
    const d1 = [Math.sign(x1 - x0), Math.sign(y1 - y0)]
    const d2 = [Math.sign(x2 - x1), Math.sign(y2 - y1)]
    if (d1[0] === d2[0] && d1[1] === d2[1]) continue // straight through, skip the point
    d += ` L ${x1 - d1[0] * r} ${y1 - d1[1] * r} Q ${x1} ${y1} ${x1 + d2[0] * r} ${y1 + d2[1] * r}`
  }
  const [lx, ly] = pts[pts.length - 1]
  d += ` L ${lx} ${ly}`
  return d
}

// The Tryp plane, nose-up at origin (same silhouette as the creator map).
// Just the plane itself - a thin white edge + shadow keep it visible over the
// orange trail without a backing disc. Position + heading are CSS transforms
// with a VERY short transition: just enough to smooth cell-to-cell motion
// without the plane visibly lagging behind the finger.
function PlaneIcon({ x, y, angle, scale = 3.4 }) {
  return (
    <g
      style={{
        transform: `translate(${x}px, ${y}px) rotate(${angle + 90}deg)`,
        transition: 'transform 0.07s linear',
        pointerEvents: 'none',
      }}
    >
      {/* bob class and scale attribute MUST live on separate <g>s - a CSS
          transform animation overrides an SVG transform attribute on the
          same element (this silently rendered the plane at scale 1). */}
      <g className="fp-plane-bob">
        <g transform={`scale(${scale})`}>
          <path
            d="M0 -11 C1.1 -11 1.8 -9 1.8 -6.2 L1.8 -4.4 L10 1 L10 3.1 L1.8 -0.2 L1.8 5 L4.4 7.6 L4.4 9.2 L0 7.7 L-4.4 9.2 L-4.4 7.6 L-1.8 5 L-1.8 -0.2 L-10 3.1 L-10 1 L-1.8 -4.4 L-1.8 -6.2 C-1.8 -9 -1.1 -11 0 -11 Z"
            fill={BRAND} stroke="#ffffff" strokeWidth={1} strokeLinejoin="round"
            style={{ filter: 'drop-shadow(0 1.5px 3px rgba(20,20,30,0.35))' }}
          />
        </g>
      </g>
    </g>
  )
}

export default function ZipGame({ onExit }) {
  const { user } = useAuth()
  const [day] = useState(() => ukDayIndex())
  const [nextIn] = useState(() => untilNextUkMidnight(Date.now()))
  const stored = useState(() => loadStored(day))[0]

  const layoutIndex = zipIndexForDay(day)
  const puzzle = useMemo(() => generateZip(layoutIndex), [layoutIndex])
  const { size, dots, walls, difficulty } = puzzle
  const N = size * size
  const numberAt = useMemo(() => new Map(dots.map((d) => [d.cell, d.n])), [dots])
  const wallSet = useMemo(() => new Set(walls.map(([a, b]) => wallKey(a, b))), [walls])
  const startCell = dots[0].cell
  const lastN = dots.length

  const [path, setPath] = useState([startCell])
  // The pointer handlers read and write the path synchronously (several steps
  // can land in one pointermove), so the live value is mirrored in a ref.
  const pathRef = useRef(path)
  const setPathLive = (p) => { pathRef.current = p; setPath(p) }

  const [solved, setSolved] = useState(!!stored)
  const [solveMs, setSolveMs] = useState(stored?.time_ms ?? null)
  const [streakDays, setStreakDays] = useState([]) // my past day_keys for this game
  const [checking, setChecking] = useState(!stored)
  const [shake, setShake] = useState(false)
  // Which wall was just hit, and which stop was just collected. Both are brief
  // and both clear themselves; they exist so the board can say what happened
  // where, rather than shaking the whole thing and leaving you to work it out.
  const [hitWall, setHitWall] = useState(null)
  const [popStop, setPopStop] = useState(null)
  const [elapsed, setElapsed] = useState(0)
  const startRef = useRef(0)
  const draggingRef = useRef(false)
  const savedRef = useRef(!!stored)
  const svgRef = useRef(null)

  // Server check: already flown today on another device?
  useEffect(() => {
    if (stored) return
    let alive = true
    supabase.from('game_scores')
      .select('time_ms')
      .eq('player_id', user.id).eq('mode', 'zip').eq('day_key', day)
      .gte('created_at', ukDayStartIso())
      .limit(1)
      .then(({ data }) => {
        if (!alive) return
        const row = data?.[0]
        if (row) {
          savedRef.current = true
          setSolved(true)
          setSolveMs(row.time_ms)
        }
        setChecking(false)
      })
    return () => { alive = false }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (solved || checking) return
    startRef.current = Date.now()
    const t = setInterval(() => setElapsed(Date.now() - startRef.current), 500)
    return () => clearInterval(t)
  }, [solved, checking])

  // THE ENGINE MUST NOT OUTLIVE THE GAME. It is a looping WebAudio graph, not a
  // one-shot, so leaving the page while it is fading would leave a propeller
  // running under the leaderboard - and under every page after that.
  useEffect(() => engineStop, [])
  useEffect(() => { if (solved) engineStop() }, [solved])

  // My daily streak for this game (consecutive UK days played).
  useEffect(() => {
    supabase.from('game_scores')
      .select('day_key')
      .eq('player_id', user.id).eq('mode', 'zip').not('day_key', 'is', null)
      .then(({ data }) => setStreakDays((data ?? []).map((r) => r.day_key)))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const streak = dailyStreak(solved ? [...streakDays, day] : streakDays, day)

  // Next stop number the path still has to reach.
  const expected = useMemo(() => {
    let n = 0
    for (const c of path) if (numberAt.has(c)) n++
    return n + 1
  }, [path, numberAt])

  // A REFUSED MOVE IS A NUDGE, NOT AN EARTHQUAKE.
  //
  // Ethan: "when you crash into a wall it shakes a lot, it shouldn't shake so
  // much." It used `animate-shake`, the same ±6px over 400ms that a wrong quiz
  // answer gets - but that is a whole board, you are mid-drag on it, and a
  // wrong quiz answer happens once every ten seconds while a wall happens
  // several times a second while you feel your way round one. `fp-nudge` is
  // ±2px over 220ms: enough to feel the refusal, not enough to lose your place.
  //
  // The wall you hit lights up as well, which is the more useful half of the
  // feedback - the shake says "no", the flash says which no.
  function blocked(a, b) {
    setShake(true)
    setTimeout(() => setShake(false), 240)
    if (a != null && b != null) {
      const k = wallKey(a, b)
      setHitWall(k)
      setTimeout(() => setHitWall((cur) => (cur === k ? null : cur)), 420)
    }
    playWrong()
  }

  function win() {
    // LANDED, THEN WELL DONE - IN THAT ORDER.
    //
    // The thud is the event (the route is complete, the aircraft is down) and
    // the arpeggio is the reaction to it. Played together they are mush; played
    // in sequence, with the celebration a beat behind, the ear reads them as
    // cause and effect. 260ms is roughly the length of the gear thump itself,
    // so the fanfare starts as it finishes rather than over the top of it.
    playGearThud()
    setTimeout(playCelebrate, 260)
    const time_ms = Date.now() - startRef.current
    setSolved(true)
    setSolveMs(time_ms)
    localStorage.setItem(STORE_KEY, JSON.stringify({ day, time_ms }))
    if (savedRef.current) return
    savedRef.current = true
    supabase.from('game_scores').insert({
      player_id: user.id, mode: 'zip', region: 'Daily', day_key: day,
      correct: 1, total: 1, time_ms,
    }).then(() => {})
  }

  // Walk toward `target`, interpolating straight-line drags, enforcing every
  // rule per step (adjacency, no revisits, stop order, walls).
  function walkTo(target) {
    if (solved || checking) return
    const cur = [...pathRef.current]
    let guard = size * 2
    let moved = false
    let reached = null
    while (guard-- > 0) {
      const head = cur[cur.length - 1]
      if (target === head) break
      const rh = Math.floor(head / size), ch = head % size
      const rt = Math.floor(target / size), ct = target % size
      let next
      if (rh === rt && ch !== ct) next = head + Math.sign(ct - ch)
      else if (ch === ct && rh !== rt) next = head + Math.sign(rt - rh) * size
      else break
      // Backtrack: stepping onto the previous cell retracts the contrail.
      if (cur.length > 1 && next === cur[cur.length - 2]) { cur.pop(); moved = true; continue }
      if (cur.includes(next)) break // can't cross your own contrail
      if (wallSet.has(wallKey(head, next))) { blocked(head, next); break } // no-fly wall
      const num = numberAt.get(next)
      let exp = 1
      for (const c of cur) if (numberAt.has(c)) exp++
      if (num != null && num !== exp) { blocked(); break } // stops must be in order
      if (num === lastN && cur.length + 1 !== N) { blocked(); break } // land last
      cur.push(next)
      moved = true
      // THE COIN. A numbered stop is the only thing in this puzzle that is an
      // achievement rather than a move, so it is the only thing that gets a
      // sound of its own. Not on the final stop: that one lands on the win
      // fanfare a fraction of a second later and the two would collide.
      if (num != null && num !== lastN) { playCoin(); reached = next }
    }
    if (moved) engineThrust()
    if (reached != null) {
      setPopStop(reached)
      setTimeout(() => setPopStop((c) => (c === reached ? null : c)), 420)
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
    if (solved || checking) return
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

  // Geometry helpers for rendering.
  const centre = (cell) => [(cell % size) * CELL + CELL / 2, Math.floor(cell / size) * CELL + CELL / 2]
  const head = path[path.length - 1]
  const [hx, hy] = centre(head)
  let angle = -90 // nose up before the first move
  if (path.length > 1) {
    const [px, py] = centre(path[path.length - 2])
    angle = (Math.atan2(hy - py, hx - px) * 180) / Math.PI
  }
  // The snake stops short of the head cell centre so its rounded cap sits
  // BEHIND the aircraft - the plane itself is the front of the trail.
  const pts = path.map(centre)
  let trailPts = pts
  if (pts.length > 1) {
    const [ax, ay] = pts[pts.length - 2]
    const t = 1 - 30 / (Math.hypot(hx - ax, hy - ay) || 1)
    trailPts = [...pts.slice(0, -1), [ax + (hx - ax) * t, ay + (hy - ay) * t]]
  }
  const trailD = roundedPath(trailPts)
  // Smooth colour ramp along the trail. A winding stroke can't take a real SVG
  // gradient, so we draw the body as many short round-capped strokes whose
  // colour is interpolated by CUMULATIVE distance along the path. Subdividing
  // each cell segment to hit a fixed number of colour steps keeps the ramp
  // buttery whether the trail is 3 cells or 120 - the old one-colour-per-cell
  // approach banded visibly on short trails ("choppy at the start").
  const TRAIL_STEPS = 72
  const bodySegs = []
  if (trailPts.length > 1) {
    const segCount = trailPts.length - 1
    const subs = Math.max(1, Math.ceil(TRAIL_STEPS / segCount))
    const totalSub = segCount * subs
    let k = 0
    for (let i = 0; i < segCount; i++) {
      const [x1, y1] = trailPts[i]
      const [x2, y2] = trailPts[i + 1]
      for (let s = 0; s < subs; s++) {
        const ta = s / subs, tb = (s + 1) / subs
        const ax = x1 + (x2 - x1) * ta, ay = y1 + (y2 - y1) * ta
        const bx = x1 + (x2 - x1) * tb, by = y1 + (y2 - y1) * tb
        const frac = totalSub > 1 ? (k + 0.5) / (totalSub - 1) : 1
        bodySegs.push({ d: `M ${ax} ${ay} L ${bx} ${by}`, c: lerpHex(TRAIL_TAIL, BRAND_LIGHT, Math.min(frac, 1)) })
        k++
      }
    }
  }
  const covered = new Set(path)
  const progress = Math.round((path.length / N) * 100)
  const W = size * CELL

  // Wall segment endpoints (drawn on the shared edge, inset from the corners).
  const wallSegment = ([a, b]) => {
    const ra = Math.floor(a / size), ca = a % size
    if (b === a + 1) { // vertical wall to the right of a
      const x = (ca + 1) * CELL
      return { x1: x, y1: ra * CELL + 8, x2: x, y2: (ra + 1) * CELL - 8 }
    }
    const y = (ra + 1) * CELL // horizontal wall below a
    return { x1: ca * CELL + 8, y1: y, x2: (ca + 1) * CELL - 8, y2: y }
  }

  return (
    <div className="space-y-6">
      <style>{`
        .fp-plane-bob { animation: fp-bob 2.1s ease-in-out infinite; }
        @keyframes fp-bob {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-2px); }
        }
        /* Dashes drift BACKWARDS along the path (away from the plane at the
           head), like a contrail streaming behind the aircraft. */
        .fp-trail-dash { animation: fp-dash 0.8s linear infinite; }
        @keyframes fp-dash { to { stroke-dashoffset: 19; } }
        /* A REFUSED MOVE: 2px, 220ms. See the note on blocked() - the old
           ±6px/400ms shake was borrowed from a wrong quiz answer, which happens
           once a round; a wall happens repeatedly while you feel your way past
           one, and at that rate it read as the board falling over. */
        .fp-nudge { animation: fp-nudge 0.22s ease-in-out both; }
        @keyframes fp-nudge {
          0%, 100% { transform: translateX(0); }
          30% { transform: translateX(-2px); }
          70% { transform: translateX(2px); }
        }
        /* The wall you actually hit, so the refusal points at something. */
        .fp-wall-hit { animation: fp-wall-hit 0.42s ease-out both; }
        @keyframes fp-wall-hit {
          0% { stroke: #dc2626; stroke-width: 15; }
          60% { stroke: #dc2626; stroke-width: 12; }
          100% { stroke: #d94407; stroke-width: 10; }
        }
        /* A stop being collected. The coin sound lands on the same frame. */
        .fp-stop-pop { animation: fp-stop-pop 0.42s cubic-bezier(0.22,1,0.36,1) both; transform-box: fill-box; transform-origin: center; }
        @keyframes fp-stop-pop {
          0% { transform: scale(1); }
          40% { transform: scale(1.34); }
          100% { transform: scale(1); }
        }
        /* The board arriving. The whole grid used to appear in one frame, which
           on the bigger layouts is 169 panes materialising at once. */
        .fp-board { animation: fp-board-in 0.45s cubic-bezier(0.22,1,0.36,1) both; }
        @keyframes fp-board-in {
          from { opacity: 0; transform: scale(0.985); }
          to { opacity: 1; transform: scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          .fp-plane-bob, .fp-trail-dash, .fp-nudge, .fp-wall-hit, .fp-stop-pop, .fp-board { animation: none; }
        }
      `}</style>

      {/* THE HEADER IS ONE PANEL, AND THE PROGRESS IS A BAR.
          What was here was a `flex-wrap` row of three badges on the left and
          three things on the right, which is six items competing for 375px: on
          a phone it wrapped into two or three ragged lines and "Back to games"
          ended up wherever there was room. And "Sky filled 42%" was a NUMBER for
          a quantity that is a proportion - the one thing every other mode on
          this page draws as the gradient bar Ethan picked out (see GameChrome).

          So: a rounded panel with the puzzle on one line and the two figures on
          another, the bar across the foot of it filling as the sky does, and the
          way out as a real button in a fixed corner rather than a link that
          moves. It stacks at `sm` instead of wrapping, so there is no width at
          which it comes out ragged. */}
      <div className="overflow-hidden rounded-card border border-gray-100 bg-white shadow-card">
        <div className="flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:p-4">
          <span className="flex min-w-0 flex-wrap items-center gap-2">
            <Badge tone="light"><Icon name="plane-tryp" className="h-3.5 w-3.5" /> Flight Path</Badge>
            <Badge tone={HARD_DIFFS.includes(difficulty) ? 'brand' : 'grey'} className="!px-2 !py-0.5 text-[10px]">{DIFF_LABEL[difficulty]}</Badge>
            <StreakChip n={streak} title={`${streak}-day daily streak`} />
          </span>
          <div className="flex shrink-0 items-center gap-4 sm:gap-5">
            <div className="leading-tight">
              <span className="block text-[10px] font-medium uppercase tracking-widest text-smoke">Sky filled</span>
              <span className="block text-base font-bold tabular-nums text-ink sm:text-lg">{progress}%</span>
            </div>
            <div className="leading-tight">
              <span className="block text-[10px] font-medium uppercase tracking-widest text-smoke">Time</span>
              <span className="block font-mono text-base font-bold tabular-nums text-ink sm:text-lg">{solved ? fmtTime(solveMs ?? 0) : fmtTime(elapsed)}</span>
            </div>
            <button
              onClick={onExit}
              className="ml-auto flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1.5 text-xs font-semibold text-smoke transition-all duration-200 hover:-translate-y-0.5 hover:border-brand hover:text-brand sm:ml-0"
            >
              <Icon name="chevronLeft" className="h-3.5 w-3.5" />
              Games
            </button>
          </div>
        </div>
        {/* Zero-width fills still paint their padding, so at 0% there is no bar
            at all - just the track. */}
        <div className="h-1.5 w-full bg-cloud">
          {progress > 0 && (
            <div
              className="h-full rounded-r-full bg-gradient-to-r from-brand to-brand-light transition-[width] duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          )}
        </div>
      </div>

      <div className="card !p-3 sm:!p-6">
        {/* The rules, split so the phone gets the short version. The full
            sentence ran to four lines at 375px above a board that then had to
            share the screen with it. */}
        <p className="mb-3 text-center text-[13px] leading-snug text-smoke sm:mb-4 sm:text-sm">
          Fly through every stop <span className="font-semibold text-ink">in order</span>, filling the whole sky.
          {walls.length > 0 && <> Orange bars are <span className="font-semibold text-ink">no-fly walls</span>.</>}
          <span className="hidden sm:inline"> Drag the plane, drag backwards to undo.</span>
        </p>

        {/* WIDER ON A BIG SCREEN. The cap was 660px whatever the display, so an
            eleven-by-eleven board on a desktop was a postage stamp in the middle
            of a very wide card while the same board on a tablet filled it. The
            `lg:` step only applies where there is room for it. */}
        <div className={cx(
          'fp-board relative mx-auto w-full',
          size >= 11 ? 'max-w-[660px] lg:max-w-[760px]' : size >= 8 ? 'max-w-[600px] lg:max-w-[680px]' : 'max-w-[520px] lg:max-w-[580px]',
          shake && 'fp-nudge',
        )}>
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${W}`}
            className="block w-full select-none overflow-hidden rounded-card"
            style={{ touchAction: 'none' }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            aria-label="Flight path puzzle board"
          >
            <defs>
              <linearGradient id="fp-sky" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#aed7f5" />
                <stop offset="55%" stopColor="#cfe8fb" />
                <stop offset="100%" stopColor="#e8f4fd" />
              </linearGradient>
            </defs>
            {/* the sky behind the flight grid */}
            <rect x="0" y="0" width={W} height={W} fill="url(#fp-sky)" />
            {/* sky cells: translucent rounded panes with the blue sky showing
                between them; the flown route is drawn over them as a snake */}
            {Array.from({ length: N }).map((_, cell) => {
              const x = (cell % size) * CELL, y = Math.floor(cell / size) * CELL
              return (
                <rect
                  key={cell}
                  x={x + 3} y={y + 3} width={CELL - 6} height={CELL - 6} rx={14}
                  fill="rgba(255,255,255,0.42)"
                  stroke="rgba(255,255,255,0.85)"
                  strokeWidth={1.5}
                />
              )
            })}

            {/* the flown sky: one continuous rounded SNAKE through every cell
                on the route - a soft light-orange wake glow under a solid
                rounded body (round caps = rounded head/tail), topped with the
                flowing dashed white contrail streaming back from the plane */}
            {path.length > 1 ? (
              <>
                <path d={trailD} fill="none" stroke={BRAND_LIGHT} strokeOpacity={0.22} strokeWidth={80} strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: 'none' }} />
                <path d={trailD} fill="none" stroke={BRAND_LIGHT} strokeOpacity={0.38} strokeWidth={66} strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: 'none' }} />
                {/* solid body: a fine colour ramp (lightest at the tail, full
                    orange right behind the plane) drawn as many short
                    round-capped strokes so the gradient is smooth end to end */}
                {bodySegs.map((seg, i) => (
                  <path
                    key={i}
                    d={seg.d}
                    fill="none" stroke={seg.c}
                    strokeWidth={54} strokeLinecap="round"
                    style={{ pointerEvents: 'none' }}
                  />
                ))}
                <path className="fp-trail-dash" d={trailD} fill="none" stroke="#ffffff" strokeWidth={5} strokeDasharray="3 16" strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: 'none' }} />
              </>
            ) : (
              <>
                <rect x={hx - 42} y={hy - 42} width={84} height={84} rx={30} fill={BRAND_LIGHT} fillOpacity={0.3} style={{ pointerEvents: 'none' }} />
                <rect x={hx - 34} y={hy - 34} width={68} height={68} rx={24} fill={BRAND_LIGHT} style={{ pointerEvents: 'none' }} />
              </>
            )}

            {/* no-fly walls: solid Tryp orange bars */}
            {walls.map((wpair, i) => {
              const s = wallSegment(wpair)
              const hit = hitWall === wallKey(wpair[0], wpair[1])
              return (
                <line
                  // Keyed on the hit so the class change remounts the node -
                  // an animation already applied does not restart itself, so
                  // hitting the same wall twice would flash once.
                  key={`${i}${hit ? '-hit' : ''}`}
                  {...s}
                  className={hit ? 'fp-wall-hit' : undefined}
                  stroke={BRAND} strokeWidth={10} strokeLinecap="round"
                  style={{ pointerEvents: 'none', filter: 'drop-shadow(0 1px 1.5px rgba(20,20,30,0.2))' }}
                />
              )
            })}

            {/* numbered stops. The stop under the plane hides entirely - its
                number is shown ON the aircraft instead (below). */}
            {dots.map((d) => {
              if (d.cell === head && !solved && !checking) return null
              const [x, y] = centre(d.cell)
              const visited = covered.has(d.cell)
              const popping = popStop === d.cell
              return (
                <g
                  key={popping ? `${d.n}-pop` : d.n}
                  className={popping ? 'fp-stop-pop' : undefined}
                  style={{ pointerEvents: 'none' }}
                >
                  <circle cx={x} cy={y} r={27} fill={visited ? BRAND : '#ffffff'} stroke={visited ? '#ffffff' : BRAND} strokeWidth={4} style={{ transition: 'fill 180ms ease-out, stroke 180ms ease-out' }} />
                  <text x={x} y={y + 1} textAnchor="middle" dominantBaseline="central" fontSize={26} fontWeight="700" fill={visited ? '#ffffff' : BRAND}>
                    {d.n}
                  </text>
                </g>
              )
            })}

            {/* the plane at the head of the trail; when it sits on a numbered
                stop the stop's number rides on the fuselage (kept upright) */}
            {!solved && !checking && (
              <>
                <PlaneIcon x={hx} y={hy} angle={angle} />
                {numberAt.has(head) && (
                  <g style={{ transform: `translate(${hx}px, ${hy}px)`, transition: 'transform 0.07s linear', pointerEvents: 'none' }}>
                    {/* a small white badge on the fuselage keeps the stop
                        number readable over the busy plane silhouette */}
                    <circle cx={0} cy={0} r={16} fill="#ffffff" style={{ filter: 'drop-shadow(0 1px 2px rgba(20,20,30,0.3))' }} />
                    <text x={0} y={1} textAnchor="middle" dominantBaseline="central" fontSize={21} fontWeight="800" fill={BRAND}>
                      {numberAt.get(head)}
                    </text>
                  </g>
                )}
              </>
            )}
          </svg>

          {solved && (
            <div className="absolute inset-0 flex items-center justify-center rounded-card bg-white/85 backdrop-blur-[2px]">
              <div className="flex flex-col items-center gap-3 p-6 text-center animate-pop-in">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand text-white shadow-lift">
                  <Icon name="plane-tryp" className="h-8 w-8" />
                </span>
                <p className="text-xl font-bold text-ink">Smooth landing!</p>
                <p className="text-sm text-smoke">
                  Today's flight completed{solveMs != null ? ` in ${fmtTime(solveMs)}` : ''}.
                </p>
                <p className="text-xs text-smoke">New route at midnight UK time · {nextIn}</p>
                <button onClick={onExit} className="btn-secondary !py-2 text-sm">Back to games</button>
              </div>
            </div>
          )}
          {checking && !solved && (
            <div className="absolute inset-0 flex items-center justify-center rounded-card bg-white/70">
              <p className="text-sm text-smoke">Checking today's flight…</p>
            </div>
          )}
        </div>

        {/* THE CONTROLS ARE THUMB-SIZED, AND "NEXT STOP" IS THE BIGGEST THING
            IN THE ROW. It was two small secondary buttons and a line of grey
            11px text, in that order - so the thing you look at between every
            move was the smallest and faintest item on the page, and the two
            buttons you press by accident were the loudest. The number now sits
            in a brand chip on the right and the buttons are 44px tall, which is
            the minimum a finger can be asked to hit. */}
        {!solved && !checking && (
          <div className="mt-4 flex items-center justify-center gap-2.5 sm:gap-3">
            <button
              onClick={undo}
              className="flex h-11 items-center gap-1.5 rounded-full border border-gray-200 px-4 text-sm font-semibold text-smoke transition-all duration-200 hover:-translate-y-0.5 hover:border-brand hover:text-brand active:scale-95"
            >
              <Icon name="reply" className="h-4 w-4" />
              Undo
            </button>
            <button
              onClick={restart}
              className="flex h-11 items-center gap-1.5 rounded-full border border-gray-200 px-4 text-sm font-semibold text-smoke transition-all duration-200 hover:-translate-y-0.5 hover:border-brand hover:text-brand active:scale-95"
            >
              <Icon name="reorder" className="h-4 w-4" />
              Restart
            </button>
            <span className="flex h-11 items-center gap-2 rounded-full bg-brand-tint px-4 text-brand">
              <span className="text-[10px] font-semibold uppercase tracking-widest">Next stop</span>
              <span className="text-lg font-extrabold tabular-nums leading-none">{Math.min(expected, lastN)}</span>
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
