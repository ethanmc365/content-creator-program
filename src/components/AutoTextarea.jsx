import { useCallback, useLayoutEffect, useRef } from 'react'

// A textarea that is as tall as what is in it.
//
// Ethan, about the About You box: "the text box should expand when writing a
// lot, rather than having to scroll through." He is right, and the reason is
// that a fixed-height textarea inside a page that also scrolls gives you two
// nested scrollers with no visible boundary between them: the wheel does one
// thing over the box and another an inch to the left of it, and you cannot see
// the paragraph you are editing.
//
// HOW IT MEASURES. Height is set to `auto` first and then to `scrollHeight`.
// Without the reset the box can only ever grow, because scrollHeight of an
// element that is already tall enough is just its own height - so deleting
// three lines would leave three lines of blank space behind forever.
//
// `minRows` is enforced in CSS through `rows`, not by clamping the measurement,
// so the browser computes the floor from the real line-height of whatever font
// is actually applied rather than from a number guessed here.
//
// It also re-measures on FONT LOAD. Poppins arrives after first paint, and a
// box measured in the fallback face is measured at the wrong line height; the
// difference is a couple of pixels per line, which on a long paragraph is a
// visible jump or a clipped last line.
export default function AutoTextarea({ value, minRows = 3, maxHeight, className, ...rest }) {
  const ref = useRef(null)

  const fit = useCallback(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    const next = maxHeight ? Math.min(el.scrollHeight, maxHeight) : el.scrollHeight
    el.style.height = `${next}px`
    // Only show a scrollbar once the cap is actually reached, so an uncapped
    // box never paints one at all.
    el.style.overflowY = maxHeight && el.scrollHeight > maxHeight ? 'auto' : 'hidden'
  }, [maxHeight])

  useLayoutEffect(() => { fit() }, [value, fit])

  useLayoutEffect(() => {
    let alive = true
    if (document.fonts?.ready) document.fonts.ready.then(() => { if (alive) fit() })
    // A window resize changes where the text wraps, so a paragraph that was
    // four lines on a wide column becomes six on a narrow one.
    window.addEventListener('resize', fit)
    return () => {
      alive = false
      window.removeEventListener('resize', fit)
    }
  }, [fit])

  return (
    <textarea
      ref={ref}
      rows={minRows}
      value={value}
      className={className}
      onInput={fit}
      {...rest}
    />
  )
}
