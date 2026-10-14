// Team and admin tools: applications, team membership, reports, notes, emails, audit and monitoring: the Supabase tables and functions this area owns. Pages call these instead of naming
// tables, so a schema rename or a backend move is a change in this folder. Each accessor returns the same query
// builder / `{ data, error }` as before.
import { supabase } from '../lib/supabase'

export const makeTeamApi = (db = supabase) => ({
  adminAuditLog: () => db.from('admin_audit_log'),
  adminNotes: () => db.from('admin_notes'),
  applicationDecisions: () => db.from('application_decisions'),
  clientErrors: () => db.from('client_errors'),
  creatorAdminNotes: () => db.from('creator_admin_notes'),
  creatorReports: () => db.from('creator_reports'),
  emailOutbox: () => db.from('email_outbox'),
  teamInvites: () => db.from('team_invites'),
  adminApproveApplication: (args, opts) => db.rpc('admin_approve_application', args, opts),
  adminScheduleApproval: (args, opts) => db.rpc('admin_schedule_approval', args, opts),
  adminCancelScheduledApproval: (args, opts) => db.rpc('admin_cancel_scheduled_approval', args, opts),
  claimMyScheduledApproval: (args, opts) => db.rpc('claim_my_scheduled_approval', args, opts),
  scheduledApprovals: () => db.from('scheduled_approvals'),
  adminChallengeMetrics: (args, opts) => db.rpc('admin_challenge_metrics', args, opts),
  adminCreatorScorecard: (args, opts) => db.rpc('admin_creator_scorecard', args, opts),
  adminDeclineApplication: (args, opts) => db.rpc('admin_decline_application', args, opts),
  adminDeleteChallenge: (args, opts) => db.rpc('admin_delete_challenge', args, opts),
  adminDeleteCreator: (args, opts) => db.rpc('admin_delete_creator', args, opts),
  adminListActivity: (args, opts) => db.rpc('admin_list_activity', args, opts),
  adminListEmails: (args, opts) => db.rpc('admin_list_emails', args, opts),
  adminListLastSeen: (args, opts) => db.rpc('admin_list_last_seen', args, opts),
  adminPushAdoption: (args, opts) => db.rpc('admin_push_adoption', args, opts),
  adminPushAnalytics: (args, opts) => db.rpc('admin_push_analytics', args, opts),
  adminSetAdmin: (args, opts) => db.rpc('admin_set_admin', args, opts),
  adminViewsGained: (args, opts) => db.rpc('admin_views_gained', args, opts),
  adminWeeklyActivity: (args, opts) => db.rpc('admin_weekly_activity', args, opts),
  approveTeamMember: (args, opts) => db.rpc('approve_team_member', args, opts),
  claimTeamInvite: (args, opts) => db.rpc('claim_team_invite', args, opts),
  decideMessageReport: (args, opts) => db.rpc('decide_message_report', args, opts),
  emailLog: (args, opts) => db.rpc('email_log', args, opts),
  reportClientError: (args, opts) => db.rpc('report_client_error', args, opts),
  sendTestPush: (args, opts) => db.rpc('send_test_push', args, opts),
  setTeamMember: (args, opts) => db.rpc('set_team_member', args, opts),
  setViewSyncSecret: (args, opts) => db.rpc('set_view_sync_secret', args, opts),
  teamInviteCheck: (args, opts) => db.rpc('team_invite_check', args, opts),
  teamRoster: (args, opts) => db.rpc('team_roster', args, opts),
  transferOwnership: (args, opts) => db.rpc('transfer_ownership', args, opts),
  viewSyncBacklog: (args, opts) => db.rpc('view_sync_backlog', args, opts),
  viewSyncStatus: (args, opts) => db.rpc('view_sync_status', args, opts),
  yearDmCounts: (args, opts) => db.rpc('year_dm_counts', args, opts),
  /** A function in this area chosen at run time. */
  call: (fn, args, opts) => db.rpc(fn, args, opts),
})

export const teamApi = makeTeamApi()
