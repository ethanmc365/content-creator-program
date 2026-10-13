import { useEffect, useRef } from 'react'

const COUNT_MS = 1250

// THE COUNT STARTS AFTER THE TILE HAS LANDED, NOT DURING.
//
// Three things were running on the same frames: `stat-in` translating the tile, this loop rewriting the text, and -
// because Poppins' figures are proportional by default - a text re-layout and re-centre caused by that rewrite. The two
// halves of the fix are `tabular-nums` on the readout (see the stats band) and `delay` here, which puts the entrance and
// the count in SEQUENCE. The delay tracks the length of `stat-in` (420ms - see the note on `hero-word-in`); the counter
// is then the only thing moving, which is what makes a straight line read as a straight line. Keep the two numbers
// together: a `delay` shorter than `stat-in` puts the rewrite back on the same frames as the translate, which is the
// judder this was written to remove.
//
// It also means the tile is not blank while it waits: the readout holds `0` -
// or `€0` - from the first frame, which is where the count starts anyway.
export function Tally({ value, format = (n) => n, delay = 0 }) {
  const ref = useRef(null)
  const target = Number(value) || 0
  const formatRef = useRef(format)
  useEffect(() => { formatRef.current = format })

  useEffect(() => {
    const node = ref.current
    if (!node) return undefined
    const reduced = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduced) { node.textContent = String(formatRef.current(target)); return undefined }

    let raf = 0
    let start = 0
    const tick = (now) => {
      if (!start) start = now
      const t = Math.min(1, (now - start) / COUNT_MS)
      node.textContent = String(formatRef.current(Math.round(target * t)))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    const begin = setTimeout(() => { raf = requestAnimationFrame(tick) }, delay)
    // A TIMER BEHIND THE FRAME LOOP, and this file's neighbours have paid for
    // that rule twice: requestAnimationFrame does not run in a background tab,
    // so a counter armed only with rAF sits on zero for a reader who opened the
    // page in a tab and came back to it. The timer lands the final value
    // whatever happened to the frames.
    const settle = setTimeout(
      () => { node.textContent = String(formatRef.current(target)) },
      delay + COUNT_MS + 80,
    )
    return () => { cancelAnimationFrame(raf); clearTimeout(begin); clearTimeout(settle) }
  }, [target, delay])

  return <span ref={ref}>{format(0)}</span>
}
