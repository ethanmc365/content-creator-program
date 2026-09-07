import { useState } from 'react'
import { Spinner } from './ui'
import { signInWithGoogle, useAuthProviders } from '../lib/oauth'
import { useT } from '../lib/i18n'
import { useDemoMode } from '../lib/demoMode'

// THE GOOGLE MARK IS DRAWN, NOT DOWNLOADED.
//
// The production CSP is `img-src 'self'` plus our own storage, so a hotlinked
// `google.com/favicon.ico` is a blocked request and an empty box - the same
// rule that put `SocialMark` and `AirlineMark` in the codebase as SVG. These
// are Google's four brand colours in their published four-path mark, which is
// what their sign-in branding guidelines require: the mark unaltered, on a
// white or a neutral button, never recoloured to match the host brand.
//
// It stays four-colour in DARK MODE too, for the same reason. Everything else
// on this screen answers to the Tryp palette; this one glyph belongs to
// somebody else and a creator recognises it by its colours.
function GoogleMark({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z" />
      <path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z" />
      <path fill="#FBBC05" d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34A21.99 21.99 0 002 24c0 3.55.85 6.91 2.34 9.88l7.35-5.7z" />
      <path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z" />
    </svg>
  )
}

/**
 * "Continue with Google", or nothing at all.
 *
 * DRAWS NOTHING UNTIL IT KNOWS. `useAuthProviders` asks GoTrue's own settings
 * endpoint whether Google is configured on this project - see lib/oauth for why
 * a button that leads to "Unsupported provider" is worse than no button, and
 * why this is the design that lets the feature turn itself on the moment the
 * dashboard step is done rather than waiting for another deploy.
 *
 * There is no skeleton and no reserved space while the answer is in flight. A
 * grey slab above the email form on the front door of the product, for one
 * request, on a screen somebody reaches maybe twice in their life, is a worse
 * trade than the form moving down 78px on a fast connection - and on a slow one
 * the form is usable the whole time, which is the thing that matters.
 */
// `referral` and NOT `ref`: React treats a prop called `ref` as the ref-
// forwarding slot and strips it before the component ever sees it, so the
// invite code would have silently vanished on exactly the signups that came
// from an invite link.
export default function GoogleButton({ referral, label = 'Continue with Google' }) {
  const tr = useT()
  // THE TESTING CENTRE RENDERS THESE PAGES FOR REAL, AND THIS BUTTON LEAVES THE
  // SITE. `?demo=1` puts a live Login/Signup inside an admin demo (see
  // lib/demoMode); everything else on those pages is inert there, and a button
  // that redirects the whole window to accounts.google.com would take the
  // Testing Centre with it. Shown, so the demo is honest about what the page
  // looks like, and refused with the same sentence the other controls use.
  const { on: demo, asked: demoAsked } = useDemoMode()
  const providers = useAuthProviders()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // In the demo the button is drawn whether or not the project has Google
  // configured, because the point of that screen is to show the front door.
  if (!demoAsked && !providers?.has('google')) return null

  async function go() {
    if (demo) { setError('Sandbox: nobody was signed in.'); return }
    setBusy(true)
    setError('')
    const { error: err } = await signInWithGoogle(referral)
    // On success the browser is already navigating to Google, so `busy` stays
    // true deliberately - releasing it would flash an enabled button under a
    // page that is leaving.
    if (err) { setBusy(false); setError(err.message) }
  }

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={go}
        disabled={busy}
        // A NEUTRAL BUTTON, NOT AN ORANGE ONE. The primary action on this
        // screen is the form below it, and two solid-brand buttons on one card
        // is two things claiming to be the main one. Lift on hover rather than
        // a colour change, like every other button in the product.
        className="flex w-full items-center justify-center gap-3 rounded-full border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-ink shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift disabled:opacity-60"
      >
        {busy ? <Spinner className="h-5 w-5" /> : <GoogleMark />}
        <span>{tr(label)}</span>
      </button>

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
      )}

      {/* THE DIVIDER SAYS "OR", AND THAT IS THE WHOLE OF ITS JOB. Without it the
          two ways in read as a sequence - press Google, then fill this in -
          which is exactly the "am I being asked for my email twice?" confusion
          Ethan wanted avoided. */}
      <div className="flex items-center gap-3" aria-hidden>
        <span className="h-px flex-1 bg-gray-100" />
        <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">{tr('or')}</span>
        <span className="h-px flex-1 bg-gray-100" />
      </div>
    </div>
  )
}
