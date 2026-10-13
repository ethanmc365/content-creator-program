import { useCallback, useEffect, useRef, useState } from 'react'
import Reveal from '../components/network/Reveal'
import { cx } from '../lib/utils'
import { useT } from '../lib/i18n'

// A ROW YOU SWIPE, WITH THE ARROWS A DESKTOP EXPECTS.
//
// Ethan (9 Sep 2026), three times in one message: "on the how it works, the way
// you can scroll to the right - I really like how you built that in, and I want
// that built in more"; "why creators join - again, this should be that same
// scrolling feature"; "recently active creators - have it as a swiping thing as
// well, and make sure you can see at least part of one more creator so they
// know they can scroll."
//
// So it is one component rather than three copies of the same eleven Tailwind
// classes. The rail was invented for "How it works" and it worked for one
// reason worth restating: 01, 02, 03 are a SEQUENCE, and a sequence you scroll
// through one card at a time stops being one. The same argument covers four
// reasons and twenty faces - they are sets, and a set read one item per screen
// is not a set.
//
// THREE THINGS MAKE IT READ AS SCROLLABLE RATHER THAN CUT OFF:
//
//  1  THE NEXT CARD PEEKS. Every caller's width leaves a fraction of the
//     following card visible at the right edge. A row that ends flush with the
//     screen looks finished; one that ends mid-card asks to be pushed.
//  2  IT IS FULL BLEED. `-mx-5 px-5` (and `sm:-mx-8 sm:px-8`) lets the cards
//     run to the edges of the phone while the first one still lines up with the
//     text above it, so the peeking card is at the SCREEN edge rather than
//     stopping short of it inside a gutter.
//  3  ARROWS, ON A POINTER ONLY. A finger swipes; a mouse does not, and a
//     trackpad's horizontal scroll is a gesture most people never use
//     deliberately. The buttons are `hoverable:`-gated for the same reason
//     every hover style on this page is - on iOS the first tap on anything
//     whose appearance changes on hover is spent ON the hover.
//
// The arrows disable themselves at each end from a real scroll measurement
// rather than from an index, because the container is the thing that knows: its
// item widths are percentages of a width this component never sees.
//
// SNAP TO START, NOT TO CENTRE. `snap-center` is right for the three-card rail
// it came from, where the deck is short enough that the middle card really is
// the subject. With twenty cards it fights every flick: you aim at the next
// card and land with it centred, which means the row is permanently offset from
// its own left gutter. `snap-start` lines each card up with the text above it.
//
// It uses `Reveal`, so the entrance stagger on a rail is the same one the rest
// of the page uses - and a rail is one screen wide, which is exactly the case
// where Reveal's container mode is correct (see the note in Reveal.jsx).
export function Rail({ children, className = '', itemClassName = '', gap = 'gap-4', stagger = 0.09, label }) {
  const tr = useT()
  const ref = useRef(null)
  // `Reveal` publishes its container through a CALLBACK rather than by writing
  // into a ref it was handed - see the note on `innerRef` there - so this is
  // where the node is caught. `useCallback` with no dependencies, because a new
  // function identity on every render would detach and reattach the ref, and
  // React calls a detaching ref callback with `null`.
  const catchScroller = useCallback((el) => { ref.current = el }, [])
  const [ends, setEnds] = useState({ start: true, end: true })

  // WHERE THE ROW IS, MEASURED. `scrollWidth - clientWidth` is the total travel
  // and a 2px slack absorbs sub-pixel widths, which percentage item widths
  // produce constantly - without it the right arrow never quite disables.
  const measure = useCallback(() => {
    const el = ref.current
    if (!el) return
    const max = el.scrollWidth - el.clientWidth
    setEnds({ start: el.scrollLeft <= 2, end: el.scrollLeft >= max - 2 })
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    measure()
    el.addEventListener('scroll', measure, { passive: true })
    // The row's own width decides everything here, and it changes on rotation,
    // on a desktop resize, and once when the webfont settles.
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    ro?.observe(el)
    return () => { el.removeEventListener('scroll', measure); ro?.disconnect() }
  }, [measure, children])

  // ONE CARD AND A BIT PER PRESS, ANIMATED BY HAND.
  //
  // Paging by a full container width overshoots what the reader was looking at;
  // 80% keeps the card they had their eye on partly in view, which is what
  // makes a press feel like a nudge rather than a jump.
  //
  // `scrollBy({ behavior: 'smooth' })` DOES NOTHING ON A MANDATORY SNAP
  // CONTAINER, and this is the third time this codebase has met that family of
  // bug (see the scroll-behaviour notes in lib/scrollBehaviour and the chat
  // scroller). Measured on this exact rail: a smooth `scrollBy(900)` left
  // `scrollLeft` at 0, while `el.scrollLeft = 500` moved it and snapped to 556.
  // The snap engine re-resolves the scroll position on every frame of the
  // browser's own animation and keeps pulling it back to the point it started
  // from, so the animation runs and arrives exactly where it began.
  //
  // So the snap is suspended for the length of OUR animation and restored at
  // the end - at which point the browser snaps once, to the nearest point,
  // which is the card we were aiming at. A 380ms ease-out over a distance the
  // reader chose reads as a page turn; assigning `scrollLeft` outright (the fix
  // used elsewhere for a REPOSITION) would be a jump, and here the movement is
  // the feedback that the press did something.
  //
  // The rAF handle lives in a ref so a second press cancels the first rather
  // than running two tweens over one scroller.
  const anim = useRef(0)
  const settle = useRef(0)
  const page = (dir) => {
    const el = ref.current
    if (!el) return
    cancelAnimationFrame(anim.current)
    const from = el.scrollLeft
    const max = el.scrollWidth - el.clientWidth
    const to = Math.max(0, Math.min(max, from + dir * el.clientWidth * 0.8))
    if (to === from) return
    const reduced = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduced) {
      // One assignment IS allowed to be smooth-suppressed the cheap way: there
      // is no loop to fight with, and somebody who asked for less motion should
      // get the jump rather than the animation.
      const was = el.style.scrollBehavior
      el.style.scrollBehavior = 'auto'
      el.scrollLeft = to
      el.style.scrollBehavior = was
      return
    }

    // AND `scroll-behavior` HAS TO GO WITH IT, which is the same rule this
    // codebase has now paid for five times: `scroll-behavior: smooth` is set
    // PLATFORM-WIDE in index.css, and the `scrollLeft` SETTER honours it. So
    // sixty assignments a second are sixty smooth animations started and
    // abandoned one frame later, and the element never moves at all - measured,
    // `scrollLeft` stayed at 0 for the whole tween. A REPOSITION IS NOT A
    // SCROLL, and every frame of a hand-written animation is a reposition.
    const previousSnap = el.style.scrollSnapType
    const previousBehaviour = el.style.scrollBehavior
    el.style.scrollSnapType = 'none'
    el.style.scrollBehavior = 'auto'
    const restore = () => {
      el.style.scrollSnapType = previousSnap
      el.style.scrollBehavior = previousBehaviour
      // MEASURE FROM HERE TOO, NOT ONLY FROM THE SCROLL EVENT. A scroll event
      // is dispatched by the rendering pipeline, so a rail paged in a hidden
      // pane or a background tab moves without ever telling the arrows - and
      // they would sit disabled over a rail that is halfway along. Asking
      // directly at the end of the movement costs two property reads and makes
      // the arrow state true whatever the browser did with the events.
      measure()
    }
    const start = performance.now()
    const DURATION = 380
    const step = (now) => {
      const t = Math.min(1, (now - start) / DURATION)
      // Ease-out cubic. A press should leave immediately and settle, which is
      // the opposite of the travel curve the tour uses - that one is crossing a
      // distance, this one is arriving.
      el.scrollLeft = from + (to - from) * (1 - (1 - t) ** 3)
      if (t < 1) anim.current = requestAnimationFrame(step)
      else restore()
    }
    anim.current = requestAnimationFrame(step)
    // A TIMER BEHIND THE FRAME LOOP. rAF does not run in a background tab or a
    // hidden pane, and the two properties above are suspended until the loop
    // finishes: without this, a rail that was paged and then hidden comes back
    // with its snapping permanently off.
    clearTimeout(settle.current)
    settle.current = setTimeout(() => { el.scrollLeft = to; restore() }, DURATION + 120)
  }
  // A tween outliving its scroller would keep writing to a detached node, and
  // would leave `scroll-snap-type: none` on it if it ever came back.
  useEffect(() => () => { cancelAnimationFrame(anim.current); clearTimeout(settle.current) }, [])

  return (
    <div className={cx('relative', className)}>
      <Reveal
        innerRef={catchScroller}
        row
        from="down"
        stagger={stagger}
        role="group"
        aria-label={label}
        className={cx(
          // THE TOP PADDING IS THE ROOM THE HOVER NEEDS (4 Oct 2026). A card lifts 5px and grows 2% on hover, and the step badge
          // already hangs 12px above it; a scroller clips whatever leaves it, so with 16px the top of the badge was cut off.
          // The -mt-3 gives the extra padding back, so the page layout is exactly what it was.
          '-mx-5 -mt-3 flex snap-x snap-mandatory overflow-x-auto px-5 pb-3 pt-7 sm:-mx-8 sm:px-8',
          // SCROLL PADDING, OR THE RAIL EATS ITS OWN LEFT GUTTER.
          //
          // A snap point aligns against the scrollport, and the scrollport is
          // the container's PADDING box unless `scroll-padding` says otherwise.
          // So `snap-start` lined card one up with x=0 rather than with the
          // 20px gutter the heading above it sits on - and because the snap is
          // mandatory the browser then scrolled the rail 20px to make it true,
          // which also meant it opened one scroll-step in and drew a "scroll
          // left" arrow pointing at nothing. Measured: `scrollLeft` 20 on a
          // rail that had never been touched.
          //
          // These two values must stay equal to the `px-` above them.
          'scroll-pl-5 sm:scroll-pl-8',
          '[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          gap,
        )}
        itemClassName={cx('shrink-0 snap-start', itemClassName)}
      >
        {children}
      </Reveal>

      {/* THE ARROWS SIT OUTSIDE THE CARDS, NOT ON THEM. Over the first and last
          card they would cover a face on one rail and a step number on another;
          just past the gutter they are furniture. `hidden hoverable:flex` keeps
          them off every touch screen entirely, where they would be two dead
          controls beside a row that already swipes. */}
      {[['prev', -1, ends.start], ['next', 1, ends.end]].map(([key, dir, atEnd]) => (
        <button
          key={key}
          type="button"
          onClick={() => page(dir)}
          disabled={atEnd}
          aria-label={key === 'prev' ? tr('Scroll left') : tr('Scroll right')}
          className={cx(
            'absolute top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white text-ink shadow-card ring-1 ring-black/5 transition-all duration-200 hoverable:flex',
            'hoverable:hover:-translate-y-1/2 hoverable:hover:scale-110 hoverable:hover:shadow-lift',
            'disabled:pointer-events-none disabled:opacity-0',
            key === 'prev' ? '-left-3 lg:-left-5' : '-right-3 lg:-right-5',
          )}
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d={dir < 0 ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} />
          </svg>
        </button>
      ))}
    </div>
  )
}
