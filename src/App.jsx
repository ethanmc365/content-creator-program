import { Routes, Route, Navigate } from 'react-router-dom'
import { ProtectedRoute, AdminRoute } from './components/ProtectedRoute'
import AppLayout from './components/layout/AppLayout'

// Public pages
import Landing from './pages/Landing'
import Login from './pages/auth/Login'
import Signup from './pages/auth/Signup'
import ForgotPassword from './pages/auth/ForgotPassword'
import ResetPassword from './pages/auth/ResetPassword'

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
import WallOfFame from './pages/WallOfFame'
import Rewards from './pages/Rewards'
import Resources from './pages/Resources'
import Events from './pages/Events'
import Notifications from './pages/Notifications'
import Dashboard from './pages/Dashboard'

// Admin pages
import AdminPanel from './pages/admin/AdminPanel'
import AdminCreators from './pages/admin/AdminCreators'
import AdminChallenges from './pages/admin/AdminChallenges'
import AdminChallengeForm from './pages/admin/AdminChallengeForm'
import AdminResults from './pages/admin/AdminResults'
import AdminWallOfFame from './pages/admin/AdminWallOfFame'
import AdminRewards from './pages/admin/AdminRewards'
import AdminAnalytics from './pages/admin/AdminAnalytics'
import AdminEvents from './pages/admin/AdminEvents'
import AdminResources from './pages/admin/AdminResources'

export default function App() {
  return (
    <Routes>
      {/* ---------- Public ---------- */}
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

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
          <Route path="/wall-of-fame" element={<WallOfFame />} />
          <Route path="/rewards" element={<Rewards />} />
          <Route path="/resources" element={<Resources />} />
          <Route path="/events" element={<Events />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/dashboard" element={<Dashboard />} />

          {/* ---------- Admin only ---------- */}
          <Route element={<AdminRoute />}>
            <Route path="/admin" element={<AdminPanel />} />
            <Route path="/admin/creators" element={<AdminCreators />} />
            <Route path="/admin/challenges" element={<AdminChallenges />} />
            <Route path="/admin/challenges/new" element={<AdminChallengeForm />} />
            <Route path="/admin/challenges/:id/edit" element={<AdminChallengeForm />} />
            <Route path="/admin/challenges/:id/results" element={<AdminResults />} />
            <Route path="/admin/challenges/:id/wall-of-fame" element={<AdminWallOfFame />} />
            <Route path="/admin/rewards" element={<AdminRewards />} />
            <Route path="/admin/analytics" element={<AdminAnalytics />} />
            <Route path="/admin/events" element={<AdminEvents />} />
            <Route path="/admin/resources" element={<AdminResources />} />
          </Route>
        </Route>
      </Route>

      {/* Anything unknown → landing */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
