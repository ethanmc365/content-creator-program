import { createClient } from '@supabase/supabase-js'

// Single shared Supabase client for the whole app.
// The two values below come from your Supabase project's API settings —
// see README → "Environment variables".
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
  supabaseAnonKey || 'placeholder-anon-key'
)
