// When the "appLocked" switch is on, fans see a "free trial ended" screen
// instead of the app. Admins and the superadmin keep full access, and the
// staff sign-in page stays open so they can get in.
import type { ReactNode } from 'react'
import { useSyncExternalStore } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { flagValue, getFlags, subscribeFlags } from '../data/flags'

const KEY = 'ekhaya-app-locked'
const remembered = () => { try { return localStorage.getItem(KEY) === '1' } catch { return false } }
const remember = (on: boolean) => { try { localStorage.setItem(KEY, on ? '1' : '0') } catch { /* private mode */ } }

export default function AppLock({ children }: { children: ReactNode }) {
  const flags = useSyncExternalStore(subscribeFlags, getFlags)
  const { role, user, loading, signOut } = useAuth()
  const { pathname } = useLocation()
  // Until the switches arrive, use the last known state so the app doesn't flash open.
  const locked = flags.loaded ? flagValue(flags, 'appLocked') : remembered()
  if (flags.loaded) remember(locked)
  const staff = role === 'admin' || role === 'superadmin'
  if (!locked || staff || pathname === '/login' || pathname === '/forgot-password') return <>{children}</>
  if (user && loading) return null

  return <main className="app-lock" role="alert">
    <div className="app-lock-card">
      <img src="./pwa-icon-192.png" alt="Ekhaya FC" width={84} height={84} onError={(e) => { e.currentTarget.style.display = 'none' }} />
      <span className="app-lock-tag">FREE TRIAL ENDED</span>
      <h1>Your 5-week free trial has ended</h1>
      <p>Thank you for using the Ekhaya FC app during the free trial period.</p>
      <p>The trial has now come to an end. To continue enjoying live match updates, news, the squad, Ekhaya TV and the club shop on your phone, a subscription payment is required.</p>
      <p className="app-lock-strong">Please pay for your app subscription to unlock the Ekhaya FC mobile app.</p>
      <p className="app-lock-small">The app will reopen automatically as soon as payment is confirmed.</p>
      <div className="app-lock-actions">
        {user ? <button type="button" className="app-lock-link" onClick={() => void signOut()}>Sign out</button> : <Link className="app-lock-link" to="/login">Club staff sign in</Link>}
      </div>
    </div>
  </main>
}
