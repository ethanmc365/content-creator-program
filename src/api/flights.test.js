import { describe, it, expect } from 'vitest'
import { makeFlightsApi } from './flights'
import { recordingClient } from './recorder.test-helper'

describe('flights api', () => {
  it('every accessor names its own table or function', async () => {
    const { client, calls } = recordingClient()
    const api = makeFlightsApi(client)
    await api.collabInterests()
    await api.collabPosts()
    await api.flights()
    await api.acknowledgeCollabInterest({ x: 1 })
    await api.collabInterestCounts({ x: 1 })
    await api.flightLeaderboard({ x: 1 })
    await api.routeCreators({ x: 1 })
    await api.routeFlyers({ x: 1 })
    await api.sameFlight({ x: 1 })
    await api.communityAircraft({ x: 1 })
    await api.communityAircraftGap({ x: 1 })
    await api.communityFlightRecords({ x: 1 })
    await api.communityFlightTotals({ x: 1 })
    await api.communityRoutes({ x: 1 })
    await api.routeFlyersMany({ x: 1 })
    await api.sameFlightMany({ x: 1 })
    expect(calls).toEqual([
      ['from', 'collab_interests'],
      ['from', 'collab_posts'],
      ['from', 'flights'],
      ['rpc', 'acknowledge_collab_interest', { x: 1 }],
      ['rpc', 'collab_interest_counts', { x: 1 }],
      ['rpc', 'flight_leaderboard', { x: 1 }],
      ['rpc', 'route_creators', { x: 1 }],
      ['rpc', 'route_flyers', { x: 1 }],
      ['rpc', 'same_flight', { x: 1 }],
      ['rpc', 'community_aircraft', { x: 1 }],
      ['rpc', 'community_aircraft_gap', { x: 1 }],
      ['rpc', 'community_flight_records', { x: 1 }],
      ['rpc', 'community_flight_totals', { x: 1 }],
      ['rpc', 'community_routes', { x: 1 }],
      ['rpc', 'route_flyers_many', { x: 1 }],
      ['rpc', 'same_flight_many', { x: 1 }],
    ])
  })
})
