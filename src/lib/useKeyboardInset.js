import { useEffect, useState } from 'react'

// Tracks the on-screen (software) keyboard height in CSS pixels, 0 when closed.
//
// On mobile, focusing a text field opens the keyboard, which shrinks the
// *visual* viewport while the *layout* viewport (dvh/innerHeight) stays the same
// height. The gap between the two is the keyboard. We use that to pin the chat
// composer directly above the keyboard and hide chrome that would waste space,
// WhatsApp-style. Works on iOS Safari and Android Chrome (default
// interactive-widget=resizes-visual). Desktop has no visualViewport keyboard so
// this stays 0 there.
export function useKeyboardInset() {
  const [inset, setInset] = useState(0)

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return

    let raf = 0
    const update = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        // Height the keyboard is covering: full layout height minus what's
        // still visible (and minus any offset when the page is pinch-scrolled).
        const covered = window.innerHeight - vv.height - vv.offsetTop
        // Ignore small deltas (browser toolbars appearing/disappearing) so we
        // only react to a real keyboard.
        setInset(covered > 90 ? Math.round(covered) : 0)
      })
    }

    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    update()
    return () => {
      cancelAnimationFrame(raf)
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])

  return inset
}
