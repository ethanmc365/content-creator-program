// App-wide settings and the public landing page: the Supabase tables and functions this area owns. Pages call these instead of naming
// tables, so a schema rename or a backend move is a change in this folder. Each accessor returns the same query
// builder / `{ data, error }` as before.
import { supabase } from '../lib/supabase'

export const makeSettingsApi = (db = supabase) => ({
  appSettings: () => db.from('app_settings'),
  landingStats: (args, opts) => db.rpc('landing_stats', args, opts),
  /** A function in this area chosen at run time. */
  call: (fn, args, opts) => db.rpc(fn, args, opts),
})

export const settingsApi = makeSettingsApi()
