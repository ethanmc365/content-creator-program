import { useLayoutEffect, useRef } from 'react'

// One map pin: a round photo sitting in a classic teardrop, with a small pointer
// tip on the exact coordinate. The avatar is CONCENTRIC with the white disc so
// it's dead-centre in the pin. Counter-scaled against the zoom so it stays a
// calm, readable size (a hair of growth when you zoom in, never a balloon).
// THE MOVE BETWEEN TWO GROUPINGS. A wrapper <g> around a pin, animated with
// the Web Animations API on mount only, so a pin that stays put never moves.
// `arriving`: fly in from (dx, dy) away, or pop in place when `pop`.
// `leaving`: a pin that has just been swallowed, flying (dx, dy) into its new
// group and fading as it goes. Offsets are in the map's own units, which is
// what the wrapper sits in. Under reduced motion nothing animates.
const MORPH_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'

export function PinMorph({ x, y, dx = 0, dy = 0, pop = false, arriving = false, leaving = false, children }) {
  const ref = useRef(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !(arriving || leaving) || typeof el.animate !== 'function') return undefined
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined
    const origin = `${x ?? 0}px ${y ?? 0}px`
    el.style.transformOrigin = leaving ? `${(x ?? 0)}px ${(y ?? 0)}px` : origin
    const frames = leaving
      ? [
        { transform: 'translate(0px, 0px) scale(1)', opacity: 1 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.7)`, opacity: 0 },
      ]
      : pop
        ? [
          { transform: 'scale(0.55)', opacity: 0.3 },
          { transform: 'scale(1.08)', opacity: 1, offset: 0.65 },
          { transform: 'scale(1)', opacity: 1 },
        ]
        : [
          { transform: `translate(${dx}px, ${dy}px) scale(0.8)`, opacity: 0.4 },
          { transform: 'translate(0px, 0px) scale(1)', opacity: 1 },
        ]
    // QUICKER (28 Sep 2026, later). 420/380ms was a deliberate, readable move
    // when a regroup was a rare event; with the regroup now following the
    // gesture it is the thing the reader is waiting on, so it is roughly halved.
    // Still long enough to read as a move rather than a cut, which was the whole
    // point of animating it ("rather than just flashing, appearing, and
    // disappearing").
    const a = el.animate(frames, { duration: leaving ? 200 : 240, easing: MORPH_EASE, fill: leaving ? 'forwards' : 'none' })
    return () => a.cancel()
    // Mount only: the move is from where the pin WAS to where it is.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return <g ref={ref} style={leaving ? { pointerEvents: 'none' } : undefined}>{children}</g>
}
