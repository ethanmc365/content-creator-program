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
import { payeeComplete, payeeFromPrivate } from '../../lib/invoice'
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

  const spotRef = useRef(null)
  const cardRef = useRef(null)
  const rafRef = useRef(0)
  // The timer half of the loop above. See the note on `schedule`.
  const tickRef = useRef(0)
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
      // AND SCROLL TO THE THING IT IS TALKING ABOUT. The menu is eighteen items
      // long and both of the steps that open it point at something past the
      // halfway mark - "Creator Network" is sixth, "Travel games" twelfth - so
      // opening it and saying the name still left somebody scrolling a list
      // looking for a word. The panel is scrolled so the item is in view before
      // the card appears.
      const dest = (g?.kind === 'route') ? g.to : null
      if (dest) {
        setTimeout(() => {
          const panel = document.querySelector('[data-tour-keepout]')
          const item = panel?.querySelector(`a[href="${dest}"]`)
          item?.scrollIntoView({ block: 'center' })
        }, 80)
      }
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

  // THE `dwell` AND `connect` GOALS ARE GONE (4 Sep 2026).
  //
  // `dwell` advanced on a TIMER, which is the one interaction in a walkthrough
  // that takes control away from the person doing it - Ethan: "I don't like at
  // the start where there's a timer to start, you should always have to click
  // something to proceed." `connect` sent a real connection request to a real
  // stranger as a side effect of a tutorial. Neither is coming back.

  // -------------------------------------- goal: they add payment details ---
  //
  // Polled rather than pushed, for the same reason the push goal is: the field
  // lives on a page this component does not own and does not want to reach
  // into. `payeeComplete` is the SAME test the invoice uses, so "the tour says
  // I have done it" and "an invoice can actually be paid" cannot disagree.
  useEffect(() => {
    if (!ready || goal?.kind !== 'payee' || !user?.id) return undefined
    let alive = true
    const check = async () => {
      const { data } = await supabase
        .from('creator_private').select('*').eq('id', user.id).maybeSingle()
      if (!alive || !data) return
      if (payeeComplete(payeeFromPrivate(data))) finishStep()
    }
    check()
    const id = setInterval(check, 1500)
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
    // A TALL ANCHOR IS SCROLLED TO THE TOP, NOT THE MIDDLE.
    //
    // Centring is right for a nav item and wrong for the live challenge card,
    // which is 578px of a 900px window: centred, it leaves ~160px above and
    // ~160px below, and the walkthrough card is 305px - so nothing fits above,
    // below or beside it and the card has to overlap the very thing it is
    // pointing at. Scrolled to the top, the same anchor leaves the whole lower
    // half of the window free.
    const el = findAnchor(anchorName)
    if (el) {
      const tall = el.getBoundingClientRect().height > window.innerHeight * 0.4
      el.scrollIntoView({ block: tall ? 'start' : 'center', behavior: 'smooth' })
    }

    // ARMED TWO WAYS, FOR THE REASON lib/chatScroll ALREADY LEARNED.
    //
    // `requestAnimationFrame` does not run in a background tab, in a hidden
    // pane, or under some automation - and this loop is the ONLY thing that
    // positions the spotlight and the card. When it does not run, the spotlight
    // stays at its initial zero size and the card stays at its CSS default,
    // which is bottom-centre - directly over the thing the step is pointing at.
    // The walkthrough has always had this hole; the chat scroller was fixed for
    // it months ago and this was never given the same treatment.
    //
    // Each step arms an rAF AND a timer, and whichever arrives first runs,
    // cancelling the other. Foreground gets frame-accurate tracking; anywhere
    // rAF is throttled still gets a correctly placed card, just on a timer.
    const schedule = () => {
      cancelAnimationFrame(rafRef.current)
      clearTimeout(tickRef.current)
      const once = () => { cancelAnimationFrame(rafRef.current); clearTimeout(tickRef.current); tick() }
      rafRef.current = requestAnimationFrame(once)
      tickRef.current = setTimeout(once, 32)
    }

    const tick = () => {
      schedule()
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

      // THE LIT AREA IS THE ANCHOR PLUS WHATEVER IT OPENED.
      //
      // The spotlight cuts a hole in a scrim, and the hole used to be the
      // anchor alone. On the two steps that open the account menu that meant
      // the avatar was lit and the MENU - the thing the card had just told you
      // to use - sat under the dim, greyed out like the rest of the page. The
      // same `data-tour-keepout` rectangles that keep the card off it belong
      // inside the hole for the same reason: they are part of what the step is
      // about.
      // `visible` IS CHECKED BEFORE `r` IS READ, AND THAT IS THE WHOLE OF
      // "IF I CLICK A BUTTON IT ALL JUST GOES AWAY" (4 Sep 2026).
      //
      // This was an unconditional `union([{ top: r.top, ... }])`, three lines
      // after a `visible` test that already knew `r` could be undefined. So the
      // moment a step's anchor was not in the DOM - which is EVERY step for the
      // frames between navigating and the new page rendering, and permanently
      // for the notifications step on a device that has blocked push - this
      // threw:
      //
      //     TypeError: Cannot read properties of undefined (reading 'top')
      //
      // inside the rAF loop. `schedule()` runs first, so the loop re-armed and
      // threw again on the next frame, for ever. Nothing after the throw ever
      // ran: the spotlight froze on the PREVIOUS step's anchor and the card
      // stopped being positioned entirely. On a phone, where a navigation takes
      // long enough that the anchor is reliably missing on the first tick, that
      // is most taps.
      //
      // Found by reading the console rather than the code: it was filling with
      // one of these per frame.
      const lit = visible
        ? union([
          { top: r.top, left: r.left, width: r.width, height: r.height },
          ...[...document.querySelectorAll('[data-tour-keepout]')].map((el) => el.getBoundingClientRect()),
        ])
        : null

      if (visible && lit) {
        spot.dataset.on = 'yes'
        spot.style.top = `${lit.top - PAD}px`
        spot.style.left = `${lit.left - PAD}px`
        spot.style.width = `${lit.right - lit.left + PAD * 2}px`
        spot.style.height = `${lit.bottom - lit.top + PAD * 2}px`
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
      // The same rectangle the spotlight just lit: what must stay visible is
      // exactly what the card must not cover.
      if (!lit) return
      const { top, left } = placeCard(lit, { w: vw, h: vh }, card.offsetHeight || 260)

      card.style.top = `${top}px`
      card.style.left = `${left}px`
    }

    schedule()
    return () => {
      cancelAnimationFrame(rafRef.current)
      clearTimeout(tickRef.current)
    }
  }, [ready, step?.anchor, isPhone])

  // THE DOCUMENT KNOWS THE WALK IS RUNNING.
  //
  // On a phone the account menu is 668px of an 812px screen - eighteen items -
  // and the card is a sheet at the bottom. There is nowhere to put a 272px card
  // that does not land on it, which is why Ethan still saw "cards blocking the
  // instructions" on the two steps that open it, on mobile, after the desktop
  // placement was fixed. Desktop can move the card beside the menu; a phone has
  // no beside.
  //
  // So the menu gives way instead: `html.tour-running` caps it above the sheet
  // (index.css). It already scrolls, and `scrollMenuToGoal` below puts the item
  // the step is about at the top of what is left, so the shorter menu costs
  // nothing.
  useEffect(() => {
    document.documentElement.classList.add('tour-running')
    return () => document.documentElement.classList.remove('tour-running')
  }, [])

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
  // THE GATE HOLDS ONLY WHILE THERE IS STILL SOMETHING THEY CAN DO.
  //
  // `required` hides the skip so notifications cannot be waved past - Ethan
  // asked for that and it is right. But `denied` is not a refusal to press the
  // button, it is the BROWSER refusing to ask again: once a device has said no,
  // no amount of pressing produces a prompt, and the only fix is several taps
  // deep in the operating system's own settings. Holding the gate there does
  // not get notifications turned on; it strands somebody at 83% with an X as
  // the only way out, which is how a walkthrough becomes the thing people
  // remember about the product.
  //
  // So: gate `default` (never asked - the prompt still works), release
  // `denied`. The card still says how to turn them back on, the "check again"
  // button still re-reads the permission the moment they do, and
  // BankDetailsPrompt-style nagging is not this component's job.
  const pushBlocked = step.required && goal?.kind === 'push'
    && pushSupported() && pushState !== 'granted' && pushState !== 'denied'

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

        {/* THE BODY SCROLLS, THE ACTIONS DO NOT (4 Sep 2026).
            The whole sheet was one `overflow-y: auto` box capped at 17rem, so
            on any step with a long explanation - the notifications one, when a
            device has blocked push and the card has to explain how to undo that
            - the buttons were simply below the fold, inside a small scroller
            nobody could tell was scrollable. Somebody looking at a card with no
            visible way forward concludes it is broken, and they are not wrong.
            Progress on top, actions on the bottom, and only the words in
            between move. */}
        <div className="tour-scroll">
        <p className="tour-title text-[17px] font-bold leading-snug tracking-tight">{step.title}</p>
        <p className="tour-body mt-1.5 text-sm leading-relaxed text-smoke">{step.body}</p>

        {/* THE INSTRUCTION. The one line that matters if they read nothing
            else, so it gets the brand colour, an arrow, and its own row. */}
        {step.do && !hit && (
          <p className="tour-do mt-3 flex items-center gap-2 rounded-xl bg-brand-tint/60 px-3 py-2.5 text-[13px] font-semibold text-brand">
            <Icon name="chevronRight" className="h-4 w-4 shrink-0 animate-pulse" />
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

        </div>

        <div className="tour-actions mt-4 flex items-center gap-2">
          {last ? (
            <button onClick={() => onFinish?.('finished')} className="btn-primary ml-auto !px-5 !py-2 text-sm">
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
              {/* THE PAYMENT STEP IS ASKED, NOT ENFORCED, and its skip says so
                  in words rather than reading "Skip this" like the others.
                  A hard gate on bank details produces somebody who closes the
                  app - and somebody genuinely may not have their IBAN to hand
                  standing on a train. BankDetailsPrompt asks again on later
                  opens, so skipping here does not mean never. */}
              {!pushBlocked && (
                <button onClick={skip} className="btn-ghost shrink-0 !px-3 !py-1.5 text-xs text-smoke">
                  {goal?.kind === 'payee' ? tr("I'll do this later") : tr("Skip this")}
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
