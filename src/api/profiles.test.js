import { describe, it, expect } from 'vitest'
import { makeProfilesApi } from './profiles'
import { recordingClient } from './recorder.test-helper'

describe('profiles api', () => {
  it('every accessor names its own table or function', async () => {
    const { client, calls } = recordingClient()
    const api = makeProfilesApi(client)
    await api.connections()
    await api.creatorPhotos()
    await api.creatorPortfolios()
    await api.profiles()
    await api.adminSetCreatorMarkets({ x: 1 })
    await api.profileGameStats({ x: 1 })
    expect(calls).toEqual([
      ['from', 'connections'],
      ['from', 'creator_photos'],
      ['from', 'creator_portfolios'],
      ['from', 'profiles'],
      ['rpc', 'admin_set_creator_markets', { x: 1 }],
      ['rpc', 'profile_game_stats', { x: 1 }],
    ])
  })
})
