import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { Badge, StreakChip } from '../ui'
import Icon from '../Icon'
import PuzzleChrome from './PuzzleChrome'
import { generateZip, zipIndexForDay, wallKey } from '../../lib/zip'
import { hintForPath } from '../../lib/zipHint'
import { ukDayIndex, ukDayStartIso, untilNextUkMidnight, dailyStreak } from '../../lib/daily'
import { cx } from '../../lib/utils'
import { playCelebrate, playCoin, playWrong, playGearThud, playHintRewind, playHintClear, engineThrust, engineStop } from '../../lib/gameSounds'
import { useT } from '../../lib/i18n'

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
const DIFF_LABEL = { hop: 'Short hop', easy: 'Easy', medium: 'Medium', hard: 'Hard', expert: 'Expert', extreme: 'Extreme', ultra: 'Ultra', legend: 'Legendary' }
const HARD_DIFFS = ['hard', 'expert', 'extreme', 'ultra', 'legend']

// TEN SECONDS BETWEEN HINTS, AND THE WAIT IS DRAWN.
//
// Ethan: "to stop people spamming this button, it should have a 10 second cool
// down. And a visual animation that it's cooling down and show when it's
// clickable again."
//
// A disabled button that says nothing is indistinguishable from a broken one,
// so the wait is a ring that empties around the button and the label counts
// down in whole seconds. When it comes back it flashes once - the moment it
// becomes pressable is the moment worth animating, and it is the one a
// greyed-out button never tells you about.
const HINT_COOLDOWN_MS = 10_000

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
// Position + heading are CSS transforms with a VERY short transition: just
// enough to smooth cell-to-cell motion without the plane visibly lagging behind
// the finger.
//
// IT IS LIT NOW, NOT FLAT (16 Sep 2026). It was one flat brand-orange fill with
// a white outline, sitting on a trail of the same orange - so at the one moment
// it matters, mid-drag, the aircraft and its own contrail were the same colour
// and the eye had only a 1px line to separate them. Three things fix that and
// none of them changes the silhouette Ethan settled on:
//
//   - a soft warm HALO behind it, so there is always a gap of light between the
//     plane and whatever it is flying over;
//   - a fuselage GRADIENT running across the aircraft's own axis (it rotates
//     with the plane, so the light stays on one side of the hull rather than
//     one side of the screen);
//   - a cockpit glint and a wing highlight, which is what makes a shape read as
//     metal rather than as a sticker.
const PLANE_D = 'M0 -11 C1.1 -11 1.8 -9 1.8 -6.2 L1.8 -4.4 L10 1 L10 3.1 L1.8 -0.2 L1.8 5 L4.4 7.6 L4.4 9.2 L0 7.7 L-4.4 9.2 L-4.4 7.6 L-1.8 5 L-1.8 -0.2 L-10 3.1 L-10 1 L-1.8 -4.4 L-1.8 -6.2 C-1.8 -9 -1.1 -11 0 -11 Z'

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
          <circle cx={0} cy={0} r={13.5} fill="url(#fp-halo)" />
          <path
            d={PLANE_D}
            fill="url(#fp-fuse)" stroke="#ffffff" strokeWidth={1.1} strokeLinejoin="round"
            style={{ filter: 'drop-shadow(0 2px 3.5px rgba(16,32,48,0.32))' }}
          />
          {/* the cockpit: a glint on the nose, the thing that makes it read
              as glass rather than as more paint */}
          <path
            d="M0 -9.7 C0.8 -9.7 1.25 -8.3 1.25 -6.4 L1.25 -4.9 C0.5 -5.2 -0.5 -5.2 -1.25 -4.9 L-1.25 -6.4 C-1.25 -8.3 -0.8 -9.7 0 -9.7 Z"
            fill="#ffffff" fillOpacity={0.62}
          />
          {/* a highlight along the leading edge of one wing */}
          <path d="M-9.6 1.2 L-1.8 -3.9 L-1.8 -2.7 L-9.6 1.95 Z" fill="#ffffff" fillOpacity={0.34} />
        </g>
      </g>
    </g>
  )
}

/**
 * The point `dist` svg units back along `pts` from its last point, or null if
 * the trail is not that long yet. Used to space the contrail puffs evenly
 * behind the aircraft however fast the player is dragging.
 */
function pointBack(pts, dist) {
  let left = dist
  for (let i = pts.length - 1; i > 0; i--) {
    const [x2, y2] = pts[i]
    const [x1, y1] = pts[i - 1]
    const len = Math.hypot(x2 - x1, y2 - y1)
    if (len >= left) {
      const t = left / (len || 1)
      return [x2 + (x1 - x2) * t, y2 + (y1 - y2) * t]
    }
    left -= len
  }
  return null
}

export default function ZipGame({ onExit }) {
  const tr = useT()
  // Open on the puzzle rather than on the page it lives at the bottom of.
  const cardRef = useRef(null)
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

  // ---- the hint
  // `hintNext` is the cell the plane has been turned to face; it is a HEADING,
  // not a move, and it clears the moment the player flies anywhere.
  const [hintNext, setHintNext] = useState(null)
  const [hintMsg, setHintMsg] = useState(null)
  const [hintsUsed, setHintsUsed] = useState(0)
  const [hintAt, setHintAt] = useState(0)   // when the last hint was taken
  const [now, setNow] = useState(0)         // ticks only while a cooldown runs
  const rewindRef = useRef(null)            // the reel-in timer, if one is running
  const cooldownLeft = hintAt ? Math.max(0, HINT_COOLDOWN_MS - (now - hintAt)) : 0
  const cooling = cooldownLeft > 0

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

  // THE COOLDOWN TICKS ONLY WHILE THERE IS A COOLDOWN. A ring that empties over
  // ten seconds needs to redraw often enough to look continuous, and an
  // interval running at that rate for the whole game - which on a legend board
  // is half an hour - would be a lot of renders in exchange for nothing.
  useEffect(() => {
    if (!hintAt) return
    setNow(Date.now())
    const t = setInterval(() => {
      const n = Date.now()
      setNow(n)
      if (n - hintAt >= HINT_COOLDOWN_MS) clearInterval(t)
    }, 80)
    return () => clearInterval(t)
  }, [hintAt])

  // The reel-in is a chain of timeouts, and it must not outlive the board.
  useEffect(() => () => clearTimeout(rewindRef.current), [])

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
    if (solved || checking || rewindRef.current) return
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
    // THE HEADING IS SPENT THE MOMENT IT IS USED (or ignored). It is the answer
    // to "which way now", and once you have flown anywhere that question has a
    // new answer - leaving the arrow up would be the board asserting something
    // it has not checked.
    if (moved) { engineThrust(); clearHint() }
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
    // THE REWIND OWNS THE ROUTE WHILE IT IS RUNNING. `walkTo`, `undo` and
    // `restart` all stand aside for it and this did not, so a tap on the trail
    // mid-rewind set the path from here while the timer went on popping cells
    // off it from underneath - two writers, and whichever landed last won.
    if (solved || checking || rewindRef.current) return
    e.preventDefault()
    try { svgRef.current.setPointerCapture?.(e.pointerId) } catch { /* synthetic events have no active pointer */ }
    const cell = cellFromEvent(e)
    const idx = pathRef.current.indexOf(cell)
    draggingRef.current = true
    if (idx >= 0) {
      // Grab the trail anywhere along it: cut back to that point and drag on.
      setPathLive(pathRef.current.slice(0, idx + 1))
      clearHint()
    } else {
      walkTo(cell)
    }
  }
  function onPointerMove(e) {
    if (!draggingRef.current || solved) return
    walkTo(cellFromEvent(e))
  }
  function onPointerUp() { draggingRef.current = false }

  // THE HEADING IS CLEARED FROM EXACTLY ONE PLACE. It was cleared in `walkTo`,
  // in `undo` and in `restart` - and NOT in the one remaining path that changes
  // the route, which is grabbing the trail half way along and dragging on from
  // there. After a hint, doing that left the target ring sitting on a cell that
  // was no longer next to the aircraft, and the plane pointing at a cell it
  // could not reach: a hint that had become a lie.
  function clearHint() {
    setHintNext(null)
    setHintMsg(null)
  }

  function undo() {
    if (solved || rewindRef.current) return
    if (pathRef.current.length > 1) setPathLive(pathRef.current.slice(0, -1))
    clearHint()
  }
  function restart() {
    if (solved || rewindRef.current) return
    setPathLive([startCell])
    clearHint()
  }

  // THE HINT.
  //
  // `hintForPath` answers the only question worth asking - how much of what you
  // have flown can still be finished - and it answers it by SOLVING, not by
  // comparing against the one route the generator happened to build the puzzle
  // from. That distinction is the whole feature: on the easy tiers there are
  // thousands of valid routes, and a player flying a good one must not be told
  // they went wrong on move two. See lib/zipHint.
  //
  // It can only ever take moves away. Ethan: "the hint should never fill in more
  // than they've got already, just go back to correct what's wrong, and if they
  // were right then it should stay the same."
  //
  // AND THE WRONG PART REELS IN RATHER THAN VANISHING. Twelve cells disappearing
  // between two frames is a board you have to re-read; the contrail retracting
  // along itself, with the plane flying backwards down it, is the same
  // information as a thing you can watch happen. It is capped at a third of a
  // second however much comes off, because it is an undo and an undo that makes
  // you wait is a punishment.
  function takeHint() {
    if (solved || checking || cooling || rewindRef.current) return
    const res = hintForPath(puzzle, pathRef.current)
    setHintsUsed((n) => n + 1)
    setHintAt(Date.now())

    if (res.removed <= 0) {
      setHintNext(res.nextCell)
      setHintMsg(tr('All correct so far — keep going'))
      playHintClear()
      return
    }

    playHintRewind()
    setHintMsg(res.removed === 1 ? tr('Took back 1 move') : `${tr('Took back')} ${res.removed} ${tr('moves')}`)
    const keep = res.path.length
    const stepMs = Math.max(14, Math.min(34, 320 / res.removed))
    const step = () => {
      const cur = pathRef.current
      if (cur.length <= keep) {
        rewindRef.current = null
        setHintNext(res.nextCell)
        return
      }
      setPathLive(cur.slice(0, -1))
      rewindRef.current = setTimeout(step, stepMs)
    }
    rewindRef.current = setTimeout(step, 0)
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
  // A HINT TURNS THE AIRCRAFT, IT DOES NOT FLY IT. Ethan asked for the plane to
  // "have the plane facing in the right direction to go next" - so the heading
  // is the one thing a hint adds, and the move is still the player's to make.
  if (hintNext != null) {
    const [nx, ny] = centre(hintNext)
    if (nx !== hx || ny !== hy) angle = (Math.atan2(ny - hy, nx - hx) * 180) / Math.PI
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
  // CONTRAIL PUFFS. Four soft white blooms spaced back along the route from the
  // aircraft, biggest and brightest nearest it. A dashed line alone reads as a
  // drawn stroke; the puffs are what make it read as something the plane is
  // LEAVING BEHIND, and because they are placed by distance rather than by cell
  // they stay evenly spaced whatever shape the route is making.
  const puffs = []
  if (trailPts.length > 1) {
    const spec = [[26, 8.5, 0.5], [54, 6.6, 0.34], [86, 4.8, 0.2], [122, 3.4, 0.1]]
    for (const [d, r, o] of spec) {
      const pt = pointBack(trailPts, d)
      if (pt) puffs.push({ x: pt[0], y: pt[1], r, o })
    }
  }
  const covered = new Set(path)
  const progress = Math.round((path.length / N) * 100)
  const W = size * CELL
  const RING = 2 * Math.PI * 9.5 // the hint button's cooldown ring
  const coolFrac = cooling ? cooldownLeft / HINT_COOLDOWN_MS : 0

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
    <div ref={cardRef} className="space-y-6">
      <style>{`
        .fp-plane-bob { animation: fp-bob 2.1s ease-in-out infinite; }
        @keyframes fp-bob {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-2px); }
        }
        /* Dashes drift BACKWARDS along the path (away from the plane at the
           head), like a contrail streaming behind the aircraft. TWO layers now,
           at different speeds and different dash lengths: a single layer reads
           as a dashed line, two moving at different rates read as depth. The
           slower, finer one is the older air. */
        .fp-trail-dash { animation: fp-dash 0.8s linear infinite; }
        @keyframes fp-dash { to { stroke-dashoffset: 19; } }
        .fp-trail-dash-far { animation: fp-dash-far 1.55s linear infinite; }
        @keyframes fp-dash-far { to { stroke-dashoffset: 30; } }
        /* The wake breathes. Very slightly - this sits under everything else on
           the board and its job is to stop the trail looking like a printed
           shape, not to be noticed on its own. */
        .fp-wake { animation: fp-wake 3.4s ease-in-out infinite; }
        @keyframes fp-wake {
          0%, 100% { opacity: 0.2; }
          50% { opacity: 0.3; }
        }
        .fp-puff { animation: fp-puff 2.6s ease-in-out infinite; }
        @keyframes fp-puff {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.12); }
        }
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
        /* THE BOARD ARRIVES CELL BY CELL, on a diagonal. It used to be one
           scale-in of the whole grid, which on a 13x13 is 169 panes appearing
           in a single frame - correct, and it lands with a thump. Each pane
           now fades in on a delay set by how far it is from the top-left, so
           the sky sweeps open. Opacity and transform only, so it is cheap
           even at 169 of them. */
        .fp-cell { animation: fp-cell-in 0.42s cubic-bezier(0.22,1,0.36,1) both; transform-box: fill-box; transform-origin: center; }
        @keyframes fp-cell-in {
          from { opacity: 0; transform: scale(0.82); }
          to { opacity: 1; transform: scale(1); }
        }
        .fp-board { animation: fp-board-in 0.4s ease-out both; }
        @keyframes fp-board-in { from { opacity: 0; } to { opacity: 1; } }
        /* WHERE THE HINT SAYS TO GO. A dashed ring that turns, on the cell the
           plane has just been pointed at. The heading alone is right but it is
           small - at a glance on a phone a 12-degree difference between two
           candidate cells is not readable, and the whole point of the button is
           that it answers the question quickly. */
        .fp-target { animation: fp-target 5s linear infinite; transform-box: fill-box; transform-origin: center; }
        @keyframes fp-target { to { transform: rotate(360deg); } }
        .fp-target-pulse { animation: fp-target-pulse 1.5s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
        @keyframes fp-target-pulse {
          0%, 100% { opacity: 0.5; transform: scale(1); }
          50% { opacity: 0.85; transform: scale(1.08); }
        }
        /* THE HINT COMING BACK. The moment the button becomes pressable again
           is the only moment in the cooldown worth animating, and a button that
           simply stops being grey does not announce it. */
        .fp-hint-pop { animation: fp-hint-pop 0.5s cubic-bezier(0.22,1,0.36,1) both; }
        @keyframes fp-hint-pop {
          0% { transform: scale(0.94); box-shadow: 0 0 0 0 rgba(217,68,7,0.5); }
          45% { transform: scale(1.05); }
          100% { transform: scale(1); box-shadow: 0 0 0 12px rgba(217,68,7,0); }
        }
        .fp-hint-msg { animation: fp-hint-msg 0.3s ease-out both; }
        @keyframes fp-hint-msg {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .fp-plane-bob, .fp-trail-dash, .fp-trail-dash-far, .fp-wake, .fp-puff,
          .fp-nudge, .fp-wall-hit, .fp-stop-pop, .fp-cell, .fp-board,
          .fp-target, .fp-target-pulse, .fp-hint-pop, .fp-hint-msg { animation: none; }
        }
      `}</style>

      {/* THE HEADER IS ONE PANEL, AND THE PROGRESS IS A BAR.
          What was here was a `flex-wrap` row of three badges on the left and
          three things on the right, which is six items competing for 375px: on
          a phone it wrapped into two or three ragged lines and "Back to games"
          ended up wherever there was room. And "Sky filled 42%" was a NUMBER for
          a quantity that is a proportion - the one thing every other mode on
          this page draws as the gradient bar Ethan picked out.

          IT IS `PuzzleChrome` NOW (2 Sep 2026), because Guess the Country had a
          different one and Ethan asked for them to be the same. This is the
          design he named; the component is where it lives so the third daily
          puzzle cannot invent a fourth. */}
      <PuzzleChrome
        onExit={onExit}
        progress={progress}
        chips={(
          <>
            <Badge tone="light"><Icon name="plane-tryp" className="h-3.5 w-3.5" /> {tr("Flight Path")}</Badge>
            <Badge tone={HARD_DIFFS.includes(difficulty) ? 'brand' : 'grey'} className="!px-2 !py-0.5 text-[10px]">{DIFF_LABEL[difficulty]}</Badge>
            <StreakChip n={streak} title={`${streak}-day daily streak`} />
          </>
        )}
        stats={[
          { label: tr('Sky filled'), value: `${progress}%` },
          { label: tr('Time'), value: solved ? fmtTime(solveMs ?? 0) : fmtTime(elapsed), mono: true },
        ]}
      />

      <div className="card !p-3 sm:!p-6">
        {/* The rules, split so the phone gets the short version. The full
            sentence ran to four lines at 375px above a board that then had to
            share the screen with it. */}
        <p className="mb-3 text-center text-[13px] leading-snug text-smoke sm:mb-4 sm:text-sm">
          {tr("Fly through every stop")} <span className="font-semibold text-ink">{tr("in order")}</span>, filling the whole sky.
          {walls.length > 0 && <> {tr("Orange bars are")} <span className="font-semibold text-ink">{tr("no-fly walls")}</span>.</>}
          <span className="hidden sm:inline"> {tr("Drag the plane, drag backwards to undo.")}</span>
          {/* THE HINT HAS TO BE FINDABLE. A button nobody presses is a feature
              nobody has, and "Hint" next to "Undo" reads like a lesser Undo
              until somebody tells you what it actually does. */}
          <span className="hidden sm:inline"> {tr("Stuck? Hint rewinds you to your last correct move.")}</span>
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
            aria-label={tr("Flight path puzzle board")}
          >
            {/* THE SKY IS A SKY AGAIN (16 Sep 2026).
                Ethan: "the background is pure white which I think would be
                better a nice blue/white gradient, represents the sky."

                It has been both. The original was a saturated three-stop blue,
                which he rejected in September for the right reason - it was the
                one surface in a white-and-orange product painted a colour the
                product does not own, and it fought the orange trail that is the
                whole subject of the board. Pure white then fixed that and lost
                something else: a puzzle about flying was played over a blank
                page, and the grid had to be outlined in grey to exist at all.

                So the third answer is neither. This gradient starts at a PALE
                blue - light enough that the orange trail is still the only
                saturated thing on the board - and washes out to near-white at
                the bottom, which is what a real sky does and what gives a large
                square some depth without giving it a colour. The panes go back
                to being translucent white over it, which is the relationship
                that reads: cloud over sky, not boxes on paper. */}
            <defs>
              <linearGradient id="fp-sky" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#8cc3ef" />
                <stop offset="38%" stopColor="#b3d8f5" />
                <stop offset="74%" stopColor="#d8ecfb" />
                <stop offset="100%" stopColor="#eef7fe" />
              </linearGradient>
              {/* The aircraft's halo and its fuselage shading. Both live here
                  rather than inside PlaneIcon because a gradient has to be in
                  the same SVG document as the thing that references it, and
                  there is exactly one board on the page. */}
              {/* A WHISPER, NOT A DISC. The plane used to sit on a white
                  circle and Ethan had that removed; this is deliberately far
                  short of one - it is a soft warm lift under the aircraft so it
                  never merges into the orange trail, and at these opacities you
                  cannot see where it ends. */}
              <radialGradient id="fp-halo" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.42" />
                <stop offset="45%" stopColor="#fff1e4" stopOpacity="0.2" />
                <stop offset="100%" stopColor="#ffd9be" stopOpacity="0" />
              </radialGradient>
              <linearGradient id="fp-fuse" x1="0" y1="0" x2="1" y2="0.25">
                <stop offset="0%" stopColor="#ff9f62" />
                <stop offset="52%" stopColor="#e8550f" />
                <stop offset="100%" stopColor="#c23a03" />
              </linearGradient>
            </defs>
            {/* the sky behind the flight grid */}
            <rect x="0" y="0" width={W} height={W} fill="url(#fp-sky)" />
            {/* Sky cells: translucent white panes over the blue. The stroke is
                a faint INK, not a white one, because the gradient washes out to
                near-white at the foot of the board and a white edge would
                disappear down there. */}
            {Array.from({ length: N }).map((_, cell) => {
              const r = Math.floor(cell / size), c = cell % size
              const x = c * CELL, y = r * CELL
              return (
                <rect
                  key={cell}
                  className="fp-cell"
                  style={{ animationDelay: `${Math.min((r + c) * 14, 340)}ms` }}
                  x={x + 3} y={y + 3} width={CELL - 6} height={CELL - 6} rx={14}
                  fill="#ffffff"
                  fillOpacity={0.5}
                  stroke="rgba(255,255,255,0.75)"
                  strokeWidth={1.5}
                />
              )
            })}

            {/* the flown sky: one continuous rounded SNAKE through every cell
                on the route - a breathing wake glow under a solid rounded body
                (round caps = rounded head/tail), then two dashed white
                contrails at different speeds and a run of soft puffs streaming
                back from the aircraft */}
            {path.length > 1 ? (
              <>
                <path className="fp-wake" d={trailD} fill="none" stroke={BRAND_LIGHT} strokeOpacity={0.22} strokeWidth={84} strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: 'none' }} />
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
                {/* A thin bright crease along the top of the body. A 54-unit
                    round stroke is a tube, and a tube with no highlight on it
                    is a flat band; this is the line of light along its spine. */}
                <path d={trailD} fill="none" stroke="#ffd9bd" strokeOpacity={0.5} strokeWidth={16} strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: 'none' }} />
                {/* The contrail dashes stay WHITE: they are drawn ON the orange
                    body, not on the board, so the board's colour is irrelevant
                    to them - and white on orange is the contrast this platform
                    uses everywhere. The second, finer layer runs at half the
                    speed, which is what turns a dashed line into moving air. */}
                <path className="fp-trail-dash-far" d={trailD} fill="none" stroke="#ffffff" strokeOpacity={0.45} strokeWidth={2.5} strokeDasharray="2 28" strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: 'none' }} />
                <path className="fp-trail-dash" d={trailD} fill="none" stroke="#ffffff" strokeWidth={5} strokeDasharray="3 16" strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: 'none' }} />
                {puffs.map((pf, i) => (
                  <circle
                    key={i}
                    className="fp-puff"
                    style={{ animationDelay: `${i * 220}ms`, pointerEvents: 'none' }}
                    cx={pf.x} cy={pf.y} r={pf.r} fill="#ffffff" fillOpacity={pf.o}
                  />
                ))}
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

            {/* WHERE THE HINT POINTED. Only ever drawn on a cell the player
                could legally fly to from where they are now - it is the same
                cell the aircraft has been turned towards, said twice, because
                a heading is precise and a ring is legible. */}
            {hintNext != null && !solved && !checking && (() => {
              const [tx, ty] = centre(hintNext)
              return (
                <g style={{ pointerEvents: 'none' }}>
                  <circle className="fp-target-pulse" cx={tx} cy={ty} r={40} fill={BRAND_LIGHT} fillOpacity={0.55} />
                  <circle
                    className="fp-target"
                    cx={tx} cy={ty} r={34}
                    fill="none" stroke={BRAND} strokeWidth={4}
                    strokeDasharray="10 9" strokeLinecap="round" strokeOpacity={1}
                  />
                </g>
              )
            })()}

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
                <p className="text-xl font-bold text-ink">{tr("Smooth landing!")}</p>
                <p className="text-sm text-smoke">
                  Today's flight completed{solveMs != null ? ` in ${fmtTime(solveMs)}` : ''}.
                </p>
                {/* Said, not scored. Hints are not counted against anybody on
                    the leaderboard - the board ranks time, and a hint costs you
                    ten seconds of it, which is punishment enough. */}
                {hintsUsed > 0 && (
                  <p className="text-xs text-smoke">
                    {hintsUsed === 1 ? tr('With 1 hint') : `${tr('With')} ${hintsUsed} ${tr('hints')}`}
                  </p>
                )}
                <p className="text-xs text-smoke">New route at midnight UK time · {nextIn}</p>
                <button onClick={onExit} className="btn-secondary !py-2 text-sm">{tr("Back to games")}</button>
              </div>
            </div>
          )}
          {checking && !solved && (
            <div className="absolute inset-0 flex items-center justify-center rounded-card bg-white/70">
              <p className="text-sm text-smoke">{tr("Checking today's flight…")}</p>
            </div>
          )}
        </div>

        {/* THE CONTROLS ARE THUMB-SIZED, AND "NEXT STOP" IS THE BIGGEST THING
            IN THE ROW. It was two small secondary buttons and a line of grey
            11px text, in that order - so the thing you look at between every
            move was the smallest and faintest item on the page, and the two
            buttons you press by accident were the loudest. The number now sits
            in a brand chip on the right and the buttons are 44px tall, which is
            the minimum a finger can be asked to hit.

            HINT LEADS THE ROW (16 Sep 2026). It is the only button here that
            does something you cannot do yourself, and on a legend board it is
            the difference between finishing and giving up - so it is the one
            wearing the brand colour and it goes first. Undo and Restart are
            still exactly where they were. */}
        {!solved && !checking && (
          <div className="mt-4 flex flex-col items-center gap-2">
            <div className="flex flex-wrap items-center justify-center gap-2.5 sm:gap-3">
              <button
                // Keyed on the cooldown so the "it's back" animation actually
                // runs: re-applying a class to a node that already has it does
                // not restart a CSS animation, and this one has to fire on the
                // exact frame the button becomes pressable.
                key={cooling ? 'hint-cooling' : 'hint-ready'}
                onClick={takeHint}
                disabled={cooling}
                aria-label={cooling ? `${tr('Hint')} — ${Math.ceil(cooldownLeft / 1000)}s` : tr('Hint')}
                title={cooling ? tr('Cooling down') : tr('Rewind to your last correct move')}
                className={cx(
                  'relative flex h-11 items-center gap-2 overflow-hidden rounded-full border px-4 text-sm font-semibold transition-all duration-200 active:scale-95',
                  cooling
                    ? 'cursor-not-allowed border-gray-200 bg-cloud text-gray-400'
                    : 'border-brand/45 bg-brand-tint text-brand hoverable:hover:-translate-y-0.5 hoverable:hover:border-brand hoverable:hover:shadow-card',
                  !cooling && hintAt > 0 && 'fp-hint-pop',
                )}
              >
                {/* The wait, said twice over: a bar filling across the button
                    and a ring emptying inside it. One of them is readable at a
                    glance from across the room and the other tells you how many
                    seconds are left; a disabled button with neither is
                    indistinguishable from a broken one. */}
                {cooling && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-0 left-0 bg-brand/10"
                    style={{ width: `${(1 - coolFrac) * 100}%`, transition: 'width 90ms linear' }}
                  />
                )}
                <span className="relative flex h-5 w-5 items-center justify-center">
                  {cooling ? (
                    <svg viewBox="0 0 24 24" className="h-5 w-5 -rotate-90" aria-hidden="true">
                      <circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
                      <circle
                        cx="12" cy="12" r="9.5" fill="none"
                        stroke="currentColor" strokeWidth="3" strokeLinecap="round"
                        strokeDasharray={RING}
                        strokeDashoffset={RING * (1 - coolFrac)}
                        style={{ transition: 'stroke-dashoffset 90ms linear' }}
                      />
                    </svg>
                  ) : (
                    <Icon name="bulb" className="h-[18px] w-[18px]" />
                  )}
                </span>
                <span className="relative tabular-nums">
                  {cooling ? `${Math.ceil(cooldownLeft / 1000)}s` : tr('Hint')}
                </span>
              </button>
              <button
                onClick={undo}
                className="flex h-11 items-center gap-1.5 rounded-full border border-gray-200 px-4 text-sm font-semibold text-smoke transition-all duration-200 hover:-translate-y-0.5 hover:border-brand hover:text-brand active:scale-95"
              >
                <Icon name="reply" className="h-4 w-4" />
                {tr("Undo")}
              </button>
              <button
                onClick={restart}
                className="flex h-11 items-center gap-1.5 rounded-full border border-gray-200 px-4 text-sm font-semibold text-smoke transition-all duration-200 hover:-translate-y-0.5 hover:border-brand hover:text-brand active:scale-95"
              >
                <Icon name="reorder" className="h-4 w-4" />
                {tr("Restart")}
              </button>
              <span className="flex h-11 items-center gap-2 rounded-full bg-brand-tint px-4 text-brand">
                <span className="text-[10px] font-semibold uppercase tracking-widest">{tr("Next stop")}</span>
                <span className="text-lg font-extrabold tabular-nums leading-none">{Math.min(expected, lastN)}</span>
              </span>
            </div>

            {/* WHAT THE HINT JUST DID, IN WORDS. "Nothing visibly happened" is
                the correct outcome when the player was already right, and it is
                also what a broken button looks like - so that case is the one
                that most needs saying out loud. The line holds its height so
                the controls above it do not jump when it appears. */}
            <p className="flex h-5 items-center text-xs text-smoke" aria-live="polite">
              {hintMsg && (
                <span key={hintMsg} className="fp-hint-msg font-medium text-brand">{hintMsg}</span>
              )}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
