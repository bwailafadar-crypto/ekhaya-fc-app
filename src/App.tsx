import { lazy, Suspense } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import { ProtectedRoute } from './auth/ProtectedRoute'
import ErrorBoundary from './components/ErrorBoundary'
import Layout from './components/Layout'
import TeamProvider from './data/TeamProvider'
import { ForgotPasswordPage, LoginPage, SignUpPage } from './pages/auth/AuthPages'
import Home from './pages/Home'
import InstallPromptProvider from './components/InstallPromptProvider'
import InstallBanner from './components/InstallBanner'
import PwaUpdateNotice from './components/PwaUpdateNotice'

// Only Home and the sign-in pages load up front; every other page downloads
// the first time it is opened, so the app starts fast on slow connections.
const AdminPanel = lazy(() => import('./pages/AdminPanel'))
const PlayerDetailPage = lazy(() => import('./pages/PlayerDetail'))
const Fixtures = lazy(() => import('./pages/Fixtures'))
const Results = lazy(() => import('./pages/Results'))
const LeagueTable = lazy(() => import('./pages/LeagueTable'))
const LiveMatch = lazy(() => import('./pages/LiveMatch'))
const Squad = lazy(() => import('./pages/Squad'))
const News = lazy(() => import('./pages/News'))
const FanZone = lazy(() => import('./pages/FanZone'))
const Membership = lazy(() => import('./pages/Membership'))
const Profile = lazy(() => import('./pages/Profile'))
const More = lazy(() => import('./pages/More'))
const InstallPage = lazy(() => import('./pages/InstallPage'))
const Community = lazy(() => import('./pages/Community'))
const Competitions = lazy(() => import('./pages/Competitions'))
const AppHealth = lazy(() => import('./pages/AppHealth'))

export default function App() {
  return (
    <HashRouter>
      <InstallPromptProvider>
        <AuthProvider>
          <TeamProvider>
            <ErrorBoundary>
              <>
              <Routes>
              <Route path="/install" element={<Suspense fallback={<p className="page-loading">Loading…</p>}><InstallPage /></Suspense>} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/signup" element={<SignUpPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route element={<ProtectedRoute allowedRoles={['admin', 'superadmin']}><Layout /></ProtectedRoute>}>
                <Route path="/admin" element={<Suspense fallback={<p className="page-loading">Loading admin…</p>}><AdminPanel /></Suspense>} />
                <Route path="/health" element={<AppHealth />} />
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
                <Route path="/news/:id" element={<News />} />
                <Route path="/fanzone" element={<FanZone />} />
                <Route path="/community" element={<Community />} />
                <Route path="/competitions" element={<Competitions />} />
                <Route path="/membership" element={<Membership />} />
                <Route path="/profile" element={<Profile />} />
                <Route path="/more" element={<More />} />
              </Route>
              </Routes>
              <InstallBanner />
              <PwaUpdateNotice />
              </>
            </ErrorBoundary>
          </TeamProvider>
        </AuthProvider>
      </InstallPromptProvider>
    </HashRouter>
  )
}
