import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

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

  // Load the profile row for the signed-in user.
  const fetchProfile = useCallback(async (userId) => {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single()
    if (error) {
      console.error('Failed to load profile:', error.message)
      return null
    }
    return data
  }, [])

  // Re-fetch the profile after edits (photo change, onboarding, etc.).
  const refreshProfile = useCallback(async () => {
    if (!session?.user) return
    setProfile(await fetchProfile(session.user.id))
  }, [session, fetchProfile])

  useEffect(() => {
    let cancelled = false

    // Safety net: never let the app hang on the full-screen spinner. If the
    // session check stalls (e.g. flaky network when a home-screen PWA resumes
    // from the background), resolve loading anyway after a few seconds so the
    // UI renders instead of spinning forever.
    const safety = setTimeout(() => { if (!cancelled) setLoading(false) }, 5000)

    // 1. Check for an existing session on first load. Resolve `loading` as soon
    //    as we know the session - don't block it on the slower profile fetch.
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (cancelled) return
        setSession(session)
        setLoading(false)
        if (session?.user) {
          upgradeLegacyToken(session)
          fetchProfile(session.user.id).then((p) => !cancelled && setProfile(p))
        }
      })
      .catch(() => { if (!cancelled) setLoading(false) })

    // 2. React to sign-in / sign-out / token refresh events.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return
      setSession(session)
      setLoading(false)
      if (session?.user) fetchProfile(session.user.id).then((p) => !cancelled && setProfile(p))
      else setProfile(null)
    })

    return () => {
      cancelled = true
      clearTimeout(safety)
      subscription.unsubscribe()
    }
  }, [fetchProfile])

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    isAdmin: profile?.is_admin === true,
    isSuspended: profile?.status === 'suspended',
    loading,
    refreshProfile,

    // Auth routes go through the `auth-gate` Edge Function, which enforces a
    // hard rate limit (5 attempts / 15 min) before touching GoTrue.
    signUp: async (email, password, name, ref) => {
      const out = await callAuthGate({ action: 'signup', email, password, name, ref })
      if (out.error) return { data: { session: null, user: null }, error: { message: out.error } }
      if (out.access_token) await supabase.auth.setSession({ access_token: out.access_token, refresh_token: out.refresh_token })
      return { data: { session: out.access_token ? out : null, user: out.user ?? null }, error: null }
    },

    signIn: async (email, password) => {
      const out = await callAuthGate({ action: 'login', email, password })
      if (out.error) return { data: { session: null, user: null }, error: { message: out.error } }
      await supabase.auth.setSession({ access_token: out.access_token, refresh_token: out.refresh_token })
      return { data: { session: out, user: out.user ?? null }, error: null }
    },

    signOut: () => supabase.auth.signOut(),

    // Rate-limited password reset (always reports success, never reveals whether
    // the email exists).
    sendPasswordReset: async (email) => {
      const out = await callAuthGate({ action: 'recover', email, redirectTo: `${window.location.origin}/reset-password` })
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
