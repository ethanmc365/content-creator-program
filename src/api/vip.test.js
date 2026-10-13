import { describe, it, expect } from 'vitest'
import { makeVipApi } from './vip'
import { recordingClient } from './recorder.test-helper'

describe('vip api', () => {
  it('every accessor names its own table or function', async () => {
    const { client, calls } = recordingClient()
    const api = makeVipApi(client)
    await api.announcements()
    await api.bonusRules()
    await api.briefs()
    await api.guides()
    await api.kpiTargets()
    await api.ledger()
    await api.members()
    await api.months()
    await api.programmes()
    await api.statements()
    await api.videos()
    await api.canManage({ x: 1 })
    await api.hasAccess({ x: 1 })
    await api.homeFor({ x: 1 })
    await api.inviteCheck({ x: 1 })
    await api.managersList({ x: 1 })
    await api.preview({ x: 1 })
    await api.programmeOptions({ x: 1 })
    await api.setTeam({ x: 1 })
    await api.settleHome({ x: 1 })
    await api.teamPeople({ x: 1 })
    await api.claimVipInvite({ x: 1 })
    await api.adminApproveVipApplication({ x: 1 })
    expect(calls).toEqual([
      ['from', 'vip_announcements'],
      ['from', 'vip_bonus_rules'],
      ['from', 'vip_briefs'],
      ['from', 'vip_guides'],
      ['from', 'vip_kpi_targets'],
      ['from', 'vip_ledger'],
      ['from', 'vip_members'],
      ['from', 'vip_months'],
      ['from', 'vip_programmes'],
      ['from', 'vip_statements'],
      ['from', 'vip_videos'],
      ['rpc', 'vip_can_manage', { x: 1 }],
      ['rpc', 'vip_has_access', { x: 1 }],
      ['rpc', 'vip_home_for', { x: 1 }],
      ['rpc', 'vip_invite_check', { x: 1 }],
      ['rpc', 'vip_managers_list', { x: 1 }],
      ['rpc', 'vip_preview', { x: 1 }],
      ['rpc', 'vip_programme_options', { x: 1 }],
      ['rpc', 'vip_set_team', { x: 1 }],
      ['rpc', 'vip_settle_home', { x: 1 }],
      ['rpc', 'vip_team_people', { x: 1 }],
      ['rpc', 'claim_vip_invite', { x: 1 }],
      ['rpc', 'admin_approve_vip_application', { x: 1 }],
    ])
  })
})
