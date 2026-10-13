import { describe, it, expect } from 'vitest'
import { makeGamesApi } from './games'
import { recordingClient } from './recorder.test-helper'

describe('games api', () => {
  it('every accessor names its own table or function', async () => {
    const { client, calls } = recordingClient()
    const api = makeGamesApi(client)
    await api.gameEvents()
    await api.gameScores()
    await api.gameModeLeaderboard({ x: 1 })
    await api.myGameStreak({ x: 1 })
    expect(calls).toEqual([
      ['from', 'game_events'],
      ['from', 'game_scores'],
      ['rpc', 'game_mode_leaderboard', { x: 1 }],
      ['rpc', 'my_game_streak', { x: 1 }],
    ])
  })
})
