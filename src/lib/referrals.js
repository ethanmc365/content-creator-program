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
    hint: 'Submitted a video to a challenge, so this referral counts.',
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
  if (hasSubmission) return REFERRAL_STAGES.counted
  if (profile.status === 'declined') return REFERRAL_STAGES.declined
  if (profile.status === 'active' || profile.status === 'muted') return REFERRAL_STAGES.joined
  if (profile.onboarded) return REFERRAL_STAGES.in_review
  return REFERRAL_STAGES.signing_up
}

// A referral is "counted" (towards rewards / totals) only when it reaches the
// counted stage - i.e. the referred creator submitted a challenge video.
export const isCountedStage = (stage) => stage?.key === 'counted'
