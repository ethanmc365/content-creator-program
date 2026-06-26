import { Routes, Route, Navigate } from 'react-router-dom'
import { ProtectedRoute, AdminRoute } from './components/ProtectedRoute'
import AppLayout from './components/layout/AppLayout'

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
import Game from './pages/Game'

// Admin pages
import AdminPanel from './pages/admin/AdminPanel'
import AdminCreators from './pages/admin/AdminCreators'
import AdminChallenges from './pages/admin/AdminChallenges'
import AdminChallengeForm from './pages/admin/AdminChallengeForm'
import AdminResults from './pages/admin/AdminResults'
import AdminRewards from './pages/admin/AdminRewards'
import AdminAnalytics from './pages/admin/AdminAnalytics'
import AdminChallengeAnalytics from './pages/admin/AdminChallengeAnalytics'
import AdminEvents from './pages/admin/AdminEvents'
import AdminResources from './pages/admin/AdminResources'
import AdminJobs from './pages/admin/AdminJobs'
import AdminReferrals from './pages/admin/AdminReferrals'
import AdminEmail from './pages/admin/AdminEmail'
import AdminApplications from './pages/admin/AdminApplications'
import AdminAuditLog from './pages/admin/AdminAuditLog'

export default function App() {
  return (
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
          <Route path="/game" element={<Game />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/settings/notifications" element={<NotificationSettings />} />
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
            <Route path="/admin/events" element={<AdminEvents />} />
            <Route path="/admin/resources" element={<AdminResources />} />
            <Route path="/admin/jobs" element={<AdminJobs />} />
            <Route path="/admin/referrals" element={<AdminReferrals />} />
            <Route path="/admin/email" element={<AdminEmail />} />
            <Route path="/admin/audit" element={<AdminAuditLog />} />
          </Route>
        </Route>
      </Route>

      {/* Anything unknown → landing */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
