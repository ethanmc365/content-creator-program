// The analytics tabs, shared by the page and a challenge's own page (AnalyticsTabs). Order set by Ethan.
export const TABS = [
  { key: 'overview', label: 'Overview' },
  // TARGETS & PROFIT (20 Oct 2026): the team's "CCC Targets" sheet, live. Second because it is the one the business
  // runs on: views against the monthly target, and what they earned and cost.
  { key: 'targets', label: 'Targets & profit' },
  // VIEWS GAINED PER WEEK, COMMUNITY / VIP / BOTH, AND THE WEEKLY SNAPSHOT. See analytics/ViewsReport.
  { key: 'views', label: 'Weekly views' },
  { key: 'programme', label: 'Challenges' },
  // MARKET AGAINST MARKET, THIRD. It reads the same datasets the Challenges tab
  // does and answers the question straight after it - "and how does that split
  // by market" - so it sits next to it rather than at the far end of the strip.
  { key: 'markets', label: 'Market league' },
  // THE VIP PROGRAMME'S OWN NUMBERS, all markets together and then each market.
  { key: 'vip', label: 'VIP' },
  // WHAT EVERY PAID CREATOR HAS MADE, ALL TIME (16 Oct 2026): the team's sheet up to September 2026, then the platform.
  { key: 'earnings', label: 'VIP earnings' },
  // RECRUITMENT (14 Oct 2026), for Lorenzo: where sign-ups come from, what they speak, where they drop off and who to
  // follow up with. Between VIP and Growth since 15 Oct (Ethan: not one of the first pages).
  { key: 'recruitment', label: 'Recruitment' },
  { key: 'growth', label: 'Growth' },
  // REFERRALS, ITS OWN TAB: it was a card at the foot of the Overview, which the team had to scroll to find.
  { key: 'referrals', label: 'Referrals' },
  { key: 'community', label: 'Community health' },
  { key: 'creators', label: 'Per creator' },
  { key: 'errors', label: 'Error monitoring' },
]
