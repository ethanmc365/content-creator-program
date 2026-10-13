import { describe, it, expect } from 'vitest'
import { makeCertificatesApi } from './certificates'
import { recordingClient } from './recorder.test-helper'

describe('certificates api', () => {
  it('every accessor names its own table or function', async () => {
    const { client, calls } = recordingClient()
    const api = makeCertificatesApi(client)
    await api.certificateAwards()
    await api.certificateDesigns()
    await api.creatorKitAssets()
    await api.creatorMilestones()
    await api.milestoneCriteria()
    await api.milestones()
    await api.awardCertificate({ x: 1 })
    await api.backfillCertificateDesign({ x: 1 })
    await api.certificateCandidates({ x: 1 })
    await api.milestoneItemsToSend({ x: 1 })
    await api.milestoneOverview({ x: 1 })
    await api.milestoneProgress({ x: 1 })
    await api.milestoneStandings({ x: 1 })
    await api.verifyCertificate({ x: 1 })
    expect(calls).toEqual([
      ['from', 'certificate_awards'],
      ['from', 'certificate_designs'],
      ['from', 'creator_kit_assets'],
      ['from', 'creator_milestones'],
      ['from', 'milestone_criteria'],
      ['from', 'milestones'],
      ['rpc', 'award_certificate', { x: 1 }],
      ['rpc', 'backfill_certificate_design', { x: 1 }],
      ['rpc', 'certificate_candidates', { x: 1 }],
      ['rpc', 'milestone_items_to_send', { x: 1 }],
      ['rpc', 'milestone_overview', { x: 1 }],
      ['rpc', 'milestone_progress', { x: 1 }],
      ['rpc', 'milestone_standings', { x: 1 }],
      ['rpc', 'verify_certificate', { x: 1 }],
    ])
  })
})
