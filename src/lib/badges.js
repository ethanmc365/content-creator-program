// Achievement badges, auto-awarded from a creator's stats (no manual issuing).
// `earned(stats)` decides if a creator has it. `icon` maps to the Icon set.
//   stats = { submissions, challenges, bestRank, wins, totalViews, countries, languages, referrals }
export const BADGES = [
  { key: 'welcome',        name: 'Welcome Aboard', icon: 'heart',   desc: 'Joined the Tryp.com Content Creator Program.', earned: () => true },
  { key: 'first',          name: 'First Steps',    icon: 'video',   desc: 'Made your first challenge submission.',        earned: (s) => s.submissions >= 1 },
  { key: 'regular',        name: 'Regular',        icon: 'flag',    desc: 'Submitted 5 challenge entries.',               earned: (s) => s.submissions >= 5 },
  { key: 'prolific',       name: 'Prolific',       icon: 'star',    desc: 'Submitted 15 challenge entries.',              earned: (s) => s.submissions >= 15 },
  { key: 'challenger',     name: 'Challenger',     icon: 'gamepad', desc: 'Entered 3 different challenges.',              earned: (s) => s.challenges >= 3 },
  { key: 'podium',         name: 'Podium',         icon: 'chart',   desc: 'Finished in the top 3 of a challenge.',        earned: (s) => s.bestRank > 0 && s.bestRank <= 3 },
  { key: 'champion',       name: 'Champion',       icon: 'trophy',  desc: 'Won a challenge outright (1st place).',        earned: (s) => s.wins >= 1 },
  { key: 'rising',         name: 'Rising',         icon: 'eye',     desc: 'Reached 10,000 total views.',                  earned: (s) => s.totalViews >= 10000 },
  { key: 'popular',        name: 'Popular',        icon: 'eye',     desc: 'Reached 100,000 total views.',                 earned: (s) => s.totalViews >= 100000 },
  { key: 'viral',          name: 'Viral',          icon: 'eye',     desc: 'Reached 1,000,000 total views.',               earned: (s) => s.totalViews >= 1000000 },
  { key: 'globetrotter',   name: 'Globetrotter',   icon: 'globe',   desc: 'Visited 10 or more countries.',                earned: (s) => s.countries >= 10 },
  { key: 'polyglot',       name: 'Polyglot',       icon: 'chat',    desc: 'Speaks 3 or more languages.',                  earned: (s) => s.languages >= 3 },
  { key: 'connector',      name: 'Connector',      icon: 'share',   desc: 'Referred a creator who joined.',               earned: (s) => s.referrals >= 1 },
  { key: 'super_referrer', name: 'Super Referrer', icon: 'users',   desc: 'Referred 3 or more creators.',                 earned: (s) => s.referrals >= 3 },
]

export function earnedBadges(stats) {
  return BADGES.filter((b) => b.earned(stats))
}
