import { describe, it, expect } from 'vitest'
import { makeSubmissionsApi } from './submissions'
import { recordingClient } from './recorder.test-helper'

describe('submissions api', () => {
  it('every accessor names its own table or function', async () => {
    const { client, calls } = recordingClient()
    const api = makeSubmissionsApi(client)
    await api.submissionBonusClaims()
    await api.submissionDisqualifications()
    await api.submissions()
    await api.disqualifySubmission({ x: 1 })
    await api.reinstateSubmission({ x: 1 })
    expect(calls).toEqual([
      ['from', 'submission_bonus_claims'],
      ['from', 'submission_disqualifications'],
      ['from', 'submissions'],
      ['rpc', 'disqualify_submission', { x: 1 }],
      ['rpc', 'reinstate_submission', { x: 1 }],
    ])
  })
})
