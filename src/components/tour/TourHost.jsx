import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import Icon from '../Icon'
import { Spinner } from '../ui'
import { cx } from '../../lib/utils'
import { useIsPhone } from '../../lib/useKeyboardInset'
import { enablePush, pushPermission, pushSupported } from '../../lib/push'
import { stepsFor } from '../../lib/tour'

// THE WALKTHROUGH, DRAWN.
//
// Three pieces, and each of them is doing one job:
//
//   THE GLOW      a brand-coloured frame around the whole viewport, so it is
//                 unmistakable that the app is in a different mode. Without it
//                 a spotlight just reads as a modal that went wrong.
//   THE SPOTLIGHT a hole cut in a dark scrim over the thing being talked about.
//                 It is ONE element: a rounded rect with an enormous spread
//                 box-shadow, which darkens everything outside it. Four divs
//                 forming a frame is the other way and it cannot animate as one.
//   THE CARD      the words. Placed near the anchor on a desktop, pinned to the
//                 bottom on a phone, and never covering the thing it describes.
//
// NOTHING IS TRAPPED. The scrim is pointer-events:none all the way through, so
// every control underneath stays live. That is deliberate and it is what makes
// the two action steps possible: the creator presses the real notification
// button and the real connect button, not a picture of one. A walkthrough that
// blocks the app teaches you how to use a walkthrough.

const PAD = 8          // breathing room around the highlighted element
const CARD_GAP = 14    // between the spotlight and the card
const CARD_W = 340

/** Find the anchor that is actually on screen. Both the desktop nav item and
 *  the mobile tab carry the same name, and only one of them is ever visible. */
function findAnchor(name) {
  if (!name) return null
  const all = [...document.querySelectorAll(`[data-tour="${name}"]`)]
  return all.find((el) => {
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0 && el.offsetParent !== null
  }) || null
}

export default function TourHost({ steps: override, onFinish, startAt = 0 }) {
  const isPhone = useIsPhone()
  const navigate = useNavigate()
  const location = useLocation()

  const steps = override || stepsFor(isPhone)
  const [i, setI] = useState(startAt)
  const [rect, setRect] = useState(null)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [actionDone, setActionDone] = useState(false)
  const [pushState, setPushState] = useState(() => pushPermission())

  const step = steps[Math.min(i, steps.length - 1)]
  const last = i >= steps.length - 1

  // ------------------------------------------------------------- routing ---
  // Move to the step's page first, then look for the anchor. `ready` gates the
  // whole overlay so nothing is drawn against the previous page's layout.
  useEffect(() => {
    setReady(false)
    setActionDone(false)
    if (!step) return undefined
    const [path, search] = (step.route || '').split('?')
    if (path && path !== location.pathname) {
      navigate(step.route, { replace: false })
    } else if (search && search !== location.search.replace('?', '')) {
      navigate(step.route, { replace: true })
    }
    // Two frames plus a beat: the route has to commit, the page has to lay out,
    // and anything lazily loaded has to arrive. Measuring earlier gives a rect
    // for an element that is about to move.
    const t = setTimeout(() => setReady(true), 260)
    return () => clearTimeout(t)
    // location is deliberately not a dependency: navigating IS the effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, step?.key])

  // ----------------------------------------------------------- measuring ---
  const measure = useCallback(() => {
    if (!step) return
    const el = findAnchor(step.anchor)
    if (!el) { setRect(null); return }
    const r = el.getBoundingClientRect()
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
  }, [step])

  // KEEPING THE SPOTLIGHT ON THE THING.
  //
  // The first version of this ran `measure` inside a requestAnimationFrame loop
  // for the whole tour, which is wrong twice over: it is sixty measurements a
  // second for two minutes to track something that moves perhaps four times,
  // and rAF IS THROTTLED TO A STOP IN A BACKGROUND TAB - so a creator who
  // switched tabs mid-step came back to a spotlight sitting wherever the layout
  // used to be.
  //
  // Measure when the step arrives, then only when something could have moved
  // it: a scroll anywhere (capture phase, so it catches inner scrollers too), a
  // resize, and a slow interval as the backstop for the layout shifts nothing
  // announces - an image loading above the anchor, a lazy section arriving.
  useLayoutEffect(() => {
    if (!ready) return undefined
    const el = findAnchor(step?.anchor)
    // Bring it into view before the first measurement, or the spotlight lands
    // on an element that is about to scroll out from under it.
    if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    measure()

    const onMove = () => measure()
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    const settle = setTimeout(measure, 420)   // after the smooth scroll lands
    const backstop = setInterval(measure, 400)
    return () => {
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
      clearTimeout(settle)
      clearInterval(backstop)
    }
  }, [ready, measure, step?.anchor])

  // ------------------------------------------------------------- actions ---
  // The two steps that ask for something real, and how each one knows it
  // happened. Both are OPTIONAL: a walkthrough you cannot leave is a trap.
  useEffect(() => {
    if (step?.action !== 'push') return undefined
    const id = setInterval(() => {
      const p = pushPermission()
      setPushState(p)
      if (p === 'granted') setActionDone(true)
    }, 700)
    return () => clearInterval(id)
  }, [step?.action])

  async function doPush() {
    setBusy(true)
    try {
      await enablePush()
      setPushState(pushPermission())
      if (pushPermission() === 'granted') setActionDone(true)
    } catch { /* the creator declined, or the browser refused */ }
    setBusy(false)
  }

  // ------------------------------------------------------------ movement ---
  const next = useCallback(() => {
    if (last) { onFinish?.('finished'); return }
    setI((n) => n + 1)
  }, [last, onFinish])

  const back = useCallback(() => setI((n) => Math.max(0, n - 1)), [])
  const quit = useCallback(() => onFinish?.('dismissed'), [onFinish])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') quit()
      if (e.key === 'ArrowRight') next()
      if (e.key === 'ArrowLeft') back()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [next, back, quit])

  if (!step) return null

  // ------------------------------------------------------------- geometry ---
  const spot = rect && {
    top: rect.top - PAD,
    left: rect.left - PAD,
    width: rect.width + PAD * 2,
    height: rect.height + PAD * 2,
  }

  const card = placeCard({ spot, isPhone })

  return createPortal(
    <div className="tour-root" aria-live="polite">
      {/* The frame round the whole screen. Says "you are being shown round"
          before a single word is read. */}
      <div className="tour-glow" aria-hidden />

      {/* The scrim, with a hole in it. When a step has no anchor the hole has
          no size and the whole screen simply dims, which is the right look for
          the opening and closing cards. */}
      <div
        aria-hidden
        className={cx('tour-spot', !spot && 'tour-spot--none', ready && 'tour-spot--ready')}
        style={spot
          ? { top: spot.top, left: spot.left, width: spot.width, height: spot.height }
          : { top: '50%', left: '50%', width: 0, height: 0 }}
      />

      {/* The words. A step with no anchor is not pointing at anything, so its
          card belongs in the middle of the screen rather than tucked into a
          corner next to a spotlight that is not there. */}
      <div
        className={cx(
          'tour-card',
          isPhone ? 'tour-card--sheet' : spot ? 'tour-card--float' : 'tour-card--centre',
        )}
        style={isPhone || !spot ? undefined : { top: card.top, left: card.left, width: CARD_W }}
        role="dialog"
        aria-label="Guided walkthrough"
      >
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand text-[11px] font-bold text-white">
            {i + 1}
          </span>
          <div className="flex flex-1 gap-1" aria-hidden>
            {steps.map((s, n) => (
              <span
                key={s.key}
                className={cx('h-1 flex-1 rounded-full transition-colors duration-300', n <= i ? 'bg-brand' : 'bg-gray-200')}
              />
            ))}
          </div>
          <button onClick={quit} aria-label="Close the walkthrough" className="-mr-1 rounded-full p-1 text-smoke transition-colors hover:text-ink">
            <Icon name="close" className="h-4 w-4" />
          </button>
        </div>

        <p className="text-base font-bold leading-snug">{step.title}</p>
        <p className="mt-1.5 text-sm leading-relaxed text-smoke">{step.body}</p>

        {/* The action steps get their own control, right here, so nobody has to
            hunt for the highlighted button on a small screen. */}
        {step.action === 'push' && (
          <PushAction state={pushState} busy={busy} onEnable={doPush} done={actionDone} />
        )}
        {step.action === 'connect' && !actionDone && (
          <p className="mt-3 rounded-xl bg-brand-tint/50 px-3 py-2.5 text-xs leading-relaxed text-brand">
            Press Connect on anybody in the highlighted card. You can also skip this and do it later.
          </p>
        )}

        <div className="mt-4 flex items-center gap-2">
          {i > 0 && (
            <button onClick={back} className="btn-ghost !px-3 !py-2 text-xs">Back</button>
          )}
          {!last && (
            <button onClick={quit} className="btn-ghost !px-3 !py-2 text-xs text-smoke">
              Skip the rest
            </button>
          )}
          <button onClick={next} className="btn-primary ml-auto !px-4 !py-2 text-sm">
            {last ? 'Finish' : step.action && !actionDone ? 'Later' : 'Next'}
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
      <p className="mt-3 rounded-xl bg-cloud px-3 py-2.5 text-xs leading-relaxed text-smoke">
        This browser cannot do push notifications. On an iPhone they work once the app is added to your
        home screen, which is worth doing anyway.
      </p>
    )
  }
  if (done || state === 'granted') {
    return (
      <p className="mt-3 flex items-center gap-2 rounded-xl bg-green-50 px-3 py-2.5 text-xs font-medium text-green-800">
        <Icon name="check" className="h-4 w-4 shrink-0" />
        Notifications are on. That is the useful one done.
      </p>
    )
  }
  if (state === 'denied') {
    return (
      <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-800">
        Your browser is blocking notifications for this site. You can turn them back on in its site
        settings, and then enable them from Settings here.
      </p>
    )
  }
  return (
    <button onClick={onEnable} disabled={busy} className="btn-primary mt-3 w-full !py-2.5 text-sm">
      {busy ? <Spinner className="h-4 w-4" /> : 'Turn on notifications'}
    </button>
  )
}

/**
 * WHERE THE CARD GOES.
 *
 * Below the spotlight if there is room, above it if there is not, and clamped
 * inside the viewport either way. On a phone none of that applies: the card is
 * a sheet at the bottom, always, because a floating card on a 390px screen
 * covers whatever it is pointing at however cleverly it is placed.
 */
function placeCard({ spot, isPhone }) {
  if (isPhone || !spot) return { top: 0, left: 0 }
  const vw = window.innerWidth
  const vh = window.innerHeight
  const CARD_H = 210

  const below = spot.top + spot.height + CARD_GAP
  const above = spot.top - CARD_GAP - CARD_H
  const top = below + CARD_H < vh ? below : above > 0 ? above : Math.max(12, vh - CARD_H - 12)

  let left = spot.left + spot.width / 2 - CARD_W / 2
  left = Math.max(12, Math.min(left, vw - CARD_W - 12))
  return { top, left }
}
