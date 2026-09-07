import { useEffect, useState } from 'react'
import { supabase } from './supabase'

// "CONTINUE WITH GOOGLE", AND THE BUTTON KNOWS WHETHER IT WORKS.
//
// Ethan, 7 Sep 2026: "can we add Continue with Google on the signup/login page.
// I've noticed a lot of [rivals] have this and I think it'll be great for us."
//
// The client half of that is four lines of `signInWithOAuth`. The part worth a
// file is the part that is NOT in our hands: Google sign-in only exists once a
// Google Cloud OAuth client has been created and its id and secret pasted into
// Supabase → Authentication → Providers. That is a dashboard action with a
// password on it, so it cannot ship in a deploy.
//
// A button that leads to `{"error":"Unsupported provider: provider is not
// enabled"}` is worse than no button, and "ship the button in a later deploy"
// means the feature waits on a second release for a switch that has already
// been flipped. So the page ASKS.
//
// `/auth/v1/settings` is GoTrue's own public endpoint - it is what the Supabase
// UI libraries read to decide which buttons to draw - and it answers
// `external.google: true|false`. One request per app open, cached at module
// scope, failing CLOSED: if it cannot be reached we draw no third-party button
// at all, because the email form underneath it always works and a dead button
// on the front door is the worst thing on this screen.
//
// The practical effect: the moment Ethan finishes the dashboard step, every
// creator's next page load has the button. No deploy, no flag, nothing to
// remember.

const SETTINGS_URL = `${import.meta.env.VITE_SUPABASE_URL}/auth/v1/settings`

let cached = null // Promise<Set<string>>

function loadProviders() {
  if (cached) return cached
  cached = fetch(SETTINGS_URL, {
    headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
  })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => new Set(Object.entries(j?.external ?? {}).filter(([, on]) => on).map(([k]) => k)))
    .catch(() => new Set())
  return cached
}

/** Which third-party sign-in buttons this project can actually honour. */
export function useAuthProviders() {
  const [providers, setProviders] = useState(null)
  useEffect(() => {
    let alive = true
    loadProviders().then((p) => { if (alive) setProviders(p) })
    return () => { alive = false }
  }, [])
  return providers
}

// WHERE THE ROUND TRIP COMES BACK TO.
//
// `window.location.origin` and not a constant, for two reasons that are both
// real here. The app answers on two Vercel origins (see lib/canonicalHost), and
// supabase-js uses PKCE - the code verifier is written to localStorage, which is
// per origin. Coming back to a different origin from the one that left means
// the verifier is not there and the exchange fails with a message about a
// missing code verifier, which reads as "Google sign-in is broken".
//
// It has to be listed in Supabase → Authentication → URL Configuration →
// Redirect URLs. See docs/GOOGLE_SIGN_IN.md.
export const OAUTH_REDIRECT = () => `${window.location.origin}/auth/callback`

// The referral code cannot travel to Google and back - nothing we attach to the
// request survives the provider - so it waits here and is attached on the way
// in by `attach_referral` (migration 196). sessionStorage would be wrong: the
// redirect leaves the site entirely, and some browsers treat the return as a
// new session.
const REF_KEY = 'tryp_oauth_ref'
export const stashRef = (ref) => { try { if (ref) localStorage.setItem(REF_KEY, ref) } catch { /* private mode */ } }
export const takeRef = () => {
  try {
    const v = localStorage.getItem(REF_KEY)
    localStorage.removeItem(REF_KEY)
    return v
  } catch { return null }
}

/**
 * Start the Google round trip. Resolves with `{ error }` if the redirect could
 * not even be started; on success the browser is already leaving, so nothing
 * after this runs.
 */
export async function signInWithGoogle(ref) {
  stashRef(ref)
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: OAUTH_REDIRECT(),
      // A CREATOR OFTEN HAS TWO GOOGLE ACCOUNTS AND ONLY ONE OF THEM IS THE ONE
      // THEY MEAN. Without this, Google silently reuses whichever session the
      // browser happens to be signed into - so somebody with a personal and a
      // brand account joins with whichever was last used, and the address on
      // their creator profile is not the one they would have typed. The picker
      // costs one tap and removes a class of "I signed up with the wrong email"
      // that is genuinely painful to unpick afterwards.
      queryParams: { prompt: 'select_account' },
    },
  })
  if (error) {
    // The redirect never started, so the stash would sit there for ever and
    // attach itself to some unrelated later signup.
    takeRef()
    return { error }
  }
  return { error: null }
}
