import { HashRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import { ProtectedRoute } from './auth/ProtectedRoute'
import ErrorBoundary from './components/ErrorBoundary'
import Layout from './components/Layout'
import TeamProvider from './data/TeamProvider'
import { ForgotPasswordPage, LoginPage, SignUpPage } from './pages/auth/AuthPages'
import PlayerDetailPage from './pages/PlayerDetail'
import Home from './pages/Home'
import Fixtures from './pages/Fixtures'
import Results from './pages/Results'
import LeagueTable from './pages/LeagueTable'
import LiveMatch from './pages/LiveMatch'
import Squad from './pages/Squad'
import News from './pages/News'
import FanZone from './pages/FanZone'
import Membership from './pages/Membership'
import Profile from './pages/Profile'
import More from './pages/More'
import AdminPanel from './pages/AdminPanel'
import InstallBanner from './components/InstallBanner'

export default function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <TeamProvider>
          <ErrorBoundary>
            <>
            <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignUpPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route element={<ProtectedRoute allowedRoles={['admin', 'superadmin']}><Layout /></ProtectedRoute>}>
              <Route path="/admin" element={<AdminPanel />} />
            </Route>
            <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
              <Route path="/" element={<Home />} />
              <Route path="/fixtures" element={<Fixtures />} />
              <Route path="/results" element={<Results />} />
              <Route path="/table" element={<LeagueTable />} />
              <Route path="/live" element={<LiveMatch />} />
              <Route path="/squad" element={<Squad />} />
              <Route path="/squad/:id" element={<PlayerDetailPage />} />
              <Route path="/news" element={<News />} />
              <Route path="/fanzone" element={<FanZone />} />
              <Route path="/membership" element={<Membership />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/more" element={<More />} />
            </Route>
            </Routes>
            <InstallBanner />
            </>
          </ErrorBoundary>
        </TeamProvider>
      </AuthProvider>
    </HashRouter>
  )
}
