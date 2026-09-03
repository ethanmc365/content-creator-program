import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { adoptProfileLocale } from '../lib/i18n'
import { adoptTestDataVisibility } from '../lib/testData'

// AuthContext is the single source of truth for "who is logged in".
// It exposes the Supabase session, the user's profile row (including
// is_admin), and helpers for sign-up / sign-in / sign-out / password reset.
const AuthContext = createContext(null)

// HOW LONG A SLOW CONNECTION IS GIVEN BEFORE WE CALL IT A FAILURE.
//
// This was three tries at 800/1600/2400ms, which gives up 4.8 seconds after the
// first stumble. That is a reasonable budget for a laptop on wifi and far too
// small for the case that actually produces the complaint: a phone on a weak
// signal, loading the worldwide page, where this one request is competing with
// the thirty-odd the page fires on arrival. Giving up there costs the user the
// whole app - they get the "taking longer than usual" screen - to save them
// about four seconds of waiting, which is a bad trade every time.
//
// Five tries at 600/1200/2400/4800/8000 is ~17 seconds of patience. Nobody who
// is going to succeed needs more than that, and nobody who is going to fail is
// helped by failing sooner.
const RETRIES = 5
const backoff = (attempt) => Math.min(600 * 2 ** attempt, 8000)

// IS THERE A SAVED LOGIN IN THIS BROWSER? READ SYNCHRONOUSLY, BEFORE ANY AWAIT.
//
// This is the difference between "we do not know who you are yet" and "nobody
// is logged in here", and the route guard needs it on the very first render.
// `supabase.auth.getSession()` answers the same question but it is a PROMISE:
// it takes the auth lock, may refresh the token over the network, and resolves
// in a microtask behind whatever else the main thread is doing. Everything that
// happens before it resolves has to be decided without it.
//
// supabase-js persists the session under `sb-<project-ref>-auth-token`. We only
// ever ask whether such a key EXISTS and parses - never whether it is valid,
// which is the server's business. A present-but-dead session still answers
// "this person was logged in", which is exactly what the guard must know in
// order not to throw them at the login form while the real answer is in flight.
const STORAGE_KEY_RE = /^sb-.*-auth-token$/
export function hasStoredSession() {
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i)
      if (!k || !STORAGE_KEY_RE.test(k)) continue
      const raw = localStorage.getItem(k)
      if (!raw) continue
      const parsed = JSON.parse(raw)
      if (parsed?.access_token || parsed?.refresh_token) return true
    }
  } catch { /* private mode, quota, corrupt JSON - treat as "no session" */ }
  return false
}

// Call the rate-limited auth-gate Edge Function. Returns the parsed JSON
// (which contains either a session/{access_token} or an { error } message).
const AUTH_GATE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/auth-gate`
async function callAuthGate(body) {
  try {
    const res = await fetch(AUTH_GATE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(body),
    })
    return await res.json().catch(() => ({ error: 'Something went wrong. Please try again.' }))
  } catch {
    // `unreachable` distinguishes "the gate never answered" from "the gate said
    // no". Only the first one is allowed to fall back to signing in directly;
    // see signIn below. Without the flag a wrong password would fall through
    // to a second attempt, which is how you turn one failed login into two.
    return { error: 'Network error. Please check your connection and try again.', unreachable: true }
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfileState] = useState(null)
  // EVERY WAY THE PROFILE CHANGES GOES THROUGH HERE, so that "may this viewer
  // see the demo people" is updated in the same breath as the profile itself
  // and can never lag a render behind it. Doing this in an effect instead would
  // be a real bug: child effects run BEFORE their parent's, so a page's data
  // fetch would read the previous viewer's answer. See lib/testData.
  const setProfile = useCallback((p) => {
    adoptTestDataVisibility(p)
    setProfileState(p)
  }, [])
  const [loading, setLoading] = useState(true) // true until the first session check resolves
  // Whether the profile fetch for the CURRENT user has resolved. The route
  // guard waits on this so it never renders the app before we know the user's
  // status (pending / declined / active). Treating "no profile yet" as
  // "allowed" was a security hole - a fresh signup could see everything.
  const [profileLoaded, setProfileLoaded] = useState(false)
  // Set when the profile fetch fails for a NETWORK reason (not "no row"). The
  // route guard shows a "connection is slow, retry" screen instead of bouncing
  // a genuinely-logged-in user to /login.
  const [profileError, setProfileError] = useState(false)
  // Has the FIRST `getSession()` actually come back? `loading` used to carry
  // this, but it is also flipped by a watchdog (below) and the guard cannot
  // tell the two apart - which is the whole of the bug described there.
  const [sessionChecked, setSessionChecked] = useState(false)
  // Was there a saved login in this browser when the app started? Read once,
  // synchronously, so the very first render already knows. See hasStoredSession.
  const [storedSession] = useState(hasStoredSession)
  const loadedForUser = useRef(null)
  // The user id whose profile fetch is in flight, so the two callers that both
  // fire on a cold boot make one request between them. See loadProfile.
  const inFlight = useRef(null)

  // "View as creator": an admin can step into a hidden sandbox creator account
  // (is_test=true, invisible to the community) and experience the app EXACTLY as
  // a normal creator does — their profile, chat identity with no admin badge,
  // their DMs / notifications / access.
  //
  // On enter we swap to the preview creator's session (minted server-side by the
  // `impersonate` function) and keep a short-lived, signed "exit ticket". On exit
  // the server mints a BRAND-NEW admin session from that ticket — we do NOT try to
  // restore stashed admin tokens. That old approach broke whenever the admin's
  // original session row had been revoked elsewhere (a sign-out on another device
  // deletes the row while the token still looks valid), which stranded/logged out
  // the admin. Minting a fresh session always works.
  //
  // `impersonating` is derived from the ACTUAL session: true only while a stash
  // exists AND the logged-in user is the preview creator. So a leftover stash can
  // never resurrect the "viewing as creator" pill for a real admin login.
  const IMPERSONATE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/impersonate`
  const ADMIN_STASH_KEY = 'tryp_admin_session'
  const readStash = () => {
    try { return JSON.parse(localStorage.getItem(ADMIN_STASH_KEY) || 'null') } catch { return null }
  }
  const [impersonating, setImpersonating] = useState(false)

  // Keep `impersonating` and the stash honest against whoever is actually logged
  // in. Called whenever the session changes: if the stash's creator id matches
  // the current user we're genuinely previewing; otherwise the stash is stale
  // (e.g. a fresh admin login after a failed exit) so we clear it and hide the
  // pill. This self-heals any admin who got stuck in the old broken state.
  const reconcileImpersonation = useCallback((currentSession) => {
    const stash = readStash()
    const uid = currentSession?.user?.id
    if (stash?.creatorId && uid && uid === stash.creatorId) {
      setImpersonating(true)
    } else {
      if (stash) { try { localStorage.removeItem(ADMIN_STASH_KEY) } catch { /* ignore */ } }
      setImpersonating(false)
    }
  }, [])

  const enterCreatorPreview = useCallback(async () => {
    const { data: { session: cur } } = await supabase.auth.getSession()
    if (!cur) return { error: 'You need to be signed in.' }
    let out
    try {
      const res = await fetch(IMPERSONATE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${cur.access_token}`,
        },
        body: JSON.stringify({ action: 'enter' }),
      })
      out = await res.json().catch(() => ({}))
      if (!res.ok || !out?.token_hash || !out?.exit_ticket) return { error: out?.error || 'Could not start creator preview.' }
    } catch {
      return { error: 'Network error. Please try again.' }
    }
    // Stash the signed exit ticket (NOT the admin's tokens) BEFORE swapping, so
    // exit can always mint a fresh admin session even if the original one dies.
    try {
      localStorage.setItem(ADMIN_STASH_KEY, JSON.stringify({
        exitTicket: out.exit_ticket,
        creatorId: out.creator_id,
        adminId: out.admin_id,
      }))
    } catch { /* ignore */ }
    const { error } = await supabase.auth.verifyOtp({ token_hash: out.token_hash, type: 'magiclink' })
    if (error) {
      try { localStorage.removeItem(ADMIN_STASH_KEY) } catch { /* ignore */ }
      return { error: error.message }
    }
    setImpersonating(true)
    return {}
  }, [IMPERSONATE_URL])

  const exitCreatorPreview = useCallback(async () => {
    const saved = readStash()
    if (!saved?.exitTicket) {
      // Nothing to exit with. Do NOT sign out (that would strand the admin) —
      // just drop the flag; they can log back in if needed.
      try { localStorage.removeItem(ADMIN_STASH_KEY) } catch { /* ignore */ }
      setImpersonating(false)
      return { error: 'Your admin session could not be restored automatically. Please log in again.' }
    }
    // Ask the server to mint a FRESH admin session from the signed ticket. This
    // never depends on the (possibly-revoked) original admin session, so it can't
    // fail the way token-restore did.
    let out
    try {
      const res = await fetch(IMPERSONATE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ action: 'exit', exit_ticket: saved.exitTicket }),
      })
      out = await res.json().catch(() => ({}))
      if (!res.ok || !out?.token_hash) {
        // Keep the stash so the admin can retry Exit. We never sign them out.
        return { error: out?.error || 'Could not restore your admin session. Please try again.' }
      }
    } catch {
      return { error: 'Network error. Please try again.' }
    }
    // Swap straight into the fresh admin session.
    const { error } = await supabase.auth.verifyOtp({ token_hash: out.token_hash, type: 'magiclink' })
    if (error) {
      return { error: error.message || 'Could not restore your admin session. Please try again.' }
    }
    // Only clear the stash once the admin session is truly back.
    try { localStorage.removeItem(ADMIN_STASH_KEY) } catch { /* ignore */ }
    setImpersonating(false)
    return {}
  }, [IMPERSONATE_URL])

  // Storage validates tokens against the asymmetric (ES256) signing key. A
  // session minted under the old HS256 key can't upload (RLS sees no user), so
  // if we spot a legacy-algorithm access token we silently refresh it once to
  // upgrade it to ES256. This self-heals existing logins without a re-login.
  function upgradeLegacyToken(session) {
    try {
      const token = session?.access_token
      if (!token) return
      const alg = JSON.parse(atob(token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/'))).alg
      if (alg && alg !== 'ES256') supabase.auth.refreshSession()
    } catch { /* ignore */ }
  }

  // Load the profile row for the signed-in user. Returns { data, error } so
  // callers can tell "no row exists" (PGRST116) apart from a transient failure.
  const fetchProfile = useCallback(async (userId) => {
    const result = await supabase.from('profiles').select('*').eq('id', userId).single()
    // THE LANGUAGE FOLLOWS THE ACCOUNT, and this is the one place every path
    // into a profile goes through - first load, refresh after an edit, and the
    // manual retry. `adoptProfileLocale` stands aside if this device has
    // already been told otherwise, so a switch somebody has just made is never
    // undone a second later by a fetch landing. See lib/i18n.
    if (result?.data?.locale) adoptProfileLocale(result.data.locale)
    return result
  }, [])

  // Re-fetch the profile after edits (photo change, onboarding, etc.).
  const refreshProfile = useCallback(async () => {
    if (!session?.user) return
    const { data } = await fetchProfile(session.user.id)
    setProfile(data ?? null)
    setProfileLoaded(true)
  }, [session, fetchProfile, setProfile])

  // Manual retry from the "connection is slow" screen.
  const retryProfile = useCallback(async () => {
    if (!session?.user) return
    inFlight.current = null
    setProfileError(false)
    setProfileLoaded(false)
    const { data, error } = await fetchProfile(session.user.id)
    if (data) {
      setProfile(data)
      loadedForUser.current = session.user.id
      setProfileLoaded(true)
    } else if (error?.code === 'PGRST116') {
      // Local scope, for the reason spelled out in loadProfile: signing out of
      // this browser must never revoke the account's other devices. This one is
      // a deliberate press of "retry" rather than an automatic read, so it does
      // not need the retry ladder - the user has already waited.
      await supabase.auth.signOut({ scope: 'local' })
    } else {
      setProfileError(true)
    }
  }, [session, fetchProfile, setProfile])

  useEffect(() => {
    let cancelled = false

    // THE WATCHDOG THAT LOGGED PEOPLE OUT.
    //
    // Ethan, handing the platform to the Tryp.com team: "the worldwide page
    // sometimes loads fine, but sometimes it takes ages to load and doesn't
    // load at all, it will then just go back to the login page."
    //
    // This timer is why. It exists so the app can never hang for ever on the
    // full-screen session spinner, and it did that by flipping `loading` to
    // false after five seconds. But the guard reads exactly two things:
    //
    //     if (loading) return <FullPageSpinner />
    //     if (!user)   return <Navigate to="/login" replace />
    //
    // and `user` comes from a session that has NOT ARRIVED YET. So the watchdog
    // did not un-stick a stalled boot - it converted one into a logout. Five
    // seconds is not a long time on a phone: `getSession()` takes the auth lock,
    // refreshes the token over the network if it is due, and resolves in a
    // microtask queued behind the thirty-odd requests and the map render that
    // the worldwide page kicks off on the same main thread. "Sometimes" is the
    // signature of a race, and this is the race.
    //
    // The landing was a login form with empty fields, which reads as "you have
    // been signed out" and is why the report says people re-enter their details.
    // In fact the session was fine and arrived a moment later.
    //
    // So the watchdog no longer speaks for the session. It ends the SPINNER, and
    // `sessionChecked` - set only by a real answer from `getSession` or from an
    // auth event - is what the guard uses to decide that nobody is logged in.
    // A browser with a saved login that has not resolved yet gets the "taking
    // longer than usual" screen with a retry on it; a browser with no saved
    // login still goes straight to /login, and now does so without waiting.
    const safety = setTimeout(() => {
      if (cancelled) return
      setLoading(false)
      if (!hasStoredSession()) setSessionChecked(true)
    }, 5000)

    // Fetch the profile (with a couple of retries for transient network errors)
    // and flip profileLoaded so the route guard can decide.
    //  * A real "no row" (PGRST116) is a corrupt/ghost login → sign it out.
    //  * A network failure sets profileError so the guard shows a retry screen
    //    instead of treating the user as logged-out.
    const loadProfile = async (userId, attempt = 0) => {
      // ONE PROFILE FETCH, NOT TWO. `getSession()` resolving and the
      // INITIAL_SESSION auth event both land on a cold boot, a few milliseconds
      // apart, and both used to start their own request - so the single most
      // important call on the page was issued twice and the two copies queued
      // behind each other. Measured on production: 621ms and 535ms for the same
      // row. Retries are exempt, or a retry would refuse to run.
      if (attempt === 0) {
        if (inFlight.current === userId) return
        inFlight.current = userId
      }
      try {
        const { data, error } = await fetchProfile(userId)
        if (cancelled) return
        if (data) {
          inFlight.current = null
          setProfile(data)
          loadedForUser.current = userId
          setProfileError(false)
          setProfileLoaded(true)
          return
        }
        // A GHOST LOGIN IS ONLY A GHOST IF IT IS STILL MISSING AFTER RETRIES,
        // AND SIGNING IT OUT IS A LOCAL ACT.
        //
        // PGRST116 is "the result contains 0 rows", which is what a genuinely
        // profile-less auth user looks like - and ALSO what a row temporarily
        // withheld by RLS looks like, and what a request that lands mid-deploy
        // can look like. This branch used to fire on the FIRST such read and
        // call a bare `supabase.auth.signOut()`.
        //
        // TWO THINGS WERE WRONG WITH THAT, and together they cost the Tryp.com
        // team demo account a whole afternoon (2 Sep 2026). Ethan: "it appeared
        // like it worked first, but it opened the worldwide page and then
        // nothing loaded at all and I couldn't click anything. Then I refreshed
        // and it was back to the login page."
        //
        //   1. `signOut()` in supabase-js DEFAULTS TO `scope: 'global'`. It does
        //      not sign this browser out - it revokes EVERY refresh token on the
        //      account, on every device. On a SHARED account that is three
        //      people signed out by one person's blip; on any account it is a
        //      transient read logging you off your phone. `auth.sessions` for
        //      that account was empty afterwards, including sessions created
        //      forty minutes before the login that triggered it.
        //   2. It fired on ONE read, while the branch directly below already
        //      knew that a failed profile fetch deserves three retries. A real
        //      ghost login is still a ghost 2.4 seconds later; a blip is not.
        //
        // So: retry it like any other failure, and if it is STILL missing, sign
        // out locally. The route guard sends them to /login either way, which is
        // the correct outcome for an account with no profile - it just no longer
        // takes the user's other devices with it.
        if (error?.code === 'PGRST116' && attempt >= RETRIES) {
          inFlight.current = null
          // NEVER SIGN OUT A SESSION THIS LOAD DOES NOT OWN.
          //
          // The retry ladder is ~17 seconds long, and somebody can log in again
          // inside it - which is precisely what a person does when a page looks
          // stuck. If they have, the session in the browser is no longer the one
          // this ladder was reading for, and signing it out would throw away a
          // login that just succeeded. So re-read who is actually signed in and
          // stand down unless it is still the same user.
          const { data: { session: now } } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }))
          if (now?.user?.id && now.user.id !== userId) return
          setProfile(null)
          setProfileLoaded(true)
          await supabase.auth.signOut({ scope: 'local' })
          return
        }
        // Transient failure: back off and try again. See RETRIES.
        if (attempt < RETRIES) {
          setTimeout(() => { if (!cancelled) loadProfile(userId, attempt + 1) }, backoff(attempt))
          return
        }
        inFlight.current = null
        setProfileError(true)
        setProfileLoaded(true)
      } catch {
        if (cancelled) return
        if (attempt < RETRIES) {
          setTimeout(() => { if (!cancelled) loadProfile(userId, attempt + 1) }, backoff(attempt))
          return
        }
        inFlight.current = null
        setProfileError(true)
        setProfileLoaded(true)
      }
    }

    // 1. Check for an existing session on first load. This is the ONLY place,
    //    along with the auth events below, that is allowed to say "there is no
    //    session" - see the watchdog above for what happened when a timer could.
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (cancelled) return
        setSession(session)
        setLoading(false)
        setSessionChecked(true)
        reconcileImpersonation(session)
        if (session?.user) {
          upgradeLegacyToken(session)
          loadProfile(session.user.id)
        } else {
          setProfileLoaded(true)
        }
      })
      .catch(() => {
        // getSession itself threw. That is not evidence of being logged out, so
        // it does not set sessionChecked: a browser holding a saved login lands
        // on the retry screen rather than on the login form.
        if (!cancelled) { setLoading(false); setProfileLoaded(true) }
      })

    // 2. React to sign-in / sign-out / token refresh events.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return
      setSession(session)
      setLoading(false)
      setSessionChecked(true)
      reconcileImpersonation(session)
      if (session?.user) {
        // New user (or a fresh sign-in) → make the guard wait for the profile.
        // A plain token refresh keeps the same id, so don't flash the spinner.
        if (loadedForUser.current !== session.user.id) { setProfileLoaded(false); setProfileError(false) }
        loadProfile(session.user.id)
      } else {
        loadedForUser.current = null
        setProfile(null)
        setProfileLoaded(true)
      }
    })

    return () => {
      cancelled = true
      clearTimeout(safety)
      subscription.unsubscribe()
    }
  }, [fetchProfile, reconcileImpersonation, setProfile])

  const realIsAdmin = profile?.is_admin === true

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    // isAdmin gates all admin UI + the /admin route guard. During a creator
    // preview the logged-in profile IS the sandbox creator (is_admin=false), so
    // admin UI hides naturally. `impersonating` (a stashed admin session exists)
    // is what surfaces the "exit creator view" pill so the admin can get back.
    isAdmin: realIsAdmin,
    // AN ADMIN IS NEVER "VIEWING AS A CREATOR", BY DEFINITION.
    //
    // Ethan: "I noticed one sign saying you're viewing as a creator, but it
    // shouldn't show that on the admin account, because you're not viewing as
    // a creator."
    //
    // `impersonating` was derived from a localStorage stash matching the logged
    // in user id, and a stash left behind by an exit that did not finish can
    // outlive the preview it described. Rather than chase every way that stash
    // can go stale, this asserts the invariant the feature actually rests on:
    // the preview account is the sandbox CREATOR (`is_admin = false`, enforced
    // in the impersonate function, which will only ever mint a session for one
    // fixed non-admin id). So if the profile in hand is an admin, this is not a
    // preview - whatever the stash says - and the pill must not appear.
    impersonating: impersonating && !realIsAdmin,
    enterCreatorPreview,
    exitCreatorPreview,
    isSuspended: profile?.status === 'suspended',
    loading,
    // True once a REAL answer about the session has arrived. The guard sends
    // people to /login on `sessionChecked && !user`, never on `!user` alone -
    // see the watchdog note in the effect below.
    sessionChecked,
    // There was a saved login in this browser at startup. Distinguishes "still
    // arriving" from "nobody is logged in" for the first few hundred ms.
    storedSession,
    profileLoaded,
    profileError,
    refreshProfile,
    retryProfile,

    // Auth routes go through the `auth-gate` Edge Function, which enforces a
    // hard rate limit (5 attempts / 15 min) before touching GoTrue.
    signUp: async (email, password, name, ref, captchaToken) => {
      const out = await callAuthGate({ action: 'signup', email, password, name, ref, captchaToken })
      if (out.error) return { data: { session: null, user: null }, error: { message: out.error } }
      if (out.access_token) await supabase.auth.setSession({ access_token: out.access_token, refresh_token: out.refresh_token })
      return { data: { session: out.access_token ? out : null, user: out.user ?? null }, error: null }
    },

    signIn: async (email, password, captchaToken) => {
      const out = await callAuthGate({ action: 'login', email, password, captchaToken })

      // THE RATE LIMITER IS NOT ALLOWED TO BE A SINGLE POINT OF FAILURE.
      //
      // `auth-gate` is a proxy in front of GoTrue that exists to count failed
      // attempts. It is a good thing to have and it is NOT worth the whole
      // platform: if that one function is unreachable from somebody's browser,
      // for any reason at all, they simply cannot sign in, and the message they
      // get is "Network error. Please check your connection", which sends them
      // to look at their wifi.
      //
      // That happened, on 2 Sep 2026, to Ethan on two different browsers while
      // the function's own logs showed it answering every request it received
      // cleanly - 200s and 400s, no timeouts, no errors. Whatever stopped the
      // request, it stopped it before it arrived, and nothing on the server
      // could have fixed it.
      //
      // So when the gate cannot be REACHED, sign in against GoTrue directly.
      // The endpoint is Supabase's own, on a different path with its own CORS
      // handling, and GoTrue applies its own rate limiting server-side, so the
      // fallback is not a hole - it is the same login with one fewer thing in
      // the way. `unreachable` is set only by the catch in callAuthGate, so a
      // refused password or a 429 still comes straight back to the user.
      if (out.unreachable) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
          options: captchaToken ? { captchaToken } : undefined,
        })
        if (error) return { data: { session: null, user: null }, error }
        return { data, error: null }
      }

      if (out.error) return { data: { session: null, user: null }, error: { message: out.error } }
      await supabase.auth.setSession({ access_token: out.access_token, refresh_token: out.refresh_token })
      return { data: { session: out, user: out.user ?? null }, error: null }
    },

    // LOGGING OUT OF THIS BROWSER LOGS YOU OUT OF THIS BROWSER.
    //
    // This was a bare `supabase.auth.signOut()`, and supabase-js DEFAULTS THAT
    // TO `scope: 'global'` - which does not sign this browser out, it REVOKES
    // EVERY SESSION ON THE ACCOUNT, everywhere, including sessions that are
    // being used right now on other devices and in other windows.
    //
    // THIS IS THE "IT LOADS, THEN CRASHES BACK TO THE LOGIN PAGE" BUG, and the
    // auth logs name it exactly. Ethan, 3 Sep 2026, on his own account and on
    // the demo one: "I'd put in my login details correct. It loads through the
    // login page and tries to load the worldwide page, but nothing loads, and
    // then it crashes and goes back to the login."
    //
    //     06:53:23  POST /token   200  login   qa-admin   referer trypcreators.vercel.app
    //     06:53:24  POST /logout?scope=global  204        referer content-creator-program.vercel.app
    //
    // A successful login, and ONE SECOND LATER a global logout FROM A DIFFERENT
    // WINDOW - the app is served on two Vercel domains, so a second tab is a
    // second origin with its own storage but the SAME account. That logout
    // revoked the session the first window had just created; every request after
    // it 401s, and the route guard correctly concludes there is no session and
    // shows /login. Nothing was wrong with the password, the captcha or the rate
    // limiter. Five login/logout pairs in nine minutes have this shape.
    //
    // ON A SHARED TEAM ACCOUNT THIS IS FATAL AND CONSTANT: the demo login is
    // meant to be used by several people at once, and any one of them pressing
    // "Log out" would throw everybody else out mid-session.
    //
    // `local` revokes this session and leaves the others alone. The deliberate
    // "sign out everywhere" is a separate, clearly-named action below - which is
    // exactly the point: revoking other people's sessions should take a decision,
    // not a default.
    signOut: () => {
      try { localStorage.removeItem(ADMIN_STASH_KEY) } catch { /* ignore */ }
      setImpersonating(false)
      return supabase.auth.signOut({ scope: 'local' })
    },

    // Sign out on every device: revokes all of this user's refresh tokens
    // server-side (scope: 'global'), not just the local session. Because our
    // refresh tokens never expire, this is the only way to boot a lost/stolen
    // device. Other tabs/devices drop to the login screen on their next refresh.
    signOutEverywhere: () => {
      try { localStorage.removeItem(ADMIN_STASH_KEY) } catch { /* ignore */ }
      setImpersonating(false)
      return supabase.auth.signOut({ scope: 'global' })
    },

    // Rate-limited password reset (always reports success, never reveals whether
    // the email exists).
    sendPasswordReset: async (email, captchaToken) => {
      const out = await callAuthGate({ action: 'recover', email, captchaToken, redirectTo: `${window.location.origin}/reset-password` })
      return { data: {}, error: out.error ? { message: out.error } : null }
    },

    updatePassword: (newPassword) => supabase.auth.updateUser({ password: newPassword }),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
