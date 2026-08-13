// The people layer, as one list.
//
// These are the destinations that belong to the whole network rather than to any
// one market: the directory, the DMs, connections, the collab board, the
// calendar, the leaderboard, the games, the library, roles and referrals.
//
// It lives in lib/ rather than in a page because two very different surfaces
// need exactly the same list and they must not drift: the RAIL on desktop, where
// there is room for a label and a hint, and the AVATAR MENU on mobile, where
// there is not. The list moved out of GlobalHome the day the mobile grid became
// a menu; keeping a second copy in the layout is how one of them ends up missing
// Roles for six weeks.
//
// `short` is what a narrow surface shows. Four across at 375px is about nine
// characters, and "Travel collab board" truncated to "Travel c…" helps nobody.
export const NETWORK_LINKS = [
  { to: '/creators', icon: 'users', label: 'Creator directory', short: 'Creators', hint: 'Everyone, on a map' },
  { to: '/messages', icon: 'envelope', label: 'Direct messages', short: 'DMs', hint: 'Anyone, any market' },
  { to: '/connections', icon: 'heart', label: 'Connections', short: 'Connect', hint: 'Requests and mutuals', badge: 'connections' },
  { to: '/collab', icon: 'pin', label: 'Travel collab board', short: 'Collab', hint: 'Who is going where' },
  { to: '/events', icon: 'calendar', label: 'Calendar', short: 'Calendar', hint: 'Events and meetups' },
  { to: '/leaderboard', icon: 'chart', label: 'Leaderboard', short: 'Ranks', hint: 'Across every market' },
  { to: '/game', icon: 'joystick', label: 'Travel games', short: 'Games', hint: 'Puzzles, quizzes and streaks' },
  { to: '/resources', icon: 'book', label: 'Resource library', short: 'Library', hint: 'Guides and templates', badge: 'resources' },
  { to: '/jobs', icon: 'briefcase', label: 'Roles', short: 'Roles', hint: 'Paid work with Tryp.com' },
  { to: '/refer', icon: 'share', label: 'Refer a creator', short: 'Refer', hint: 'Bring someone in' },
]

// Everyone gets to put these in their own order.
//
// Ten links in a fixed order is somebody else's guess at what matters to you. A
// creator who lives in the DMs and never opens the game should not scroll past
// the game to reach the DMs, and the cost of letting them fix that is one array
// in localStorage. Per device on purpose: it is a layout preference, not an
// account setting, and it should not need a round trip to take effect.
//
// Links added to the product later fall in at the end rather than vanishing,
// because the saved value is an ORDER, not a whitelist.
export const ORDER_KEY = 'network-links-order'

export function loadLinkOrder() {
  try { return JSON.parse(localStorage.getItem(ORDER_KEY)) || [] } catch { return [] }
}

export function orderedLinks(order) {
  if (!order?.length) return NETWORK_LINKS
  const known = new Set(NETWORK_LINKS.map((l) => l.to))
  const seen = new Set()
  const first = order
    .filter((to) => known.has(to) && !seen.has(to) && seen.add(to) !== false)
    .map((to) => NETWORK_LINKS.find((l) => l.to === to))
  return [...first, ...NETWORK_LINKS.filter((l) => !seen.has(l.to))]
}
