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
//
// IT MEASURES A TWIN, NEVER ITSELF (8 Oct 2026). Ethan: "in the About You section, I click in, type, and then the
// entire mobile screen starts glitching absolutely crazy". Resetting the LIVE box to `height: auto` on every
// keystroke shrank the page for an instant; iOS Safari answers a shrinking document under a focused caret by
// re-scrolling to keep the caret in view, and the box grew back in the same frame - once per letter. An
// off-screen copy with the same width and type takes the collapse instead, and the visible box only ever has its
// height written when the number actually changed.
const COPIED = ['boxSizing', 'width', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'lineHeight',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth',
  'borderLeftWidth', 'borderStyle', 'textTransform', 'textIndent', 'whiteSpace', 'wordBreak', 'overflowWrap', 'hyphens', 'tabSize']
let twin = null

function measure(el, rows) {
  if (!twin) {
    twin = document.createElement('textarea')
    twin.setAttribute('aria-hidden', 'true')
    twin.tabIndex = -1
    Object.assign(twin.style, {
      position: 'absolute', top: '0', left: '-9999px', visibility: 'hidden', pointerEvents: 'none',
      overflow: 'hidden', height: 'auto', minHeight: '0', maxHeight: 'none', zIndex: '-1',
    })
  }
  if (!twin.isConnected) document.body.appendChild(twin)
  const cs = getComputedStyle(el)
  for (const k of COPIED) twin.style[k] = cs[k]
  twin.style.width = `${el.getBoundingClientRect().width}px`
  twin.rows = rows
  twin.value = el.value
  const borders = cs.boxSizing === 'border-box'
    ? (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.borderBottomWidth) || 0)
    : 0
  return twin.scrollHeight + borders
}

export default function AutoTextarea({ value, minRows = 3, maxHeight, className, ...rest }) {
  const ref = useRef(null)

  const fit = useCallback(() => {
    const el = ref.current
    if (!el || !el.isConnected) return
    const full = measure(el, minRows)
    const next = maxHeight ? Math.min(full, maxHeight) : full
    if (el.style.height !== `${next}px`) el.style.height = `${next}px`
    // Only show a scrollbar once the cap is actually reached, so an uncapped
    // box never paints one at all.
    const overflow = maxHeight && full > maxHeight ? 'auto' : 'hidden'
    if (el.style.overflowY !== overflow) el.style.overflowY = overflow
  }, [maxHeight, minRows])

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
