import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { adoptProfileLocale } from '../lib/i18n'
import { adoptTestDataVisibility } from '../lib/testData'
import { clearPageCache } from '../lib/pageCache'
import { resetNotifications } from '../lib/notifications'
import { clearScopeCache } from '../lib/scope'
import { clearRoster } from '../lib/roster'
import { clearVipAccess, clearVipCache } from '../lib/vip'
import { identifyForMonitoring } from '../lib/monitoring'
import { profilesApi } from '../api/profiles'

// AuthContext is the single source of truth for "who is logged in".
// It exposes the Supabase session, the user's profile row (including
// is_admin), and helpers for sign-up / sign-in / sign-out / password reset.
const AuthContext = createContext(null)

// Profile fetch retries: five tries at 600/1200/2400/4800/8000 ms (~17 s), so a phone on weak signal is not
// sent to the "taking longer than usual" screen after a few seconds.
const RETRIES = 5
const backoff = (attempt) => Math.min(600 * 2 ** attempt, 8000)

// Is there a saved login in this browser? Read synchronously before any await, so the route guard can tell
// "not known yet" from "nobody is logged in" on the first render. Only checks that a session key exists and parses;
// validity is the server's business.
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

// THE PROFILE FROM LAST TIME, SO THE APP DRAWS BEFORE THE NETWORK ANSWERS. Every app open waited on a profile round trip
// before the route guard would draw a single page. The last profile this device saw is used the moment the stored
// session says it is the same person; the real one is fetched straight after and replaces it. Nothing is trusted from it
// that the server does not re-check: every read and write still goes through RLS.
const PROFILE_CACHE = 'tryp_profile_cache_v1'
function readCachedProfile(userId) {
  try {
    const c = JSON.parse(localStorage.getItem(PROFILE_CACHE) || 'null')
    return c && c.id === userId && c.data ? c.data : null
  } catch { return null }
}
function writeCachedProfile(p) {
  try {
    if (p?.id) localStorage.setItem(PROFILE_CACHE, JSON.stringify({ id: p.id, data: p }))
    else localStorage.removeItem(PROFILE_CACHE)
  } catch { /* private mode or full */ }
}

// SAME CONTENT, SAME OBJECT. Supabase announces the session again on every token refresh and every time the app comes
// back to the foreground (SIGNED_IN on visibilitychange), and the profile is fetched again each time. Handing React a
// new object whose content has not changed re-ran every effect keyed on `user` or `profile` across the app: on 21 Oct
// switching back to the app re-downloaded 17 requests / 238 kB (the 158 kB who-to-meet roster among them), which is
// the freeze people feel on a weak connection. The comparison is a JSON string of a ~2 kB row, so it costs nothing.
export function sameJson(a, b) {
  if (a === b) return true
  if (!a || !b) return false
  try { return JSON.stringify(a) === JSON.stringify(b) } catch { return false }
}

export function AuthProvider({ children }) {
  const [session, setSessionState] = useState(null)
  // The user outlives a token refresh: only a real change of account details gives consumers a new object.
  const [user, setUser] = useState(null)
  // A refreshed token is a new session (callers read access_token), but an identical one is not.
  const setSession = useCallback((next) => {
    setSessionState((prev) => (prev && next && prev.access_token === next.access_token && sameJson(prev.user, next.user) ? prev : next))
    setUser((prev) => (sameJson(prev, next?.user ?? null) ? prev : (next?.user ?? null)))
  }, [])
  const [profile, setProfileState] = useState(null)
  // EVERY WAY THE PROFILE CHANGES GOES THROUGH HERE, so that "may this viewer
  // see the demo people" is updated in the same breath as the profile itself
  // and can never lag a render behind it. Doing this in an effect instead would
  // be a real bug: child effects run BEFORE their parent's, so a page's data
  // fetch would read the previous viewer's answer. See lib/testData.
  const setProfile = useCallback((p) => {
    adoptTestDataVisibility(p)
    // AND MONITORING LEARNS WHO THIS IS, in the same breath and for the same
    // reason: "is this crash everybody or is it one account" is the first
    // question asked of any error report, and it cannot be answered after the
    // fact. Just the profile id - see lib/monitoring, which strips the email,
    // the name and the IP.
    identifyForMonitoring(p?.id || null)
    // `last_seen_at` is bumped by the app itself every minute (touch_last_seen), so it alone never counts as a change.
    setProfileState((prev) => (prev && p && sameJson({ ...prev, last_seen_at: null }, { ...p, last_seen_at: null }) ? prev : p))
    writeCachedProfile(p)
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

  // "View as creator": an admin steps into a hidden sandbox creator account (is_test) to see the app exactly as a
  // creator does. Enter swaps to a session minted by the `impersonate` edge function and keeps a short-lived signed
  // exit ticket; exit mints a fresh admin session from that ticket (stashed admin tokens could have been revoked).
  // `impersonating` is true only while a stash exists AND the logged-in user is the preview creator.
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

  const enterCreatorPreview = useCallback(async (target) => {
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
        body: JSON.stringify({ action: 'enter', target: target === 'vip' ? 'vip' : undefined }),
      })
      out = await res.json().catch(() => ({}))
      if (!res.ok || !out?.token_hash || !out?.exit_ticket) return { error: out?.error || 'Could not start creator preview.' }
    } catch {
      return { error: 'Network error. Please try again.' }
    }
    // WHERE TO COME BACK TO. The page is remembered here and the Exit pill returns to it.
    try { localStorage.setItem('tryp_preview_return', window.location.pathname + window.location.search) } catch { /* ignore */ }
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
    // The admin's pages must not be handed to the creator being previewed. See
    // lib/pageCache - the caches are keyed by page, not by account.
    clearPageCache()
    clearRoster()
    clearScopeCache()
    // THE VIP ANSWERS ARE ACCOUNTS' TOO. and, on the way out, the VIP tools door stayed missing. The VIP overview and
    // the "has VIP tools" answer are module caches kept for the session; the previous account's survived the swap.
    clearVipCache()
    clearVipAccess()
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
    // And the creator's pages go with the creator. See lib/pageCache.
    clearPageCache()
    clearRoster()
    clearScopeCache()
    clearVipCache()
    clearVipAccess()
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
    const result = await profilesApi.profiles().select('*').eq('id', userId).single()
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
    clearRoster() // the edit may change how this person appears on the home page's cards
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

    // The watchdog ends the SPINNER after 5 s; it never decides that nobody is logged in. `sessionChecked`, set only by
    // a real answer from getSession or an auth event, does that. A browser with a saved login that has not resolved yet
    // gets the retry screen instead of the login form (the old watchdog turned a slow boot into an apparent logout).
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
      // One profile fetch, not two: getSession and the INITIAL_SESSION event both arrive on a cold boot.
      // Retries are exempt.
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
        // A missing profile (PGRST116) is retried like any other failure (it can be a transient RLS or deploy blip), and
        // only then signed out, LOCALLY. signOut() defaults to scope 'global', which revokes every session on the account.
        if (error?.code === 'PGRST116' && attempt >= RETRIES) {
          inFlight.current = null
          // Never sign out a session this load does not own: the person may have logged in again during the retries.
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
          // Draw now from last time's profile; loadProfile replaces it.
          const cached = readCachedProfile(session.user.id)
          if (cached && loadedForUser.current !== session.user.id) {
            setProfileState(cached)
            adoptTestDataVisibility(cached)
            loadedForUser.current = session.user.id
            setProfileLoaded(true)
          }
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
  }, [fetchProfile, reconcileImpersonation, setProfile, setSession])

  const realIsAdmin = profile?.is_admin === true
  const value = {
    session,
    user,
    profile,
    // isAdmin gates all admin UI + the /admin route guard. During a creator
    // preview the logged-in profile IS the sandbox creator (is_admin=false), so
    // admin UI hides naturally. `impersonating` (a stashed admin session exists)
    // is what surfaces the "exit creator view" pill so the admin can get back.
    isAdmin: realIsAdmin,
    // An admin is never "viewing as a creator": the preview account is always the non-admin sandbox creator, so an
    // admin profile means no preview, whatever a stale stash says.
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

      // Signup falls back to GoTrue directly when the auth-gate function cannot be reached (same as login).
      // `unreachable` is set only by the catch in callAuthGate, so a real refusal still comes straight back.
      if (out.unreachable) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          // The same metadata the gate forwards - `handle_new_user` reads
          // `name` to build the profile row and `ref` to record the referral,
          // so dropping them here would create a nameless, unattributed
          // account that looks like a bug three screens later.
          options: {
            data: { name: name || null, ref: ref || null },
            ...(captchaToken ? { captchaToken } : {}),
          },
        })
        if (error) return { data: { session: null, user: null }, error }
        return { data, error: null }
      }

      if (out.error) return { data: { session: null, user: null }, error: { message: out.error } }
      if (out.access_token) await supabase.auth.setSession({ access_token: out.access_token, refresh_token: out.refresh_token })
      return { data: { session: out.access_token ? out : null, user: out.user ?? null }, error: null }
    },

    signIn: async (email, password, captchaToken) => {
      const out = await callAuthGate({ action: 'login', email, password, captchaToken })

      // The rate limiter (auth-gate) must not be a single point of failure: when it cannot be reached, sign in against
      // GoTrue directly (which has its own rate limits). A refused password or a 429 still comes straight back.
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

    // Log out of THIS browser only (`scope: 'local'`). The default 'global' revokes every session on the account,
    // including other devices and other people on a shared team login. "Sign out everywhere" is a separate action below.
    signOut: () => {
      try { localStorage.removeItem(ADMIN_STASH_KEY) } catch { /* ignore */ }
      setImpersonating(false)
      // THE NEXT PERSON TO SIGN IN ON THIS DEVICE MUST NOT SEE THIS ONE'S ROWS.
      // Both caches are keyed by page, not by account - which is right for the
      // thing they do (paint the tab you just left) and fatal the moment the
      // account changes underneath them. See lib/pageCache.
      clearPageCache()
      clearRoster()
    clearRoster()
      clearScopeCache()
      // And the notification store, for the same reason and with the same
      // failure mode: it is module state now (lib/notifications), so without
      // this the next person to sign in on this device sees the last one's
      // bell until their own fetch lands.
      resetNotifications()
      return supabase.auth.signOut({ scope: 'local' })
    },

    // Sign out on every device: revokes all of this user's refresh tokens
    // server-side (scope: 'global'), not just the local session. Because our
    // refresh tokens never expire, this is the only way to boot a lost/stolen
    // device. Other tabs/devices drop to the login screen on their next refresh.
    signOutEverywhere: () => {
      try { localStorage.removeItem(ADMIN_STASH_KEY) } catch { /* ignore */ }
      setImpersonating(false)
      clearPageCache()
      clearRoster()
    clearRoster()
      clearScopeCache()
      return supabase.auth.signOut({ scope: 'global' })
    },

    // Rate-limited password reset (always reports success, never reveals whether
    // the email exists).
    sendPasswordReset: async (email, captchaToken) => {
      const out = await callAuthGate({ action: 'recover', email, captchaToken, redirectTo: `${window.location.origin}/reset-password` })
      // THE THIRD DOOR GETS THE SAME FALLBACK. All three ways into the platform
      // - sign in, sign up, and "I have forgotten my password" - go through the
      // gate, and each one that lacks this becomes the next outage. Somebody
      // locked out of their account is exactly the person who cannot route
      // around a rate limiter being unreachable.
      if (out.unreachable) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
          ...(captchaToken ? { captchaToken } : {}),
        })
        return { data: {}, error: error ? { message: error.message } : null }
      }
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
