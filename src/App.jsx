import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { ProtectedRoute, AdminRoute } from './components/ProtectedRoute'
import AppLayout from './components/layout/AppLayout'
import OfflineScreen from './components/OfflineScreen'
import ConfirmHost from './components/ConfirmHost'
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
import NotificationSettings from './pages/NotificationSettings'
import Dashboard from './pages/Dashboard'
import Jobs from './pages/Jobs'
import Refer from './pages/Refer'
import Collab from './pages/Collab'
import Connections from './pages/Connections'
import Feedback from './pages/Feedback'

// Heavier / rarely-visited pages are code-split so they don't ship in the
// initial bundle. Game + Leaderboard pull in extra weight; the whole admin area
// is never needed by regular creators, so it loads on demand only.
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
const AdminScheduledAnnouncements = lazy(() => import('./pages/admin/AdminScheduledAnnouncements'))
const AdminWhatsNew = lazy(() => import('./pages/admin/AdminWhatsNew'))
const AdminFeedback = lazy(() => import('./pages/admin/AdminFeedback'))

function LazyFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <PlaneLoader />
    </div>
  )
}

export default function App() {
  return (
    <>
      <OfflineScreen />
      <ConfirmHost />
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
          <Route path="/settings/notifications" element={<NotificationSettings />} />
          <Route path="/feedback" element={<Feedback />} />
          <Route path="/dashboard" element={<Dashboard />} />

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
            <Route path="/admin/scheduled" element={<AdminScheduledAnnouncements />} />
            <Route path="/admin/whats-new" element={<AdminWhatsNew />} />
            <Route path="/admin/feedback" element={<AdminFeedback />} />
          </Route>
        </Route>
      </Route>

      {/* Anything unknown → landing */}
      <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
    </>
  )
}
