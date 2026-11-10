// When the "appLocked" switch is on, fans see a short, friendly "back soon"
// maintenance notice instead of the app. Admins and the superadmin keep full
// access, and the staff sign-in page stays open so they can get in.
import type { ReactNode } from 'react'
import { useSyncExternalStore } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { flagValue, getFlags, subscribeFlags } from '../data/flags'

const KEY = 'ekhaya-app-locked'
const remembered = () => { try { return localStorage.getItem(KEY) === '1' } catch { return false } }
const remember = (on: boolean) => { try { localStorage.setItem(KEY, on ? '1' : '0') } catch { /* private mode */ } }

export default function AppLock({ children }: { children: ReactNode }) {
  const flags = useSyncExternalStore(subscribeFlags, getFlags)
  const { role, user, loading, signOut } = useAuth()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  // Until the switches arrive, use the last known state so the app doesn't flash open.
  const locked = flags.loaded ? flagValue(flags, 'appLocked') : remembered()
  if (flags.loaded) remember(locked)
  // When the app is locked, only the superadmin keeps access. Everyone else
  // (fans and ordinary admins) sees the notice. The sign-in pages stay open.
  if (!locked || role === 'superadmin' || pathname === '/login' || pathname === '/forgot-password') return <>{children}</>
  // Don't show the notice until we actually know who this is: while auth is
  // loading, or a signed-in user's role hasn't arrived yet, wait instead of
  // flashing the notice at the superadmin.
  if (loading || (user && !role)) return null

  return <main className="app-lock" role="alert">
    <div className="app-lock-card">
      <header className="app-lock-head">
        <img className="app-lock-logo" src="./team-logos/ekhaya-fc.png" alt="Ekhaya FC" width={48} height={48} onError={(e) => { e.currentTarget.style.display = 'none' }} />
        <span className="app-lock-pill"><i className="app-lock-dot" />Back soon</span>
      </header>

      <div className="app-lock-body">
        <h1>We'll be right back</h1>
        <p>The Ekhaya FC app is getting a quick update. Please check back again shortly — we won't be long.</p>
        <p className="app-lock-note">Thanks for your patience. Together, we are home. 💛🖤</p>

        <div className="app-lock-actions">
          <Link className="app-lock-signin" to="/login">Club staff sign in</Link>
          {user && <button type="button" className="app-lock-link" onClick={() => { void signOut().finally(() => navigate('/login')) }}>Sign out</button>}
        </div>
      </div>

      <footer className="app-lock-foot">
        <img src="./team-logos/ekhaya-fc.png" alt="" width={20} height={20} aria-hidden="true" />
        <span>Ekhaya FC</span>
      </footer>
    </div>
  </main>
}
