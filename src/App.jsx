import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { ProtectedRoute, AdminRoute } from './components/ProtectedRoute'
import NetworkRoute from './components/NetworkRoute'
import AppLayout from './components/layout/AppLayout'
import OfflineScreen from './components/OfflineScreen'
import ErrorBoundary from './components/ErrorScreen'
import ConfirmHost from './components/ConfirmHost'
import ToastHost from './components/ToastHost'
import { PlaneLoader } from './components/ui'

// Public pages
import Landing from './pages/Landing'
import Login from './pages/auth/Login'
import Signup from './pages/auth/Signup'
import ForgotPassword from './pages/auth/ForgotPassword'
import ResetPassword from './pages/auth/ResetPassword'
import PrivacyPolicy from './pages/legal/PrivacyPolicy'
import Terms from './pages/legal/Terms'

// Creator pages
import Onboarding from './pages/Onboarding'
import Home from './pages/Home'
import Profile from './pages/Profile'
import EditProfile from './pages/EditProfile'
import Directory from './pages/Directory'
import Chat from './pages/Chat'
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
const GlobalSettings = lazy(() => import('./pages/GlobalSettings'))

const Game = lazy(() => import('./pages/Game'))
const Leaderboard = lazy(() => import('./pages/Leaderboard'))
const AdminPanel = lazy(() => import('./pages/admin/AdminPanel'))
const AdminCreators = lazy(() => import('./pages/admin/AdminCreators'))
const AdminChallenges = lazy(() => import('./pages/admin/AdminChallenges'))
const AdminChallengeForm = lazy(() => import('./pages/admin/AdminChallengeForm'))
const AdminResults = lazy(() => import('./pages/admin/AdminResults'))
const AdminRewards = lazy(() => import('./pages/admin/AdminRewards'))
const AdminAnalytics = lazy(() => import('./pages/admin/AdminAnalytics'))
const AdminChallengeAnalytics = lazy(() => import('./pages/admin/AdminChallengeAnalytics'))
const AdminNetwork = lazy(() => import('./pages/admin/AdminNetwork'))
const AdminEvents = lazy(() => import('./pages/admin/AdminEvents'))
const AdminResources = lazy(() => import('./pages/admin/AdminResources'))
const AdminJobs = lazy(() => import('./pages/admin/AdminJobs'))
const AdminReferrals = lazy(() => import('./pages/admin/AdminReferrals'))
const AdminEmail = lazy(() => import('./pages/admin/AdminEmail'))
const AdminApplications = lazy(() => import('./pages/admin/AdminApplications'))
const AdminAuditLog = lazy(() => import('./pages/admin/AdminAuditLog'))
const AdminTeam = lazy(() => import('./pages/admin/AdminTeam'))
const AdminMilestones = lazy(() => import('./pages/admin/AdminMilestones'))
const AdminScheduledAnnouncements = lazy(() => import('./pages/admin/AdminScheduledAnnouncements'))
const AdminWhatsNew = lazy(() => import('./pages/admin/AdminWhatsNew'))
const AdminFeedback = lazy(() => import('./pages/admin/AdminFeedback'))
const AdminReports = lazy(() => import('./pages/admin/AdminReports'))
const AdminNotes = lazy(() => import('./pages/admin/AdminNotes'))

function LazyFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <PlaneLoader />
    </div>
  )
}

export default function App() {
  // The route is the boundary's reset key: without it one broken page poisons
  // the session, because the boundary stays in its error state and shows the
  // error screen for pages that are perfectly fine. See ErrorScreen.
  const { pathname } = useLocation()
  return (
    <>
      <OfflineScreen />
      <ConfirmHost />
      <ToastHost />
      <ErrorBoundary resetKey={pathname}>
      <Suspense fallback={<LazyFallback />}>
      <Routes>
      {/* ---------- Public ---------- */}
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
          <Route path="/home" element={<Home />} />
          <Route path="/profile/edit" element={<EditProfile />} />
          <Route path="/profile/:id" element={<Profile />} />
          <Route path="/creators" element={<Directory />} />
          <Route path="/chat" element={<Navigate to="/chat/general" replace />} />
          <Route path="/chat/:channel" element={<Chat />} />
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
            <Route path="/admin/challenges" element={<AdminChallenges />} />
            <Route path="/admin/challenges/new" element={<AdminChallengeForm />} />
            <Route path="/admin/challenges/:id/edit" element={<AdminChallengeForm />} />
            <Route path="/admin/challenges/:id/results" element={<AdminResults />} />
            <Route path="/admin/rewards" element={<AdminRewards />} />
            <Route path="/admin/analytics" element={<AdminAnalytics />} />
            <Route path="/admin/analytics/:id" element={<AdminChallengeAnalytics />} />
            <Route path="/admin/network" element={<AdminNetwork />} />
            <Route path="/admin/events" element={<AdminEvents />} />
            <Route path="/admin/resources" element={<AdminResources />} />
            <Route path="/admin/jobs" element={<AdminJobs />} />
            <Route path="/admin/referrals" element={<AdminReferrals />} />
            <Route path="/admin/email" element={<AdminEmail />} />
            <Route path="/admin/audit" element={<AdminAuditLog />} />
            <Route path="/admin/team" element={<AdminTeam />} />
            <Route path="/admin/milestones" element={<AdminMilestones />} />
            <Route path="/admin/scheduled" element={<AdminScheduledAnnouncements />} />
            <Route path="/admin/whats-new" element={<AdminWhatsNew />} />
            <Route path="/admin/feedback" element={<AdminFeedback />} />
            <Route path="/admin/reports" element={<AdminReports />} />
            <Route path="/admin/notes" element={<AdminNotes />} />
            {/* Invoices now live inside the Rewards dashboard */}
            <Route path="/admin/invoices" element={<Navigate to="/admin/rewards?tab=invoices" replace />} />
          </Route>
        </Route>
      </Route>

      {/* Anything unknown → landing */}
      <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
      </ErrorBoundary>
    </>
  )
}
