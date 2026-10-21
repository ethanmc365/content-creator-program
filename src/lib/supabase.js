import { createClient } from '@supabase/supabase-js'
import { resilientFetch } from './netQuality'
import { shareReads } from './sharedReads'
import { watchLoads } from './loadTrouble'
import { SESSION_STORAGE_KEY, attachClient, carrySession } from './sessionCarry'

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
      // Pinned to today's default so the login is still found after a move to a
      // new server address (see lib/sessionCarry). Never change it.
      storageKey: SESSION_STORAGE_KEY,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    },
    // Reads time out and retry once on a weak connection, and their timing is
    // what decides whether the app is on a slow one. See lib/netQuality.
    // Identical reads asked at the same moment go out once. See lib/sharedReads.
    // A request refused for an old or expired login refreshes it once and is sent again. See lib/sessionCarry.
    global: { fetch: carrySession(watchLoads(shareReads(resilientFetch))) },
  }
)
attachClient(supabase)
