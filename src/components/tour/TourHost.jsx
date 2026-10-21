import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import Icon from '../Icon'
import { Spinner } from '../ui'
import { cx } from '../../lib/utils'
import { useIsPhone, useKeyboardOpen } from '../../lib/useKeyboardInset'
import { enablePush, pushPermission, pushSupported } from '../../lib/push'
import { partOf, savedStep, saveStep, stepAt, stepGoal, stepsFor, tourPreviewWho } from '../../lib/tour'
import { setTourRunning } from '../../lib/appNag'
import { placeCard, restingPlace, union, CARD_W } from '../../lib/tourPlacement'
import { useAuth } from '../../context/AuthContext'
import { payeeComplete, payeeFromPrivate } from '../../lib/invoice'
import { useT } from '../../lib/i18n'
import { moneyApi } from '../../api/money'

// THE WALKTHROUGH, DRAWN AND DRIVEN.
//
// Three layers: a brand glow round the viewport for the whole walk; a spotlight (one rounded rect with a huge
// box-shadow spread that darkens everything else); and the card (words, progress, instruction).
//
// Two decisions:
// 1. React owns the content; one rAF loop writes the geometry straight to the elements' styles, so the overlay
//    does not re-render every frame. React re-renders only when the step changes.
// 2. Nothing is trapped and there is no Next button: the scrim is pointer-events:none, and a step advances when the
//    creator actually does the thing (taps the nav, scrolls, presses Connect, turns notifications on).

const PAD = 8

function findAnchor(name) {
  if (!name) return null
  const all = [...document.querySelectorAll(`[data-tour="${name}"]`)]
  return all.find((el) => {
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0 && el.offsetParent !== null
  }) || null
}

// `required` = the first run, which starts itself and cannot be closed: every step is one press on something the
// card points at. A walk started from Settings is a refresher and closes like any overlay.
// Two steps stay skippable even on a first run: payment ("I'll do this later"; BankDetailsPrompt asks again) and
// notifications once the browser has blocked them (it will never ask again).
// TRAVEL_MS is a little longer than the CSS transition (820 ms in index.css) so turning the transition off never
// clips its last frames.
const TRAVEL_MS = 950

export default function TourHost({ onFinish, network = false, layout = 'desktop', required = false, variant = null }) {
  const tr = useT()
  const isPhone = useIsPhone()
  // IS SOMEBODY TYPING. Only the payment step cares (see `keepClear` in
  // lib/tour), and it cares a lot: on a phone the sheet sits exactly where the
  // form is, and there is no sideways to move it in.
  const typing = useKeyboardOpen()
  const navigate = useNavigate()
  const location = useLocation()
  const { user, profile, isAdmin } = useAuth()
  // WHICH WALK. A VIP gets the VIP walk; the Testing Centre can ask for either one by name.
  const vip = variant ? variant === 'vip' : (!!profile?.is_vip && !isAdmin)
  // The team walking the VIP walk is not a VIP, so the VIP page it walks is a new VIP's first day (`mode=as`), which
  // draws exactly the creator's page: the add-a-video box, the payouts section, the earnings card.
  const vipPreview = vip && !profile?.is_vip

  const steps = useMemo(() => stepsFor({ network, vip }), [network, vip])
  // RESUME, RATHER THAN RESTART. See `savedStep` in lib/tour: a walkthrough
  // that moves you around the product is one people leave halfway, and coming
  // back to step one is how they stop coming back at all. Clamped to the last
  // real step so a shortened walk can never resume off the end.
  const [i, setI] = useState(() => Math.min(savedStep(layout), stepsFor({ network, vip }).length - 1))
  const [ready, setReady] = useState(false)
  // The spotlight fades in once at the start of the walk and then travels (state, because it is read during render).
  // A one-pixel deadband: the loop runs every frame, but only writes a position that actually changed, or the CSS
  // transition is retargeted every frame and stutters.
  const [litOnce, setLitOnce] = useState(false)
  // THE WALK LEAVES THE WAY IT ARRIVED. Everything else about this component is about movement; ending it with a hard
  // cut is the one moment that undoes that impression. `data-closing` fades the card, the spotlight and the glow
  // (index.css) and the unmount is held for the length of it.
  const [closing, setClosing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [hit, setHit] = useState(false)        // the goal just completed
  const [pushState, setPushState] = useState(() => pushPermission())

  const spotRef = useRef(null)
  const cardRef = useRef(null)
  const rafRef = useRef(0)
  // The timer half of the loop above. See the note on `schedule`.
  const tickRef = useRef(0)
  const travelUntil = useRef(0)
  const advanced = useRef(false)

  // Is this step live: a ref, written by the step-entry effect before the loop effect runs. `ready` is state and is
  // one render behind, which made the card glide down and back up on the first step that scrolls.
  const live = useRef(false)

  // The words change when the card starts moving: `i` (where the card is going) changes at once, `shown` (what it
  // says) catches up in `settle()` when the travel window opens.
  const [shown, setShown] = useState(i)

  const lastWrite = useRef({})
  // HOW MANY CONSECUTIVE FRAMES THE GEOMETRY HAS BEEN IDENTICAL, and what it
  // was. See the loop below: this is what lets the tracker stand down instead
  // of forcing a layout flush sixty times a second for the whole walkthrough.
  const still = useRef(0)
  const lastSig = useRef(null)

  const put = useCallback((el, prop, px) => {
    const key = `${el.dataset.tourEl || 'x'}:${prop}`
    const prev = lastWrite.current[key]
    if (prev != null && Math.abs(prev - px) < 1) return
    lastWrite.current[key] = px
    el.style[prop] = `${px}px`
  }, [])




  // Place the card before its first paint (useLayoutEffect, mount only), using the same `restingPlace` the loop uses.
  // Otherwise a fixed element with no top/left paints at the top-left corner for a few frames.
  useLayoutEffect(() => {
    const card = cardRef.current
    // On a phone the card is a sheet pinned by CSS (`.tour-card--sheet`), so it
    // has never had this problem and must not be given inline pixels.
    if (!card || isPhone) return
    const rest = restingPlace(
      { w: window.innerWidth, h: window.innerHeight },
      { w: card.offsetWidth || CARD_W, h: card.offsetHeight || 260 },
      !!steps[Math.min(i, steps.length - 1)]?.keepClear,
    )
    card.style.top = `${rest.top}px`
    card.style.left = `${rest.left}px`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Remember where they are on every move, so backgrounding the app at step
  // four comes back to step four.
  useEffect(() => { saveStep(layout, i) }, [layout, i])

  const step = steps[Math.min(i, steps.length - 1)]
  // WHAT THE CARD SAYS RIGHT NOW, which lags `step` by one settle. See the note
  // on `shown`: `step` is where it is going, `said` is what it is still saying
  // until it sets off. They are the same object except during a step change.
  const said = steps[Math.min(shown, steps.length - 1)]

  // The card's height is written in pixels so the CSS transition can animate it (`height: auto` cannot be).
  // Measured by unsetting it first, three times over 200 ms (content, webfonts and the tick settle); not a
  // ResizeObserver, which would see our own writes. The resting place uses `targetH`, never the live height.
  const targetH = useRef(0)
  useEffect(() => {
    const card = cardRef.current
    if (!card || isPhone) return undefined
    // Ignore re-measures under 5 px (font settling), so a resting card does not shift mid-glide.
    const MIN_DELTA = 5
    const apply = (force = false) => {
      card.style.height = 'auto'
      const h = card.scrollHeight
      if (h <= 0) return
      if (!force && targetH.current && Math.abs(h - targetH.current) < MIN_DELTA) {
        // Put the height back exactly as it was: reading `scrollHeight` needed
        // `auto`, and leaving it there would drop the transition's from-value.
        card.style.height = `${targetH.current}px`
        return
      }
      targetH.current = h
      card.style.height = `${h}px`
    }
    apply(true)
    const t1 = setTimeout(apply, 60)
    const t2 = setTimeout(apply, 220)
    return () => { clearTimeout(t1); clearTimeout(t2) }
    // KEYED ON WHAT IS DRAWN. `said`, not `step`: the box has to be the size of
    // the words currently in it, and those lag by one settle now.
  }, [said?.key, isPhone, hit])
  const last = i >= steps.length - 1
  const goal = step ? stepGoal(step, network) : null
  const part = partOf(step)
  const pct = Math.round(((i + (hit ? 1 : 0)) / steps.length) * 100)

  // ------------------------------------------------------------ advancing ---
  // ONE EXIT, WHATEVER ENDED IT. Finishing, skipping the last step and pressing
  // the close button all leave through here, so there is no way out that skips
  // the animation - which is how three of the four exits ended up abrupt before.
  const CLOSE_MS = 320
  const leave = useCallback((why) => {
    setClosing(true)
    setTimeout(() => onFinish?.(why), CLOSE_MS)
  }, [onFinish])

  const finishStep = useCallback(() => {
    if (advanced.current) return
    advanced.current = true
    setHit(true)
    // A beat of acknowledgement before moving. Without it a tap that
    // simultaneously navigates AND swaps the card reads as the card glitching.
    setTimeout(() => {
      setHit(false)
      if (last) { leave('finished'); return }
      setI((n) => n + 1)
    }, 620)
  }, [last, leave])

  const skip = useCallback(() => {
    if (advanced.current) return
    advanced.current = true
    if (last) { leave('finished'); return }
    setI((n) => n + 1)
  }, [last, leave])

  const close = useCallback(() => leave('dismissed'), [leave])

  // ----------------------------------------------------- entering a step ---
  useEffect(() => {
    // SYNCHRONOUS, AND BEFORE ANYTHING ELSE IN THIS EFFECT. See the note on
    // `live`: the loop effect re-runs later in this same commit with a stale
    // `ready`, and this is the only thing that can tell it not to.
    live.current = false
    setReady(false)
    advanced.current = false
    travelUntil.current = Date.now() + TRAVEL_MS
    if (!step) return undefined

    // Put them where the step happens, unless the goal is to navigate somewhere
    // and they are already there.
    const raw = stepAt(step, network)
    // AS A REAL VIP WHEN ONE WAS PICKED. The Testing Centre can name a VIP; their own page is walked (their videos,
    // their payouts), read only.
    const asWho = vipPreview ? tourPreviewWho() : null
    const to = vipPreview && raw && /^\/vip(\?|$)/.test(raw) ? `/vip?mode=as${asWho ? `&who=${asWho}` : ''}${raw.includes('?') ? `&${raw.split('?')[1]}` : ''}` : raw
    const g = stepGoal(step, network)
    const alreadyAtGoal = g?.kind === 'route' && location.pathname.startsWith(g.to)
    if (to && !alreadyAtGoal) {
      const [path] = to.split('?')
      const sameRoute = path === location.pathname
        && (!to.includes('?') || to.endsWith(location.search))
      if (!sameRoute) navigate(to)
    }

    // Steps marked `openMenu` press the avatar first, so the item the card names is on screen. Only opens; if the menu
    // is already open, leave it.
    if (step.openMenu) {
      const menu = document.querySelector('[data-tour="avatar-menu"]')
      if (menu && menu.getAttribute('aria-expanded') !== 'true') menu.click()
      // And scroll the menu so the item is in view before the card appears.
      const dest = (g?.kind === 'route') ? g.to : null
      if (dest) {
        setTimeout(() => {
          const panel = document.querySelector('[data-tour-keepout]')
          const item = panel?.querySelector(`a[href="${dest}"]`)
          item?.scrollIntoView({ block: 'center' })
        }, 80)
      }
    }

    // Wait for the page to stop moving (two samples at the same offset; ~80 ms when nothing scrolls, 900 ms cap), not a
    // fixed delay.
    // The anchor is scrolled into view HERE, before the poll, so the card never glides towards a target that is still
    // scrolling (that caused the shaking). The anchor may not exist yet after a navigation: `hunt` retries for 400 ms,
    // and the poll only starts once the scroll has begun or been given up on.
    let settled = false
    let poll = 0
    let cap = 0
    const settle = () => {
      if (settled) return
      settled = true
      live.current = true
      // The words and the movement start together. See the note on `shown`.
      setShown(i)
      setReady(true)
    }
    const startSettle = () => {
      let lastY = window.scrollY
      let still = 0
      poll = setInterval(() => {
        const y = window.scrollY
        if (Math.abs(y - lastY) < 1) {
          still += 1
          if (still >= 2) { clearInterval(poll); settle() }
        } else { still = 0; lastY = y }
      }, 40)
      cap = setTimeout(() => { clearInterval(poll); settle() }, 900)
    }

    const scrollToAnchor = () => {
      const el = findAnchor(step.anchor)
      if (!el) return false
      // A tall anchor (the live challenge card) is scrolled to the top, leaving the lower half free for the card.
      const tall = el.getBoundingClientRect().height > window.innerHeight * 0.4
      el.scrollIntoView({ block: tall ? 'start' : 'center', behavior: 'smooth' })
      return true
    }

    let hunt = 0
    if (!step.anchor || scrollToAnchor()) {
      startSettle()
    } else {
      const from = Date.now()
      hunt = setInterval(() => {
        if (scrollToAnchor() || Date.now() - from > 400) {
          clearInterval(hunt)
          hunt = 0
          startSettle()
        }
      }, 50)
    }

    return () => { clearInterval(hunt); clearInterval(poll); clearTimeout(cap) }
    // `location` is deliberately absent: navigating IS the effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, step?.key, network])

  // -------------------------------------------------- goal: they navigate ---
  useEffect(() => {
    if (!ready || goal?.kind !== 'route') return
    if (location.pathname.startsWith(goal.to)) finishStep()
  }, [ready, goal, location.pathname, finishStep])

  // Goal: they scroll. Listens in the capture phase, because scrolls inside inner scrollers do not bubble to window.
  // Progress is the largest distance anything has moved since the step began.
  useEffect(() => {
    if (!ready || goal?.kind !== 'scroll') return undefined
    const seen = new Map()   // element -> where it was when the step started
    const startedAt = window.scrollY

    const progress = (el) => {
      if (el === document || el === window || el === document.documentElement) {
        return Math.abs(window.scrollY - startedAt)
      }
      if (!seen.has(el)) seen.set(el, el.scrollTop)
      return Math.abs(el.scrollTop - seen.get(el))
    }

    const onScroll = (e) => {
      if (progress(e.target) >= goal.px) finishStep()
    }
    // Capture, on the document: `scroll` does not bubble, so this is the only
    // way to hear about a scroller we did not know existed.
    document.addEventListener('scroll', onScroll, { passive: true, capture: true })
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      document.removeEventListener('scroll', onScroll, { capture: true })
      window.removeEventListener('scroll', onScroll)
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

  // THE `dwell` AND `connect` GOALS ARE GONE.
  //
  // `dwell` advanced on a TIMER, which is the one interaction in a walkthrough that takes control away from the person
  // doing it - `connect` sent a real connection request to a real stranger as a side effect of a tutorial. Neither is
  // coming back.

  // Goal: payment details. Polled; `payeeComplete` is the same test the invoice uses.
  useEffect(() => {
    if (!ready || goal?.kind !== 'payee' || !user?.id) return undefined
    let alive = true
    const check = async () => {
      const { data } = await moneyApi
        .creatorPrivate().select('*').eq('id', user.id).maybeSingle()
      if (!alive || !data) return
      if (payeeComplete(payeeFromPrivate(data))) finishStep()
    }
    check()
    const id = setInterval(check, 1500)
    return () => { alive = false; clearInterval(id) }
  }, [ready, goal, user?.id, finishStep])

  // Goal: notifications allowed. When they were already on, show the card for a beat before the "Nice one" tick,
  // instead of skipping past it.
  const ALREADY_ON_BEAT_MS = 1500
  useEffect(() => {
    if (goal?.kind !== 'push') return undefined
    let timer = 0
    const id = setInterval(() => {
      const p = pushPermission()
      setPushState(p)
      if (p !== 'granted' || timer) return
      // Hold for a moment so the confirmation can be read, then advance.
      timer = setTimeout(finishStep, ALREADY_ON_BEAT_MS)
    }, 500)
    return () => { clearInterval(id); if (timer) clearTimeout(timer) }
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

  useEffect(() => { if (ready) setLitOnce(true) }, [ready])

  // ------------------------------------------------------ THE rAF LOOP ---
  //
  // Everything geometric happens here and nowhere else: measure the anchor,
  // write the spotlight's box, place the card. No React state is touched, so
  // this runs at display rate without re-rendering anything.
  useEffect(() => {
    if (!ready) return undefined
    // The travel window starts when the loop starts, not when the step changes, so it covers the movement itself.
    travelUntil.current = Date.now() + TRAVEL_MS
    const anchorName = step?.anchor
    // (The `scrollIntoView` that used to be here has moved into the step-entry
    // effect above, where it runs BEFORE the settle poll rather than after it.
    // See the long note there: starting a smooth scroll at the same moment as
    // the card's travel window was the whole of the shaking.)

    // ARMED TWO WAYS: an rAF and a timer, whichever comes first (rAF does not run in a background tab or hidden pane,
    // and this loop is the only thing that positions the card and spotlight).
    //
    // AND IT IDLES WHEN NOTHING IS MOVING. `measure()` forces layout (rects, querySelectorAll, offsetWidth), and at
    // display rate for the whole walk it competed with the spotlight's repaint. It runs at full rate while travelling or
    // after something moved, and a slow heartbeat otherwise; scroll, resize and transition events wake it at once.
    const IDLE_AFTER = 8      // identical frames before it stands down
    const IDLE_MS = 250       // the heartbeat once it has

    const wake = () => {
      still.current = 0
      schedule()
    }

    const schedule = () => {
      cancelAnimationFrame(rafRef.current)
      clearTimeout(tickRef.current)
      const once = () => { cancelAnimationFrame(rafRef.current); clearTimeout(tickRef.current); tick() }
      if (still.current >= IDLE_AFTER) {
        // Idle: a timer only. No rAF, so no per-frame layout flush at all.
        tickRef.current = setTimeout(once, IDLE_MS)
        return
      }
      // Awake: rAF for accuracy, with a timer behind it because rAF does not
      // run in a background tab or a hidden pane. Whichever arrives first wins.
      rafRef.current = requestAnimationFrame(once)
      tickRef.current = setTimeout(once, 32)
    }

    // Every frame is guarded: a frame that throws is skipped and the next one still runs (an unguarded throw used to
    // freeze the walk, because `schedule()` re-arms first).
    const tick = () => {
      try {
        const sig = measure()
        // `null` means "could not measure" (no spotlight element yet), which is
        // not the same as "nothing changed" - so it resets the counter. The
        // travel window used to return null for the same purpose and no longer
        // does; see the long note in `measure`.
        if (sig == null || sig !== lastSig.current) { still.current = 0; lastSig.current = sig }
        else still.current += 1
      } catch {
        // A bad frame is a skipped frame, never a dead loop - and never a
        // reason to idle, because we do not know what it would have measured.
        still.current = 0
      }
      // AFTER, NOT BEFORE. This used to run first, on the reasoning that a
      // throw must not stop the loop re-arming - which is right, and is why the
      // try/catch above is total. Scheduling first also meant the next frame's
      // cadence was decided before this frame had measured anything, so the
      // loop could never act on what it had just learned.
      schedule()
    }

    const measure = () => {
      const spot = spotRef.current
      if (!spot) return null
      // THE STEP IS NOT LIVE YET - WRITE NOTHING AT ALL. See the note on
      // `live`. A constant signature rather than `null` so the loop stands down
      // after a few frames instead of spinning at display rate through a wait
      // that is mostly a smooth scroll: the scroll is exactly the animation
      // these frames would be stealing from.
      if (!live.current) return 'held'

      const target = findAnchor(anchorName)
      const r = target?.getBoundingClientRect()
      const vw = window.innerWidth
      const vh = window.innerHeight

      // An anchor off the screen is treated exactly like no anchor: pointing at
      // something invisible is worse than not pointing. scrollIntoView is
      // asynchronous and does nothing inside a container that will not scroll,
      // so this happens for real.
      const visible = r && r.width > 0 && r.top < vh && r.top + r.height > 0
        && r.left < vw && r.left + r.width > 0

      // While travelling between steps the box glides; the rest of the time it
      // is welded to its target, so a scroll cannot leave it swimming behind.
      const travelling = Date.now() < travelUntil.current
      spot.dataset.travel = travelling ? 'yes' : 'no'
      // The signature the idle check compares: every input the writes depend on, rounded to the pixel. Same signature,
      // same output, so skipping is safe. It idles during the glide too: nothing it measures changes while the CSS
      // transition runs. `travelling` is in the signature so the frame where the window closes wakes the loop.
      const sig = [
        travelling ? 'T' : 'S',
        visible ? `${Math.round(r.top)},${Math.round(r.left)},${Math.round(r.width)},${Math.round(r.height)}` : 'none',
        vw, vh, isPhone ? 'p' : 'd',
      ].join('|')
      // THE CARD GLIDES BETWEEN STEPS TOO. It was not lag. `top`/`left` are written straight to the element with no
      // transition, so the card TELEPORTED from one step's position to the next while separately replaying a 10px
      // entrance slide: a jump and a slide, in that order, which reads exactly as a glitch. It travels on the same curve
      // and for the same 560ms as the spotlight now, so the two move together - and, like the spotlight, the transition
      // is OFF the rest of the time, or following a scroll would leave it swimming behind.
      if (cardRef.current) cardRef.current.dataset.travel = travelling ? 'yes' : 'no'

      // The lit area is the anchor plus anything it opened (the `data-tour-keepout` rectangles, e.g. the account menu).
      // `visible` is checked before `r` is read: the anchor is missing for a few frames after every navigation.
      const lit = visible
        ? union([
          { top: r.top, left: r.left, width: r.width, height: r.height },
          ...[...document.querySelectorAll('[data-tour-keepout]')].map((el) => el.getBoundingClientRect()),
        ])
        : null

      if (visible && lit) {
        spot.dataset.on = 'yes'
        put(spot, 'top', lit.top - PAD)
        put(spot, 'left', lit.left - PAD)
        put(spot, 'width', lit.right - lit.left + PAD * 2)
        put(spot, 'height', lit.bottom - lit.top + PAD * 2)
      } else {
        spot.dataset.on = 'no'
        spot.style.top = '50%'
        spot.style.left = '50%'
        spot.style.width = '0px'
        spot.style.height = '0px'
        // Percentages cannot go through `put`, so the cache is cleared instead:
        // the next pixel write must not be deduplicated against a stale number.
        lastWrite.current = {}
      }

      // The card. On a phone it is a sheet pinned by CSS, so nothing to do.
      const card = cardRef.current
      if (!card || isPhone) return sig
      // A step with no anchor pins the card low and out of the way, not over the content. `restingPlace` computes those
      // pixels, so one mechanism (this loop) writes every position; `data-centre` only drives the entrance animation.
      // See lib/tourPlacement.
      const cardBox = { w: card.offsetWidth || CARD_W, h: targetH.current || card.offsetHeight || 260 }
      if (!visible) {
        card.dataset.centre = 'yes'
        const rest = restingPlace({ w: vw, h: vh }, cardBox, !!step.keepClear)
        put(card, 'top', rest.top)
        put(card, 'left', rest.left)
        return sig
      }

      // (The explicit from-value seeding that used to sit here is gone. It
      // existed because the resting place was CSS and had no pixel value to
      // interpolate from; both states are pixels now, so there is nothing to
      // hand off between and the transition simply runs.)
      card.dataset.centre = 'no'

      // What the card must not cover: the anchor plus `data-tour-keepout` rectangles (e.g. the account menu).
      // The arithmetic is in lib/tourPlacement, where it is tested.
      if (!lit) return sig
      // Place from `targetH` (the height the card is easing to), not `offsetHeight`, so the destination is constant while
      // the height animates.
      const { top, left } = placeCard(lit, { w: vw, h: vh }, cardBox.h)

      put(card, 'top', top)
      put(card, 'left', left)
      // THE CARD'S OWN HEIGHT IS PART OF THE SIGNATURE, because `placeCard`
      // reads it and `targetH` is re-measured twice after a step change (see
      // the height effect). Without it the loop could idle through a re-measure
      // and leave the card placed against a box it no longer is.
      return `${sig}|${Math.round(cardBox.h)}`
    }

    // Anything that could move the page wakes the loop at once (all passive; scroll is captured for inner scrollers).
    const opts = { passive: true, capture: true }
    window.addEventListener('scroll', wake, opts)
    window.addEventListener('resize', wake)
    window.addEventListener('orientationchange', wake)
    window.addEventListener('pointerdown', wake, { passive: true })
    window.addEventListener('keydown', wake)
    // A CSS transition finishing somewhere on the page - a menu opening, the
    // card's own height settling - moves things this loop measures.
    window.addEventListener('transitionend', wake, { passive: true })
    window.addEventListener('animationend', wake, { passive: true })

    still.current = 0
    lastSig.current = null
    schedule()
    return () => {
      cancelAnimationFrame(rafRef.current)
      clearTimeout(tickRef.current)
      window.removeEventListener('scroll', wake, opts)
      window.removeEventListener('resize', wake)
      window.removeEventListener('orientationchange', wake)
      window.removeEventListener('pointerdown', wake)
      window.removeEventListener('keydown', wake)
      window.removeEventListener('transitionend', wake)
      window.removeEventListener('animationend', wake)
    }
  }, [ready, step?.anchor, step?.keepClear, isPhone, put])

  // `html.tour-running` lets index.css cap the account menu above the card sheet on phones, where there is no room
  // beside it. `scrollMenuToGoal` puts the step's item at the top.
  useEffect(() => {
    document.documentElement.classList.add('tour-running')
    // And so does the rest of the app: see lib/appNag. The notifications modal
    // and the bank-details prompt both stand down while this is on screen.
    setTourRunning(true)
    return () => {
      document.documentElement.classList.remove('tour-running')
      setTourRunning(false)
    }
  }, [])

  useEffect(() => {
    // Escape is the keyboard's version of the X, so it obeys the same rule.
    if (required) return undefined
    const onKey = (e) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close, required])

  if (!step) return null

  // The notifications gate holds while the permission is `default` (the prompt still works) and releases on `denied`
  // (the browser will never ask again; the card explains how to unblock and re-checks). A browser with no push at all
  // also releases. See PushAction.
  const pushBlocked = step.required && goal?.kind === 'push'
    && pushSupported() && pushState !== 'granted' && pushState !== 'denied'

  return createPortal(
    <div className="tour-root" data-closing={closing ? 'yes' : 'no'} aria-live="polite">
      <div className="tour-glow" aria-hidden />

      <div
        ref={spotRef}
        data-tour-el="spot"
        aria-hidden
        data-on="no"
        data-travel="yes"
        // LIT ONCE, THEN NEVER DARK AGAIN UNTIL THE WALK ENDS. Gating this on `ready` meant the spotlight faded out at
        // the start of every step and back in at the end of it, so what the eye saw between two anchors was a box
        // vanishing here and a different box appearing there - the team's "it just disappears and appears". It has a
        // travel transition for exactly this; letting it stay visible is what lets the transition be seen. The first
        // step still fades in, because there is nothing for it to travel from.
        className={cx('tour-spot', (ready || litOnce) && 'tour-spot--ready')}
        style={{ top: '50%', left: '50%', width: 0, height: 0 }}
      />

      <div
        ref={cardRef}
        data-tour-el="card"
        data-centre="yes"
        // See `keepClear` in lib/tour: `data-clear` moves an anchorless card bottom-right on desktop, `data-typing` slides
        // the phone sheet away while a field is focused. Attributes, not classes, because the loop writes `data-centre`.
        data-clear={step.keepClear ? 'yes' : 'no'}
        data-typing={typing && step.keepClear ? 'yes' : 'no'}
        className={cx('tour-card', isPhone ? 'tour-card--sheet' : 'tour-card--float')}
        style={isPhone ? undefined : { width: CARD_W }}
        role="dialog"
        aria-label={tr("Guided walkthrough")}
      >
        {/* ONE PROGRESS BAR. There used to be two - a percentage bar and a
            five-segment part strip underneath it - which is two things asking
            to be read to answer one question. The part is a word now, and the
            bar is the only meter on the card. */}
        <div className="mb-3.5">
          <div className="flex items-center justify-between gap-3">
            <p className="truncate text-[11px] font-bold uppercase tracking-[0.13em] text-brand">
              {part.label}
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-[11px] font-semibold tabular-nums text-smoke">{pct}%</span>
              {/* No way out of a first run. See `required` above. */}
              {!required && (
                <button
                  onClick={close}
                  aria-label={tr("Close the walkthrough")}
                  className="-mr-1 rounded-full p-1 text-gray-300 transition-colors hover:text-ink"
                >
                  <Icon name="close" className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100">
            <div className="tour-bar h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
          </div>
        </div>

        {/* The body scrolls, the actions do not: progress on top, buttons always visible at the bottom. */}
        {/* KEYED ON THE STEP, so the words CHANGE WITH THE MOVE rather than
            snapping to the next step's text while the box is still sitting at
            the last step's position. A short fade, and only on the content -
            the card itself is one element for the whole walk so it can travel
            (see `data-travel`). */}
        <div className="tour-scroll" key={said.key}>
        <p className="tour-title tour-fade text-[17px] font-bold leading-snug tracking-tight">{said.title}</p>
        <p className="tour-body tour-fade mt-1.5 text-sm leading-relaxed text-smoke">{said.body}</p>

        {/* The instruction: the one line that matters, in brand colour on its own row. No arrow; the spotlight points. */}
        {said.do && !hit && (
          <p className="tour-do mt-3 rounded-xl bg-cloud/70 px-3 py-2.5 text-center text-[13px] font-semibold text-brand">
            {said.do}
          </p>
        )}

        {hit && (
          <p className="tour-hit mt-3 flex items-center gap-2 rounded-xl bg-green-50 px-3 py-2.5 text-[13px] font-semibold text-green-800">
            <Icon name="check" className="h-4 w-4 shrink-0" />
            <span>{tr("Nice one")}</span>
          </p>
        )}

        {goal?.kind === 'push' && (
          <PushAction
            state={pushState}
            busy={busy}
            onEnable={doPush}
            onRecheck={() => {
              const p = pushPermission()
              setPushState(p)
              if (p === 'granted') finishStep()
            }}
          />
        )}

        </div>

        <div className="tour-actions mt-4 flex items-center gap-2">
          {last ? (
            <button onClick={() => leave('finished')} className="btn-primary ml-auto !px-5 !py-2 text-sm">
              {tr("Finish")}
            </button>
          ) : goal?.kind === 'begin' ? (
            /* NOTHING STARTS ON A TIMER. The first card used to advance itself
               after 2.6 seconds whether the reader had finished or not. It is a
               button, like everything else on this walk. */
            <button onClick={finishStep} className="btn-primary ml-auto !px-5 !py-2 text-sm">
              {tr("Show me round")}
            </button>
          ) : (
            <>
              <p className="min-w-0 flex-1 truncate text-[11px] text-smoke">
                Step {i + 1} of {steps.length}
              </p>
              {/* The payment step is asked, not enforced, and its skip says so in words. BankDetailsPrompt asks again later. */}
              {/* What a first run may skip: bank details, and notifications only once the browser has blocked them or has no push.
                 Without that, a required walk would lock a creator out on their first minute. A walk someone asked for can skip
                 anything. */}
              {!pushBlocked && (!required || goal?.kind === 'payee' || goal?.kind === 'push') && (
                <button onClick={skip} className="btn-ghost shrink-0 !px-3 !py-1.5 text-xs text-smoke">
                  {goal?.kind === 'payee'
                    ? tr("I'll do this later")
                    : goal?.kind === 'push' && pushState === 'denied'
                      ? tr("Carry on without them")
                      : tr("Skip this")}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

function PushAction({ state, busy, onEnable, onRecheck }) {
  const tr = useT()
  if (!pushSupported()) {
    return (
      <Callout tone="plain" icon="device">
        {tr("This browser cannot do push notifications. On an iPhone they work as soon as the app is on your home screen, which takes ten seconds and is worth doing.")}
      </Callout>
    )
  }
  if (state === 'granted') {
    return (
      <Callout tone="good" icon="check">
        {tr("Notifications are on. You will hear about every brief the moment it goes live.")}
      </Callout>
    )
  }
  // Blocked: the browser will not prompt again, so the card names the settings steps for the browser they are in.
  if (state === 'denied') {
    return (
      <>
        <Callout tone="warn" icon="alert">
          {tr("Notifications are blocked for this site, so we cannot ask again from here - the browser will not show the prompt twice. Please turn them on and try again.")}
        </Callout>
        <ol className="mt-2 space-y-1.5 rounded-xl bg-cloud px-3 py-2.5 text-[11px] leading-relaxed text-smoke">
          {unblockSteps().map((line, n) => (
            <li key={line} className="flex gap-2">
              <span className="font-semibold text-brand">{n + 1}.</span>
              <span>{line}</span>
            </li>
          ))}
        </ol>
        <button onClick={onRecheck} className="btn-secondary mt-3 w-full !py-2.5 text-sm">
          {tr("I have turned them on")}
        </button>
      </>
    )
  }
  return (
    <button onClick={onEnable} disabled={busy} className="btn-primary mt-3 w-full !py-2.5 text-sm">
      {busy ? <Spinner className="h-4 w-4" /> : 'Turn on notifications'}
    </button>
  )
}

/**
 * How to un-block notifications, in the browser they are actually holding.
 *
 * "Check your browser settings" is advice nobody has ever successfully
 * followed. Each of these is the real path, and the iOS one is the only one
 * that is not a settings screen at all - Safari has no per-site notification
 * toggle for a tab, so the answer there is genuinely "install it".
 */
function unblockSteps() {
  const ua = navigator.userAgent || ''
  const ios = /iPad|iPhone|iPod/.test(ua)
  if (ios) {
    return [
      'Add Tryp.com to your home screen using the Share button.',
      'Open it from the home screen icon, not from Safari.',
      'Allow notifications when it asks.',
    ]
  }
  if (/Android/.test(ua)) {
    return [
      'Tap the padlock or ⋮ menu next to the address bar.',
      'Open Permissions, then Notifications.',
      'Switch them to Allow, then come back here.',
    ]
  }
  return [
    'Click the padlock or the icon at the left of the address bar.',
    'Find Notifications and set it to Allow.',
    'Reload this page if it asks you to.',
  ]
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
