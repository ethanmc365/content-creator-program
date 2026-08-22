import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import Icon from '../Icon'
import { Spinner } from '../ui'
import { cx } from '../../lib/utils'
import { useIsPhone } from '../../lib/useKeyboardInset'
import { enablePush, pushPermission, pushSupported } from '../../lib/push'
import { partOf, stepsFor, TOUR_PARTS } from '../../lib/tour'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'

// THE WALKTHROUGH, DRAWN.
//
// Three layers, each doing one job:
//
//   THE GLOW      a brand frame round the whole viewport, so it is unmistakable
//                 that the app is in a different mode. Without it a spotlight
//                 just reads as a modal that has gone wrong.
//   THE SPOTLIGHT a hole cut in a dark scrim over the thing being talked about.
//                 ONE element: a rounded rect with an enormous box-shadow
//                 spread, which darkens everything outside it.
//   THE CARD      the words, plus the progress, plus the way out.
//
// NOTHING IS TRAPPED. The scrim is pointer-events:none the whole way through,
// so every control underneath stays live. That is deliberate and it is what
// makes the action steps possible: the creator presses the REAL notification
// button and the REAL connect button, not a picture of one. A walkthrough that
// blocks the app teaches you how to use a walkthrough.

const PAD = 8
const CARD_GAP = 14
const CARD_W = 360
// Only ever used for the very first frame, before the card has been measured.
const CARD_H_FALLBACK = 260

/** Find the anchor that is actually on screen. Both the desktop nav item and
 *  the mobile tab carry the same name, and only one is ever visible. */
function findAnchor(name) {
  if (!name) return null
  const all = [...document.querySelectorAll(`[data-tour="${name}"]`)]
  return all.find((el) => {
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0 && el.offsetParent !== null
  }) || null
}

export default function TourHost({ onFinish, network = false }) {
  const isPhone = useIsPhone()
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()

  const steps = useMemo(() => stepsFor({ network }), [network])
  const [i, setI] = useState(0)
  const [rect, setRect] = useState(null)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [actionDone, setActionDone] = useState(false)
  const [pushState, setPushState] = useState(() => pushPermission())
  // TRAVELLING is what fixes the spotlight lagging behind a scroll.
  // The box has a transition on top/left/width/height so it GLIDES between
  // steps. That same transition applied to a scroll makes it swim along a few
  // frames behind the page, which is what "the animation is delayed" was. So
  // the transition is only on while the spotlight is moving from one step to
  // the next, and off for every measurement that comes from a scroll.
  const [travelling, setTravelling] = useState(false)
  const scrollRaf = useRef(0)
  const travelTimer = useRef(0)
  // THE CARD'S REAL HEIGHT, MEASURED.
  //
  // This used to be a constant of 240, and the cards are not 240 tall - the
  // step that asks you to connect carries a body, a tip and a callout and comes
  // out at well over four hundred. Placing a 432px card as though it were 240
  // put its bottom half off the screen, which is exactly the sort of thing an
  // estimate does the moment the content it is estimating grows. React 18
  // callback refs must not return a cleanup, so the node goes into state.
  const [cardEl, setCardEl] = useState(null)
  const [cardH, setCardH] = useState(CARD_H_FALLBACK)

  useEffect(() => {
    if (!cardEl) return undefined
    // `offsetHeight`, NOT `contentRect.height`. A ResizeObserver reports the
    // CONTENT box by default, and this card has 18px of padding top and bottom
    // plus a border - so contentRect was about 37px short, and the placement
    // maths needs the height the card actually occupies. Reading it off the
    // element inside the callback is the simplest way to get the border box in
    // every browser that matters.
    const read = () => setCardH(cardEl.offsetHeight)
    const ro = new ResizeObserver(read)
    ro.observe(cardEl)
    read()
    return () => ro.disconnect()
    // `cardEl` only. This effect is declared above `step`, and naming it here
    // reads it in the temporal dead zone - which threw on the first render and
    // took the whole overlay down to the error boundary. The observer already
    // fires whenever the card's height changes, which is exactly when a step
    // change matters, so there is nothing for a step dependency to add.
  }, [cardEl])

  const step = steps[Math.min(i, steps.length - 1)]
  const last = i >= steps.length - 1
  const part = partOf(step)
  const pct = Math.round(((i + 1) / steps.length) * 100)

  // ------------------------------------------------------------- routing ---
  useEffect(() => {
    setReady(false)
    setActionDone(false)
    setTravelling(true)
    if (travelTimer.current) clearTimeout(travelTimer.current)
    travelTimer.current = setTimeout(() => setTravelling(false), 520)
    if (!step) return undefined
    const [path] = (step.route || '').split('?')
    const sameRoute = path === location.pathname
      && (!step.route.includes('?') || step.route.endsWith(location.search))
    if (!sameRoute) navigate(step.route)
    // Two frames plus a beat: the route has to commit, the page has to lay out,
    // and anything lazily loaded has to arrive. Measuring earlier gives a rect
    // for an element that is about to move.
    const t = setTimeout(() => setReady(true), 280)
    return () => { clearTimeout(t) }
    // `location` is deliberately not a dependency: navigating IS the effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, step?.key])

  // ----------------------------------------------------------- measuring ---
  const measure = useCallback(() => {
    if (!step) return
    const el = findAnchor(step.anchor)
    if (!el) { setRect(null); return }
    const r = el.getBoundingClientRect()
    setRect((prev) => {
      // Skip the state write when nothing moved. A scroll fires this on every
      // frame and an unchanged object still re-renders the whole overlay.
      if (prev && Math.abs(prev.top - r.top) < 0.5 && Math.abs(prev.left - r.left) < 0.5
        && Math.abs(prev.width - r.width) < 0.5 && Math.abs(prev.height - r.height) < 0.5) return prev
      return { top: r.top, left: r.left, width: r.width, height: r.height }
    })
  }, [step])

  useLayoutEffect(() => {
    if (!ready) return undefined
    const el = findAnchor(step?.anchor)
    if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    measure()

    // A scroll is coalesced into one measurement per frame. rAF is the right
    // tool HERE because it is driven by a real event rather than spinning on
    // its own - a standalone rAF loop is throttled to a stop in a background
    // tab, which is what the first version of this got wrong.
    const onScroll = () => {
      if (scrollRaf.current) return
      scrollRaf.current = requestAnimationFrame(() => {
        scrollRaf.current = 0
        measure()
      })
    }
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    const settle = setTimeout(measure, 440)
    // The backstop catches layout shifts nothing announces: an image loading
    // above the anchor, a lazy section arriving, a font swapping in.
    const backstop = setInterval(measure, 500)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
      if (scrollRaf.current) cancelAnimationFrame(scrollRaf.current)
      scrollRaf.current = 0
      clearTimeout(settle)
      clearInterval(backstop)
    }
  }, [ready, measure, step?.anchor])

  // ------------------------------------------------------------- actions ---
  useEffect(() => {
    if (step?.action !== 'push') return undefined
    const id = setInterval(() => {
      const p = pushPermission()
      setPushState(p)
      if (p === 'granted') setActionDone(true)
    }, 600)
    return () => clearInterval(id)
  }, [step?.action])

  // The connect step watches for a connection request actually being sent,
  // rather than taking the creator's word for it.
  useEffect(() => {
    if (step?.action !== 'connect' || !user?.id) return undefined
    let alive = true
    const check = async () => {
      // `creator_id` is the person who SENT it - see lib/connections. Counting
      // both sides would go green for a request somebody else sent to them,
      // which is not the thing this step is asking for.
      const { count } = await supabase
        .from('connections').select('id', { count: 'exact', head: true }).eq('creator_id', user.id)
      if (alive && (count ?? 0) > 0) setActionDone(true)
    }
    check()
    const id = setInterval(check, 1500)
    return () => { alive = false; clearInterval(id) }
  }, [step?.action, user?.id])

  async function doPush() {
    setBusy(true)
    try {
      await enablePush(user?.id)
      const p = pushPermission()
      setPushState(p)
      if (p === 'granted') setActionDone(true)
    } catch { /* declined, or the browser refused */ }
    setBusy(false)
  }

  // ------------------------------------------------------------ movement ---
  // THE HARD GATE. The last step asks for notifications and will not let you
  // past - but only while there is actually something to press. A browser that
  // has already refused, or one that cannot do push at all, is not a decision
  // the creator can make from here, and a gate with no way through is a dead
  // end rather than a gate.
  const pushBlocked = step?.required && step.action === 'push'
    && !actionDone && pushState === 'default' && pushSupported()

  const next = useCallback(() => {
    if (pushBlocked) return
    if (last) { onFinish?.('finished'); return }
    setI((n) => n + 1)
  }, [last, onFinish, pushBlocked])

  const back = useCallback(() => setI((n) => Math.max(0, n - 1)), [])
  const close = useCallback(() => onFinish?.('dismissed'), [onFinish])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') close()
      if (e.key === 'ArrowRight') next()
      if (e.key === 'ArrowLeft') back()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [next, back, close])

  if (!step) return null

  const raw = rect && {
    top: rect.top - PAD,
    left: rect.left - PAD,
    width: rect.width + PAD * 2,
    height: rect.height + PAD * 2,
  }

  // IF THE THING IS NOT ON SCREEN, DO NOT PRETEND TO POINT AT IT.
  //
  // `scrollIntoView` usually brings the anchor into view, but not always: it is
  // asynchronous, it does nothing for an element inside a container that will
  // not scroll, and it is ignored outright in some embedded browsers. When it
  // has not landed, the anchor can be a thousand pixels below the fold - and
  // every branch of the placement maths then puts the card down there with it,
  // off the bottom of the screen. The page dims and nothing else appears, which
  // reads as the walkthrough being broken.
  //
  // So visibility is checked rather than assumed. An anchor that is not on
  // screen is treated exactly like a step that has no anchor: plain scrim,
  // card in the middle, words still readable. It self-corrects the moment the
  // scroll lands, because this is recomputed on every measurement.
  const onScreen = raw
    && raw.top < window.innerHeight && raw.top + raw.height > 0
    && raw.left < window.innerWidth && raw.left + raw.width > 0
  const spot = onScreen ? raw : null

  const card = placeCard({ spot, isPhone, cardH })

  return createPortal(
    <div className="tour-root" aria-live="polite">
      <div className="tour-glow" aria-hidden />

      <div
        aria-hidden
        data-travel={travelling ? 'yes' : 'no'}
        className={cx('tour-spot', !spot && 'tour-spot--none', ready && 'tour-spot--ready')}
        style={spot
          ? { top: spot.top, left: spot.left, width: spot.width, height: spot.height }
          : { top: '50%', left: '50%', width: 0, height: 0 }}
      />

      <div
        ref={setCardEl}
        className={cx('tour-card', isPhone ? 'tour-card--sheet' : spot ? 'tour-card--float' : 'tour-card--centre')}
        style={isPhone || !spot ? undefined : { top: card.top, left: card.left, width: CARD_W }}
        role="dialog"
        aria-label="Guided walkthrough"
      >
        {/* PROGRESS, AS A PERCENTAGE AND AS A PART.
            Eighteen dots is a count of how much is left. A filling bar with
            "Your people, part 3 of 5" is a shape, and a shape is what stops
            somebody quitting at step nine. */}
        <div className="mb-3.5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.13em] text-brand">
              {part.label}
            </p>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold tabular-nums text-smoke">{pct}%</span>
              <button
                onClick={close}
                aria-label="Close the walkthrough"
                className="-mr-1 rounded-full p-1 text-gray-300 transition-colors hover:text-ink"
              >
                <Icon name="close" className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100">
            <div className="tour-bar h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-2 flex gap-1" aria-hidden>
            {TOUR_PARTS.map((p, n) => (
              <span
                key={p.key}
                className={cx(
                  'h-0.5 flex-1 rounded-full transition-colors duration-500',
                  n < part.index ? 'bg-brand/40' : n === part.index ? 'bg-brand' : 'bg-gray-100',
                )}
              />
            ))}
          </div>
        </div>

        <p className="text-[17px] font-bold leading-snug tracking-tight">{step.title}</p>
        <p className="mt-1.5 text-sm leading-relaxed text-smoke">{step.body}</p>
        {step.tip && (
          <p className="mt-2.5 flex items-start gap-2 text-xs leading-relaxed text-smoke">
            <Icon name="bulb" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" />
            <span>{step.tip}</span>
          </p>
        )}

        {step.action === 'push' && (
          <PushAction state={pushState} busy={busy} onEnable={doPush} done={actionDone} />
        )}
        {step.action === 'connect' && (
          <ConnectAction done={actionDone} />
        )}

        <div className="mt-4 flex items-center gap-1">
          {i > 0 && (
            <button onClick={back} className="btn-ghost !px-2.5 !py-2 text-xs">Back</button>
          )}
          {/* SKIP MOVES ON BY ONE. It used to end the whole walk, which meant
              the only way past a single step you did not care about was to quit
              everything. Pressing it repeatedly is still a way to the end; that
              is a choice somebody makes rather than one they trip over. The X
              in the corner is the way out. */}
          {!last && !pushBlocked && (
            <button onClick={next} className="btn-ghost !px-2.5 !py-2 text-xs text-smoke">
              Skip this
            </button>
          )}
          <button
            onClick={next}
            disabled={pushBlocked}
            className={cx('btn-primary ml-auto !px-4 !py-2 text-sm', pushBlocked && 'cursor-not-allowed opacity-40')}
          >
            {last ? 'Finish' : 'Next'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function PushAction({ state, busy, onEnable, done }) {
  if (!pushSupported()) {
    return (
      <Callout tone="plain" icon="device">
        This browser cannot do push notifications. On an iPhone they work as soon as the app is added to
        your home screen, which takes about ten seconds and is worth doing.
      </Callout>
    )
  }
  if (done || state === 'granted') {
    return (
      <Callout tone="good" icon="check">
        Notifications are on. You will hear about every brief the moment it goes live.
      </Callout>
    )
  }
  if (state === 'denied') {
    return (
      <Callout tone="warn" icon="alert">
        Your browser is blocking notifications for this site, so we cannot ask again from here. Turn them
        back on in its site settings whenever you are ready.
      </Callout>
    )
  }
  return (
    <button onClick={onEnable} disabled={busy} className="btn-primary mt-3.5 w-full !py-2.5 text-sm">
      {busy ? <Spinner className="h-4 w-4" /> : 'Turn on notifications'}
    </button>
  )
}

function ConnectAction({ done }) {
  if (done) {
    return (
      <Callout tone="good" icon="check">
        Sent. They will get a notification, and you will show up in each other’s suggestions from now on.
      </Callout>
    )
  }
  return (
    <Callout tone="plain" icon="users">
      Press Connect on any card behind this. It stays live while the walkthrough is open.
    </Callout>
  )
}

function Callout({ tone, icon, children }) {
  const tones = {
    plain: 'bg-cloud text-smoke',
    good: 'bg-green-50 text-green-800',
    warn: 'bg-amber-50 text-amber-800',
  }
  return (
    <p className={cx('mt-3.5 flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs leading-relaxed', tones[tone])}>
      <Icon name={icon} className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  )
}

/**
 * WHERE THE CARD GOES.
 *
 * Below the spotlight if there is room, above if not, clamped inside the
 * viewport either way. On a phone none of that applies: it is a sheet at the
 * bottom, always, because a floating card on a 390px screen covers whatever it
 * is pointing at however cleverly it is placed.
 */
function placeCard({ spot, isPhone, cardH = CARD_H_FALLBACK }) {
  if (isPhone || !spot) return { top: 0, left: 0 }
  const vw = window.innerWidth
  const vh = window.innerHeight

  const below = spot.top + spot.height + CARD_GAP
  const above = spot.top - CARD_GAP - cardH
  let top = below + cardH < vh ? below : above > 0 ? above : vh - cardH - 12

  // AND THEN CLAMP IT, UNCONDITIONALLY.
  //
  // Every branch above is reasoning about where the spotlight is, and all three
  // give an off-screen answer when the spotlight itself is off-screen - which
  // happens whenever `scrollIntoView` has not landed yet, or cannot land
  // because the anchor is inside a container that will not scroll. The card
  // then sits a thousand pixels below the fold and the walkthrough looks
  // broken: the page dims, and nothing else appears.
  //
  // The words are the one part that must be visible no matter what the geometry
  // says, so this is the last word on it rather than a branch.
  top = Math.max(12, Math.min(top, vh - cardH - 12))

  let left = spot.left + spot.width / 2 - CARD_W / 2
  left = Math.max(12, Math.min(left, vw - CARD_W - 12))
  return { top, left }
}
