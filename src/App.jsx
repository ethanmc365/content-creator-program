import { lazy, Suspense, useEffect } from 'react'
import { Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom'
import { warmMapAtlas } from './lib/mapCountries'
import { ProtectedRoute, AdminRoute } from './components/ProtectedRoute'
import NetworkRoute from './components/NetworkRoute'
import AppLayout from './components/layout/AppLayout'
import OfflineScreen from './components/OfflineScreen'
import { startOutbox } from './lib/outbox'
import { watchInstallPrompt } from './lib/install'
import ErrorBoundary, { NotFoundScreen } from './components/ErrorScreen'
import ConfirmHost from './components/ConfirmHost'
import ToastHost from './components/ToastHost'
import { AppLoader } from './components/ui'

// Public pages
import Landing from './pages/Landing'
import Preview from './pages/dev/Preview'
import Login from './pages/auth/Login'
import Signup from './pages/auth/Signup'
import ForgotPassword from './pages/auth/ForgotPassword'
import ResetPassword from './pages/auth/ResetPassword'
import PrivacyPolicy from './pages/legal/PrivacyPolicy'
import Terms from './pages/legal/Terms'

// Creator pages
import Onboarding from './pages/Onboarding'
import Profile from './pages/Profile'
import EditProfile from './pages/EditProfile'
import Directory from './pages/Directory'
import Messages from './pages/Messages'
import Challenges from './pages/Challenges'
import ChallengeDetail from './pages/ChallengeDetail'
import Rewards from './pages/Rewards'
import Resources from './pages/Resources'
import Events from './pages/Events'
import Notifications from './pages/Notifications'
import Settings from './pages/Settings'
import Dashboard from './pages/Dashboard'
import Jobs from './pages/Jobs'
import Refer from './pages/Refer'
import Collab from './pages/Collab'
import Connections from './pages/Connections'
import Feedback from './pages/Feedback'

// Heavier / rarely-visited pages are code-split so they don't ship in the
// initial bundle. Game + Leaderboard pull in extra weight; the whole admin area
// is never needed by regular creators, so it loads on demand only.
// The global network shell. Code-split: with the preview flag off nobody ever
// navigates here, so it must not add a byte to a creator's initial bundle.
const GlobalHome = lazy(() => import('./pages/GlobalHome'))
const ChapterHome = lazy(() => import('./pages/ChapterHome'))
const MarketChallenges = lazy(() => import('./pages/MarketChallenges'))
const MarketMembers = lazy(() => import('./pages/MarketMembers'))
const ExploreMarkets = lazy(() => import('./pages/ExploreMarkets'))
const ManageChapter = lazy(() => import('./pages/ManageChapter'))
const NetworkChat = lazy(() => import('./pages/NetworkChat'))
const Rooms = lazy(() => import('./pages/Rooms'))
// The community board. Lazy like every other network page: it is behind the
// preview flag, so a UK creator must not download it.
const Board = lazy(() => import('./pages/Board'))
const BoardThread = lazy(() => import('./pages/Board').then((m) => ({ default: m.BoardThread })))
const Milestones = lazy(() => import('./pages/Milestones'))
// The flight log. Behind the preview gate with the rest of the network build,
// and lazy for the same reason: a UK creator must not download the airport
// table, the map component or the page.
const Flights = lazy(() => import('./pages/Flights'))
// The aircraft collection. Its own route rather than a tab on the log, because
// it is a page you go to look at rather than a section you scroll past - and
// because a wall of two dozen drawings has no business loading with the log.
const AircraftCollection = lazy(() => import('./pages/AircraftCollection'))
const FlightCommunity = lazy(() => import('./pages/FlightCommunity'))
const GlobalSettings = lazy(() => import('./pages/GlobalSettings'))

const Game = lazy(() => import('./pages/Game'))
const Leaderboard = lazy(() => import('./pages/Leaderboard'))
const AdminPanel = lazy(() => import('./pages/admin/AdminPanel'))
const AdminCreators = lazy(() => import('./pages/admin/AdminCreators'))
const AdminChallengeForm = lazy(() => import('./pages/admin/AdminChallengeForm'))
const AdminResults = lazy(() => import('./pages/admin/AdminResults'))
const AdminRewards = lazy(() => import('./pages/admin/AdminRewards'))
const AdminAnalytics = lazy(() => import('./pages/admin/AdminAnalytics'))
const AdminChallengeAnalytics = lazy(() => import('./pages/admin/AdminChallengeAnalytics'))
const AdminEvents = lazy(() => import('./pages/admin/AdminEvents'))
const AdminResources = lazy(() => import('./pages/admin/AdminResources'))
const AdminJobs = lazy(() => import('./pages/admin/AdminJobs'))
const AdminReferrals = lazy(() => import('./pages/admin/AdminReferrals'))
const AdminEmail = lazy(() => import('./pages/admin/AdminEmail'))
const AdminApplications = lazy(() => import('./pages/admin/AdminApplications'))
const AdminAuditLog = lazy(() => import('./pages/admin/AdminAuditLog'))
const AdminConnections = lazy(() => import('./pages/admin/AdminConnections'))
const AdminTeam = lazy(() => import('./pages/admin/AdminTeam'))
const AdminMilestones = lazy(() => import('./pages/admin/AdminMilestones'))
const AdminFeedback = lazy(() => import('./pages/admin/AdminFeedback'))
const AdminReports = lazy(() => import('./pages/admin/AdminReports'))
const AdminNotes = lazy(() => import('./pages/admin/AdminNotes'))
// The Testing Centre: every feature and every automation, demonstrated over
// invented people. Admin only (it sits under AdminRoute below) and lazy like
// the rest of /admin, so no creator ever downloads it. See TestingCentre.jsx.
const TestingCentre = lazy(() => import('./pages/admin/TestingCentre'))

// The route chunk is on its way. While index.html's boot layer is still up
// this draws nothing at all - see lib/bootLoader.js, and the photograph of two
// loaders forty pixels apart that it exists to prevent.
function LazyFallback() {
  return <AppLoader className="min-h-[60vh]" />
}


// A /chat/:channel link from a notification, a bookmark or an old message.
//
// The worldwide rooms carry the BARE channel keys (general, announcements,
// content_tips) precisely because they inherited the UK conversation, so an old
// link maps one-to-one onto the room that now holds those messages. Anything
// unrecognised goes to the index rather than a 404.
const LEGACY_ROOMS = new Set(['general', 'announcements', 'content_tips', 'introductions'])
function LegacyChatRedirect() {
  const { channel } = useParams()
  return <Navigate to={LEGACY_ROOMS.has(channel) ? `/global/chat/${channel}` : '/rooms'} replace />
}

export default function App() {
  // The route is the boundary's reset key: without it one broken page poisons
  // the session, because the boundary stays in its error state and shows the
  // error screen for pages that are perfectly fine. See ErrorScreen.
  const { pathname } = useLocation()
  // The atlas, downloaded and parsed while the shell settles rather than on the
  // frame a map mounts. The <link rel="prefetch"> in index.html usually has the
  // bytes already; this is what turns them into the parsed FeatureCollection
  // every map holds, so the map that appears when you scroll to it has nothing
  // left to do. See lib/mapCountries.
  useEffect(() => { warmMapAtlas() }, [])
  // The outbox listens for the connection coming back, once, for the whole app.
  // It is mounted here rather than in a chat page on purpose: a message queued
  // in the Lisbon room should still go out if you happen to be standing in your
  // DMs when the signal returns, and it should go out on the reload after the
  // tab was killed whether or not you open a chat at all. See lib/outbox.
  useEffect(() => startOutbox(), [])
  // `beforeinstallprompt` fires early and exactly once, so it has to be caught
  // at startup rather than when a screen that wants it happens to mount. See
  // lib/install - there is no equivalent on iOS and there never has been.
  useEffect(() => watchInstallPrompt(), [])
  return (
    <>
      <OfflineScreen />
      <ConfirmHost />
      <ToastHost />
      <ErrorBoundary resetKey={pathname}>
      <Suspense fallback={<LazyFallback />}>
      <Routes>
      {/* ---------- Public ---------- */}
      {/* Dev-only component bench. See pages/dev/Preview.jsx - it exists so
          signed-in layout work can be measured without a login. Tree-shaken out
          of production builds by the DEV guard. */}
      {import.meta.env.DEV && <Route path="/__preview" element={<Preview />} />}
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/privacy" element={<PrivacyPolicy />} />
      <Route path="/terms" element={<Terms />} />

      {/* ---------- Signed in ---------- */}
      <Route element={<ProtectedRoute />}>
        {/* Onboarding is full-screen (no navbar) */}
        <Route path="/onboarding" element={<Onboarding />} />

        <Route element={<AppLayout />}>
          {/* HOME IS THE WORLDWIDE HUB NOW. The old personal dashboard could
              not answer "what is happening across the network", which is the
              question the landing page of a six-market community has to answer.
              The path stays alive because hundreds of sent notifications, the
              logo link and every "back to home" in the product point at it. */}
          <Route path="/home" element={<Navigate to="/global" replace />} />
          <Route path="/profile/edit" element={<EditProfile />} />
          <Route path="/profile/:id" element={<Profile />} />
          <Route path="/creators" element={<Directory />} />
          {/* The single hard-coded UK conversation is gone. Its messages are
              the worldwide rooms' history (they carry the bare channel keys),
              so every old /chat link lands on the room holding the thread it
              was pointing at rather than on a dead end. */}
          <Route path="/chat" element={<Navigate to="/rooms" replace />} />
          <Route path="/chat/:channel" element={<LegacyChatRedirect />} />
          <Route path="/messages" element={<Messages />} />
          <Route path="/messages/:conversationId" element={<Messages />} />
          <Route path="/challenges" element={<Challenges />} />
          <Route path="/challenges/:id" element={<ChallengeDetail />} />
          <Route path="/rewards" element={<Rewards />} />
          <Route path="/resources" element={<Resources />} />
          <Route path="/events" element={<Events />} />
          <Route path="/jobs" element={<Jobs />} />
          <Route path="/refer" element={<Refer />} />
          <Route path="/collab" element={<Collab />} />
          <Route path="/connections" element={<Connections />} />
          <Route path="/game" element={<Game />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/settings" element={<Settings />} />
          {/* Notification settings now live inline on /settings; keep the old
              path working for bookmarks/deep links by redirecting there. */}
          <Route path="/settings/notifications" element={<Navigate to="/settings" replace />} />
          {/* THIRTY-FIVE LIVE NOTIFICATIONS POINT HERE.
              The events page has been `/events` for a while, and something -
              since removed - was filing event reminders against `/calendar`.
              Every one of those taps landed on the not-found screen. Fixing
              the writer would not have fixed the ones already sent, and a
              redirect is the only thing that repairs a link somebody already
              has in their pocket. */}
          <Route path="/calendar" element={<Navigate to="/events" replace />} />
          <Route path="/feedback" element={<Feedback />} />
          <Route path="/dashboard" element={<Dashboard />} />

          {/* ---------- Global network (behind the preview flag) ---------- */}
          {/* NetworkRoute renders nothing but a redirect when the flag is off,
              so these paths are inert for every creator until it is on. */}
          <Route element={<NetworkRoute />}>
            <Route path="/global" element={<GlobalHome />} />
            <Route path="/global/markets" element={<ExploreMarkets />} />
            <Route path="/global/settings" element={<GlobalSettings />} />
            {/* Worldwide rooms and each market's rooms share one component;
                the presence of :slug is what scopes it. */}
            <Route path="/rooms" element={<Rooms />} />
            <Route path="/board" element={<Board />} />
            <Route path="/board/:id" element={<BoardThread />} />
            {/* MOVED IN HERE, IT WAS NEVER MEANT TO BE OUT THERE. The milestone
                route is part of the network build: the milestones are defined
                per market, the page is the network's flight path, and the only
                link to it has always been gated on the preview flag. Sitting in
                the open list it was still reachable by URL, and a UK creator who
                landed on it got a page of the unreleased build - the reported
                "UK creators have been able to view My route". */}
            <Route path="/milestones" element={<Milestones />} />
            <Route path="/flights" element={<Flights />} />
            <Route path="/flights/aircraft" element={<AircraftCollection />} />
            <Route path="/flights/community" element={<FlightCommunity />} />
            <Route path="/global/chat" element={<Navigate to="/global/chat/general" replace />} />
            <Route path="/global/chat/:channelKey" element={<NetworkChat />} />
            <Route path="/c/:slug" element={<ChapterHome />} />
            <Route path="/c/:slug/challenges" element={<MarketChallenges />} />
            <Route path="/c/:slug/members" element={<MarketMembers />} />
            <Route path="/c/:slug/chat" element={<NetworkChat />} />
            <Route path="/c/:slug/chat/:channelKey" element={<NetworkChat />} />
            <Route path="/manage/:slug" element={<ManageChapter />} />
          </Route>

          {/* ---------- Admin only ---------- */}
          <Route element={<AdminRoute />}>
            <Route path="/admin" element={<AdminPanel />} />
            <Route path="/admin/applications" element={<AdminApplications />} />
            <Route path="/admin/creators" element={<AdminCreators />} />
            <Route path="/admin/connections" element={<AdminConnections />} />
            {/* "Manage challenges" is gone. It was a second list of the same
                challenges, whose only unique powers were publish/close/archive,
                delete, and a box asking an admin to type how many participation
                vouchers went out - a number the entries already answer. All
                three now live on the challenge itself, so this is one list
                fewer to keep in step. Old links still land somewhere sensible. */}
            <Route path="/admin/challenges" element={<Navigate to="/challenges" replace />} />
            <Route path="/admin/challenges/new" element={<AdminChallengeForm />} />
            <Route path="/admin/challenges/:id/edit" element={<AdminChallengeForm />} />
            <Route path="/admin/challenges/:id/results" element={<AdminResults />} />
            <Route path="/admin/rewards" element={<AdminRewards />} />
            <Route path="/admin/analytics" element={<AdminAnalytics />} />
            <Route path="/admin/analytics/:id" element={<AdminChallengeAnalytics />} />
            {/* Community network folded into Analytics as its Connections tab.
                It was a second door onto "how is the community doing". */}
            <Route path="/admin/network" element={<Navigate to="/admin/analytics?tab=network" replace />} />
            <Route path="/admin/events" element={<AdminEvents />} />
            <Route path="/admin/resources" element={<AdminResources />} />
            <Route path="/admin/jobs" element={<AdminJobs />} />
            <Route path="/admin/referrals" element={<AdminReferrals />} />
            <Route path="/admin/email" element={<AdminEmail />} />
            <Route path="/admin/audit" element={<AdminAuditLog />} />
            <Route path="/admin/team" element={<AdminTeam />} />
            <Route path="/admin/milestones" element={<AdminMilestones />} />
            {/* Scheduling moved into the rooms. It lived on a page of its own
                and could only ever post to #announcements; it is now a button
                beside the poll in EVERY chat, posting on that market's clock.
                Anything queued from the old page was for #announcements, so
                that is where this lands and where it is still cancellable. */}
            <Route path="/admin/scheduled" element={<Navigate to="/chat/announcements" replace />} />
            {/* "What's new" is gone. It was a form that posted a tagged message
                into #announcements and nothing else - a second door onto the
                announcements room, with its own admin page and its own tile.
                Announcing a feature IS an announcement. */}
            <Route path="/admin/whats-new" element={<Navigate to="/chat/announcements" replace />} />
            <Route path="/admin/feedback" element={<AdminFeedback />} />
            <Route path="/admin/reports" element={<AdminReports />} />
            <Route path="/admin/notes" element={<AdminNotes />} />
            <Route path="/admin/testing" element={<TestingCentre />} />
            <Route path="/admin/testing/:lab" element={<TestingCentre />} />
            {/* Invoices now live inside the Rewards dashboard */}
            <Route path="/admin/invoices" element={<Navigate to="/admin/rewards?tab=invoices" replace />} />
          </Route>
        </Route>
      </Route>

      {/* ANYTHING UNKNOWN GETS A PAGE, NOT A REDIRECT.
          This was `<Navigate to="/" replace />`, which meant a mistyped or
          stale link dropped you on the marketing page with no explanation and
          no clue that the address was wrong. See NotFoundScreen. */}
      <Route path="*" element={<NotFoundScreen />} />
      </Routes>
      </Suspense>
      </ErrorBoundary>
    </>
  )
}
