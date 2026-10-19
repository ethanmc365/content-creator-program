// Challenges, groups, points, results and templates: the Supabase tables and functions this feature owns. Pages call these instead of
// naming tables, so a schema rename or a backend move is a change in this folder. Each accessor returns the same
// query builder / `{ data, error }` as before.
import { supabase } from '../lib/supabase'

export const makeChallengesApi = (db = supabase) => ({
  challengeBoosts: () => db.from('challenge_boosts'),
  challengeCollabs: () => db.from('challenge_collabs'),
  challengeGroupMembers: () => db.from('challenge_group_members'),
  challengeGroups: () => db.from('challenge_groups'),
  challengeHistory: () => db.from('challenge_history'),
  challengeTemplates: () => db.from('challenge_templates'),
  challengeVoucherDayWins: () => db.from('challenge_voucher_day_wins'),
  challengeVoucherDays: () => db.from('challenge_voucher_days'),
  challenges: () => db.from('challenges'),
  pointAwards: () => db.from('point_awards'),
  pointRules: () => db.from('point_rules'),
  results: () => db.from('results'),
  submissionFeedback: () => db.from('submission_feedback'),
  awardChallengePrizes: (args, opts) => db.rpc('award_challenge_prizes', args, opts),
  challengeMarketBoard: (args, opts) => db.rpc('challenge_market_board', args, opts),
  challengeNudge: (args, opts) => db.rpc('challenge_nudge', args, opts),
  challengePrizeStandings: (args, opts) => db.rpc('challenge_prize_standings', args, opts),
  challengeReach: (args, opts) => db.rpc('challenge_reach', args, opts),
  challengeReachEmails: (args, opts) => db.rpc('challenge_reach_emails', args, opts),
  challengeStartsAt: (args, opts) => db.rpc('challenge_starts_at', args, opts),
  challengeVoucherCounts: (args, opts) => db.rpc('challenge_voucher_counts', args, opts),
  rebuildChallengeResults: (args, opts) => db.rpc('rebuild_challenge_results', args, opts),
  recalcChallengePoints: (args, opts) => db.rpc('recalc_challenge_points', args, opts),
  viewsLeaderboard: (args, opts) => db.rpc('views_leaderboard', args, opts),
  setEntryFeedback: (args, opts) => db.rpc('set_entry_feedback', args, opts),
  // Video of the Week (migration 435).
  weeklyPrizeBoard: (args, opts) => db.rpc('weekly_prize_board', args, opts),
  awardWeeklyPrize: (args, opts) => db.rpc('award_weekly_prize', args, opts),
  weeklyPrizeRefresh: (args, opts) => db.rpc('weekly_prize_refresh', args, opts),
  /** A challenge function chosen at run time (award or withdraw a bonus). */
  call: (fn, args, opts) => db.rpc(fn, args, opts),
})

export const challengesApi = makeChallengesApi()
