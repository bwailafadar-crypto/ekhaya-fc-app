import { AnimatePresence, motion } from 'framer-motion'
import { CalendarDays, Home, Menu, Radio, Trophy } from 'lucide-react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { ToastProvider } from './Toast'

const tabs = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/fixtures', label: 'Fixtures', icon: CalendarDays },
  { to: '/live', label: 'Live', icon: Radio },
  { to: '/table', label: 'Table', icon: Trophy },
  { to: '/more', label: 'More', icon: Menu },
]

const MotionNavLink = motion.create(NavLink)

const titles: Record<string, string> = {
  '/': 'Home', '/fixtures': 'Fixtures', '/results': 'Results',
  '/table': 'League Table', '/live': 'Live Match', '/squad': 'Squad',
  '/news': 'News', '/fanzone': 'Fan Zone', '/membership': 'Membership',
  '/profile': 'Fan Profile', '/more': 'More',
}

export default function Layout() {
  const { pathname } = useLocation()

  return (
    <ToastProvider>
      <div className="app">
        <header className="topbar">
          <span className="club-crest" aria-label="Ekhaya FC crest">EFC</span>
          <div className="topbar-brand">
            <span className="brand">EKHAYA FC</span>
            <span className="page-title">{titles[pathname] ?? ''}</span>
          </div>
          <span className="topbar-season">EST. 2015</span>
        </header>

        <main className="content">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={pathname}
              className="page-transition"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>

        <nav className="bottom-nav" aria-label="Main navigation">
          {tabs.map(({ to, label, icon: Icon }) => (
            <MotionNavLink
              key={to}
              to={to}
              end={to === '/'}
              whileTap={{ scale: 0.92 }}
              className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}
            >
              <Icon className="nav-icon" size={20} strokeWidth={2.1} aria-hidden="true" />
              <span className="nav-label">{label}</span>
            </MotionNavLink>
          ))}
        </nav>
      </div>
    </ToastProvider>
  )
}
