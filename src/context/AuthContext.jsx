import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { adoptProfileLocale } from '../lib/i18n'

// AuthContext is the single source of truth for "who is logged in".
// It exposes the Supabase session, the user's profile row (including
// is_admin), and helpers for sign-up / sign-in / sign-out / password reset.
const AuthContext = createContext(null)

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
    return { error: 'Network error. Please check your connection and try again.' }
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
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
  const loadedForUser = useRef(null)

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
  }, [session, fetchProfile])

  // Manual retry from the "connection is slow" screen.
  const retryProfile = useCallback(async () => {
    if (!session?.user) return
    setProfileError(false)
    setProfileLoaded(false)
    const { data, error } = await fetchProfile(session.user.id)
    if (data) {
      setProfile(data)
      loadedForUser.current = session.user.id
      setProfileLoaded(true)
    } else if (error?.code === 'PGRST116') {
      await supabase.auth.signOut()
    } else {
      setProfileError(true)
    }
  }, [session, fetchProfile])

  useEffect(() => {
    let cancelled = false

    // Safety net: never let the app hang on the full-screen SESSION spinner. If
    // the initial session check stalls, resolve `loading` so the UI can render.
    // We deliberately do NOT force profileLoaded here - a slow profile fetch is
    // handled by loadProfile's own retry + the "connection slow" screen, so a
    // logged-in user is never silently bounced to /login on a flaky network.
    const safety = setTimeout(() => { if (!cancelled) setLoading(false) }, 5000)

    // Fetch the profile (with a couple of retries for transient network errors)
    // and flip profileLoaded so the route guard can decide.
    //  * A real "no row" (PGRST116) is a corrupt/ghost login → sign it out.
    //  * A network failure sets profileError so the guard shows a retry screen
    //    instead of treating the user as logged-out.
    const loadProfile = async (userId, attempt = 0) => {
      try {
        const { data, error } = await fetchProfile(userId)
        if (cancelled) return
        if (data) {
          setProfile(data)
          loadedForUser.current = userId
          setProfileError(false)
          setProfileLoaded(true)
          return
        }
        if (error?.code === 'PGRST116') {
          setProfile(null)
          setProfileLoaded(true)
          await supabase.auth.signOut()
          return
        }
        // Transient failure: retry up to 3 times with a short backoff.
        if (attempt < 3) {
          setTimeout(() => { if (!cancelled) loadProfile(userId, attempt + 1) }, 800 * (attempt + 1))
          return
        }
        setProfileError(true)
        setProfileLoaded(true)
      } catch {
        if (cancelled) return
        if (attempt < 3) {
          setTimeout(() => { if (!cancelled) loadProfile(userId, attempt + 1) }, 800 * (attempt + 1))
          return
        }
        setProfileError(true)
        setProfileLoaded(true)
      }
    }

    // 1. Check for an existing session on first load. Resolve `loading` as soon
    //    as we know the session - the guard then waits on profileLoaded.
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (cancelled) return
        setSession(session)
        setLoading(false)
        reconcileImpersonation(session)
        if (session?.user) {
          upgradeLegacyToken(session)
          loadProfile(session.user.id)
        } else {
          setProfileLoaded(true)
        }
      })
      .catch(() => { if (!cancelled) { setLoading(false); setProfileLoaded(true) } })

    // 2. React to sign-in / sign-out / token refresh events.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return
      setSession(session)
      setLoading(false)
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
  }, [fetchProfile, reconcileImpersonation])

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
    impersonating,
    enterCreatorPreview,
    exitCreatorPreview,
    isSuspended: profile?.status === 'suspended',
    loading,
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
      if (out.error) return { data: { session: null, user: null }, error: { message: out.error } }
      await supabase.auth.setSession({ access_token: out.access_token, refresh_token: out.refresh_token })
      return { data: { session: out, user: out.user ?? null }, error: null }
    },

    signOut: () => {
      try { localStorage.removeItem(ADMIN_STASH_KEY) } catch { /* ignore */ }
      setImpersonating(false)
      return supabase.auth.signOut()
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
