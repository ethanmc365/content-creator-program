import { describe, it, expect } from 'vitest'
import { makeSettingsApi } from './settings'
import { recordingClient } from './recorder.test-helper'

describe('settings api', () => {
  it('every accessor names its own table or function', async () => {
    const { client, calls } = recordingClient()
    const api = makeSettingsApi(client)
    await api.appSettings()
    await api.landingStats({ x: 1 })
    expect(calls).toEqual([
      ['from', 'app_settings'],
      ['rpc', 'landing_stats', { x: 1 }],
    ])
  })
})
