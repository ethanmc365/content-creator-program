import { useEffect, useLayoutEffect, useRef, useState } from 'react'

// ------------------------------------------------------------------ parts ---

/**
 * ONE CARD, WHOSE HEIGHT FOLLOWS THE STEP INSIDE IT.
 *
 * The slide-in was already there (`.onb-screen`, index.css). What was missing
 * is that the box around it changed size instantly: welcome is short, the
 * photos step is tall, and moving between them snapped the card - and every
 * button under it - by a couple of hundred pixels on the frame the slide
 * started. That reads as the whole page jumping, which is exactly what Ethan
 * described.
 *
 * A ResizeObserver on the CONTENT keeps `height` on the frame, so the card also
 * grows smoothly when something inside a step appears (an error line, the
 * market card, a validation message) rather than only between steps.
 *
 * `overflow: hidden` IS ONLY ON WHILE IT MOVES. A frame that clips permanently
 * would cut off the country picker's dropdown - the same trap the chat action
 * bar hit with the reaction picker. The clip is needed exactly while the height
 * is in flight, and no dropdown is open on the frame a step changes.
 */
export function StepFrame({ stepKey, dir, children }) {
  const inner = useRef(null)
  const [height, setHeight] = useState(null)
  const [moving, setMoving] = useState(false)
  const timer = useRef(0)

  // MEASURED ON EVERY STEP SYNCHRONOUSLY, AND WATCHED IN BETWEEN.
  //
  // The step measure is keyed on `stepKey` and runs inside the commit, so the
  // new height is written on the same frame the new screen mounts. The observer
  // on top of it catches anything that changes WITHIN a step - an error line,
  // the market card appearing, a validation message.
  //
  // NOT THE OBSERVER ALONE. ResizeObserver callbacks are delivered as part of
  // the rendering steps, so they are throttled to a stop in a background tab -
  // and a frame stuck at the previous step's height, clipping while it moves,
  // is a worse bug than the one this is fixing. The same "never gate on the
  // frame loop alone" rule as lib/chatScroll and the walkthrough's geometry.
  useLayoutEffect(() => {
    const el = inner.current
    if (!el) return undefined
    // `offsetHeight`, not `entry.contentRect.height`: the observer reports the
    // CONTENT box, and this element is the one being measured for a layout
    // height. Same rule the tour card learned.
    const measure = () => setHeight(el.offsetHeight)
    measure()
    if (typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [stepKey])

  // Clip only for the length of the move.
  useEffect(() => {
    setMoving(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setMoving(false), 420)
    return () => clearTimeout(timer.current)
  }, [stepKey])

  return (
    <div
      className="onb-frame"
      data-moving={moving ? 'yes' : 'no'}
      style={height == null ? undefined : { height }}
    >
      <div ref={inner}>
        <div key={stepKey} className="onb-screen" data-dir={dir}>
          {children}
        </div>
      </div>
    </div>
  )
}
