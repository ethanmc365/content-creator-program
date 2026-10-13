import { describe, it, expect } from 'vitest'
import { makeTeamApi } from './team'
import { recordingClient } from './recorder.test-helper'

describe('team api', () => {
  it('every accessor names its own table or function', async () => {
    const { client, calls } = recordingClient()
    const api = makeTeamApi(client)
    await api.adminAuditLog()
    await api.adminNotes()
    await api.applicationDecisions()
    await api.clientErrors()
    await api.creatorAdminNotes()
    await api.creatorReports()
    await api.emailOutbox()
    await api.teamInvites()
    await api.adminApproveApplication({ x: 1 })
    await api.adminChallengeMetrics({ x: 1 })
    await api.adminCreatorScorecard({ x: 1 })
    await api.adminDeclineApplication({ x: 1 })
    await api.adminDeleteChallenge({ x: 1 })
    await api.adminDeleteCreator({ x: 1 })
    await api.adminListActivity({ x: 1 })
    await api.adminListEmails({ x: 1 })
    await api.adminListLastSeen({ x: 1 })
    await api.adminPushAdoption({ x: 1 })
    await api.adminPushAnalytics({ x: 1 })
    await api.adminSetAdmin({ x: 1 })
    await api.adminViewsGained({ x: 1 })
    await api.adminWeeklyActivity({ x: 1 })
    await api.approveTeamMember({ x: 1 })
    await api.claimTeamInvite({ x: 1 })
    await api.decideMessageReport({ x: 1 })
    await api.emailLog({ x: 1 })
    await api.reportClientError({ x: 1 })
    await api.sendTestPush({ x: 1 })
    await api.setTeamMember({ x: 1 })
    await api.setViewSyncSecret({ x: 1 })
    await api.teamInviteCheck({ x: 1 })
    await api.teamRoster({ x: 1 })
    await api.transferOwnership({ x: 1 })
    await api.viewSyncBacklog({ x: 1 })
    await api.viewSyncStatus({ x: 1 })
    await api.yearDmCounts({ x: 1 })
    expect(calls).toEqual([
      ['from', 'admin_audit_log'],
      ['from', 'admin_notes'],
      ['from', 'application_decisions'],
      ['from', 'client_errors'],
      ['from', 'creator_admin_notes'],
      ['from', 'creator_reports'],
      ['from', 'email_outbox'],
      ['from', 'team_invites'],
      ['rpc', 'admin_approve_application', { x: 1 }],
      ['rpc', 'admin_challenge_metrics', { x: 1 }],
      ['rpc', 'admin_creator_scorecard', { x: 1 }],
      ['rpc', 'admin_decline_application', { x: 1 }],
      ['rpc', 'admin_delete_challenge', { x: 1 }],
      ['rpc', 'admin_delete_creator', { x: 1 }],
      ['rpc', 'admin_list_activity', { x: 1 }],
      ['rpc', 'admin_list_emails', { x: 1 }],
      ['rpc', 'admin_list_last_seen', { x: 1 }],
      ['rpc', 'admin_push_adoption', { x: 1 }],
      ['rpc', 'admin_push_analytics', { x: 1 }],
      ['rpc', 'admin_set_admin', { x: 1 }],
      ['rpc', 'admin_views_gained', { x: 1 }],
      ['rpc', 'admin_weekly_activity', { x: 1 }],
      ['rpc', 'approve_team_member', { x: 1 }],
      ['rpc', 'claim_team_invite', { x: 1 }],
      ['rpc', 'decide_message_report', { x: 1 }],
      ['rpc', 'email_log', { x: 1 }],
      ['rpc', 'report_client_error', { x: 1 }],
      ['rpc', 'send_test_push', { x: 1 }],
      ['rpc', 'set_team_member', { x: 1 }],
      ['rpc', 'set_view_sync_secret', { x: 1 }],
      ['rpc', 'team_invite_check', { x: 1 }],
      ['rpc', 'team_roster', { x: 1 }],
      ['rpc', 'transfer_ownership', { x: 1 }],
      ['rpc', 'view_sync_backlog', { x: 1 }],
      ['rpc', 'view_sync_status', { x: 1 }],
      ['rpc', 'year_dm_counts', { x: 1 }],
    ])
  })
})
