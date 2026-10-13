import { describe, it, expect } from 'vitest'
import { makeChallengesApi } from './challenges'
import { recordingClient } from './recorder.test-helper'

describe('challenges api', () => {
  it('every accessor names its own table or function', async () => {
    const { client, calls } = recordingClient()
    const api = makeChallengesApi(client)
    await api.challengeBoosts()
    await api.challengeCollabs()
    await api.challengeGroupMembers()
    await api.challengeGroups()
    await api.challengeHistory()
    await api.challengeTemplates()
    await api.challengeVoucherDayWins()
    await api.challengeVoucherDays()
    await api.challenges()
    await api.pointAwards()
    await api.pointRules()
    await api.results()
    await api.submissionFeedback()
    await api.awardChallengePrizes({ x: 1 })
    await api.challengeMarketBoard({ x: 1 })
    await api.challengeNudge({ x: 1 })
    await api.challengePrizeStandings({ x: 1 })
    await api.challengeReach({ x: 1 })
    await api.challengeReachEmails({ x: 1 })
    await api.challengeStartsAt({ x: 1 })
    await api.challengeVoucherCounts({ x: 1 })
    await api.rebuildChallengeResults({ x: 1 })
    await api.recalcChallengePoints({ x: 1 })
    await api.viewsLeaderboard({ x: 1 })
    await api.setEntryFeedback({ x: 1 })
    expect(calls).toEqual([
      ['from', 'challenge_boosts'],
      ['from', 'challenge_collabs'],
      ['from', 'challenge_group_members'],
      ['from', 'challenge_groups'],
      ['from', 'challenge_history'],
      ['from', 'challenge_templates'],
      ['from', 'challenge_voucher_day_wins'],
      ['from', 'challenge_voucher_days'],
      ['from', 'challenges'],
      ['from', 'point_awards'],
      ['from', 'point_rules'],
      ['from', 'results'],
      ['from', 'submission_feedback'],
      ['rpc', 'award_challenge_prizes', { x: 1 }],
      ['rpc', 'challenge_market_board', { x: 1 }],
      ['rpc', 'challenge_nudge', { x: 1 }],
      ['rpc', 'challenge_prize_standings', { x: 1 }],
      ['rpc', 'challenge_reach', { x: 1 }],
      ['rpc', 'challenge_reach_emails', { x: 1 }],
      ['rpc', 'challenge_starts_at', { x: 1 }],
      ['rpc', 'challenge_voucher_counts', { x: 1 }],
      ['rpc', 'rebuild_challenge_results', { x: 1 }],
      ['rpc', 'recalc_challenge_points', { x: 1 }],
      ['rpc', 'views_leaderboard', { x: 1 }],
      ['rpc', 'set_entry_feedback', { x: 1 }],
    ])
  })
})
