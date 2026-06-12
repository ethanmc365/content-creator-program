import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// AuthContext is the single source of truth for "who is logged in".
// It exposes the Supabase session, the user's profile row (including
// is_admin), and helpers for sign-up / sign-in / sign-out / password reset.
const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true) // true until the first session check resolves

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
    // 1. Check for an existing session on first load.
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session)
      if (session?.user) setProfile(await fetchProfile(session.user.id))
      setLoading(false)
    })

    // 2. React to sign-in / sign-out / token refresh events.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session)
      setProfile(session?.user ? await fetchProfile(session.user.id) : null)
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [fetchProfile])

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    isAdmin: profile?.is_admin === true,
    isSuspended: profile?.status === 'suspended',
    loading,
    refreshProfile,

    signUp: (email, password, name) =>
      supabase.auth.signUp({ email, password, options: { data: { name } } }),

    signIn: (email, password) => supabase.auth.signInWithPassword({ email, password }),

    signOut: () => supabase.auth.signOut(),

    // Sends Supabase's built-in password-reset email. Also used by admins to
    // trigger a reset on a creator's behalf (it only needs the email address).
    sendPasswordReset: (email) =>
      supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      }),

    updatePassword: (newPassword) => supabase.auth.updateUser({ password: newPassword }),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
