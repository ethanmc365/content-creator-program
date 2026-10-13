import { describe, it, expect } from 'vitest'
import { makeMarketsApi } from './markets'
import { recordingClient } from './recorder.test-helper'

describe('markets api', () => {
  it('every accessor names its own table or function', async () => {
    const { client, calls } = recordingClient()
    const api = makeMarketsApi(client)
    await api.communities()
    await api.communityMembers()
    await api.communityStandings()
    await api.kpiTargets()
    await api.marketJoinRequests()
    await api.askJoinRequestDetails({ x: 1 })
    await api.communityAircraft({ x: 1 })
    await api.communityAircraftGap({ x: 1 })
    await api.communityFlightRecords({ x: 1 })
    await api.communityFlightTotals({ x: 1 })
    await api.communityRoutes({ x: 1 })
    await api.createMarket({ x: 1 })
    await api.decideJoinRequest({ x: 1 })
    await api.deleteMarket({ x: 1 })
    await api.joinMarket({ x: 1 })
    await api.kpiActuals({ x: 1 })
    await api.kpiActualsBatch({ x: 1 })
    await api.kpiDetail({ x: 1 })
    await api.myManagedScopes({ x: 1 })
    await api.otherMarketChallenges({ x: 1 })
    await api.publicCreatorMap({ x: 1 })
    await api.requestJoinMarket({ x: 1 })
    await api.setMarketLeads({ x: 1 })
    await api.setMarketRetired({ x: 1 })
    expect(calls).toEqual([
      ['from', 'communities'],
      ['from', 'community_members'],
      ['from', 'community_standings'],
      ['from', 'kpi_targets'],
      ['from', 'market_join_requests'],
      ['rpc', 'ask_join_request_details', { x: 1 }],
      ['rpc', 'community_aircraft', { x: 1 }],
      ['rpc', 'community_aircraft_gap', { x: 1 }],
      ['rpc', 'community_flight_records', { x: 1 }],
      ['rpc', 'community_flight_totals', { x: 1 }],
      ['rpc', 'community_routes', { x: 1 }],
      ['rpc', 'create_market', { x: 1 }],
      ['rpc', 'decide_join_request', { x: 1 }],
      ['rpc', 'delete_market', { x: 1 }],
      ['rpc', 'join_market', { x: 1 }],
      ['rpc', 'kpi_actuals', { x: 1 }],
      ['rpc', 'kpi_actuals_batch', { x: 1 }],
      ['rpc', 'kpi_detail', { x: 1 }],
      ['rpc', 'my_managed_scopes', { x: 1 }],
      ['rpc', 'other_market_challenges', { x: 1 }],
      ['rpc', 'public_creator_map', { x: 1 }],
      ['rpc', 'request_join_market', { x: 1 }],
      ['rpc', 'set_market_leads', { x: 1 }],
      ['rpc', 'set_market_retired', { x: 1 }],
    ])
  })
})
