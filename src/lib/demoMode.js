import { useCallback, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// DEMO MODE, AND WHY IT IS A URL PARAMETER RATHER THAN A PROP.
//
// The Testing Centre shows the real public pages and the real onboarding at
// phone, tablet and desktop widths. That used to render them INLINE inside the
// admin page, inside a box of a fixed width, which looked right and was wrong:
// a CSS media query reads the BROWSER VIEWPORT, not the width of the box its
// element happens to be sitting in. So a "phone" preview 390px wide on a 1440px
// screen still had every `sm:` and `lg:` rule applied to it. It was a desktop
// layout squeezed into a narrow column, which is exactly what a phone layout is
// not, and the desktop preview had the same problem in reverse.
//
// A same-origin iframe has its own viewport, so the breakpoints are real. But
// an iframe cannot be handed a prop, so the demo flag has to travel in the URL:
//
//     /onboarding?demo=1&prefill=full&pending=1
//
// AND IT IS GATED ON BEING AN ADMIN, not on the parameter alone. A creator who
// is handed that link gets the ordinary page. The parameter can only ever make
// a page inert; there is nothing it unlocks.
//
// `on` VERSUS `asked`, AND THE BUG THAT NEEDED BOTH.
//
// `on` is the gated answer: the parameter AND an admin. That is the right gate
// for anything a demo page DOES - staying inert, prefilling, skipping writes -
// because a creator handed the link must get the ordinary page.
//
// It is the wrong gate for "should I redirect away from here", because
// `isAdmin` arrives with the PROFILE and `user` arrives with the SESSION, and
// the session is there first. So /signup?demo=1 in the Testing Centre frame
// looked at `user`, found one, and bounced to /onboarding a beat before it
// learned it was a demo - which is why the "Sign up" screen of the public-pages
// lab was showing the onboarding flow, and why that lab and the onboarding lab
// appeared to be the same thing.
//
// `asked` is the parameter alone. It unlocks nothing and grants nothing; all it
// can do is stop a redirect, which is safe for anybody.
export function useDemoMode() {
  const [params] = useSearchParams()
  const { isAdmin } = useAuth()
  const asked = params.get('demo') === '1'
  const on = asked && !!isAdmin
  return { on, asked, params }
}

const CHANNEL = 'tryp-demo'

/** Child to parent: "this is where I am now". */
export function postDemoState(payload) {
  if (typeof window === 'undefined' || window.parent === window) return
  try {
    window.parent.postMessage({ channel: CHANNEL, dir: 'up', ...payload }, window.location.origin)
  } catch { /* a cross-origin parent is not ours to talk to */ }
}

/** Parent to child: "go to step 4". */
export function sendDemoCommand(frame, payload) {
  try {
    frame?.contentWindow?.postMessage({ channel: CHANNEL, dir: 'down', ...payload }, window.location.origin)
  } catch { /* the frame may not have loaded yet; the next state post re-syncs */ }
}

/**
 * Listen for messages on the demo channel, in either direction.
 *
 * The origin check is the whole security of this: `event.origin` is the only
 * thing a frame cannot lie about, and everything else in the message is data
 * somebody could have put there. Nothing here acts on anything but a step
 * number from our own origin.
 */
export function useDemoMessages(handler, { enabled = true } = {}) {
  const stable = useCallback((e) => {
    if (!enabled) return
    if (e.origin !== window.location.origin) return
    if (e.data?.channel !== CHANNEL) return
    handler(e.data)
  }, [handler, enabled])

  useEffect(() => {
    window.addEventListener('message', stable)
    return () => window.removeEventListener('message', stable)
  }, [stable])
}
