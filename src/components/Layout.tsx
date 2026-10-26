import { CalendarDays, Home, Menu, Radio, Trophy } from 'lucide-react'
import { Suspense, useEffect, useState, type CSSProperties } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { ToastProvider } from './Toast'
import TeamLogo from './TeamLogo'
import AdminAlerts from './AdminAlerts'
import ForegroundAlerts from './ForegroundAlerts'
import AdminAlertRelay from './AdminAlertRelay'
import ConnectionBanner from './ConnectionBanner'
import AlertsPrompt from './AlertsPrompt'
import CommunitySync from './CommunitySync'
import SnapshotPublisher from './SnapshotPublisher'
import AutoShrinkImages from './AutoShrinkImages'
import LiveAlerts from './LiveAlerts'
import ActivityTracker from './ActivityTracker'
import DeviceTracker from './DeviceTracker'
import ReauthHost from './ReauthHost'
import { useFlag, useNotice } from '../hooks/useFlag'
import { config } from '../config'

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
  '/news': 'News', '/fanzone': 'Fan Zone', '/community': 'Fan Family', '/competitions': 'Competitions', '/health': 'App health', '/membership': 'Membership',
  '/profile': 'Fan Profile', '/more': 'More', '/admin': 'Admin',
}

// Pages reached from the More tab keep the More tab lit.
const MORE_PAGES = ['/more', '/competitions', '/results', '/squad', '/news', '/fanzone', '/community', '/membership', '/profile', '/admin', '/health']
// Pages where the bars must never slide away (live scores, admin tools).
const PINNED = ['/live', '/admin', '/health']

function activeTab(pathname: string) {
  if (pathname === '/') return 0
  const direct = tabs.findIndex((tab) => tab.to !== '/' && pathname.startsWith(tab.to))
  if (direct >= 0) return direct
  return MORE_PAGES.some((page) => pathname.startsWith(page)) ? tabs.length - 1 : -1
}

/**
 * Scroll-aware bars: they slide away while the fan scrolls down to read and
 * come straight back on any scroll up, near the top, or at the end of a page.
 */
function useScrollChrome(pathname: string, enabled: boolean) {
  const [state, setState] = useState({ path: pathname, hidden: false, scrolled: false })
  useEffect(() => {
    let lastY = window.scrollY
    let frame = 0
    const pinned = !enabled || PINNED.some((page) => pathname.startsWith(page))
    const update = () => {
      frame = 0
      const y = window.scrollY
      const delta = y - lastY
      const atEnd = window.innerHeight + y >= document.documentElement.scrollHeight - 40
      setState((current) => {
        let hidden = current.path === pathname ? current.hidden : false
        if (pinned || y < 90 || atEnd) hidden = false
        else if (delta > 8) hidden = true
        else if (delta < -6) hidden = false
        const scrolled = y > 8
        return current.path === pathname && current.hidden === hidden && current.scrolled === scrolled ? current : { path: pathname, hidden, scrolled }
      })
      if (Math.abs(delta) > 6) lastY = y
    }
    const onScroll = () => { frame ||= window.requestAnimationFrame(update) }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => { window.removeEventListener('scroll', onScroll); if (frame) window.cancelAnimationFrame(frame) }
  }, [pathname, enabled])
  const current = state.path === pathname
  return { hidden: current && state.hidden, scrolled: current && state.scrolled }
}

function tapFeedback() {
  // A tiny buzz on Android, like native apps. Ignored where unsupported.
  try { navigator.vibrate?.(8) } catch { /* not allowed */ }
}

export default function Layout() {
  const { pathname } = useLocation()
  const smartBars = useFlag('smartBars')
  const notice = useNotice()
  const { hidden, scrolled } = useScrollChrome(pathname, smartBars)
  const active = activeTab(pathname)

  return (
    <ToastProvider>
      <div className="app">
        <header className={`topbar${scrolled ? ' is-scrolled' : ''}${hidden ? ' is-hidden' : ''}`}>
          <TeamLogo name="Ekhaya FC" crest />
          <div className="topbar-brand">
            <span className="brand">EKHAYA FC</span>
            <span className="page-title">{titles[pathname] ?? ''}</span>
          </div>
          <span className="topbar-season">{config.environment === 'production' ? 'EST. 2022' : <span className="env-badge">{config.environment.toUpperCase()}</span>}</span>
          <AdminAlerts />
        </header>

        <ConnectionBanner />
        {notice && <p className="club-notice" role="status">{notice}</p>}
        <ForegroundAlerts />
        <AdminAlertRelay />
        <DeviceTracker />
        <ReauthHost />
        <AlertsPrompt />
        <CommunitySync />
        <SnapshotPublisher />
        <AutoShrinkImages />
        <LiveAlerts />
        <ActivityTracker />

        <main className="content">
          <div key={pathname} className="page-transition">
              <Suspense fallback={<div className="page-loading-skeleton" aria-label="Loading"><span /><span /><span /></div>}><Outlet /></Suspense>
          </div>
        </main>

        <nav className={`bottom-nav${hidden ? ' is-hidden' : ''}`} aria-label="Main navigation" style={{ '--active': active } as CSSProperties}>
          {active >= 0 && <span className="nav-pill" aria-hidden="true" />}
          {tabs.map(({ to, label, icon: Icon }, index) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={tapFeedback}
              aria-current={index === active ? 'page' : undefined}
              className={() => 'nav-item' + (index === active ? ' active' : '')}
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
