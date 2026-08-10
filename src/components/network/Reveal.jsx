import { useEffect, useState } from 'react'

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
    const io = new IntersectionObserver(
      (entries) => { if (entries.some((e) => e.isIntersecting)) setShown(true) },
      { rootMargin: '0px 0px -10% 0px' },
    )
    io.observe(node)
    return () => io.disconnect()
  }, [node, shown])

  // Belt and braces: if the observer has not fired within a second (a hidden
  // tab, a preview pane where rAF is frozen, a layout that never scrolls),
  // show the content anyway. An animation failing should cost the animation,
  // never the content.
  useEffect(() => {
    if (shown) return undefined
    const t = setTimeout(() => setShown(true), 1000)
    return () => clearTimeout(t)
  }, [shown])

  const kids = Array.isArray(children) ? children : [children]
  return (
    <Tag
      ref={setNode}
      className={`reveal${shown ? ' is-in' : ''}${className ? ` ${className}` : ''}`}
      style={{ '--reveal-stagger': `${Math.round(stagger * 1000)}ms` }}
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
