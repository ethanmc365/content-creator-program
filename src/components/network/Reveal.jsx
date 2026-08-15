import { Children, Fragment, useEffect, useState } from 'react'

// A grid or list whose children arrive one after another as it scrolls into
// view. THE animation of this product, extracted.
//
// WHY IT IS A COMPONENT RATHER THAN TWO VARIANTS YOU IMPORT
//
// The stagger already existed as `listContainer` + `listItem` in lib/motion, and
// using it meant three things at every call site: wrap the grid in motion.div,
// remember `initial="hidden" animate="show"`, and turn every child into a
// motion element carrying `variants={listItem}`. Most places did two of the
// three, which is why some grids staggered, some faded as one block, and some
// did nothing at all.
//
// This does all three. Children stay plain elements; the wrapper puts each one
// in its own div and hands it its place in the queue.
//
// WHY IT IS CSS AND NOT MOTION
//
// It was Motion, and that quietly made it unusable in the half of the app that
// most needed it. The creator directory, the collab board, the connections page
// and the chat are all EAGERLY routed - they load before anything is split -
// so importing anything that pulls the Motion runtime puts ~120kB into the
// first paint for every creator, on a phone, on the way to a page that has not
// asked for it yet. That is the same trap `flagFromIso` and `ParticipationBar`
// were each moved out of.
//
// So this is an IntersectionObserver, one class, and a transition-delay. Same
// language (same distance, same curve, same stagger), no runtime, importable
// from anywhere. The ToastHost is CSS-only for exactly this reason.
//
// IN VIEW, NOT ON MOUNT. A grid eight screens down animating on mount has spent
// its motion on nobody, and re-animating every time you scroll past is a page
// that will not sit still - so it fires once, and the root margin starts it
// slightly before the element is on screen so the motion is FINISHING as it
// arrives.
//
// Reduced motion is handled in the stylesheet: the transform is dropped and the
// stagger collapses, leaving a plain fade.
export default function Reveal({
  children,
  className,
  as: Tag = 'div',
  // `stagger` lets a dense list run tighter than a sparse grid. Past about 60ms
  // per child a grid stops reading as "arriving" and starts reading as "slow",
  // so the ceiling is deliberately low. Seconds, to match the old Motion API.
  stagger = 0.045,
  // Everything after this many children arrives together. A 40-card directory
  // staggered at 45ms would take nearly two seconds to finish drawing, and the
  // cards at the end would animate long after the reader had scrolled past them.
  maxStagger = 12,
  // WHERE THE CHILDREN COME FROM.
  //
  // 'up' (the default) is the house entrance: everything rises a little as it
  // arrives. The others exist because a two-column page reads better when the
  // two columns do not arrive identically - the article rises, the rail slides
  // in from the side it lives on - and that difference is what makes a layout
  // feel composed rather than merely animated.
  from = 'up',
  // A head start, in seconds, added before this container's own stagger.
  //
  // WHY A PAGE NEEDS THIS. Every section on a hub carries its own observer, and
  // the three or four that are above the fold therefore all fire on the same
  // frame - so a page that is supposed to assemble instead flashes in as one
  // block, which is exactly the "you can't even really see the animation, it
  // just appears" report. Giving the first few sections an increasing delay
  // makes the page arrive top to bottom. Sections further down pass 0: they are
  // already separated in time by the act of scrolling to them, and a delay
  // there would just be a page that lags behind your thumb.
  delay = 0,
  ...rest
}) {
  const [shown, setShown] = useState(false)
  // The node in STATE, not a ref, with the observer in an effect keyed on it.
  //
  // This was a callback ref that returned its own cleanup, which reads
  // naturally and is a React 19 feature - on 18 a callback ref returning a
  // function is a warning and the cleanup never runs, so every conditionally
  // rendered grid leaked an observer. State is also what makes the effect
  // re-run when a grid unmounts and comes back.
  const [node, setNode] = useState(null)

  useEffect(() => {
    if (!node || shown) return undefined
    // No IntersectionObserver (very old browser, some test environments) must
    // never mean "invisible content". Show it and move on.
    if (typeof IntersectionObserver === 'undefined') {
      setShown(true)
      return undefined
    }
    // THE ROOT MARGIN HAS TO GROW THE VIEWPORT, NOT SHRINK IT.
    //
    // THE BUG THIS FIXES. This said `-10%`, and a NEGATIVE bottom margin pulls
    // the observer's bottom edge UP - so a section did not begin arriving until
    // its top had already travelled a tenth of a screen INTO view, and then
    // took its delay and its 720ms transition on top of that. Scrolling down
    // the hub therefore meant looking at an empty space where Daily puzzles or
    // the map should be for the better part of a second: Ethan's "there's a big
    // delay before daily puzzles and everyone right now appear". The comment
    // above has always said the intent was to start it "slightly before the
    // element is on screen", which is a POSITIVE margin; the code did the exact
    // opposite of what it was documented to do.
    //
    // 15% of the viewport below the fold is roughly one flick of a thumb ahead
    // of the reader, so the motion is FINISHING as the section arrives rather
    // than starting once it is already being looked at.
    const io = new IntersectionObserver(
      (entries) => { if (entries.some((e) => e.isIntersecting)) setShown(true) },
      { rootMargin: '0px 0px 15% 0px' },
    )
    io.observe(node)
    return () => io.disconnect()
  }, [node, shown])

  // Belt and braces, BUT ONLY FOR WHAT IS ACTUALLY ON SCREEN.
  //
  // This used to reveal everything unconditionally after a second, which was
  // safe when a page had one Reveal wrapped round the whole article and is
  // exactly wrong now that every section carries its own. A hub eleven sections
  // long would quietly hand its motion to all of them one second after load -
  // so the six screens you had not scrolled to yet were already finished by the
  // time you got there, and the page read as "it just appears". That is the
  // reported bug, and the fallback was causing it.
  //
  // So the net still catches a broken observer, and it checks first: if the
  // element is genuinely within (or above) the viewport and still hidden,
  // something has gone wrong and the content wins. If it is below the fold,
  // waiting IS the correct behaviour and we keep waiting.
  useEffect(() => {
    if (shown || !node) return undefined
    const check = () => {
      const vh = window.innerHeight || 0
      // A viewport of zero height means we are somewhere that cannot answer the
      // question - a headless pane, a hidden iframe - and "I cannot tell" must
      // resolve to showing the content, never to hiding it.
      if (vh === 0) { setShown(true); return }
      const r = node.getBoundingClientRect()
      if (r.top < vh) setShown(true)
    }
    const t = setTimeout(check, 1200)
    // AND AGAIN WHENEVER THE VIEWPORT CHANGES.
    //
    // The one-shot check answers "was this on screen 1.2 seconds after it
    // mounted". Rotate a phone, open a laptop lid, or simply have the observer
    // be inert (some embedded panes never deliver entries), and a section that
    // is now plainly on screen stays at opacity 0 forever with nothing left to
    // wake it. Re-checking on resize and orientation change costs a bounding
    // rect and removes the only way this component can lose content.
    window.addEventListener('resize', check)
    window.addEventListener('orientationchange', check)
    return () => {
      clearTimeout(t)
      window.removeEventListener('resize', check)
      window.removeEventListener('orientationchange', check)
    }
  }, [shown, node])

  // WHEN THE STAGGER IS ACTUALLY OVER.
  //
  // `will-change: opacity, transform` promises the browser a compositor layer,
  // and the stylesheet used to withdraw that promise on `is-in` - the same
  // class that starts the transition - so every card lost its layer on the
  // frame it began moving. Big cards (a map, a chart, a live challenge) then
  // had to be re-rasterised mid-slide, which is the judder. The hint is only
  // spent once the LAST child has landed, so that is when `is-done` goes on:
  // base delay + the last child's stagger step + the transition itself, with a
  // small margin. Keeping it forever would be the opposite mistake - a page of
  // permanently promoted layers is a page that eats memory for nothing.
  const [done, setDone] = useState(false)

  // LOOK THROUGH A FRAGMENT.
  //
  // Callers pass a list of cards, and a list of cards is very often wrapped in
  // a <>…</> by whatever built it - NetworkLayout's `rail` prop is exactly
  // that. React.Children then reports ONE child, the fragment, so the whole
  // rail arrived as a single block and the stagger did nothing. Unwrapping a
  // lone fragment costs nothing and removes a trap nobody would think to look
  // for.
  const raw = Array.isArray(children) ? children : [children]
  const unwrapped = raw.length === 1 && raw[0]?.type === Fragment
    ? Children.toArray(raw[0].props.children)
    : raw
  const kids = unwrapped

  // WHEN THE STAGGER IS ACTUALLY OVER.
  //
  // `will-change: opacity, transform` promises the browser a compositor layer,
  // and the stylesheet used to withdraw that promise on `is-in` - the same
  // class that STARTS the transition - so every card lost its layer on the
  // frame it began moving. Big cards (a map, a chart, a live challenge) then
  // had to be re-rasterised mid-slide, which is the judder. The hint is only
  // spent once the LAST child has landed, so that is when `is-done` goes on:
  // base delay + the last child's stagger step + the transition itself, plus a
  // small margin. Keeping it forever would be the opposite mistake - a page of
  // permanently promoted layers is a page that eats memory for nothing.
  //
  // Counted off `kids`, AFTER the fragment has been unwrapped. Counting the
  // raw children instead reports 1 for a fragment-wrapped rail, which would
  // withdraw the hint a beat before the last card in it had finished moving -
  // the same bug in miniature.
  const lastIndex = Math.max(0, Math.min(kids.filter(Boolean).length - 1, maxStagger))
  useEffect(() => {
    if (!shown || done) return undefined
    const ms = delay * 1000 + lastIndex * stagger * 1000 + 720 + 120
    const t = setTimeout(() => setDone(true), ms)
    return () => clearTimeout(t)
  }, [shown, done, lastIndex, delay, stagger])

  return (
    <Tag
      ref={setNode}
      data-from={from}
      className={`reveal${shown ? ' is-in' : ''}${done ? ' is-done' : ''}${className ? ` ${className}` : ''}`}
      style={{
        '--reveal-stagger': `${Math.round(stagger * 1000)}ms`,
        '--reveal-base': `${Math.round(delay * 1000)}ms`,
      }}
      {...rest}
    >
      {kids.filter(Boolean).map((child, i) => (
        <div
          // The child's own key is what React needs; this wrapper is positional
          // and never reorders independently of it.
          key={child?.key ?? i}
          className="reveal-item"
          // Grid cells have to stretch or a card that fills its row height
          // stops filling it the moment a wrapper appears between the two.
          style={{ '--reveal-i': Math.min(i, maxStagger) }}
        >
          {child}
        </div>
      ))}
    </Tag>
  )
}
