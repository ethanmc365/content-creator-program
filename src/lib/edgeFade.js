import { useEffect, useState } from 'react'

// A SCROLLING COLUMN FADES AT WHICHEVER END STILL HAS MORE (16 Oct 2026, from NetworkLayout's rail; shared 19 Oct with
// the challenge brief's right column). Read on scroll, resize and content changes, never on an animation frame (a hidden
// tab runs none). Returns a mask-image value, or undefined when everything fits.
export function useEdgeFade(ref, on = true, deps = []) {
  const [edge, setEdge] = useState({ up: false, down: false })
  useEffect(() => {
    const el = ref.current
    if (!el || !on) return undefined
    const read = () => {
      const up = el.scrollTop > 4
      const down = el.scrollHeight - el.clientHeight - el.scrollTop > 4
      setEdge((e) => (e.up === up && e.down === down ? e : { up, down }))
    }
    read()
    const late = setTimeout(read, 900)
    el.addEventListener('scroll', read, { passive: true })
    window.addEventListener('resize', read)
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(read) : null
    ro?.observe(el)
    if (el.firstElementChild) ro?.observe(el.firstElementChild)
    return () => { clearTimeout(late); el.removeEventListener('scroll', read); window.removeEventListener('resize', read); ro?.disconnect() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, ...deps])
  return edge.up || edge.down
    ? `linear-gradient(to bottom, transparent 0, #000 ${edge.up ? 32 : 0}px, #000 calc(100% - ${edge.down ? 64 : 0}px), transparent 100%)`
    : undefined
}

// The classes that make a desktop column stick under the header and scroll by itself (same as the Worldwide rail).
export const RAIL_SCROLL = 'lg:sticky lg:top-24 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto overscroll-contain lg:overscroll-contain lg:[scrollbar-width:none] lg:[&::-webkit-scrollbar]:hidden lg:-mx-3 lg:-mt-2 lg:px-3 lg:pb-8 lg:pt-2'
