// The analytics tabs, shared by the page and a challenge's own page (AnalyticsTabs). Order set by Ethan.
export const TABS = [
  { key: 'overview', label: 'Overview' },
  // RECRUITMENT (14 Oct 2026), for Lorenzo: where sign-ups come from, what they speak, where they drop off and who to
  // follow up with. The application funnel moved here from the Overview.
  { key: 'recruitment', label: 'Recruitment' },
  // VIEWS GAINED PER WEEK, COMMUNITY / VIP / BOTH, AND THE WEEKLY SNAPSHOT. See analytics/ViewsReport.
  { key: 'views', label: 'Weekly views' },
  { key: 'programme', label: 'Challenges' },
  // MARKET AGAINST MARKET, THIRD. It reads the same datasets the Challenges tab
  // does and answers the question straight after it - "and how does that split
  // by market" - so it sits next to it rather than at the far end of the strip.
  { key: 'markets', label: 'Market league' },
  // THE VIP PROGRAMME'S OWN NUMBERS, all markets together and then each market.
  { key: 'vip', label: 'VIP' },
  { key: 'growth', label: 'Growth' },
  // REFERRALS, ITS OWN TAB: it was a card at the foot of the Overview, which the team had to scroll to find.
  { key: 'referrals', label: 'Referrals' },
  { key: 'community', label: 'Community health' },
  { key: 'creators', label: 'Per creator' },
  // ERROR MONITORING LEFT ANALYTICS (14 Oct 2026): a crash is not a statistic. It lives on the admin desk, where the
  // team looks every day.
]
