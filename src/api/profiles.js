// Creator profiles, gallery photos, connections and portfolios: the Supabase tables and functions this feature owns. Pages call these instead of
// naming tables, so a schema rename or a backend move is a change in this folder. Each accessor returns the same
// query builder / `{ data, error }` as before.
import { supabase } from '../lib/supabase'

export const makeProfilesApi = (db = supabase) => ({
  connections: () => db.from('connections'),
  creatorPhotos: () => db.from('creator_photos'),
  creatorPortfolios: () => db.from('creator_portfolios'),
  profiles: () => db.from('profiles'),
  adminSetCreatorMarkets: (args, opts) => db.rpc('admin_set_creator_markets', args, opts),
  profileGameStats: (args, opts) => db.rpc('profile_game_stats', args, opts),
})

export const profilesApi = makeProfilesApi()
