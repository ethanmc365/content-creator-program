import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import Icon from '../Icon'
import { Spinner } from '../ui'
import { cx } from '../../lib/utils'
import { enablePush, pushPermission, pushSupported } from '../../lib/push'
import { goalAccepts, partOf, stepAt, stepsFor, variantFor } from '../../lib/tour'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'

// THE WALKTHROUGH, DRAWN AND DRIVEN.
//
// Four layers, and the order they are listed in is the order they matter:
//
//   THE AURA      a soft orange gradient bleeding inwards from all four edges
//                 of the viewport for the whole walk. NOT a border. There is no
//                 line anywhere in it - it is four overlapping gradients and a
//                 pair of corner blooms, so the screen looks lit from its own
//                 edges rather than framed.
//   THE HALO      the highlighted thing, wearing a heavy orange glow. THIS is
//                 what does the highlighting now.
//   THE VEIL      a very light wash over everything else, with a FEATHERED hole
//                 punched in it. It used to be 62% black, which turned a live
//                 app into a photograph of one; it is 20% now with a soft edge,
//                 because the halo is carrying the work.
//   THE CARD      the words, one progress bar, and the instruction.
//
// FOUR ARCHITECTURAL DECISIONS THAT MATTER
//
// 1. REACT OWNS THE CONTENT, ONE rAF LOOP OWNS EVERY PIXEL OF GEOMETRY.
//    Tracking a scrolling anchor through React state means a setState per frame
//    and a re-render of the whole overlay with it. Position, size, radius and
//    the card's placement are written STRAIGHT to the elements' styles inside
//    one loop; React re-renders only when the step changes.
//
// 2. THE TRAVEL BETWEEN STEPS IS TWEENED IN THAT SAME LOOP, NOT IN CSS.
//    A CSS transition on `top`/`left` cannot tell the difference between "the
//    step changed" and "the page scrolled", so the highlight swam a few frames
//    behind every scroll. The loop keeps its own clock: for ~600ms after a step
//    change it eases from where it was to wherever the target is RIGHT NOW
//    (so a target that is itself still moving is chased, not raced), and after
//    that it is welded to the target with no interpolation at all.
//
// 3. THE CARD IS PLACED, NOT PARKED. Every frame it works out which side of the
//    highlighted thing has room, picks a width that fits that gap, and moves
//    there - so it changes size and shape as the walk goes on and it never sits
//    on top of the thing it is pointing at. Anchorless steps get a wide card in
//    the middle; a phone gets a full-width one above or below.
//
// 4. NOTHING IS TRAPPED, AND THERE IS NO CLOSE BUTTON IN THE CORNER.
//    The veil is pointer-events:none throughout, so every control underneath
//    stays live, and the walk advances when the creator does the thing. There
//    is no X: a cross in the corner of a two-minute walk is a button whose only
//    purpose is to end the walk before it has started, and it gets pressed by
//    reflex. Leaving is a worded link at the foot of the card, and Escape.

const PAD = 10          // how far the halo stands off the thing it is round
const GAP = 18          // how far the card stands off the halo
const EDGE = 14         // how close anything may get to the edge of the screen
const TRAVEL_MS = 620

const WIDTHS = { sm: 328, md: 384, lg: 452 }

const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, hi))
const lerp = (a, b, t) => a + (b - a) * t
// Quintic ease-out. Leaves fast, arrives with no overshoot, and is flat enough
// at the end that a target which moves late in the tween is still caught.
const ease = (t) => 1 - (1 - t) ** 5

function findAnchor(name) {
  if (!name) return null
  const all = [...document.querySelectorAll(`[data-tour="${name}"]`)]
  return all.find((el) => {
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0 && el.offsetParent !== null
  }) || null
}

/** The bottom-left safe area, in px, straight from the stylesheet. */
function safeBottom() {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--tour-safe-b')
    return parseFloat(v) || 0
  } catch { return 0 }
}

/**
 * WHERE THE CARD GOES.
 *
 * Pure, and deliberately so: it is the one piece of this file with any
 * judgement in it, and judgement that cannot be reasoned about on paper ends up
 * being tuned by screenshot.
 *
 * Every side of the highlighted thing that can hold the card is a candidate,
 * scored on how much room is actually there. A wide screen prefers to put the
 * card BESIDE the highlight, because a page's content runs down the middle and
 * the margins are the empty part; a phone has no margins, so it goes above or
 * below. Nothing that fits is ever allowed to overlap the halo.
 */
export function placeCard({ rect, vw, vh, w, h, bottomInset = 0 }) {
  const top = EDGE
  const bottom = vh - EDGE - bottomInset
  const clampX = (x) => clamp(x, EDGE, Math.max(EDGE, vw - w - EDGE))
  const clampY = (y) => clamp(y, top, Math.max(top, bottom - h))

  if (!rect) {
    // Nothing to sit beside. Slightly above the optical centre, which is where
    // the eye already is, and clear of a phone's tab bar.
    return { x: clampX((vw - w) / 2), y: clampY((bottom - top - h) * 0.42 + top), side: 'centre' }
  }

  const cx = rect.x + rect.w / 2
  const cy = rect.y + rect.h / 2
  const wide = vw >= 900
  const cands = []

  if (rect.x + rect.w + GAP + w + EDGE <= vw) {
    cands.push({ side: 'right', x: rect.x + rect.w + GAP, y: clampY(cy - h / 2), room: vw - (rect.x + rect.w) })
  }
  if (rect.x - GAP - w - EDGE >= 0) {
    cands.push({ side: 'left', x: rect.x - GAP - w, y: clampY(cy - h / 2), room: rect.x })
  }
  if (rect.y + rect.h + GAP + h <= bottom) {
    cands.push({ side: 'below', x: clampX(cx - w / 2), y: rect.y + rect.h + GAP, room: bottom - (rect.y + rect.h) })
  }
  if (rect.y - GAP - h >= top) {
    cands.push({ side: 'above', x: clampX(cx - w / 2), y: rect.y - GAP - h, room: rect.y - top })
  }

  if (cands.length) {
    const bias = (side) => {
      const sideways = side === 'left' || side === 'right'
      return wide === sideways ? 260 : 0
    }
    cands.sort((a, b) => (b.room + bias(b.side)) - (a.room + bias(a.side)))
    return cands[0]
  }

  // Nothing fits cleanly - a tall card and a highlight in the middle of a short
  // screen. Put it in whichever half of the screen the highlight is NOT in and
  // let it clamp: a card half over the halo still beats a card hanging off the
  // edge. No nib in this case, because the card is no longer adjacent to
  // anything and an arrow pointing across a gap points at whatever is in the
  // gap.
  const below = cy < vh / 2
  return {
    x: clampX(cx - w / 2),
    y: below ? clampY(bottom - h) : clampY(top),
    side: 'centre',
    tight: true,
  }
}

export default function TourHost({ onFinish, network = false }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()

  const steps = useMemo(() => stepsFor({ network }), [network])
  const [i, setI] = useState(0)
  // 'settle' -> we may still be navigating; 'probe' -> looking for the anchor;
  // 'live' -> the step is on screen and its goal is armed.
  const [phase, setPhase] = useState('settle')
  const [present, setPresent] = useState(true)
  const [busy, setBusy] = useState(false)
  const [hit, setHit] = useState(false)
  const [pushState, setPushState] = useState(() => pushPermission())
  const [meter, setMeter] = useState(0)       // 0..1 for dwell and scroll goals

  const veilRef = useRef(null)
  const haloRef = useRef(null)
  const cardRef = useRef(null)
  const innerRef = useRef(null)
  const rafRef = useRef(0)
  const advanced = useRef(false)
  const armedAt = useRef(0)
  // WHICH STEP THE `live` PHASE ACTUALLY BELONGS TO.
  //
  // React state updates are not applied until the next render, so on the commit
  // where `i` changes, `phase` is still 'live' from the step BEFORE it. Without
  // this the "drop a step that resolved to nothing" effect below reads that
  // stale `live` together with the NEW step's resolution - and a stale `present`
  // with it - and can drop a perfectly good step before it has even been looked
  // for. The key is written at the moment a step genuinely goes live.
  const armedKey = useRef(null)
  // The card's measured size, kept by a ResizeObserver rather than by reading
  // offsetHeight inside the rAF loop. Measuring in the loop forced a layout on
  // every frame, twice, while the card was mid-transition.
  const cardSize = useRef({ w: 0, h: 260 })
  const appliedW = useRef(0)
  // Everything the tween needs. Refs, because nothing in here may cause a
  // render: it changes sixty times a second.
  const tween = useRef({ halo: null, card: null, from: null, t0: 0, radius: 14 })

  const raw = steps[Math.min(i, steps.length - 1)]
  const ready = phase === 'live'
  const step = useMemo(
    () => variantFor(raw, { network, present, pathname: location.pathname }),
    // The pathname is read ONCE per step, when the step is resolved. Re-running
    // this on every navigation would re-resolve `brief-read` out of existence
    // the moment its own goal moved the creator off /challenges/…
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [raw, network, present],
  )
  const last = i >= steps.length - 1
  const goal = step?.goal || null
  const part = partOf(raw)
  const pct = Math.round(((i + (hit ? 1 : 0)) / steps.length) * 100)

  // WHAT THE CARD IS SHOWING WHILE IT IS BETWEEN TWO THINGS.
  //
  // The card fades out, travels, and fades back in, and the step it belongs to
  // changes somewhere in the middle of that. Rendering `null` for those frames
  // would unmount the layer and lose the position it is travelling FROM, so the
  // next card would appear at the top-left corner for a frame and then jump.
  // The last resolved step is held instead, invisible, purely so the box has
  // something the right shape in it while it moves.
  const [held, setHeld] = useState(null)
  useEffect(() => { if (step) setHeld(step) }, [step])
  const view = step || held

  // ------------------------------------------------------------ advancing ---
  const finishStep = useCallback(() => {
    if (advanced.current) return
    advanced.current = true
    setHit(true)
    // A beat of acknowledgement before moving. Without it a tap that
    // simultaneously navigates AND swaps the card reads as the card glitching.
    setTimeout(() => {
      setHit(false)
      if (last) { onFinish?.('finished'); return }
      setI((n) => n + 1)
    }, 600)
  }, [last, onFinish])

  const skip = useCallback(() => {
    if (advanced.current) return
    advanced.current = true
    if (last) { onFinish?.('finished'); return }
    setI((n) => n + 1)
  }, [last, onFinish])

  const leave = useCallback(() => onFinish?.('dismissed'), [onFinish])

  // ----------------------------------------------------- entering a step ---
  //
  // Three beats. Navigate if the step lives somewhere else, then LOOK FOR THE
  // ANCHOR for up to a second and a half, then go live. The looking is the part
  // that was missing: a challenge card cannot be found on the frame the router
  // arrives, so "is there a live brief" was being answered by a page that had
  // not loaded yet.
  useEffect(() => {
    setPhase('settle')
    setPresent(true)
    setMeter(0)
    advanced.current = false
    armedKey.current = null
    if (!raw) return undefined

    const to = stepAt(raw, network)
    const g = raw.goalNet && network ? raw.goalNet : raw.goal
    const alreadyThere = goalAccepts(g, location.pathname)
    if (to && !alreadyThere) {
      const [path] = to.split('?')
      const sameRoute = path === location.pathname
        && (!to.includes('?') || to.endsWith(location.search))
      if (!sameRoute) navigate(to)
    }

    let cancelled = false
    const settle = setTimeout(() => {
      if (cancelled) return
      if (!raw.anchor) { setPresent(true); setPhase('live'); armedAt.current = Date.now(); armedKey.current = raw.key; return }
      setPhase('probe')
      const deadline = Date.now() + 1500
      const look = () => {
        if (cancelled) return
        if (findAnchor(raw.anchor)) {
          setPresent(true); setPhase('live'); armedAt.current = Date.now(); armedKey.current = raw.key; return
        }
        if (Date.now() > deadline) {
          setPresent(false); setPhase('live'); armedAt.current = Date.now(); armedKey.current = raw.key; return
        }
        probe = setTimeout(look, 90)
      }
      let probe = setTimeout(look, 0)
      cleanup = () => clearTimeout(probe)
    }, 320)
    let cleanup = null
    return () => { cancelled = true; clearTimeout(settle); cleanup?.() }
    // `location` is deliberately absent: navigating IS the effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, raw?.key, network])

  // A step that resolved to nothing - no anchor, no empty variant, or a step
  // that needed a page nobody reached - is dropped without ceremony.
  useEffect(() => {
    if (ready && raw && armedKey.current === raw.key && !step) skip()
  }, [ready, raw, step, skip])

  // -------------------------------------------------- goal: they navigate ---
  useEffect(() => {
    if (!ready || goal?.kind !== 'route') return
    if (goalAccepts(goal, location.pathname)) finishStep()
  }, [ready, goal, location.pathname, finishStep])

  // ---------------------------------------------------- goal: they scroll ---
  //
  // THE BUG THIS FIXES: "sometimes it didn't register the scroll".
  //
  // It listened for `scroll` on `window` and compared `window.scrollY` against
  // a baseline. Three ways that fails, all of them real here:
  //   * the scroll happened inside a container (a rail, a modal, the aircraft
  //     wall) and never reached the window at all;
  //   * they scrolled down and back up, so the ABSOLUTE difference never
  //     reached the threshold even though they had scrolled twice as far;
  //   * the page was shorter than the viewport, so there was nothing to scroll
  //     and the only way past the step was the skip button.
  //
  // So: distance is ACCUMULATED, from any scroller on the page (capture phase
  // catches nested ones), with wheel and touch deltas as a backstop for
  // anything that scrolls without firing a scroll event. The threshold is
  // lowered to what the page can actually deliver, and a page that cannot
  // scroll at all becomes a short dwell instead of a dead end.
  useEffect(() => {
    if (!ready || goal?.kind !== 'scroll') return undefined
    const doc = document.documentElement
    const room = Math.max(0, (doc.scrollHeight || 0) - window.innerHeight)
    const need = Math.max(60, Math.min(goal.px, room - 8))

    if (room < 80) {
      // Nothing to scroll. Read the screen instead.
      const started = Date.now()
      const id = setInterval(() => {
        const p = Math.min(1, (Date.now() - started) / 4200)
        setMeter(p)
        if (p >= 1) finishStep()
      }, 60)
      return () => clearInterval(id)
    }

    let acc = 0
    const lasts = new WeakMap()
    const bump = (by) => {
      acc += Math.abs(by)
      setMeter(Math.min(1, acc / need))
      if (acc >= need) finishStep()
    }
    const track = (el) => {
      const top = el === document ? window.scrollY : (el.scrollTop || 0)
      const prev = lasts.get(el)
      lasts.set(el, top)
      // The first sighting of a scroller is a baseline, never a delta - and the
      // step's own scrollIntoView is still settling for a moment after arming.
      if (prev == null || Date.now() - armedAt.current < 350) return
      bump(top - prev)
    }
    const onScroll = (e) => {
      const t = e.target
      track(t === document || t === window || t === doc ? document : t)
    }
    const onWheel = (e) => { if (Date.now() - armedAt.current > 350) bump(e.deltaY) }
    let touchY = null
    const onTouchStart = (e) => { touchY = e.touches?.[0]?.clientY ?? null }
    const onTouchMove = (e) => {
      const y = e.touches?.[0]?.clientY
      if (y == null || touchY == null) return
      if (Date.now() - armedAt.current > 350) bump(y - touchY)
      touchY = y
    }
    document.addEventListener('scroll', onScroll, { capture: true, passive: true })
    window.addEventListener('wheel', onWheel, { passive: true })
    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: true })
    return () => {
      document.removeEventListener('scroll', onScroll, { capture: true })
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
    }
  }, [ready, goal, finishStep])

  // ----------------------------------------------------- goal: they click ---
  useEffect(() => {
    if (!ready || goal?.kind !== 'click') return undefined
    const onClick = (e) => {
      if (e.target?.closest?.(`[data-tour="${goal.anchor}"]`)) finishStep()
    }
    // Capture phase: the app's own handler may unmount the button.
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [ready, goal, finishStep])

  // ------------------------------------------------ goal: nothing to do ---
  useEffect(() => {
    if (!ready || goal?.kind !== 'dwell') return undefined
    const started = Date.now()
    const id = setInterval(() => {
      const p = Math.min(1, (Date.now() - started) / goal.ms)
      setMeter(p)
      if (p >= 1) finishStep()
    }, 60)
    return () => clearInterval(id)
  }, [ready, goal, finishStep])

  // ------------------------------------------------- goal: they connect ---
  useEffect(() => {
    if (!ready || goal?.kind !== 'connect' || !user?.id) return undefined
    let alive = true
    let baseline = null
    const check = async () => {
      // `creator_id` is the person who SENT it - see lib/connections. Counting
      // both sides would go green for a request somebody sent to THEM.
      const { count } = await supabase
        .from('connections').select('id', { count: 'exact', head: true }).eq('creator_id', user.id)
      if (!alive) return
      const n = count ?? 0
      // Baseline first, so a creator who already had connections is not skipped
      // straight past the one step that asks them to make a new one.
      if (baseline === null) { baseline = n; return }
      if (n > baseline) finishStep()
    }
    check()
    const id = setInterval(check, 1400)
    return () => { alive = false; clearInterval(id) }
  }, [ready, goal, user?.id, finishStep])

  // ---------------------------------------------------- goal: they allow ---
  useEffect(() => {
    if (goal?.kind !== 'push') return undefined
    const id = setInterval(() => {
      const p = pushPermission()
      setPushState(p)
      if (p === 'granted') finishStep()
    }, 500)
    return () => clearInterval(id)
  }, [goal, finishStep])

  async function doPush() {
    setBusy(true)
    try {
      await enablePush(user?.id)
      const p = pushPermission()
      setPushState(p)
      if (p === 'granted') finishStep()
    } catch { /* declined, or the browser refused */ }
    setBusy(false)
  }

  // The card's own size, watched rather than measured. A ResizeObserver fires
  // when the content changes AND while the width transition runs, which is
  // exactly when the placement needs recomputing and never on the frames when
  // it does not.
  useEffect(() => {
    const el = innerRef.current
    if (!el || typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(([e]) => {
      cardSize.current = { w: e.contentRect.width, h: e.contentRect.height }
    })
    ro.observe(el)
    const r = el.getBoundingClientRect()
    cardSize.current = { w: r.width, h: r.height }
    return () => ro.disconnect()
  }, [])

  // ------------------------------------------------------ THE rAF LOOP ---
  //
  // Everything geometric happens here and nowhere else: measure the anchor,
  // size the halo, choose the card's width and side, tween both from wherever
  // they were. No React state is touched, so this runs at display rate without
  // re-rendering anything.
  const anchorName = step?.anchor || null
  const size = step?.size || 'md'

  useEffect(() => {
    if (!ready) return undefined

    // BRING THE TARGET INTO VIEW ONLY IF IT IS GENUINELY OFF THE SCREEN.
    //
    // This used to fire whenever the anchor was within 80px of an edge, which
    // is where a nav bar lives - so pointing at a sticky header scrolled the
    // page trying to centre something that cannot move, and pointing at the
    // mobile tab bar did the same from the other end. An element that is fully
    // on screen never needs the page moved under the reader.
    const first = findAnchor(anchorName)
    if (first) {
      const r = first.getBoundingClientRect()
      const vh = window.innerHeight
      const off = r.bottom < 8 || r.top > vh - 8
      if (off) first.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }

    // A new step: freeze where we are and start the clock.
    tween.current.from = { halo: tween.current.halo, card: tween.current.card }
    tween.current.t0 = performance.now()

    let radiusEl = null
    let radius = 14

    const tick = (now) => {
      rafRef.current = requestAnimationFrame(tick)
      const halo = haloRef.current
      const card = cardRef.current
      const inner = innerRef.current
      if (!halo || !card || !inner) return

      const vw = window.innerWidth
      const vh = window.visualViewport?.height || window.innerHeight
      const phone = vw < 640
      const bottomInset = safeBottom() + (phone ? 62 : 0)

      // ---- the target the halo wants to be ----
      const el = findAnchor(anchorName)
      const r = el?.getBoundingClientRect()
      const onScreen = !!r && r.width > 0 && r.top < vh && r.top + r.height > 0
        && r.left < vw && r.left + r.width > 0
      if (el && el !== radiusEl) {
        radiusEl = el
        radius = (parseFloat(getComputedStyle(el).borderTopLeftRadius) || 6) + PAD
      }
      const target = onScreen
        ? { x: r.left - PAD, y: r.top - PAD, w: r.width + PAD * 2, h: r.height + PAD * 2 }
        : null

      // ---- how wide the card is, and where it goes ----
      // The width comes from the step's own preference, clipped to the screen -
      // never from measuring, so nothing here forces a layout. The height comes
      // from the ResizeObserver above. `placeCard` then picks whichever side of
      // the highlight can hold that box; if no side can, it falls back rather
      // than the card shrinking, because a 320px card that still does not fit
      // beside a nav item is just a smaller card in the wrong place.
      const room = vw - EDGE * 2
      const w = phone ? Math.min(room, 430) : Math.min(WIDTHS[size] || WIDTHS.md, room)
      const h = cardSize.current.h || 260
      const chosen = placeCard({ rect: target, vw, vh, w, h, bottomInset })

      if (appliedW.current !== w) {
        inner.style.width = `${w}px`
        inner.style.maxHeight = `${Math.max(220, vh - EDGE * 2 - bottomInset)}px`
        appliedW.current = w
      }
      card.dataset.side = chosen.side

      // ---- the tween ----
      const t = clamp((now - tween.current.t0) / TRAVEL_MS, 0, 1)
      const k = ease(t)
      const from = tween.current.from

      // The halo. A step that had no highlight grows the new one out of its own
      // centre rather than flying in from the last one's corner.
      let drawn = target
      if (target) {
        const src = from?.halo || { x: target.x + target.w / 2, y: target.y + target.h / 2, w: 0, h: 0 }
        drawn = t < 1
          ? {
              x: lerp(src.x, target.x, k),
              y: lerp(src.y, target.y, k),
              w: lerp(src.w, target.w, k),
              h: lerp(src.h, target.h, k),
            }
          : target
        halo.style.opacity = '1'
        halo.style.transform = `translate3d(${drawn.x}px, ${drawn.y}px, 0)`
        halo.style.width = `${Math.max(0, drawn.w)}px`
        halo.style.height = `${Math.max(0, drawn.h)}px`
        halo.style.borderRadius = `${radius}px`
        tween.current.halo = drawn
      } else {
        halo.style.opacity = '0'
        tween.current.halo = null
      }

      // The veil's hole is the halo, one element behind it, so the feathered
      // edge of the dim and the glow are always the same rectangle.
      const veil = veilRef.current
      if (veil) {
        if (drawn && target) {
          veil.style.opacity = '1'
          veil.style.transform = `translate3d(${drawn.x}px, ${drawn.y}px, 0)`
          veil.style.width = `${Math.max(0, drawn.w)}px`
          veil.style.height = `${Math.max(0, drawn.h)}px`
          veil.style.borderRadius = `${radius}px`
        } else {
          // NOTHING TO HIGHLIGHT MEANS NOTHING TO DIM.
          //
          // The wash used to stay on with no hole in it, which turns a step
          // that simply has no target - the welcome, the sign-off, a card whose
          // anchor has scrolled away - into a greyed-out screen that reads as
          // the app being disabled. There is nothing being pointed AT, so
          // dimming everything says nothing and costs the app its colour. The
          // aura still says the walkthrough is running.
          veil.style.opacity = '0'
          veil.style.transform = `translate3d(${vw / 2}px, ${vh / 2}px, 0)`
          veil.style.width = '0px'
          veil.style.height = '0px'
        }
      }

      // The card.
      const want = { x: chosen.x, y: chosen.y, w }
      const src = from?.card || { x: chosen.x, y: chosen.y + 18, w }
      const pos = t < 1
        ? { x: lerp(src.x, want.x, k), y: lerp(src.y, want.y, k), w }
        : want
      card.style.transform = `translate3d(${Math.round(pos.x)}px, ${Math.round(pos.y)}px, 0)`
      tween.current.card = pos
    }

    // A resize invalidates the width we last applied, so the next frame writes
    // it again along with a fresh max-height.
    const onResize = () => { appliedW.current = 0 }
    window.addEventListener('resize', onResize)
    window.visualViewport?.addEventListener('resize', onResize)

    appliedW.current = 0
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener('resize', onResize)
      window.visualViewport?.removeEventListener('resize', onResize)
    }
  }, [ready, anchorName, size, step?.key])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') leave() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [leave])

  if (!view) return null

  // The gate: notifications cannot be skipped while there is something to press.
  const pushBlocked = view.required && view.goal?.kind === 'push'
    && pushState === 'default' && pushSupported()

  const metered = view.goal?.kind === 'dwell' || view.goal?.kind === 'scroll'

  return createPortal(
    <div className="tour-root" aria-live="polite">
      {/* THE AURA. Four gradients and two corner blooms - no line anywhere. */}
      <div className="tour-aura" aria-hidden />

      {/* THE VEIL. One element: a vast, softly blurred spread shadow that dims
          everything outside its own box, so the "hole" is the box itself. */}
      <div ref={veilRef} aria-hidden className="tour-veil" />

      {/* THE HALO, over the veil, so the glow lands on the page and not under
          the dim. */}
      <div ref={haloRef} aria-hidden className="tour-halo" />

      <div
        ref={cardRef}
        className="tour-card-layer"
        data-side="centre"
        data-ready={ready && step ? 'yes' : 'no'}
      >
        <div
          ref={innerRef}
          className={cx('tour-card', hit && 'is-hit')}
          role="dialog"
          aria-label="Guided walkthrough"
        >
          {/* ONE PROGRESS BAR, and the part it belongs to as a word. Two meters
              answering one question is not emphasis, it is a card that repeats
              itself before it has said anything. */}
          <div className="tour-head">
            <p className="tour-part">{part.label}</p>
            <span className="tour-pct">{pct}%</span>
          </div>
          <div className="tour-track">
            <div className="tour-bar" style={{ width: `${pct}%` }} />
          </div>

          <p className="tour-title">{view.title}</p>
          <p className="tour-body">{view.body}</p>

          {/* The four-door step. Any of them completes it, so the walk ends on
              something the creator chose rather than something they were shown. */}
          {view.choices && !hit && (
            <div className="tour-choices">
              {view.choices.map((c) => (
                <Link key={c.to} to={c.to} className="tour-choice">
                  <span className="tour-choice-icon"><Icon name={c.icon} className="h-4 w-4" /></span>
                  <span className="min-w-0">
                    <span className="tour-choice-label">{c.label}</span>
                    <span className="tour-choice-hint">{c.hint}</span>
                  </span>
                </Link>
              ))}
            </div>
          )}

          {/* THE DOOR. Whenever there is nothing highlighted to press.
              Two cases, and they look identical to the creator: a step with no
              anchor at all (rewards and the creator network live behind the
              avatar menu, which is shut), and a step whose anchor turned out to
              be absent (the worldwide rail is desktop-only). Either way the
              card would otherwise say "open your rewards" with nothing on the
              screen that does that. */}
          {!view.anchor && view.door && !hit && (
            <div className="tour-choices tour-choices--one">
              <Link to={view.door.to} className="tour-choice">
                <span className="tour-choice-icon"><Icon name={view.door.icon} className="h-4 w-4" /></span>
                <span className="min-w-0">
                  <span className="tour-choice-label">{view.door.label}</span>
                  <span className="tour-choice-hint">Open it from here</span>
                </span>
              </Link>
            </div>
          )}

          {/* THE INSTRUCTION. The one line that matters if they read nothing
              else, so it gets the brand colour, a moving mark, and its own row.
              Scroll and dwell goals draw their progress in that mark, which is
              also the answer to "did it even notice me scrolling". */}
          {view.do && !hit && (
            <p className="tour-do">
              {metered
                ? <Meter p={meter} />
                : <Icon name="chevronRight" className="h-4 w-4 shrink-0 tour-nudge" />}
              <span className="min-w-0">{view.do}</span>
            </p>
          )}

          {hit && (
            <p className="tour-hit">
              <Icon name="check" className="h-4 w-4 shrink-0" />
              <span>Nice one</span>
            </p>
          )}

          {view.goal?.kind === 'push' && <PushAction state={pushState} busy={busy} onEnable={doPush} />}

          <div className="tour-foot">
            {last ? (
              <button onClick={() => onFinish?.('finished')} className="btn-primary ml-auto !px-5 !py-2 text-sm">
                Take me in
              </button>
            ) : (
              <>
                <span className="tour-count">Step {i + 1} of {steps.length}</span>
                {!pushBlocked && (
                  <button onClick={skip} className="tour-skip">Skip this one</button>
                )}
              </>
            )}
          </div>
          {!last && (
            <button onClick={leave} className="tour-leave">Leave the walkthrough</button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** A countdown, or a scroll's progress, drawn as a ring rather than a number. */
function Meter({ p }) {
  const C = 2 * Math.PI * 7
  return (
    <svg viewBox="0 0 18 18" className="h-4 w-4 shrink-0 -rotate-90" aria-hidden>
      <circle cx="9" cy="9" r="7" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.25" />
      <circle
        cx="9" cy="9" r="7" fill="none" stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - clamp(p, 0, 1))}
        style={{ transition: 'stroke-dashoffset 0.18s linear' }}
      />
    </svg>
  )
}

function PushAction({ state, busy, onEnable }) {
  if (!pushSupported()) {
    return (
      <Callout tone="plain" icon="device">
        This browser cannot do push notifications. On an iPhone they work the moment the app is on your
        home screen, which takes ten seconds and is worth doing.
      </Callout>
    )
  }
  if (state === 'granted') {
    return (
      <Callout tone="good" icon="check">
        Notifications are on. You will hear about every brief the moment it goes live.
      </Callout>
    )
  }
  if (state === 'denied') {
    return (
      <Callout tone="warn" icon="alert">
        Your browser is blocking notifications for this site, so we cannot ask from here. Turn them back
        on in its site settings whenever you are ready.
      </Callout>
    )
  }
  return (
    <button onClick={onEnable} disabled={busy} className="btn-primary mt-3 w-full !py-2.5 text-sm">
      {busy ? <Spinner className="h-4 w-4" /> : 'Turn on notifications'}
    </button>
  )
}

function Callout({ tone, icon, children }) {
  const tones = {
    plain: 'bg-cloud text-smoke',
    good: 'bg-green-50 text-green-800',
    warn: 'bg-amber-50 text-amber-800',
  }
  return (
    <p className={cx('mt-3 flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs leading-relaxed', tones[tone])}>
      <Icon name={icon} className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  )
}
