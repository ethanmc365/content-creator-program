import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import Icon from '../Icon'
import { Spinner } from '../ui'
import { cx } from '../../lib/utils'
import { useIsPhone } from '../../lib/useKeyboardInset'
import { enablePush, pushPermission, pushSupported } from '../../lib/push'
import { partOf, stepAt, stepGoal, stepsFor } from '../../lib/tour'
import { placeCard, union, CARD_W } from '../../lib/tourPlacement'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { useT } from '../../lib/i18n'

// THE WALKTHROUGH, DRAWN AND DRIVEN.
//
// Three layers:
//   THE GLOW      a heavy brand frame round the whole viewport for the entire
//                 walk, so there is never any doubt what mode the app is in.
//   THE SPOTLIGHT a hole cut in a dark scrim over the thing being talked about.
//                 ONE element: a rounded rect with an enormous box-shadow
//                 spread, which darkens everything outside it.
//   THE CARD      the words, the one progress bar, and the instruction.
//
// TWO ARCHITECTURAL DECISIONS THAT MATTER
//
// 1. REACT OWNS THE CONTENT, A rAF LOOP OWNS THE GEOMETRY.
//    Tracking a scrolling anchor through React state means a setState per
//    frame, and a re-render of the whole overlay per frame with it. That is
//    what "the highlighted box is not smooth" was. Position is written STRAIGHT
//    to the elements' styles inside one rAF loop now; React re-renders only
//    when the step changes. Nothing to batch, nothing to reconcile, no jank.
//
// 2. NOTHING IS TRAPPED, AND THERE IS NO NEXT BUTTON.
//    The scrim is pointer-events:none throughout, so every control underneath
//    stays live - and the walk advances when the creator actually does the
//    thing: taps the nav, scrolls the brief, presses Connect, turns
//    notifications on. Pressing Next teaches you how to press Next.

const PAD = 8

function findAnchor(name) {
  if (!name) return null
  const all = [...document.querySelectorAll(`[data-tour="${name}"]`)]
  return all.find((el) => {
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0 && el.offsetParent !== null
  }) || null
}

export default function TourHost({ onFinish, network = false }) {
  const tr = useT()
  const isPhone = useIsPhone()
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()

  const steps = useMemo(() => stepsFor({ network }), [network])
  const [i, setI] = useState(0)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [hit, setHit] = useState(false)        // the goal just completed
  const [pushState, setPushState] = useState(() => pushPermission())
  const [dwell, setDwell] = useState(0)        // 0..1 for the dwell ring

  const spotRef = useRef(null)
  const cardRef = useRef(null)
  const rafRef = useRef(0)
  const travelUntil = useRef(0)
  const advanced = useRef(false)

  const step = steps[Math.min(i, steps.length - 1)]
  const last = i >= steps.length - 1
  const goal = step ? stepGoal(step, network) : null
  const part = partOf(step)
  const pct = Math.round(((i + (hit ? 1 : 0)) / steps.length) * 100)

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
    }, 620)
  }, [last, onFinish])

  const skip = useCallback(() => {
    if (advanced.current) return
    advanced.current = true
    if (last) { onFinish?.('finished'); return }
    setI((n) => n + 1)
  }, [last, onFinish])

  const close = useCallback(() => onFinish?.('dismissed'), [onFinish])

  // ----------------------------------------------------- entering a step ---
  useEffect(() => {
    setReady(false)
    setDwell(0)
    advanced.current = false
    travelUntil.current = Date.now() + 560
    if (!step) return undefined

    // Put them where the step happens, unless the goal is to navigate somewhere
    // and they are already there.
    const to = stepAt(step, network)
    const g = stepGoal(step, network)
    const alreadyAtGoal = g?.kind === 'route' && location.pathname.startsWith(g.to)
    if (to && !alreadyAtGoal) {
      const [path] = to.split('?')
      const sameRoute = path === location.pathname
        && (!to.includes('?') || to.endsWith(location.search))
      if (!sameRoute) navigate(to)
    }

    // OPEN THE DRAWER THE THING IS IN (3 Sep 2026).
    //
    // Ethan: "post a trip, find a company, open the collaboration board - but
    // it's not showing where it is. It should be automatically opening the
    // profile dropdown menu so I can actually see and then click on the collab
    // board", and later, on the settings step: "the card's actually covering
    // the settings drop down, so I'm kinda unable to click on it."
    //
    // Half the destinations in this walk - the collab board, the flight log,
    // the games, the milestones, settings - are not tabs. They live behind the
    // avatar menu, and a step that highlights a closed menu and then names
    // something inside it is asking somebody to find a door they cannot see.
    // A step marked `openMenu` presses the avatar itself, so the item the card
    // is talking about is on screen when the card appears.
    //
    // It only OPENS it. Closing is the app's business - and if it is already
    // open, pressing again would close it, which is why the state is checked.
    if (step.openMenu) {
      const menu = document.querySelector('[data-tour="avatar-menu"]')
      if (menu && menu.getAttribute('aria-expanded') !== 'true') menu.click()
    }

    const t = setTimeout(() => setReady(true), 300)
    return () => clearTimeout(t)
    // `location` is deliberately absent: navigating IS the effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, step?.key, network])

  // -------------------------------------------------- goal: they navigate ---
  useEffect(() => {
    if (!ready || goal?.kind !== 'route') return
    if (location.pathname.startsWith(goal.to)) finishStep()
  }, [ready, goal, location.pathname, finishStep])

  // ---------------------------------------------------- goal: they scroll ---
  //
  // IT LISTENED TO THE WINDOW AND ONLY THE WINDOW (3 Sep 2026).
  //
  // Ethan, on the brief step: "I am scrolling on that page, and nothing is
  // happening." He was scrolling, and the step could not tell.
  //
  // `window.scrollY` is right for a page that scrolls the document, and this
  // app has several surfaces that do not: a chat thread, the market rail, any
  // dialog with a scroller in it. A scroll inside one of those fires a `scroll`
  // event on THAT element, and a scroll event does not bubble - so a listener
  // on `window` never hears it and the step waits for ever with no way past.
  //
  // The capture phase hears every scroll in the document, whatever scrolled.
  // Progress is the largest distance anything has moved since the step began,
  // which is the honest reading of "they scrolled": the creator does not know
  // or care which element owns the wheel.
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

  // ------------------------------------------------ goal: nothing to do ---
  useEffect(() => {
    if (!ready || goal?.kind !== 'dwell') return undefined
    const started = Date.now()
    const id = setInterval(() => {
      const p = Math.min(1, (Date.now() - started) / goal.ms)
      setDwell(p)
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

  // ------------------------------------------------------ THE rAF LOOP ---
  //
  // Everything geometric happens here and nowhere else: measure the anchor,
  // write the spotlight's box, place the card. No React state is touched, so
  // this runs at display rate without re-rendering anything.
  useEffect(() => {
    if (!ready) return undefined
    const anchorName = step?.anchor
    const el = findAnchor(anchorName)
    if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' })

    const tick = () => {
      rafRef.current = requestAnimationFrame(tick)
      const spot = spotRef.current
      if (!spot) return

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

      if (visible) {
        spot.dataset.on = 'yes'
        spot.style.top = `${r.top - PAD}px`
        spot.style.left = `${r.left - PAD}px`
        spot.style.width = `${r.width + PAD * 2}px`
        spot.style.height = `${r.height + PAD * 2}px`
      } else {
        spot.dataset.on = 'no'
        spot.style.top = '50%'
        spot.style.left = '50%'
        spot.style.width = '0px'
        spot.style.height = '0px'
      }

      // The card. On a phone it is a sheet pinned by CSS, so nothing to do.
      const card = cardRef.current
      if (!card || isPhone) return
      // A STEP WITH NO ANCHOR NO LONGER PUTS THE CARD OVER THE PAGE (3 Sep
      // 2026). Ethan, on the hub: "this is the hub, scroll down and have a
      // look - yet the card is covering most of the hub." It was: with no
      // anchor the card went dead centre, which is exactly where the content
      // he was being asked to look at lives. A card asking you to read
      // something must not be on top of it, so these steps pin it low and out
      // of the way instead. `data-centre` still drives the entrance animation.
      if (!visible) { card.dataset.centre = 'yes'; card.style.top = ''; card.style.left = ''; return }
      card.dataset.centre = 'no'

      // WHAT THE CARD MUST NOT COVER IS BIGGER THAN THE ANCHOR (3 Sep 2026).
      //
      // The arithmetic lives in lib/tourPlacement, where it can be tested: this
      // used to be inline here, inside a rAF loop, and rAF does not run in a
      // hidden pane - so the one rule that matters could only be checked by
      // looking at it, and it was wrong for months.
      //
      // `data-tour-keepout` is how a dropdown tells the walkthrough it exists.
      // Without it the card was placed under the avatar, which is exactly where
      // the account menu opens, so the instruction covered the only control
      // that could satisfy it.
      const keepOuts = [...document.querySelectorAll('[data-tour-keepout]')]
        .map((el) => el.getBoundingClientRect())
      const avoid = union([{ top: r.top, left: r.left, width: r.width, height: r.height }, ...keepOuts])
      if (!avoid) return
      const { top, left } = placeCard(avoid, { w: vw, h: vh }, card.offsetHeight || 260)

      card.style.top = `${top}px`
      card.style.left = `${left}px`
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [ready, step?.anchor, isPhone])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  if (!step) return null

  // THE GATE, AND IT NO LONGER OPENS ON A REFUSAL (3 Sep 2026).
  //
  // Ethan: "remember that you can't skip enabling notifications. If you don't
  // enable notifications it should say please enable notifications and try
  // again, and this actually has to be enabled properly for their device."
  //
  // It used to hold only while the permission was still `default` - so pressing
  // "Turn on notifications" and then Block in the browser's own dialog put a
  // "Skip this" button on screen, and the one step that decides whether
  // somebody ever hears about a brief was cleared by refusing it. That is the
  // opposite of a gate.
  //
  // A DENIAL CANNOT BE UNDONE FROM A WEB PAGE - the browser will not ask twice -
  // so the gate cannot simply insist. What it can do is stay shut and hand over
  // the instructions for the browser they are actually in, with a button that
  // re-reads the permission once they have. See PushAction.
  //
  // The one case that still opens is a browser that has no push at all, where
  // no instruction exists to give. That is not a refusal, it is an absence.
  const pushBlocked = step.required && goal?.kind === 'push'
    && pushSupported() && pushState !== 'granted'

  return createPortal(
    <div className="tour-root" aria-live="polite">
      <div className="tour-glow" aria-hidden />

      <div
        ref={spotRef}
        aria-hidden
        data-on="no"
        data-travel="yes"
        className={cx('tour-spot', ready && 'tour-spot--ready')}
        style={{ top: '50%', left: '50%', width: 0, height: 0 }}
      />

      <div
        ref={cardRef}
        data-centre="yes"
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
              <button
                onClick={close}
                aria-label={tr("Close the walkthrough")}
                className="-mr-1 rounded-full p-1 text-gray-300 transition-colors hover:text-ink"
              >
                <Icon name="close" className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100">
            <div className="tour-bar h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
          </div>
        </div>

        <p className="tour-title text-[17px] font-bold leading-snug tracking-tight">{step.title}</p>
        <p className="tour-body mt-1.5 text-sm leading-relaxed text-smoke">{step.body}</p>

        {/* THE INSTRUCTION. The one line that matters if they read nothing
            else, so it gets the brand colour, an arrow, and its own row. */}
        {step.do && !hit && (
          <p className="tour-do mt-3 flex items-center gap-2 rounded-xl bg-brand-tint/60 px-3 py-2.5 text-[13px] font-semibold text-brand">
            {goal?.kind === 'dwell'
              ? <DwellRing p={dwell} />
              : <Icon name="chevronRight" className="h-4 w-4 shrink-0 animate-pulse" />}
            <span className="min-w-0">{step.do}</span>
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

        <div className="mt-4 flex items-center gap-2">
          {last ? (
            <button onClick={() => onFinish?.('finished')} className="btn-primary ml-auto !px-5 !py-2 text-sm">
              {tr("Finish")}
            </button>
          ) : (
            <>
              <p className="min-w-0 flex-1 truncate text-[11px] text-smoke">
                Step {i + 1} of {steps.length}
              </p>
              {!pushBlocked && (
                <button onClick={skip} className="btn-ghost shrink-0 !px-3 !py-1.5 text-xs text-smoke">
                  {tr("Skip this")}
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

/** The dwell countdown, drawn as a ring rather than a number. */
function DwellRing({ p }) {
  const C = 2 * Math.PI * 7
  return (
    <svg viewBox="0 0 18 18" className="h-4 w-4 shrink-0 -rotate-90" aria-hidden>
      <circle cx="9" cy="9" r="7" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.25" />
      <circle
        cx="9" cy="9" r="7" fill="none" stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - p)}
      />
    </svg>
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
  // BLOCKED, AND THE WALK DOES NOT GO ON UNTIL IT IS NOT.
  //
  // A browser that has been told "Block" will never show its permission prompt
  // again, so `onEnable` is useless here and offering it would be a button that
  // does nothing. What works is the site settings, which is two taps and
  // completely different in each browser - so the instruction names the one
  // they are in rather than describing "your browser settings" in the abstract.
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
