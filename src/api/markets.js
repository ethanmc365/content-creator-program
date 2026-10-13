// Markets (communities), memberships, join requests and KPI targets: the Supabase tables and functions this area owns. Pages call these instead of naming
// tables, so a schema rename or a backend move is a change in this folder. Each accessor returns the same query
// builder / `{ data, error }` as before.
import { supabase } from '../lib/supabase'

export const makeMarketsApi = (db = supabase) => ({
  communities: () => db.from('communities'),
  communityMembers: () => db.from('community_members'),
  communityStandings: () => db.from('community_standings'),
  kpiTargets: () => db.from('kpi_targets'),
  marketJoinRequests: () => db.from('market_join_requests'),
  askJoinRequestDetails: (args, opts) => db.rpc('ask_join_request_details', args, opts),
  communityAircraft: (args, opts) => db.rpc('community_aircraft', args, opts),
  communityAircraftGap: (args, opts) => db.rpc('community_aircraft_gap', args, opts),
  communityFlightRecords: (args, opts) => db.rpc('community_flight_records', args, opts),
  communityFlightTotals: (args, opts) => db.rpc('community_flight_totals', args, opts),
  communityRoutes: (args, opts) => db.rpc('community_routes', args, opts),
  createMarket: (args, opts) => db.rpc('create_market', args, opts),
  decideJoinRequest: (args, opts) => db.rpc('decide_join_request', args, opts),
  deleteMarket: (args, opts) => db.rpc('delete_market', args, opts),
  joinMarket: (args, opts) => db.rpc('join_market', args, opts),
  kpiActuals: (args, opts) => db.rpc('kpi_actuals', args, opts),
  kpiActualsBatch: (args, opts) => db.rpc('kpi_actuals_batch', args, opts),
  kpiDetail: (args, opts) => db.rpc('kpi_detail', args, opts),
  myManagedScopes: (args, opts) => db.rpc('my_managed_scopes', args, opts),
  otherMarketChallenges: (args, opts) => db.rpc('other_market_challenges', args, opts),
  publicCreatorMap: (args, opts) => db.rpc('public_creator_map', args, opts),
  requestJoinMarket: (args, opts) => db.rpc('request_join_market', args, opts),
  setMarketLeads: (args, opts) => db.rpc('set_market_leads', args, opts),
  setMarketRetired: (args, opts) => db.rpc('set_market_retired', args, opts),
  /** A function in this area chosen at run time. */
  call: (fn, args, opts) => db.rpc(fn, args, opts),
})

export const marketsApi = makeMarketsApi()
