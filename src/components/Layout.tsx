import { NavLink, Outlet, useLocation } from 'react-router-dom'

const tabs = [
  { to: '/', label: 'Home', icon: '🏠' },
  { to: '/fixtures', label: 'Fixtures', icon: '⚽' },
  { to: '/live', label: 'Live', icon: '🔴' },
  { to: '/table', label: 'Table', icon: '📊' },
  { to: '/more', label: 'More', icon: '☰' },
]

const titles: Record<string, string> = {
  '/': 'Home', '/fixtures': 'Fixtures', '/results': 'Results',
  '/table': 'League Table', '/live': 'Live Match', '/squad': 'Squad',
  '/news': 'News', '/fanzone': 'Fan Zone', '/membership': 'Membership',
  '/profile': 'Fan Profile', '/more': 'More',
}

export default function Layout() {
  const { pathname } = useLocation()

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">EKHAYA FC</span>
        <span className="page-title">{titles[pathname] ?? ''}</span>
      </header>

      <main className="content">
        <Outlet />
      </main>

      <nav className="bottom-nav">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.to === '/'}
            className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}
          >
            <span className="nav-icon">{t.icon}</span>
            <span className="nav-label">{t.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
