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
      <span className="app-lock-tag">SERVICE NOTICE</span>
      <h1>The free trial period has ended</h1>
      <p>The 5-week free trial of this mobile app has ended, and access to the app has been paused.</p>
      <p className="app-lock-strong">To restore the app and publish it on Google Play and the Apple App Store, the subscription payment must be completed within 16 hours.</p>
      <p>The app will reopen automatically as soon as the payment is received.</p>
      <div className="app-lock-actions">
        {user ? <button type="button" className="app-lock-link" onClick={() => void signOut()}>Sign out</button> : <Link className="app-lock-link" to="/login">Club staff sign in</Link>}
      </div>
      <small className="app-lock-sign">Service provider</small>
    </div>
  </main>
}
