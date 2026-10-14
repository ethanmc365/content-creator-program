// The VIP and Official programmes: the Supabase tables and functions this feature owns. Pages call these instead of
// naming tables, so a schema rename or a backend move is a change in this folder. Each accessor returns the same
// query builder / `{ data, error }` as before.
import { supabase } from '../lib/supabase'

export const makeVipApi = (db = supabase) => ({
  announcements: () => db.from('vip_announcements'),
  bonusRules: () => db.from('vip_bonus_rules'),
  briefs: () => db.from('vip_briefs'),
  guides: () => db.from('vip_guides'),
  kpiTargets: () => db.from('vip_kpi_targets'),
  ledger: () => db.from('vip_ledger'),
  members: () => db.from('vip_members'),
  months: () => db.from('vip_months'),
  programmes: () => db.from('vip_programmes'),
  statements: () => db.from('vip_statements'),
  videos: () => db.from('vip_videos'),
  videoQuestions: () => db.from('vip_video_questions'),
  videoAnswers: () => db.from('vip_video_answers'),
  myVideoQuestions: (args, opts) => db.rpc('vip_my_video_questions', args, opts),
  answerVideo: (args, opts) => db.rpc('vip_answer_video', args, opts),
  profileVipVideos: (args, opts) => db.rpc('profile_vip_videos', args, opts),
  canManage: (args, opts) => db.rpc('vip_can_manage', args, opts),
  hasAccess: (args, opts) => db.rpc('vip_has_access', args, opts),
  homeFor: (args, opts) => db.rpc('vip_home_for', args, opts),
  inviteCheck: (args, opts) => db.rpc('vip_invite_check', args, opts),
  managersList: (args, opts) => db.rpc('vip_managers_list', args, opts),
  preview: (args, opts) => db.rpc('vip_preview', args, opts),
  programmeOptions: (args, opts) => db.rpc('vip_programme_options', args, opts),
  setTeam: (args, opts) => db.rpc('vip_set_team', args, opts),
  settleHome: (args, opts) => db.rpc('vip_settle_home', args, opts),
  teamPeople: (args, opts) => db.rpc('vip_team_people', args, opts),
  claimVipInvite: (args, opts) => db.rpc('claim_vip_invite', args, opts),
  adminApproveVipApplication: (args, opts) => db.rpc('admin_approve_vip_application', args, opts),
  perks: () => db.from('vip_perks'),
  /** A VIP content table by name (perks, briefs and guides share one list component). */
  table: (name) => db.from(name),
  /** Any VIP database function by name (the VIP screens build the name: vipRpc('vip_x')). */
  call: (fn, args, opts) => db.rpc(fn, args, opts),
})

export const vipApi = makeVipApi()
