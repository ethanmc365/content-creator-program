// Shared model for where a referred creator is in the journey. Both the admin
// referrals page and the creator's own Refer page use this so the language and
// the counting rule stay identical everywhere.
//
// The golden rule (user decision, Jul 2026): a referral only COUNTS once the
// referred creator has actually submitted a video to a challenge. Signing up,
// getting approved and joining are all just steps on the way there.

// Ordered from earliest to "counted" so we can sort and show progress.
export const REFERRAL_STAGES = {
  signing_up: {
    key: 'signing_up',
    label: 'Finishing signup',
    short: 'Signing up',
    tone: 'grey',
    hint: 'Started signing up but has not finished their profile yet.',
    step: 1,
  },
  in_review: {
    key: 'in_review',
    label: 'Awaiting review',
    short: 'In review',
    tone: 'amber',
    hint: 'Profile submitted, waiting for the team to approve them.',
    step: 2,
  },
  joined: {
    key: 'joined',
    label: 'Joined, no video yet',
    short: 'Joined',
    tone: 'light',
    hint: 'Approved and in the community, but has not posted to a challenge yet.',
    step: 3,
  },
  counted: {
    key: 'counted',
    label: 'Counted',
    short: 'Counted',
    tone: 'green',
    hint: 'Accepted and posted in a challenge, so this counts towards your voucher.',
    step: 4,
  },
  declined: {
    key: 'declined',
    label: 'Not accepted',
    short: 'Declined',
    tone: 'grey',
    hint: 'This application was declined.',
    step: 0,
  },
}

// Work out a referred creator's stage from their profile plus whether they have
// ever submitted a challenge video.
//  - profile.status: 'pending' | 'active' | 'declined' | 'muted'
//  - profile.onboarded: true once they finish their profile (then they wait for review)
export function referralStage(profile, hasSubmission) {
  if (!profile) return REFERRAL_STAGES.signing_up
  if (profile.status === 'declined') return REFERRAL_STAGES.declined
  // Counted = ACCEPTED and posted. The same rule as the database's
  // `qualifying_referrals` (migration 242), so the badge and the voucher agree.
  const accepted = profile.status === 'active' || profile.status === 'muted'
  if (hasSubmission && accepted) return REFERRAL_STAGES.counted
  if (profile.status === 'active' || profile.status === 'muted') return REFERRAL_STAGES.joined
  if (profile.onboarded) return REFERRAL_STAGES.in_review
  return REFERRAL_STAGES.signing_up
}

// A referral is "counted" (towards rewards / totals) only when it reaches the
// counted stage - i.e. the referred creator submitted a challenge video.
export const isCountedStage = (stage) => stage?.key === 'counted'

// THE TERMS (22 Sep 2026, migration 242): every `per` counted referrals earn one
// voucher. Read from app_settings.referral_reward; these are the fallbacks.
export const DEFAULT_REFERRAL_TERMS = { amount: 20, currency: 'EUR', per: 3, label: 'Tryp.com voucher' }

export function referralTerms(value) {
  const v = value && typeof value === 'object' ? value : {}
  const per = Math.max(1, Math.floor(Number(v.per) || DEFAULT_REFERRAL_TERMS.per))
  const amount = Number(v.amount) > 0 ? Number(v.amount) : DEFAULT_REFERRAL_TERMS.amount
  return { ...DEFAULT_REFERRAL_TERMS, ...v, per, amount }
}

// Where somebody is on the ladder: how many vouchers the counted referrals have
// earned, and how far through the NEXT set of `per` they are.
export function referralProgress(counted, per = 3) {
  const n = Math.max(0, Math.floor(Number(counted) || 0))
  const p = Math.max(1, Math.floor(Number(per) || 3))
  return { earned: Math.floor(n / p), towardsNext: n % p, per: p }
}
