import { createClient } from '@supabase/supabase-js'

// Single shared Supabase client for the whole app.
// The two values below come from your Supabase project's API settings - // see README → "Environment variables".
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  // Fail loudly in development so a missing .env is obvious, not mysterious.
  console.error(
    'Missing Supabase environment variables. Copy .env.example to .env and fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
  )
}

// Placeholder fallbacks keep the UI rendering (with failing requests) instead
// of white-screening when the .env file hasn't been created yet.
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
  {
    auth: {
      // Keep people signed in until they explicitly log out. The session is
      // saved to localStorage and the access token is silently refreshed in the
      // background, so a returning visitor (even days later) stays logged in.
      // NOTE: storageKey is intentionally left at the default so existing
      // sessions survive this change (changing it would log everyone out).
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    },
  }
)
