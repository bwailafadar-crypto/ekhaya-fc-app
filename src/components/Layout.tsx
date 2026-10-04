import { CalendarDays, Home, Menu, Radio, Trophy } from 'lucide-react'
import { Suspense } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { ToastProvider } from './Toast'
import VerificationBanner from './VerificationBanner'
import TeamLogo from './TeamLogo'
import AdminAlerts from './AdminAlerts'
import ForegroundAlerts from './ForegroundAlerts'
import AdminAlertRelay from './AdminAlertRelay'
import ConnectionBanner from './ConnectionBanner'
import AlertsPrompt from './AlertsPrompt'

const tabs = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/fixtures', label: 'Fixtures', icon: CalendarDays },
  { to: '/live', label: 'Live', icon: Radio },
  { to: '/table', label: 'Table', icon: Trophy },
  { to: '/more', label: 'More', icon: Menu },
]


const titles: Record<string, string> = {
  '/': 'Home', '/fixtures': 'Fixtures', '/results': 'Results',
  '/table': 'League Table', '/live': 'Live Match', '/squad': 'Squad',
  '/news': 'News', '/fanzone': 'Fan Zone', '/membership': 'Membership',
  '/profile': 'Fan Profile', '/more': 'More', '/admin': 'Admin',
}

export default function Layout() {
  const { pathname } = useLocation()

  return (
    <ToastProvider>
      <div className="app">
        <header className="topbar">
          <TeamLogo name="Ekhaya FC" crest />
          <div className="topbar-brand">
            <span className="brand">EKHAYA FC</span>
            <span className="page-title">{titles[pathname] ?? ''}</span>
          </div>
          <span className="topbar-season">EST. 2015</span>
          <AdminAlerts />
        </header>

        <ConnectionBanner />
        <VerificationBanner />
        <ForegroundAlerts />
        <AdminAlertRelay />
        <AlertsPrompt />

        <main className="content">
          <div key={pathname} className="page-transition">
              <Suspense fallback={<div className="page-loading-skeleton" aria-label="Loading"><span /><span /><span /></div>}><Outlet /></Suspense>
          </div>
        </main>

        <nav className="bottom-nav" aria-label="Main navigation">
          {tabs.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}
            >
              <Icon className="nav-icon" size={20} strokeWidth={2.1} aria-hidden="true" />
              <span className="nav-label">{label}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </ToastProvider>
  )
}
