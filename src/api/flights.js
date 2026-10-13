// The flight log and the travel collab board: the Supabase tables and functions this area owns. Pages call these instead of naming
// tables, so a schema rename or a backend move is a change in this folder. Each accessor returns the same query
// builder / `{ data, error }` as before.
import { supabase } from '../lib/supabase'

export const makeFlightsApi = (db = supabase) => ({
  collabInterests: () => db.from('collab_interests'),
  collabPosts: () => db.from('collab_posts'),
  flights: () => db.from('flights'),
  acknowledgeCollabInterest: (args, opts) => db.rpc('acknowledge_collab_interest', args, opts),
  collabInterestCounts: (args, opts) => db.rpc('collab_interest_counts', args, opts),
  flightLeaderboard: (args, opts) => db.rpc('flight_leaderboard', args, opts),
  routeCreators: (args, opts) => db.rpc('route_creators', args, opts),
  routeFlyers: (args, opts) => db.rpc('route_flyers', args, opts),
  sameFlight: (args, opts) => db.rpc('same_flight', args, opts),
  /** A function in this area chosen at run time. */
  call: (fn, args, opts) => db.rpc(fn, args, opts),
})

export const flightsApi = makeFlightsApi()
