import { Suspense } from 'react'
import { lazyPage } from './utils/lazyPage'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import { ProtectedRoute } from './auth/ProtectedRoute'
import ErrorBoundary from './components/ErrorBoundary'
import Layout from './components/Layout'
import AppLock from './components/AppLock'
import SplashIntro from './components/SplashIntro'
import TeamProvider from './data/TeamProvider'
import { ForgotPasswordPage, LoginPage, SignUpPage } from './pages/auth/AuthPages'
import Home from './pages/Home'
import NotFound from './pages/NotFound'
import InstallPromptProvider from './components/InstallPromptProvider'
import InstallBanner from './components/InstallBanner'
import PwaUpdateNotice from './components/PwaUpdateNotice'

// Only Home and the sign-in pages load up front; every other page downloads
// the first time it is opened, so the app starts fast on slow connections.
const AdminPanel = lazyPage(() => import('./pages/AdminPanel'))
const PlayerDetailPage = lazyPage(() => import('./pages/PlayerDetail'))
const Fixtures = lazyPage(() => import('./pages/Fixtures'))
const Results = lazyPage(() => import('./pages/Results'))
const LeagueTable = lazyPage(() => import('./pages/LeagueTable'))
const LiveMatch = lazyPage(() => import('./pages/LiveMatch'))
const Squad = lazyPage(() => import('./pages/Squad'))
const News = lazyPage(() => import('./pages/News'))
const FanZone = lazyPage(() => import('./pages/FanZone'))
const Membership = lazyPage(() => import('./pages/Membership'))
const Profile = lazyPage(() => import('./pages/Profile'))
const More = lazyPage(() => import('./pages/More'))
const InstallPage = lazyPage(() => import('./pages/InstallPage'))
const Community = lazyPage(() => import('./pages/Community'))
const Competitions = lazyPage(() => import('./pages/Competitions'))
const AppHealth = lazyPage(() => import('./pages/AppHealth'))
const Tv = lazyPage(() => import('./pages/Tv'))
const Club = lazyPage(() => import('./pages/Club'))
const MatchReport = lazyPage(() => import('./pages/MatchReport'))
const TopScorers = lazyPage(() => import('./pages/TopScorers'))
const Shop = lazyPage(() => import('./pages/Shop'))
const SalesDashboard = lazyPage(() => import('./pages/SalesDashboard'))
const ActivityLog = lazyPage(() => import('./pages/ActivityLog'))

export default function App() {
  return (
    <HashRouter>
      <InstallPromptProvider>
        <AuthProvider>
          <TeamProvider>
            <ErrorBoundary>
              <>
              <SplashIntro />
              <AppLock>
              <Routes>
              <Route path="/install" element={<Suspense fallback={<p className="page-loading">Loading…</p>}><InstallPage /></Suspense>} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/signup" element={<SignUpPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route element={<ProtectedRoute allowedRoles={['admin', 'superadmin']}><Layout /></ProtectedRoute>}>
                <Route path="/admin" element={<Suspense fallback={<p className="page-loading">Loading admin…</p>}><AdminPanel /></Suspense>} />
                <Route path="/health" element={<AppHealth />} />
              </Route>
              <Route element={<ProtectedRoute allowedRoles={['superadmin']}><Layout /></ProtectedRoute>}>
                <Route path="/sales" element={<SalesDashboard />} />
                <Route path="/activity-log" element={<ActivityLog />} />
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
                <Route path="/tv" element={<Tv />} />
                <Route path="/club" element={<Club />} />
                <Route path="/report/:id" element={<MatchReport />} />
                <Route path="/scorers" element={<TopScorers />} />
                <Route path="/shop" element={<Shop />} />
                <Route path="/shop/:id" element={<Shop />} />
                <Route path="*" element={<NotFound />} />
              </Route>
              </Routes>
              <InstallBanner />
              <PwaUpdateNotice />
              </AppLock>
              </>
            </ErrorBoundary>
          </TeamProvider>
        </AuthProvider>
      </InstallPromptProvider>
    </HashRouter>
  )
}
