import { useCallback, useEffect, useRef, useState } from 'react'

// IS A SOFTWARE KEYBOARD UP OVER THIS FORM? (9 Oct 2026)
//
// Ethan, twice, on Edit profile on an iPhone: the Cancel / Save profile bar showed up in the MIDDLE of the screen, over the
// text he was typing, whenever he scrolled. It was `position: sticky; bottom`, and iOS resolves sticky against the LAYOUT
// viewport, which does not shrink when the keyboard opens - only the visual one does. So with the keys up, "stuck to the bottom"
// was a line somewhere behind the keyboard, and as the visual viewport scrolled over the page the bar slid through the middle
// of what was being edited. Nothing about the bar's own CSS can be right in that state, so while a keyboard is up the bar
// simply stops being sticky and takes its place at the foot of the form. Sticky and static both occupy the same space in the
// flow, so switching between them moves nothing.
//
// Spread `bind` on the <form>. React's onFocus/onBlur bubble, so one pair covers every field inside. The release is delayed
// because tapping from one field to the next fires blur then focus, and the bar must not flicker between them.
const TEXTY = new Set(['text', 'search', 'email', 'url', 'tel', 'password', 'number', 'date', 'time', 'datetime-local'])

function isTextField(el) {
  if (!el) return false
  if (el.tagName === 'TEXTAREA' || el.isContentEditable) return true
  return el.tagName === 'INPUT' && TEXTY.has((el.type || 'text').toLowerCase())
}

export function useTyping() {
  const [typing, setTyping] = useState(false)
  const timer = useRef(0)

  useEffect(() => () => clearTimeout(timer.current), [])

  const onFocus = useCallback((e) => {
    if (!isTextField(e.target)) return
    clearTimeout(timer.current)
    setTyping(true)
  }, [])

  const onBlur = useCallback(() => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setTyping(isTextField(document.activeElement)), 200)
  }, [])

  return { typing, bind: { onFocus, onBlur } }
}
