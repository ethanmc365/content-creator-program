// EVERY CODE-SPLIT ROUTE, IN ONE PLACE, SO SOMETHING CAN PREFETCH IT.
//
// THE REPORT, FOR THE THIRD TIME (4 Sep 2026). Ethan: "there is an issue on
// mobile where clicking between pages briefly flashes up the loading screen
// every time. I don't want this to happen, instead I want a skeleton loader."
//
// Two fixes have already been tried and both were aimed at the FALLBACK - what
// gets drawn while a chunk arrives. The first moved the Suspense boundary
// inside the layout so the chrome stops disappearing (right, and kept). The
// second delayed the fallback by 160ms (wrong: it swapped a flash of grey for a
// flash of nothing). Neither could work, because a fallback is a third screen
// between two pages however it is painted. **The only fix that removes it is
// not suspending at all.**
//
// The third attempt prefetched three chunks on idle - Worldwide, Rooms and the
// chat - because those were the tabs Ethan named. That is why the bottom tab
// bar stopped flashing and everything else did not: THIRTY-ONE other routes are
// code-split and none of them was prefetched, and Ethan is an admin who spends
// his time in /admin, where every single page is a first-visit chunk. "Every
// time" is exactly right, and it was never about the tabs.
//
// So this file is the registry, and it buys two things that a scattered pile of
// `lazy(() => import(...))` calls in App.jsx cannot:
//
//  1. PREFETCH ON INTENT. A pointer entering a link, or a finger landing on
//     one, is 80-300ms of warning before the navigation - which is longer than
//     any of these chunks takes on a warm connection. `prefetchForPath` turns
//     a href into an import, so the chunk is already resolved by the time the
//     click lands and no boundary is crossed. See lib/prefetchLinks.
//  2. A SHAPE FOR THE SKELETON. `shapeForPath` answers "what is the page that
//     is coming" for a route whose code has not arrived, which is the only
//     thing that lets the placeholder copy the layout rather than guess at it.
//     See components/RouteSkeleton.
//
// The importers live HERE and App.jsx builds its lazy components from them, so
// the registry cannot fall out of step with the routes: a new page that forgets
// to add itself does not silently lose prefetching, it fails to route at all.


// --------------------------------------------------------------- importers --
// One named importer per code-split page. Vite needs a static, literal
// `import()` per chunk - a computed specifier defeats the bundler - so these
// are written out rather than generated.
export const chunk = {
  GlobalHome: () => import('../pages/GlobalHome'),
  ChapterHome: () => import('../pages/ChapterHome'),
  MarketChallenges: () => import('../pages/MarketChallenges'),
  MarketMembers: () => import('../pages/MarketMembers'),
  ExploreMarkets: () => import('../pages/ExploreMarkets'),
  ManageChapter: () => import('../pages/ManageChapter'),
  NetworkChat: () => import('../pages/NetworkChat'),
  Rooms: () => import('../pages/Rooms'),
  Board: () => import('../pages/Board'),
  Milestones: () => import('../pages/Milestones'),
  Flights: () => import('../pages/Flights'),
  AircraftCollection: () => import('../pages/AircraftCollection'),
  FlightCommunity: () => import('../pages/FlightCommunity'),
  GlobalSettings: () => import('../pages/GlobalSettings'),
  Game: () => import('../pages/Game'),
  Leaderboard: () => import('../pages/Leaderboard'),
  AdminPanel: () => import('../pages/admin/AdminPanel'),
  AdminCreators: () => import('../pages/admin/AdminCreators'),
  AdminChallengeForm: () => import('../pages/admin/AdminChallengeForm'),
  AdminResults: () => import('../pages/admin/AdminResults'),
  AdminRewards: () => import('../pages/admin/AdminRewards'),
  AdminAnalytics: () => import('../pages/admin/AdminAnalytics'),
  AdminChallengeAnalytics: () => import('../pages/admin/AdminChallengeAnalytics'),
  AdminEvents: () => import('../pages/admin/AdminEvents'),
  AdminResources: () => import('../pages/admin/AdminResources'),
  AdminJobs: () => import('../pages/admin/AdminJobs'),
  AdminReferrals: () => import('../pages/admin/AdminReferrals'),
  AdminEmail: () => import('../pages/admin/AdminEmail'),
  AdminApplications: () => import('../pages/admin/AdminApplications'),
  AdminAuditLog: () => import('../pages/admin/AdminAuditLog'),
  AdminConnections: () => import('../pages/admin/AdminConnections'),
  AdminTeam: () => import('../pages/admin/AdminTeam'),
  AdminMilestones: () => import('../pages/admin/AdminMilestones'),
  AdminFeedback: () => import('../pages/admin/AdminFeedback'),
  AdminReports: () => import('../pages/admin/AdminReports'),
  AdminNotes: () => import('../pages/admin/AdminNotes'),
  AdminLanguages: () => import('../pages/admin/AdminLanguages'),
  TestingCentre: () => import('../pages/admin/TestingCentre'),
}

// ----------------------------------------------------------------- routing --
// Path -> chunk, most specific first. Only the split routes are listed; a path
// that matches nothing here is already in the main bundle and needs no help.
const ROUTES = [
  [/^\/global\/markets/, 'ExploreMarkets'],
  [/^\/global\/settings/, 'GlobalSettings'],
  [/^\/global\/chat/, 'NetworkChat'],
  [/^\/global/, 'GlobalHome'],
  [/^\/rooms/, 'Rooms'],
  [/^\/board/, 'Board'],
  [/^\/milestones/, 'Milestones'],
  [/^\/flights\/aircraft/, 'AircraftCollection'],
  [/^\/flights\/community/, 'FlightCommunity'],
  [/^\/flights/, 'Flights'],
  [/^\/game/, 'Game'],
  [/^\/leaderboard/, 'Leaderboard'],
  [/^\/manage\//, 'ManageChapter'],
  [/^\/c\/[^/]+\/chat/, 'NetworkChat'],
  [/^\/c\/[^/]+\/challenges/, 'MarketChallenges'],
  [/^\/c\/[^/]+\/members/, 'MarketMembers'],
  [/^\/c\/[^/]+/, 'ChapterHome'],
  [/^\/admin\/applications/, 'AdminApplications'],
  [/^\/admin\/creators/, 'AdminCreators'],
  [/^\/admin\/connections/, 'AdminConnections'],
  [/^\/admin\/challenges\/[^/]+\/results/, 'AdminResults'],
  [/^\/admin\/challenges/, 'AdminChallengeForm'],
  [/^\/admin\/rewards/, 'AdminRewards'],
  [/^\/admin\/analytics\/[^/]+/, 'AdminChallengeAnalytics'],
  [/^\/admin\/analytics/, 'AdminAnalytics'],
  [/^\/admin\/events/, 'AdminEvents'],
  [/^\/admin\/resources/, 'AdminResources'],
  [/^\/admin\/jobs/, 'AdminJobs'],
  [/^\/admin\/referrals/, 'AdminReferrals'],
  [/^\/admin\/email/, 'AdminEmail'],
  [/^\/admin\/audit/, 'AdminAuditLog'],
  [/^\/admin\/team/, 'AdminTeam'],
  [/^\/admin\/milestones/, 'AdminMilestones'],
  [/^\/admin\/feedback/, 'AdminFeedback'],
  [/^\/admin\/reports/, 'AdminReports'],
  [/^\/admin\/notes/, 'AdminNotes'],
  [/^\/admin\/languages/, 'AdminLanguages'],
  [/^\/admin\/testing/, 'TestingCentre'],
  [/^\/admin/, 'AdminPanel'],
]

/** The chunk a path needs, or null when the page is already in the bundle. */
export function chunkForPath(pathname) {
  const hit = ROUTES.find(([re]) => re.test(pathname))
  return hit ? chunk[hit[1]] : null
}

// A chunk is fetched at most once per session. The browser caches the module
// and a second `import()` returns the same resolved promise, so this is belt
// and braces - but `prefetchForPath` runs on every pointer that crosses a link,
// and doing nothing at all is cheaper than doing nothing via the module graph.
const fetched = new Set()

/**
 * Start fetching whatever `pathname` will need. Safe to call constantly: it is
 * idempotent, it never throws, and a miss costs one regex sweep.
 */
export function prefetchForPath(pathname) {
  if (!pathname || fetched.has(pathname)) return
  fetched.add(pathname)
  const load = chunkForPath(pathname)
  if (!load) return
  try { load() } catch { /* a failed prefetch is a miss, never an error */ }
}

// ------------------------------------------------------------------ shapes --
// THE SHAPE OF THE PAGE THAT IS ARRIVING.
//
// The point of a skeleton is that what lands is the layout you were already
// looking at. A grid of three cards is right for a directory and wrong for a
// conversation, and being roughly right beats being confidently generic - so
// this maps a path onto one of a small set of real layouts rather than onto
// "some cards". Crude matching is fine: the path is the only thing known about
// a route whose code has not arrived yet.
const SHAPES = [
  [/^\/(rooms|messages)\b|\/chat(\/|$)/, 'thread'],
  [/^\/(creators|connections|leaderboard|admin\/creators|admin\/applications|admin\/team|admin\/audit|admin\/reports|admin\/referrals)/, 'list'],
  [/^\/(global|c\/[^/]+)$/, 'hub'],
  [/^\/profile\//, 'profile'],
  [/^\/(collab|flights|board)$/, 'map'],
  [/^\/(events)/, 'calendar'],
  [/^\/(challenges|milestones|admin\/analytics)/, 'feature'],
  [/^\/(settings|global\/settings|admin$)/, 'settings'],
  [/^\/admin\/(challenges|events|resources|notes|email)/, 'form'],
  [/^\/admin/, 'panel'],
]

export function shapeForPath(pathname) {
  const hit = SHAPES.find(([re]) => re.test(pathname))
  return hit ? hit[1] : 'cards'
}
