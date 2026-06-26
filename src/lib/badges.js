// Achievement badges, auto-awarded from a creator's stats. Each `desc` is the
// requirement shown on hover (for earned and locked alike). Effort-based and
// tiered so there's always a next one to chase.
//   stats = { submissions, challenges, wins, bestRank, totalViews, countries, languages, referrals }
export const BADGES = [
  { key: 'podium',         name: 'Podium',          icon: 'chart',     desc: 'Finish in the top 3 of a challenge',  earned: (s) => s.bestRank > 0 && s.bestRank <= 3 },
  { key: 'champion',       name: 'Champion',        icon: 'trophy',    desc: 'Win a challenge (1st place)',          earned: (s) => s.wins >= 1 },
  { key: 'double_champ',   name: 'Double Champion', icon: 'trophy',    desc: 'Win 2 challenges',                     earned: (s) => s.wins >= 2 },
  { key: 'hat_trick',      name: 'Hat-trick Hero',  icon: 'star',      desc: 'Win 3 challenges',                     earned: (s) => s.wins >= 3 },
  { key: 'consistent',     name: 'Consistent',      icon: 'video',     desc: 'Enter 5 different challenges',          earned: (s) => s.challenges >= 5 },
  { key: 'dedicated',      name: 'Dedicated',       icon: 'flag',      desc: 'Enter 10 different challenges',         earned: (s) => s.challenges >= 10 },
  { key: 'prolific',       name: 'Prolific',        icon: 'megaphone', desc: 'Submit 25 videos',                     earned: (s) => s.submissions >= 25 },
  { key: 'globetrotter',   name: 'Globetrotter',    icon: 'globe',     desc: 'Visit 10+ countries',                  earned: (s) => s.countries >= 10 },
  { key: 'world_explorer', name: 'World Explorer',  icon: 'globe',     desc: 'Visit 20+ countries',                  earned: (s) => s.countries >= 20 },
  { key: 'globe_master',   name: 'Globe Master',    icon: 'globe',     desc: 'Visit 30+ countries',                  earned: (s) => s.countries >= 30 },
  { key: 'viral',          name: 'Viral',           icon: 'eye',       desc: 'Reach 1,000,000 total views',          earned: (s) => s.totalViews >= 1000000 },
  { key: 'polyglot',       name: 'Polyglot',        icon: 'chat',      desc: 'Speak 3 or more languages',            earned: (s) => s.languages >= 3 },
  { key: 'connector',      name: 'Connector',       icon: 'share',     desc: 'Refer a creator who joins',            earned: (s) => s.referrals >= 1 },
  { key: 'super_referrer', name: 'Super Referrer',  icon: 'users',     desc: 'Refer 3 creators who join',            earned: (s) => s.referrals >= 3 },
]

export function earnedBadges(stats) {
  return BADGES.filter((b) => b.earned(stats))
}
